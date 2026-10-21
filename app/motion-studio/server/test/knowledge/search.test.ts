import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { queryPatterns, tokenize } from "../../src/knowledge/search.js";

describe("tokenize", () => {
  it("нижний регистр, ё->е, усечение длинных русских слов до 6, синонимы EN", () => {
    expect(tokenize("Счётчик")).toContain("счетчи");
    expect(tokenize("ПОЛЬЗОВАТЕЛЕЙ")).toContain("пользо");
    expect(tokenize("chart")).toEqual(expect.arrayContaining(["chart", "график"]));
    expect(tokenize("kinetic typography")).toEqual(expect.arrayContaining(["кинети", "типогр", "текст"]));
  });
  it("числа и короткий шум отбрасываются", () => {
    expect(tokenize("10 000 до 1 000 000")).toEqual([]);
  });
});

describe("токены и паттерны", () => {
  it("английские формы совпадают с синонимами", () => {
    for (const w of ["charts", "users", "nodes", "counters"]) expect(tokenize(w).length).toBeGreaterThan(1);
    expect(tokenize("nodes")).toContain("узел");
  });
  it("короткие известные токены 3d/ai/ui остаются, регистр не важен", () => {
    expect(tokenize("3D AI Ui")).toEqual(["3d", "ai", "ui"]);
    expect(tokenize("ПОКАЖИ ГРАФИК")).toEqual(tokenize("покажи график"));
  });
  it("императивы и филлеры отбрасываются", () => {
    expect(tokenize("Создай сделай покажи нужно идёт анимацию ролик сцена плавный")).toEqual([]);
  });
  it("все 12 паттернов достижимы по русским словам", () => {
    const cases: [string, string][] = [
      ["рост", "growth-decline"], ["падение продаж", "growth-decline"], ["снижение", "growth-decline"],
      ["сравнение", "comparison"], ["против", "comparison"], ["хронология", "timeline"],
      ["таймлайн", "timeline"], ["с 2015 по 2025", "timeline"], ["этапы", "sequence-steps"], ["шаг", "sequence-steps"],
      ["архитектура", "system-structure"], ["структура", "system-structure"], ["причина", "cause-effect"],
      ["следствие", "cause-effect"], ["связи", "relationships"], ["отношения", "relationships"],
      ["превращение", "transformation"], ["трансформация", "transformation"], ["количество", "quantities"],
      ["доля", "quantities"], ["процент", "quantities"], ["карта", "spatial"], ["география", "spatial"],
      ["акцент", "key-point-emphasis"], ["главное", "key-point-emphasis"], ["концепция", "abstract-concepts"],
    ];
    for (const [q, slug] of cases) expect(queryPatterns(q), q).toContain(slug);
    expect(new Set(cases.map((c) => c[1])).size).toBe(12);
    expect(queryPatterns("карточка")).toEqual([]);
  });
});

describe("search на синтетической KB", () => {
  let root: string;
  let kb: KnowledgeAdapter;
  const rec = (o: Record<string, unknown>) => ({
    name: "X", kind: "component", category: "misc", visualizes: "", use_when: "", voiceover_cues: [], inputs: "",
    adaptations: "", patterns: [], compat_flags: [], source_files: ["a.tsx"], docs: [], verification: "static-review",
    remotion_compat: "native", card: "components/r/x.md", license: "MIT (x)", ...o,
  });
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "kb-search-"));
    await mkdir(join(root, "components"), { recursive: true });
    const rows = [
      rec({ id: "r/counter", repo: "r", name: "Counter", visualizes: "счётчик числа" }),
      rec({ id: "r/counter-adapt", repo: "r", name: "Counter2", visualizes: "счётчик числа", remotion_compat: "adaptable" }),
      rec({ id: "r/counter-complex", repo: "r", name: "Counter3", visualizes: "счётчик числа", remotion_compat: "complex" }),
      rec({ id: "q/restricted", repo: "q", name: "R", visualizes: "счётчик", license: "MIT + Commons Clause" }),
      rec({ id: "r/by-name", repo: "r", name: "Chart", kind: "template", patterns: ["growth"] }),
    ];
    await writeFile(join(root, "capabilities.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    await writeFile(
      join(root, "repositories.json"),
      JSON.stringify({ repositories: [
        { id: "r", name: "r", url: "u", commit: "abcdef1", license: "MIT" },
        { id: "q", name: "q", url: "u", commit: "abcdef2", license: "MIT + Commons Clause" },
      ] }),
    );
    kb = await KnowledgeAdapter.load({ kbRoot: root, sourceRoot: root });
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it("native выше adaptable; complex по умолчанию скрыт", () => {
    const ids = kb.search("счетчик").map((h) => h.view.id);
    expect(ids).toEqual(["r/counter", "r/counter-adapt"]);
  });
  it("restricted скрыт, пока нет allowRestricted", () => {
    expect(kb.search("счетчик").some((h) => h.view.id === "q/restricted")).toBe(false);
    expect(kb.search("счетчик", { allowRestricted: true }).some((h) => h.view.id === "q/restricted")).toBe(true);
  });
  it("фильтры compat/kinds/patterns и limit", () => {
    expect(kb.search("счетчик", { compat: ["complex"] }).map((h) => h.view.id)).toEqual(["r/counter-complex"]);
    expect(kb.search("chart", { kinds: ["template"] }).map((h) => h.view.id)).toEqual(["r/by-name"]);
    expect(kb.search("chart", { kinds: ["hook"] })).toEqual([]);
    expect(kb.search("growth", { patterns: ["growth"] }).map((h) => h.view.id)).toEqual(["r/by-name"]);
    expect(kb.search("счетчик", undefined, 1)).toHaveLength(1);
  });
  it("matched показывает токены, пустой запрос — пусто", () => {
    expect(kb.search("счётчик")[0]!.matched).toContain("счетчи");
    expect(kb.search("")).toEqual([]);
  });
  it("IDF: редкий токен весит больше частого", () => {
    // «счетчик» есть у 4 из 5 записей, «chart» — у одной: при равных полях редкий выигрывает.
    const hits = kb.search("счетчик chart", { compat: ["native"], kinds: ["template", "component"] });
    expect(hits[0]!.view.id).toBe("r/by-name");
  });
  it("view: commit/репозиторий из repositories.json, confidence, unknown для отсутствующего", () => {
    const v = kb.getCapability("r/counter")!;
    expect(v.commit).toBe("abcdef1");
    expect(v.repository_url).toBe("u");
    expect(v.license_class).toBe("permissive");
    expect(v.confidence).toBe("medium");
    expect(kb.getCapability("q/restricted")!.license_class).toBe("restricted");
    expect(kb.getCapability("nope/none")).toBeUndefined();
  });
});
