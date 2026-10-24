// Адаптеры ночи (`night-io.ts`) на настоящих git и процессах во временном каталоге:
// остатки агента — патчем, а не в общий stash (ревью ночи I3); разбор JSON `claude -p`;
// таймаут и досрочная остановка процесса; пробный агент; стоимость прогона bench; diff путей и
// снимок защищённых веток (I2, M5).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { benchRunSpent, createNightGit, gitEnv, parseAgentOutput, parseLsofCwd, probeVerdict, runProcess } from "../../src/bench/night-io.js";

const ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
beforeAll(() => {
  Object.assign(process.env, ENV);
});
// Под pre-commit git передаёт тестам GIT_DIR/GIT_INDEX_FILE репозитория проекта: без очистки
// git во временном каталоге писал бы в настоящий репозиторий (инцидент 2026-10-23).
const sh = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...gitEnv(), ...ENV } }).trim();

function repo(): string {
  const d = mkdtempSync(join(tmpdir(), "night-io-"));
  sh(d, "init", "-q", "-b", "main", ".");
  writeFileSync(join(d, "a.txt"), "a\n");
  writeFileSync(join(d, ".gitignore"), "tmp/\n");
  sh(d, "add", "-A");
  sh(d, "commit", "-qm", "init");
  return d;
}

describe("gitEnv", () => {
  it("убирает переменные, которые направляют git в чужой репозиторий (GIT_DIR, GIT_INDEX_FILE, …)", () => {
    const env = gitEnv({ GIT_DIR: "/x/.git", GIT_INDEX_FILE: "/x/index", GIT_WORK_TREE: "/x", GIT_COMMON_DIR: "/x", GIT_OBJECT_DIRECTORY: "/x/o", GIT_AUTHOR_NAME: "a", PATH: "/bin" });
    expect(env).toEqual({ GIT_AUTHOR_NAME: "a", PATH: "/bin" });
  });

  it("createNightGit работает в своём cwd даже при чужом GIT_DIR в окружении", () => {
    const d = repo();
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = join(d, "нет-такого");
    try {
      expect(createNightGit().head(d)).toBe(sh(d, "rev-parse", "HEAD"));
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
  });
});

describe("createNightGit", () => {
  it("saveLeftover: правки — патч wip.patch + копии неотслеживаемых, дерево чистое, stash не тронут", () => {
    const d = repo();
    const g = createNightGit();
    writeFileSync(join(d, "a.txt"), "a2\n");
    writeFileSync(join(d, "b.txt"), "b\n");
    sh(d, "add", "b.txt");
    mkdirSync(join(d, "sub"));
    writeFileSync(join(d, "sub", "c.txt"), "c\n");
    mkdirSync(join(d, "tmp"));
    writeFileSync(join(d, "tmp", "ignored.txt"), "i\n");
    const out = join(d, "tmp", "night", "1");
    const r = g.saveLeftover(d, out);
    expect(r).toEqual({ dir: out, patch: true, untracked: ["sub/c.txt"] });
    const patch = readFileSync(join(out, "wip.patch"), "utf8");
    expect(patch).toMatch(/a2/);
    expect(patch).toMatch(/b\.txt/);
    expect(readFileSync(join(out, "wip-untracked", "sub", "c.txt"), "utf8")).toBe("c\n");
    expect(g.isClean(d)).toBe(true);
    expect(existsSync(join(d, "tmp", "ignored.txt"))).toBe(true);
    expect(sh(d, "stash", "list")).toBe("");
    // патч применяется обратно
    sh(d, "apply", "--index", join(out, "wip.patch"));
    expect(readFileSync(join(d, "a.txt"), "utf8")).toBe("a2\n");
    expect(readFileSync(join(d, "b.txt"), "utf8")).toBe("b\n");
  });

  it("saveLeftover на чистом дереве — null, ничего не пишет", () => {
    const d = repo();
    expect(createNightGit().saveLeftover(d, join(d, "tmp", "x"))).toBeNull();
    expect(existsSync(join(d, "tmp", "x"))).toBe(false);
  });

  it("changedFiles: пути коммитов from..HEAD, переименование — оба имени", () => {
    const d = repo();
    const start = sh(d, "rev-parse", "HEAD");
    sh(d, "mv", "a.txt", "check");
    writeFileSync(join(d, "n.txt"), "n\n");
    sh(d, "add", "-A");
    sh(d, "commit", "-qm", "mv");
    expect(createNightGit().changedFiles(d, start).sort()).toEqual(["a.txt", "check", "n.txt"]);
  });

  it("refs: снимок main/staging; сдвиг виден", () => {
    const d = repo();
    const g = createNightGit();
    sh(d, "branch", "staging");
    const before = g.refs(d);
    expect(Object.keys(before).sort()).toEqual(["refs/heads/main", "refs/heads/staging"]);
    writeFileSync(join(d, "z.txt"), "z\n");
    sh(d, "add", "z.txt");
    sh(d, "commit", "-qm", "z");
    expect(g.refs(d)["refs/heads/main"]).not.toBe(before["refs/heads/main"]);
    expect(g.refs(d)["refs/heads/staging"]).toBe(before["refs/heads/staging"]);
  });
});

describe("parseAgentOutput", () => {
  const ok = { code: 0, timedOut: false, budgetUsd: 10 };
  it("итог JSON: стоимость, ходы, сессия, отчёт, отказы прав; строки журнала до JSON пропускаются", () => {
    const j = { type: "result", is_error: false, total_cost_usd: 1.25, num_turns: 7, session_id: "s1", result: "готово",
      permission_denials: [{ tool_name: "Bash", tool_input: { command: "git   push origin main" } }, { tool_name: "Write", tool_input: { file_path: "/etc/x" } }] };
    const r = parseAgentOutput(`шум\n${JSON.stringify(j)}\n`, ok);
    expect(r).toMatchObject({ status: "ok", cost_usd: 1.25, turns: 7, session_id: "s1", summary: "готово" });
    expect(r.denials).toEqual(["Bash: git push origin main", "Write: /etc/x"]);
  });

  it("таймаут без JSON — стоимость по лимиту; ошибка (is_error) — status error с подтипом и хвостом stderr", () => {
    expect(parseAgentOutput("", { code: null, timedOut: true, budgetUsd: 10 })).toMatchObject({ status: "timeout", cost_usd: 10 });
    const r = parseAgentOutput(JSON.stringify({ is_error: true, subtype: "error_max_budget_usd", total_cost_usd: 3 }), { code: 1, timedOut: false, budgetUsd: 10, errText: "spawn EPERM" });
    expect(r.status).toBe("error");
    expect(r.cost_usd).toBe(3);
    expect(r.error).toMatch(/error_max_budget_usd.*EPERM/);
  });

  it("падение без JSON (код ≠ 0) — error, стоимость по лимиту (оценка сверху)", () => {
    expect(parseAgentOutput("не JSON", { code: 2, timedOut: false, budgetUsd: 4 })).toMatchObject({ status: "error", cost_usd: 4 });
  });
});

describe("probeVerdict", () => {
  const a = (summary: string, status: "ok" | "error" = "ok") => ({ status, cost_usd: 0.1, wall_ms: 1, denials: [], summary });
  it("NIGHT_PROBE_EXIT=0 — годен; красный ./check или EPERM — отказ с причиной; нет метки — отказ", () => {
    expect(probeVerdict(a("./check зелёный\nNIGHT_PROBE_EXIT=0"))).toEqual({ ok: true });
    const e = probeVerdict(a("88 падений: Error: spawn EPERM\nNIGHT_PROBE_EXIT=1"));
    expect(e.ok).toBe(false);
    expect(e.reason).toMatch(/EPERM/);
    expect(probeVerdict(a("NIGHT_PROBE_EXIT=0 но spawn EPERM в выводе")).ok).toBe(false);
    expect(probeVerdict(a("не смог")).reason).toMatch(/NIGHT_PROBE_EXIT/);
    expect(probeVerdict({ ...a(""), status: "error", error: "код 1" }).ok).toBe(false);
  });
});

describe("runProcess", () => {
  it("таймаут гасит группу процесса и сообщает timedOut", async () => {
    const d = mkdtempSync(join(tmpdir(), "night-run-"));
    const r = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { cwd: d, out: join(d, "out.log"), timeoutMs: 300 });
    expect(r.timedOut).toBe(true);
    expect(r.ms).toBeLessThan(5000);
  });

  it("watch: досрочная остановка с причиной (бюджет bench)", async () => {
    const d = mkdtempSync(join(tmpdir(), "night-run-"));
    let n = 0;
    const r = await runProcess(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], {
      cwd: d, out: join(d, "out.log"), timeoutMs: 20_000, watchMs: 50, watch: () => (++n >= 2 ? "бюджет" : null),
    });
    expect(r.timedOut).toBe(false);
    expect(r.stopped).toBe("бюджет");
  });

  it("обычный выход: код, вывод в файл, stdin", async () => {
    const d = mkdtempSync(join(tmpdir(), "night-run-"));
    const r = await runProcess(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], { cwd: d, out: join(d, "out.log"), input: "привет", timeoutMs: 5000 });
    expect(r).toMatchObject({ code: 0, timedOut: false });
    expect(readFileSync(join(d, "out.log"), "utf8")).toBe("привет");
  });
});

describe("benchRunSpent", () => {
  it("сумма генерации (с прошлыми попытками) и прогонов судьи, включая неудачные", () => {
    const d = mkdtempSync(join(tmpdir(), "night-bench-"));
    mkdirSync(join(d, "s1", "judge-runs"), { recursive: true });
    writeFileSync(join(d, "s1", "gen.json"), JSON.stringify({ cost_usd: 2, prior_attempts: [{ cost_usd: 1 }] }));
    writeFileSync(join(d, "s1", "judge-runs", "1.json"), JSON.stringify({ cost_usd: 0.5 }));
    writeFileSync(join(d, "s1", "judge-runs", "1.failed-1.json"), JSON.stringify({ cost_usd: 0.1 }));
    mkdirSync(join(d, "s2"));
    writeFileSync(join(d, "scores.json"), "{}");
    expect(benchRunSpent(d)).toBeCloseTo(3.6);
    expect(benchRunSpent(join(d, "нет"))).toBe(0);
  });
});

describe("parseLsofCwd", () => {
  it("pid процессов с рабочим каталогом внутри worktree (не соседнего с тем же префиксом)", () => {
    const txt = ["p101", "fcwd", "n/w/night-1/app", "p102", "fcwd", "n/w/night-10", "p103", "fcwd", "n/w/night-1", "p104", "fcwd", "n/other"].join("\n");
    expect(parseLsofCwd(txt, "/w/night-1")).toEqual([101, 103]);
  });
});
