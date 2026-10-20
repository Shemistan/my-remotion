#!/usr/bin/env python3
"""Сборка и контроль качества визуальной базы знаний `knowledge/`.

    python3 tools/kb.py build   # собрать knowledge/capabilities.jsonl из
                                # knowledge/components/<repo>/capabilities.jsonl
    python3 tools/kb.py check   # проверить базу (зовётся из ./check)
    python3 tools/kb.py check --repo <id>   # только один репозиторий
    python3 tools/kb.py stats   # сводка: репозитории, записи, категории

Исходные части каталога: knowledge/components/<repo>/capabilities*.jsonl
(большой репозиторий можно разбить на срезы capabilities-<срез>.jsonl).

Что проверяет `check`:
  1. каждая строка *.jsonl — валидный JSON с обязательными полями и
     допустимыми значениями перечислений (см. knowledge/taxonomy.md);
  2. id уникален и имеет вид `<repo>/<slug>`, repo есть в repositories.json;
  3. карточка `card` существует, и в ней упомянут id;
  4. все пути `source_files` и локальные `docs` существуют относительно
     корня с исходниками (каталог, где лежат templates/ и official_skills/;
     ищется вверх от cwd или берётся из $KB_SOURCE_ROOT); если корня нет —
     предупреждение, а не ошибка;
  5. у каждой записи есть сценарии использования (`use_when`) и не меньше
     двух фраз озвучки (`voiceover_cues`);
  6. remotion_compat и verification заданы явно; статус `rendered-*`
     требует записи в knowledge/compatibility/results.jsonl;
  7. у репозитория указана лицензия;
  8. паттерны из `patterns` существуют в knowledge/patterns/, а id,
     упомянутые в файлах паттернов, существуют в каталоге;
  9. knowledge/capabilities.jsonl совпадает с результатом `build`.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

KB = "knowledge"
COMPAT = {"native", "adaptable", "complex", "unsuitable", "unknown"}
VERIFICATION = {"unverified", "static-review", "rendered-ok", "rendered-fail"}
KINDS = {"component", "example", "template", "hook", "util", "doc", "chart-type",
         "diagram-type"}
FLAGS = {
    "css-animation", "css-transition", "raf", "timers", "dom", "user-events",
    "engine:gsap", "engine:motion", "engine:anime", "engine:three",
    "engine:d3", "engine:other", "canvas", "webgl", "svg", "async-data",
    "external-service",
}
REQUIRED = (
    "id", "name", "repo", "kind", "category", "visualizes", "use_when",
    "voiceover_cues", "visual_style", "inputs", "animations", "source_files",
    "docs", "dependencies", "remotion_compat", "compat_flags", "adaptations",
    "verification", "patterns", "license", "card",
)
LIST_FIELDS = ("voiceover_cues", "animations", "source_files", "docs",
               "dependencies", "compat_flags", "patterns")
_ID = re.compile(r"^[a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9.-]*$")
_ID_IN_TEXT = re.compile(r"`([a-z0-9][a-z0-9-]*/[a-z0-9][a-z0-9.-]*)`")


def read_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append((n, json.loads(line)))
            except json.JSONDecodeError as e:
                rows.append((n, e))
    return rows


def load_categories(root):
    """Слаги категорий из knowledge/taxonomy.md: строки вида `- \\`slug\\` — …`
    в разделе «Категории компонентов»."""
    path = os.path.join(root, KB, "taxonomy.md")
    cats = set()
    if not os.path.exists(path):
        return cats
    section = False
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("## "):
                section = "категории компонентов" in line.lower()
                continue
            if section:
                m = re.match(r"^- `([a-z0-9-]+)`", line)
                if m:
                    cats.add(m.group(1))
    return cats


def find_source_root(root):
    env = os.environ.get("KB_SOURCE_ROOT")
    if env and os.path.isdir(os.path.join(env, "templates")):
        return os.path.abspath(env)
    cur = os.path.abspath(root)
    while True:
        if os.path.isdir(os.path.join(cur, "templates")) and \
                os.path.isdir(os.path.join(cur, "official_skills")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            return None
        cur = parent


def part_files(root, only_repo=None):
    """(repo, path) для всех components/<repo>/capabilities*.jsonl —
    большой репозиторий может быть разбит на срезы capabilities-<срез>.jsonl."""
    base = os.path.join(root, KB, "components")
    out = []
    if not os.path.isdir(base):
        return out
    for repo in sorted(os.listdir(base)):
        if only_repo and repo != only_repo:
            continue
        d = os.path.join(base, repo)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if name.startswith("capabilities") and name.endswith(".jsonl"):
                out.append((repo, os.path.join(d, name)))
    return out


def build(root):
    rows = []
    for _repo, p in part_files(root):
        for n, r in read_jsonl(p):
            if isinstance(r, dict):
                rows.append(r)
    rows.sort(key=lambda r: r.get("id", ""))
    return "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n"
                   for r in rows)


def cmd_build(root):
    out = os.path.join(root, KB, "capabilities.jsonl")
    text = build(root)
    with open(out, "w", encoding="utf-8") as f:
        f.write(text)
    print("✓ kb: собран %s (%d записей)" % (os.path.relpath(out, root),
                                            text.count("\n")))
    return 0


def check(root, only_repo=None):
    """only_repo — проверить один репозиторий (параллельная работа агентов):
    чужие части и актуальность сборного файла не проверяются."""
    errors, warnings = [], []
    err = lambda p, m: errors.append((p, m))  # noqa: E731
    warn = lambda p, m: warnings.append((p, m))  # noqa: E731

    repos_path = os.path.join(root, KB, "repositories.json")
    repos = {}
    if os.path.exists(repos_path):
        with open(repos_path, encoding="utf-8") as f:
            data = json.load(f)
        for r in data.get("repositories", []):
            repos[r["id"]] = r
            for field in ("id", "name", "path", "category", "license", "commit",
                          "url", "purpose"):
                if not r.get(field):
                    err(repos_path, "репозиторий %s: нет поля '%s'"
                        % (r.get("id"), field))
    else:
        err(repos_path, "файла нет")

    categories = load_categories(root)
    if not categories:
        err(os.path.join(root, KB, "taxonomy.md"),
            "не найден раздел «Категории компонентов» со слагами")

    patterns_dir = os.path.join(root, KB, "patterns")
    patterns = set()
    if os.path.isdir(patterns_dir):
        patterns = {n[:-3] for n in os.listdir(patterns_dir)
                    if n.endswith(".md") and n != "README.md"}

    results = set()
    res_path = os.path.join(root, KB, "compatibility", "results.jsonl")
    if os.path.exists(res_path):
        for n, r in read_jsonl(res_path):
            if isinstance(r, dict) and r.get("id"):
                results.add(r["id"])
            else:
                err(res_path, "строка %d: невалидный JSON или нет id" % n)

    source_root = find_source_root(root)
    if source_root is None:
        warn(os.path.join(root, KB), "корень с templates/ не найден — "
             "существование исходников не проверено (задай KB_SOURCE_ROOT)")

    ids = {}
    for repo, p in part_files(root, only_repo):
        rel = os.path.relpath(p, root)
        for n, r in read_jsonl(p):
            where = "%s:%d" % (rel, n)
            if not isinstance(r, dict):
                err(where, "невалидный JSON: %s" % r)
                continue
            missing = [f for f in REQUIRED if f not in r]
            if missing:
                err(where, "нет полей: %s" % ", ".join(missing))
                continue
            cid = r["id"]
            if not _ID.match(cid):
                err(where, "id '%s' не вида <repo>/<slug>" % cid)
            if cid in ids:
                err(where, "id '%s' дублирует %s" % (cid, ids[cid]))
            ids[cid] = where
            if r["repo"] != repo or not cid.startswith(repo + "/"):
                err(where, "repo '%s' не совпадает с каталогом '%s' или id"
                    % (r["repo"], repo))
            if r["repo"] not in repos:
                err(where, "repo '%s' нет в repositories.json" % r["repo"])
            if r["kind"] not in KINDS:
                err(where, "kind '%s'; допустимо: %s"
                    % (r["kind"], ", ".join(sorted(KINDS))))
            if categories and r["category"] not in categories:
                err(where, "category '%s' нет в taxonomy.md" % r["category"])
            if r["remotion_compat"] not in COMPAT:
                err(where, "remotion_compat '%s'; допустимо: %s"
                    % (r["remotion_compat"], ", ".join(sorted(COMPAT))))
            if r["verification"] not in VERIFICATION:
                err(where, "verification '%s'; допустимо: %s"
                    % (r["verification"], ", ".join(sorted(VERIFICATION))))
            if r["verification"].startswith("rendered") and cid not in results:
                err(where, "verification=%s, но в compatibility/results.jsonl "
                    "нет записи" % r["verification"])
            for f in LIST_FIELDS:
                if not isinstance(r[f], list):
                    err(where, "поле '%s' должно быть списком" % f)
            for f in ("visualizes", "use_when", "visual_style", "inputs",
                      "adaptations", "license", "name"):
                if not isinstance(r[f], str) or not r[f].strip():
                    err(where, "поле '%s' пустое" % f)
            if isinstance(r["voiceover_cues"], list) and len(r["voiceover_cues"]) < 2:
                err(where, "нужно не меньше двух фраз озвучки")
            if isinstance(r["source_files"], list) and not r["source_files"]:
                err(where, "нет исходных файлов")
            if isinstance(r["compat_flags"], list):
                bad = [x for x in r["compat_flags"] if x not in FLAGS]
                if bad:
                    err(where, "неизвестные compat_flags: %s" % ", ".join(bad))
            if isinstance(r["patterns"], list):
                bad = [x for x in r["patterns"] if x not in patterns]
                if bad:
                    err(where, "нет таких паттернов: %s" % ", ".join(bad))
            if r["remotion_compat"] == "unknown" and "недостаточно" not in \
                    r["adaptations"].lower() and "неизвестн" not in r["adaptations"].lower():
                warn(where, "compat=unknown — в adaptations стоит явно сказать, "
                     "каких данных не хватает")
            card = os.path.join(root, KB, r["card"])
            if not os.path.isfile(card):
                err(where, "карточки нет: %s" % r["card"])
            else:
                with open(card, encoding="utf-8") as f:
                    if cid not in f.read():
                        err(where, "карточка %s не упоминает id %s" % (r["card"], cid))
            if source_root:
                for sp in r["source_files"] + [d for d in r["docs"]
                                               if not d.startswith("http")]:
                    if not os.path.exists(os.path.join(source_root, sp)):
                        err(where, "файла нет: %s" % sp)

    if only_repo:
        return errors, warnings, ids

    # паттерны: все упомянутые id существуют
    for name in sorted(patterns):
        p = os.path.join(patterns_dir, name + ".md")
        with open(p, encoding="utf-8") as f:
            text = f.read()
        for m in _ID_IN_TEXT.findall(text):
            if m not in ids:
                err(os.path.relpath(p, root), "упомянут несуществующий id `%s`" % m)

    # сборный файл актуален
    out = os.path.join(root, KB, "capabilities.jsonl")
    expected = build(root)
    actual = ""
    if os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            actual = f.read()
    if actual != expected:
        err(os.path.relpath(out, root),
            "устарел — запусти `python3 tools/kb.py build`")
    return errors, warnings, ids


def cmd_check(root, only_repo=None):
    errors, warnings, ids = check(root, only_repo)
    for p, m in warnings:
        print("⚠ kb: %s: %s" % (os.path.relpath(p, root) if os.path.isabs(p) else p, m),
              file=sys.stderr)
    if errors:
        print("✗ kb: база знаний не консистентна (%d):" % len(errors), file=sys.stderr)
        for p, m in errors:
            print("  %s: %s" % (os.path.relpath(p, root) if os.path.isabs(p) else p, m),
                  file=sys.stderr)
        return 1
    print("✓ kb: %d записей, ошибок нет" % len(ids))
    return 0


def cmd_stats(root):
    rows = [r for _, p in part_files(root) for _, r in read_jsonl(p)
            if isinstance(r, dict)]
    by = lambda k: Counter(r.get(k) for r in rows)  # noqa: E731
    print("репозиториев с записями: %d" % len({r.get("repo") for r in rows}))
    print("записей: %d" % len(rows))
    for k in ("repo", "kind", "category", "remotion_compat", "verification"):
        print("\n%s:" % k)
        for v, c in sorted(by(k).items(), key=lambda x: (-x[1], str(x[0]))):
            print("  %-28s %d" % (v, c))
    pc = Counter(p for r in rows for p in r.get("patterns", []))
    print("\npatterns:")
    for v, c in sorted(pc.items(), key=lambda x: (-x[1], x[0])):
        print("  %-28s %d" % (v, c))
    fl = Counter(p for r in rows for p in r.get("compat_flags", []))
    print("\ncompat_flags:")
    for v, c in sorted(fl.items(), key=lambda x: (-x[1], x[0])):
        print("  %-28s %d" % (v, c))
    usable = sum(1 for r in rows if r.get("remotion_compat") in ("native", "adaptable"))
    print("\nпригодны для Remotion (native+adaptable): %d" % usable)
    return 0


def main(argv):
    args = list(argv[1:])
    only_repo = None
    if "--repo" in args:
        i = args.index("--repo")
        only_repo = args[i + 1]
        del args[i:i + 2]
    cmd = args[0] if args else "check"
    root = os.path.abspath(args[1] if len(args) > 1 else os.getcwd())
    if not os.path.isdir(os.path.join(root, KB)):
        print("kb: каталога %s/ нет — пропуск" % KB)
        return 0
    if cmd == "check":
        return cmd_check(root, only_repo)
    return {"build": cmd_build, "stats": cmd_stats}[cmd](root)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
