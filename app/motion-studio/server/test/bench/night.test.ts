// Оркестратор цикла качества (спека 2026-10-23-night-quality-loop) на фейковых git, агенте и bench:
// ветки итераций, fast-forward принятого, пометки бэклога, остановки (окно, бюджет, SSD,
// пустой бэклог), сбой итерации не останавливает ночь, продолжение без второй базовой линии.
// Предохранители по ревью ночи: серия сбоев, сбой окружения не «сжигает» пункт (B1),
// запрещённые пути (I2), подтверждающий прогон (I4), сдвиг main/staging (M5), бюджет и окно
// bench (M3), траты прерванного агента (M2).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CRITERIA } from "../../src/bench/metrics.js";
import {
  type AgentResult, type NightConfig, type NightDeps, type NightGit, type NightState,
  describePlan, forbiddenTouched, infraKind, isRunKey, latestNight, parseUntil, parseWindow, runKeyOf, runNight,
} from "../../src/bench/night.js";
import { parseBacklog } from "../../src/bench/quality-backlog.js";

const FP = { rubric_sha256: "r".repeat(64), anchors_sha256: "a".repeat(64) };
const SETS = { explainer: ["test1", "bench-abtest"], user: ["user-02", "user-06"] };
const BACKLOG = `# Бэклог

## Q01 — Первый
статус: открыт

Сделай раз.

## Q02 — Второй
статус: открыт

Сделай два.

## Q03 — Третий
статус: открыт

Сделай три.
`;

/** Фейковый git: ветки → коммит, текущая ветка, файлы коммитов. */
class FakeGit implements NightGit {
  branches = new Map<string, string>();
  cur = "";
  seq = 0;
  dirty = false;
  wt = new Set<string>();
  pushed: string[] = [];
  history = new Map<string, string[]>();
  files = new Map<string, string[]>();
  leftovers: string[] = [];
  private nextSha() {
    this.seq += 1;
    return `c${String(this.seq).padStart(7, "0")}`;
  }
  constructor(start: string) {
    this.branches.set("task", start);
    this.branches.set("main", start);
    this.history.set(start, []);
  }
  worktreeExists(p: string) { return this.wt.has(p); }
  addWorktree(_from: string, path: string, branch: string, at: string) {
    this.wt.add(path);
    mkdirSync(join(path, "docs"), { recursive: true });
    writeFileSync(join(path, "docs", "quality-backlog.md"), BACKLOG);
    this.branches.set(branch, at);
    this.cur = branch;
  }
  head() { return this.branches.get(this.cur)!; }
  branch() { return this.cur; }
  isClean() { return !this.dirty; }
  switchNew(_cwd: string, b: string, from: string) {
    if (this.branches.has(b)) throw new Error(`ветка ${b} уже есть`);
    this.branches.set(b, from);
    this.cur = b;
  }
  switchTo(_cwd: string, b: string) {
    if (!this.branches.has(b)) throw new Error(`нет ветки ${b}`);
    if (this.dirty) throw new Error("грязное дерево");
    this.cur = b;
  }
  ffMerge(_cwd: string, ref: string) {
    const target = this.branches.get(ref)!;
    const here = this.head();
    if (!(this.history.get(target) ?? []).includes(here) && target !== here) throw new Error("не fast-forward");
    this.branches.set(this.cur, target);
  }
  /** Коммит на текущей ветке. */
  commit(files = ["app/motion-studio/server/src/pipeline/x.ts"]) {
    const parent = this.head();
    const sha = this.nextSha();
    this.history.set(sha, [parent, ...(this.history.get(parent) ?? [])]);
    this.files.set(sha, files);
    this.branches.set(this.cur, sha);
    return sha;
  }
  private chain(from: string) {
    const h = this.head();
    const c = [h, ...(this.history.get(h) ?? [])];
    const i = c.indexOf(from);
    return i < 0 ? c : c.slice(0, i);
  }
  log(_cwd: string, from: string) { return this.chain(from).map((s) => `${s} коммит`); }
  changedFiles(_cwd: string, from: string) { return this.chain(from).flatMap((s) => this.files.get(s) ?? []); }
  refs() { return { "refs/heads/main": this.branches.get("main")! }; }
  commitFile() { this.commit(["docs/quality-backlog.md"]); }
  saveLeftover(_cwd: string, dir: string) {
    this.dirty = false;
    this.leftovers.push(dir);
    return { dir, patch: true, untracked: [] };
  }
  push(_cwd: string, bs: string[]) {
    this.pushed.push(...bs);
    return null;
  }
}

type AgentPlan = Partial<AgentResult> & { commits?: number; files?: string[]; moveMain?: boolean; switchTo?: string; dirty?: boolean };
interface Plan {
  /** Оценки explainer/user, которые bench «получит» на очередном прогоне. */
  bench: { explainer: number[]; user: number[]; incomplete?: boolean; error?: string; stopped?: "budget" | "timeout" }[];
  agent: AgentPlan[];
}

function setup(plan: Plan, over: Partial<NightConfig> = {}, now0 = new Date("2026-10-23T22:00:00")) {
  const root = mkdtempSync(join(tmpdir(), "night-test-"));
  const git = new FakeGit("c0000000");
  let clock = now0.getTime();
  const calls: string[] = [];
  const benchArgs: { runId: string; timeoutMs: number; maxCostUsd: number }[] = [];
  let storage = true;
  const cfg: NightConfig = {
    date: "2026-10-23",
    until: new Date(now0.getTime() + 9 * 3600_000).toISOString(),
    budgetUsd: 150,
    smoke: true,
    agentTimeoutMs: 3600_000,
    agentBudgetUsd: 20,
    minAgentMs: 15 * 60_000,
    benchEstimateMs: 3600_000,
    benchCostEstimateUsd: 30,
    sets: SETS,
    source: { branch: "task", commit: "c0000000", root: join(root, "src") },
    worktree: join(root, "wt"),
    stateDir: join(root, "state"),
    examplesDir: join(root, "examples"),
    briefTemplate: "Пункт {{item_id}}: {{item_title}}\n{{item_body}}\nВетка {{branch}}, до {{deadline}}.",
    ...over,
  };
  const scoresFile = (cwd: string, run: string) => join(cwd, "tmp", "bench", run, "scores.json");
  const deps: NightDeps = {
    now: () => new Date(clock),
    log: () => {},
    storageOnline: () => storage,
    git,
    runAgent: async (a) => {
      const p = plan.agent.shift() ?? {};
      calls.push(`agent ${git.cur} ${a.brief.split("\n")[0]}`);
      if (p.switchTo) {
        git.branches.set(p.switchTo, git.head());
        git.cur = p.switchTo;
      }
      for (let i = 0; i < (p.commits ?? 1); i++) git.commit(p.files);
      if (p.moveMain) git.branches.set("main", "evil000");
      if (p.dirty) git.dirty = true;
      clock += p.wall_ms ?? 30 * 60_000;
      const rest: Partial<AgentResult> = Object.fromEntries(Object.entries(p).filter(([k]) => !["commits", "files", "moveMain", "switchTo", "dirty"].includes(k)));
      return { status: "ok", cost_usd: 5, wall_ms: 30 * 60_000, denials: [], ...rest };
    },
    runCheck: async () => {
      calls.push(`check ${git.cur}`);
      return true;
    },
    runBench: async (a) => {
      calls.push(`bench ${a.set} ${a.runId}`);
      benchArgs.push({ runId: a.runId, timeoutMs: a.timeoutMs, maxCostUsd: a.maxCostUsd });
      const p = a.set === "explainer" ? plan.bench[0]! : plan.bench.shift()!;
      clock += 20 * 60_000;
      if (p.stopped) return { ok: false, stopped: p.stopped, error: p.stopped };
      if (p.error) return { ok: false, error: p.error };
      const ids = SETS[a.set];
      const vals = p[a.set];
      const rows = ids.map((id, i) => ({
        id,
        judge: p.incomplete && i === 1 ? null : { overall: vals[i]!, criteria: Object.fromEntries(CRITERIA.map((c) => [c, vals[i]!])) },
        gen: { job_status: "completed", status: "completed", wall_ms: 300_000, stage_wall_ms: { total: 300_000 } },
        gen_cost_total_usd: 2,
      }));
      mkdirSync(join(a.cwd, "tmp", "bench", a.runId, ids[0]!), { recursive: true });
      writeFileSync(join(a.cwd, "tmp", "bench", a.runId, ids[0]!, "preview.mp4"), "mp4");
      writeFileSync(scoresFile(a.cwd, a.runId), JSON.stringify({ summary: { run: a.runId, judge_model: "opus", judge: FP, gen_cost_usd: 4, judge_cost_usd: 1 }, rows }));
      return { ok: true };
    },
    findBaseline: () => null,
  };
  return { cfg, deps, git, calls, benchArgs, root, setStorage: (v: boolean) => (storage = v), advance: (ms: number) => (clock += ms) };
}

const backlogOf = (wt: string) => parseBacklog(readFileSync(join(wt, "docs", "quality-backlog.md"), "utf8"));
const B = (explainer: number[], user: number[] = [5, 5]) => ({ explainer, user });

describe("runNight", () => {
  it("базовая линия, принятая итерация с подтверждающим прогоном (ff night/<дата>), не принятая (пункт вниз), остановка по окну; отчёт", async () => {
    const t = setup({
      bench: [B([6, 6]), B([6.5, 6.5]), B([6.5, 6.5]), B([6.5, 6.5])],
      agent: [{}, {}],
    }, { until: new Date(new Date("2026-10-23T22:00:00").getTime() + 4 * 3600_000).toISOString() });
    const st = await runNight(t.cfg, t.deps);
    expect(t.calls).toEqual([
      expect.stringMatching(/^bench explainer night-2026-10-23-0-c000000$/),
      "bench user night-2026-10-23-0-c000000-user",
      expect.stringMatching(/^agent night\/2026-10-23-1 Пункт Q01: Первый/),
      "check night/2026-10-23-1",
      expect.stringMatching(/^bench explainer night-2026-10-23-1-c\d{6}$/),
      expect.stringMatching(/^bench user night-2026-10-23-1-.*-user$/),
      expect.stringMatching(/^bench explainer night-2026-10-23-1-.*-r2$/),
      expect.stringMatching(/^bench user night-2026-10-23-1-.*-user-r2$/),
      expect.stringMatching(/^agent night\/2026-10-23-2 Пункт Q02/),
      "check night/2026-10-23-2",
      expect.stringMatching(/^bench explainer night-2026-10-23-2-/),
      expect.stringMatching(/^bench user night-2026-10-23-2-/),
    ]);
    expect(st.iterations.map((i) => [i.n, i.item.id, i.outcome])).toEqual([[1, "Q01", "принято"], [2, "Q02", "не дало роста"]]);
    // принятая итерация: night/<дата> — fast-forward на её коммит (+ пометка бэклога)
    const it1 = st.iterations[0]!;
    expect(t.git.history.get(t.git.branches.get("night/2026-10-23")!)).toContain(it1.head_commit);
    expect(it1.first_verdict!.accepted).toBe(true);
    // базовая линия — среднее двух прогонов кандидата, не один удачный
    expect(st.baseline!.source).toMatch(/итерация 1 \(среднее двух прогонов\)/);
    expect(st.baseline!.scores.explainer).toMatch(/-avg\/scores\.json$/);
    // не принятая: ветка осталась, night/<дата> её коммита не содержит, следующая — от принятого
    const it2 = st.iterations[1]!;
    expect(t.git.branches.get("night/2026-10-23-2")).toBe(it2.head_commit);
    expect(t.git.history.get(t.git.branches.get("night/2026-10-23")!)).not.toContain(it2.head_commit);
    expect(it2.start_commit).not.toBe(it1.start_commit);
    expect(it2.verdict!.reasons.join(" ")).toMatch(/explainer \+0\.00/);
    // бэклог в ветке ночи: Q01 принят, Q02 внизу «не дало роста»
    const b = backlogOf(t.cfg.worktree);
    expect(b.items.map((i) => [i.id, i.status.split(" ")[0]])).toEqual([["Q01", "принято"], ["Q03", "открыт"], ["Q02", "не"]]);
    expect(b.items[0]!.status).toBe("принято (ночь 2026-10-23, #1)");
    expect(st.stop!.reason).toMatch(/окно/);
    const report = readFileSync(join(t.cfg.stateDir, "REPORT.md"), "utf8");
    expect(report).toMatch(/# Прогон цикла качества 2026-10-23/);
    expect(report).toMatch(/Q01.*принято/);
    expect(report).toMatch(/6\.00 → 6\.50/);
    expect(report).toMatch(/подтверждающий прогон/);
    // время в отчёте — местное (L5)
    expect(report).toMatch(/Окно до 2026-10-24 02:00 \(местное\)/);
    // ролики принятой итерации скопированы с README
    expect(existsSync(join(t.cfg.examplesDir, "night-2026-10-23-1", "README.md"))).toBe(true);
    expect(existsSync(join(t.cfg.examplesDir, "night-2026-10-23-1", "explainer-test1.mp4"))).toBe(true);
    expect(t.git.pushed).toContain("night/2026-10-23");
    // бюджет: 2 агента по $5 + 4 пары bench по $10
    expect(st.spent_usd).toBe(50);
  });

  it("сбой агента (таймаут) — пункт «сбой» вниз, ночь идёт дальше; оставленные правки — патчем в каталог итерации", async () => {
    const t = setup({ bench: [B([6, 6]), B([7, 7]), B([7, 7])], agent: [{ status: "timeout", commits: 1, dirty: true }, {}] }, { maxIterations: 2 });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations.map((i) => [i.item.id, i.outcome])).toEqual([["Q01", "сбой"], ["Q02", "принято"]]);
    expect(st.iterations[0]!.leftover).toEqual({ dir: join(t.cfg.stateDir, "1"), patch: true, untracked: [] });
    expect(st.iterations[0]!.failure).toEqual({ kind: "agent_timeout", infra: false });
    expect(t.calls.filter((c) => c.startsWith("check"))).toEqual(["check night/2026-10-23-2"]);
    expect(st.stop!.reason).toMatch(/предел итераций/);
    expect(backlogOf(t.cfg.worktree).items.at(-1)!.status).toMatch(/^сбой \(ночь 2026-10-23, #1\): агент: timeout/);
    expect(readFileSync(join(t.cfg.stateDir, "REPORT.md"), "utf8")).toMatch(/wip\.patch/);
  });

  it("агент без коммитов — сбой без bench, пункт вниз", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [{ commits: 0 }] }, { maxIterations: 1 });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.outcome).toBe("сбой");
    expect(st.iterations[0]!.failure).toEqual({ kind: "no_commits", infra: false });
    expect(st.iterations[0]!.note).toMatch(/коммит/);
    expect(t.calls.filter((c) => c.startsWith("bench"))).toHaveLength(2);
    expect(backlogOf(t.cfg.worktree).items.at(-1)!.id).toBe("Q01");
  });

  it("B1: сбой окружения (EPERM) оставляет пункт открытым; два одинаковых сбоя подряд — остановка ночи", async () => {
    const eperm = { commits: 0, summary: "pre-commit ./check: 88 падений Error: spawn EPERM" };
    const t = setup({ bench: [B([6, 6])], agent: [eperm, eperm, {}] });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations.map((i) => [i.item.id, i.outcome, i.failure?.kind])).toEqual([["Q01", "сбой", "eperm"], ["Q01", "сбой", "eperm"]]);
    expect(st.stop!.reason).toMatch(/два сбоя подряд.*EPERM/);
    const q1 = backlogOf(t.cfg.worktree).items[0]!;
    expect(q1.status).toBe("открыт");
    expect(q1.history).toEqual([expect.stringMatching(/сбой инфраструктуры \(ночь 2026-10-23, #1\)/), expect.stringMatching(/#2/)]);
    expect(t.calls.filter((c) => c.startsWith("agent"))).toHaveLength(2);
  });

  it("B1: два сбоя подряд одного рода и без окружения (нет коммитов) — тоже остановка; разные роды — нет", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [{ commits: 0 }, { commits: 0 }] });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations).toHaveLength(2);
    expect(st.stop!.reason).toMatch(/два сбоя подряд/);
    const u = setup({ bench: [B([6, 6])], agent: [{ commits: 0 }, { status: "timeout" }, { commits: 0 }] }, { maxIterations: 3 });
    expect((await runNight(u.cfg, u.deps)).stop!.reason).toMatch(/предел итераций/);
  });

  it("B1: ./check красный из-за окружения (EPERM в журнале) — сбой окружения, пункт открыт", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [{}] }, { maxIterations: 1 });
    t.deps.runCheck = async ({ logFile }) => {
      mkdirSync(join(logFile, ".."), { recursive: true });
      writeFileSync(logFile, "Error: spawn EPERM\n");
      return false;
    };
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.failure).toEqual({ kind: "eperm", infra: true });
    expect(backlogOf(t.cfg.worktree).items[0]!.status).toBe("открыт");
  });

  it("I2: агент изменил запрещённые пути (check, bench) — «отклонено» до ./check, bench, commit/push оркестратора", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [{ files: ["check", "app/motion-studio/server/src/bench/metrics.ts", "app/motion-studio/render/src/a.ts"] }] }, { maxIterations: 1 });
    const commitsBefore: string[] = [];
    const orig = t.git.commitFile.bind(t.git);
    t.git.commitFile = () => {
      commitsBefore.push(t.git.cur);
      orig();
    };
    const st = await runNight(t.cfg, t.deps);
    const it0 = st.iterations[0]!;
    expect(it0.outcome).toBe("отклонено");
    expect(it0.forbidden).toEqual(["check", "app/motion-studio/server/src/bench/metrics.ts"]);
    expect(it0.note).toMatch(/запрещённые пути/);
    expect(t.calls.filter((c) => c.startsWith("check") || c.includes("-1-"))).toEqual([]);
    // пометка бэклога — коммитом в ветке ночи (её хуки — от принятого), не в ветке агента
    expect(commitsBefore).toEqual(["night/2026-10-23"]);
    expect(backlogOf(t.cfg.worktree).items.at(-1)!.status).toMatch(/^отклонено \(ночь 2026-10-23, #1\): запрещённые пути/);
  });

  it("M5: агент сдвинул main — ночь останавливается", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [{ moveMain: true }, {}] });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations).toHaveLength(1);
    expect(st.stop!.reason).toMatch(/защищённые ветки.*main c000000 → evil000/);
    expect(t.calls.filter((c) => c.startsWith("check"))).toEqual([]);
  });

  it("агент сменил ветку и коммитил в ней — оркестратор возвращает ветку итерации, коммиты чужой ветки не засчитываются", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [{ switchTo: "agent-own" }] }, { maxIterations: 1 });
    const st = await runNight(t.cfg, t.deps);
    const it0 = st.iterations[0]!;
    expect(it0.note).toMatch(/агент оставил ветку agent-own вместо night\/2026-10-23-1/);
    expect(it0.commits).toEqual([]);
    expect(it0.outcome).toBe("сбой");
    expect(t.calls.filter((c) => c.startsWith("check"))).toEqual([]);
  });

  it("bench неполный (сцена без оценки) — не принято как сбой, базовая линия прежняя", async () => {
    const t = setup({ bench: [B([6, 6]), { ...B([9, 9], [9, 9]), incomplete: true }], agent: [{}] }, { maxIterations: 1 });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.outcome).toBe("сбой");
    expect(st.iterations[0]!.verdict!.reasons[0]).toMatch(/неполный прогон explainer/);
    expect(st.baseline!.runs.explainer).toMatch(/-0-/);
  });

  it("SSD отключён перед bench итерации — остановка с причиной, bench не зовётся; продолжение доводит итерацию без второй базовой линии", async () => {
    const t = setup({ bench: [B([6, 6]), B([7, 7]), B([7, 7])], agent: [{}] }, { maxIterations: 1 });
    const orig = t.deps.runCheck;
    t.deps.runCheck = async (a) => {
      t.setStorage(false);
      return orig(a);
    };
    let st = await runNight(t.cfg, t.deps);
    expect(st.stop!.reason).toMatch(/SSD/);
    expect(st.iterations[0]!.phase).toBe("bench");
    expect(t.calls.filter((c) => c.startsWith("bench"))).toHaveLength(2);
    // утро: SSD снова на месте, повторный запуск продолжает ту же итерацию
    t.setStorage(true);
    t.deps.runCheck = orig;
    st = await runNight(t.cfg, t.deps);
    expect(t.calls.filter((c) => c.startsWith("bench"))).toHaveLength(6);
    expect(t.calls.filter((c) => c.includes("-0-"))).toHaveLength(2);
    expect(t.calls.filter((c) => c.startsWith("agent"))).toHaveLength(1);
    expect(st.iterations.map((i) => i.outcome)).toEqual(["принято"]);
  });

  it("SSD отключён между наборами explainer и user — остановка, user не зовётся; продолжение доводит итерацию", async () => {
    const t = setup({ bench: [B([6, 6]), B([7, 7]), B([7, 7])], agent: [{}] }, { maxIterations: 1 });
    const orig = t.deps.runBench;
    t.deps.runBench = async (a) => {
      const r = await orig(a);
      if (/-1-/.test(a.runId) && a.set === "explainer" && !a.runId.endsWith("-r2")) t.setStorage(false);
      return r;
    };
    let st = await runNight(t.cfg, t.deps);
    expect(st.stop!.reason).toMatch(/SSD/);
    expect(st.iterations[0]!.phase).toBe("bench");
    expect(t.calls.filter((c) => /^bench user .*-1-/.test(c))).toEqual([]);
    t.setStorage(true);
    t.deps.runBench = orig;
    st = await runNight(t.cfg, t.deps);
    expect(st.iterations.map((i) => i.outcome)).toEqual(["принято"]);
    expect(t.calls.filter((c) => c.includes("-0-"))).toHaveLength(2);
  });

  it("M3: bench получает потолок трат (остаток бюджета) и таймаут не дальше окна; остановка по бюджету — ночь стоит, итерация в фазе bench", async () => {
    const t = setup({ bench: [B([6, 6]), { ...B([7, 7]), stopped: "budget" }], agent: [{}] }, { until: new Date(new Date("2026-10-23T22:00:00").getTime() + 3 * 3600_000).toISOString() });
    const st = await runNight(t.cfg, t.deps);
    expect(t.benchArgs[0]!.maxCostUsd).toBe(150);
    expect(t.benchArgs[1]!.maxCostUsd).toBe(145);
    // итерация: потрачено 10 (база) + 5 (агент)
    expect(t.benchArgs[2]!.maxCostUsd).toBe(135);
    for (const a of t.benchArgs) expect(a.timeoutMs).toBeLessThanOrEqual(3 * 3600_000);
    expect(t.benchArgs[2]!.timeoutMs).toBeLessThanOrEqual(3 * 3600_000 - 40 * 60_000 - 30 * 60_000);
    expect(st.stop!.reason).toMatch(/бюджет \$150 исчерпан во время bench explainer/);
    expect(st.iterations[0]!.phase).toBe("bench");
  });

  it("I4: подтверждающий прогон не подтвердил рост — «не дало роста», базовая линия прежняя", async () => {
    const t = setup({ bench: [B([6, 6]), B([6.5, 6.5]), B([5.5, 5.5])], agent: [{}] }, { maxIterations: 1 });
    const st = await runNight(t.cfg, t.deps);
    const it0 = st.iterations[0]!;
    expect(it0.outcome).toBe("не дало роста");
    expect(it0.first_verdict!.accepted).toBe(true);
    expect(it0.note).toMatch(/не подтвердилось повтором/);
    expect(st.baseline!.runs.explainer).toMatch(/-0-/);
    expect(t.git.history.get(t.git.branches.get("night/2026-10-23")!) ?? []).not.toContain(it0.head_commit);
  });

  it("I4: подтверждающий прогон не помещается в бюджет: уверенное «принято» — принято по одному прогону (с пометкой); пограничное — сбой, пункт открыт", async () => {
    const t = setup({ bench: [B([6, 6]), B([7, 7])], agent: [{ cost_usd: 130 }] }, { maxIterations: 1 });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.outcome).toBe("принято");
    expect(st.baseline!.single_run).toBe(true);
    expect(readFileSync(join(t.cfg.stateDir, "REPORT.md"), "utf8")).toMatch(/один прогон/);
    const u = setup({ bench: [B([6, 6]), B([6.15, 6.25])], agent: [{ cost_usd: 130 }] }, { maxIterations: 1 });
    const su = await runNight(u.cfg, u.deps);
    expect(su.iterations[0]!.verdict!.borderline).toBe(true);
    expect(su.iterations[0]!.failure).toEqual({ kind: "unconfirmed", infra: true });
    expect(backlogOf(u.cfg.worktree).items[0]!.status).toBe("открыт");
  });

  it("разные судьи у прогонов — сбой окружения, а не «не дало роста» (L4)", async () => {
    const t = setup({ bench: [B([6, 6]), B([7, 7])], agent: [{}] }, { maxIterations: 1 });
    const orig = t.deps.runBench;
    t.deps.runBench = async (a) => {
      const r = await orig(a);
      if (/-1-/.test(a.runId)) {
        const p = join(a.cwd, "tmp", "bench", a.runId, "scores.json");
        const s = JSON.parse(readFileSync(p, "utf8"));
        s.summary.judge = { ...FP, rubric_sha256: "x".repeat(64) };
        writeFileSync(p, JSON.stringify(s));
      }
      return r;
    };
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.failure).toEqual({ kind: "judge", infra: true });
    expect(backlogOf(t.cfg.worktree).items[0]!.status).toBe("открыт");
  });

  it("прерывание во время агента: траты по лимиту итерации (M2), сбой окружения — пункт остаётся открытым и берётся снова", async () => {
    const t = setup({ bench: [B([6, 6]), B([7, 7]), B([7, 7])], agent: [{}] }, { maxIterations: 2 });
    await runNight({ ...t.cfg, maxIterations: 0 }, t.deps);
    // имитация обрыва: итерация 1 в фазе agent
    const sp = join(t.cfg.stateDir, "state.json");
    const st0 = JSON.parse(readFileSync(sp, "utf8")) as NightState;
    t.git.switchNew("", "night/2026-10-23-1", st0.accepted_commit);
    st0.iterations.push({ n: 1, item: { id: "Q01", title: "Первый", acceptance: "рост" }, branch: "night/2026-10-23-1", start_commit: st0.accepted_commit, phase: "agent", started_at: "2026-10-23T23:00:00.000Z", limits: { agent_ms: 3600_000, agent_usd: 17 } });
    delete st0.stop;
    writeFileSync(sp, JSON.stringify(st0));
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations.map((i) => [i.item.id, i.outcome])).toEqual([["Q01", "сбой"], ["Q01", "принято"]]);
    expect(st.iterations[0]!.note).toMatch(/прерван/);
    expect(st.iterations[0]!.agent!.cost_usd).toBe(17);
    expect(st.iterations[0]!.failure).toEqual({ kind: "interrupted", infra: true });
  });

  it("прерывание после того, как агент записал итог (agent.json) — траты по нему, итерация идёт дальше обычным путём", async () => {
    const t = setup({ bench: [B([6, 6]), B([7, 7]), B([7, 7])], agent: [] }, { maxIterations: 1 });
    await runNight({ ...t.cfg, maxIterations: 0 }, t.deps);
    const sp = join(t.cfg.stateDir, "state.json");
    const st0 = JSON.parse(readFileSync(sp, "utf8")) as NightState;
    t.git.switchNew("", "night/2026-10-23-1", st0.accepted_commit);
    t.git.commit();
    st0.iterations.push({ n: 1, item: { id: "Q01", title: "Первый", acceptance: "рост" }, branch: "night/2026-10-23-1", start_commit: st0.accepted_commit, phase: "agent", started_at: "2026-10-23T23:00:00.000Z", limits: { agent_ms: 3600_000, agent_usd: 17 } });
    delete st0.stop;
    writeFileSync(sp, JSON.stringify(st0));
    mkdirSync(join(t.cfg.stateDir, "1"), { recursive: true });
    writeFileSync(join(t.cfg.stateDir, "1", "agent.json"), JSON.stringify({ type: "result", is_error: false, total_cost_usd: 2.5, result: "сделано" }));
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.agent!.cost_usd).toBe(2.5);
    expect(st.iterations[0]!.outcome).toBe("принято");
  });

  it("пустой бэклог — досрочный конец с отчётом", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [] });
    t.git.addWorktree("", t.cfg.worktree, "night/2026-10-23", "c0000000");
    writeFileSync(join(t.cfg.worktree, "docs", "quality-backlog.md"), "## Q01 — a\nстатус: принято (ночь 2026-10-20)\n");
    const st = await runNight(t.cfg, t.deps);
    expect(st.stop!.reason).toMatch(/нет открытых/);
    expect(existsSync(join(t.cfg.stateDir, "REPORT.md"))).toBe(true);
  });

  it("бюджет не вмещает итерацию — остановка; выбранный пункт (--item) — только он; неоткрытый --item — понятная остановка (L2)", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [] }, { budgetUsd: 20 });
    expect((await runNight(t.cfg, t.deps)).stop!.reason).toMatch(/бюджет/);
    const u = setup({ bench: [B([6, 6]), B([6, 6])], agent: [{}] }, { item: "Q03" });
    const st = await runNight(u.cfg, u.deps);
    expect(st.iterations.map((i) => i.item.id)).toEqual(["Q03"]);
    expect(st.stop!.reason).toMatch(/выбранный пункт/);
    const w = setup({ bench: [B([6, 6])], agent: [] }, { item: "Q09" });
    expect((await runNight(w.cfg, w.deps)).stop!.reason).toMatch(/--item: бэклог: пункта Q09 нет/);
  });

  it("worktree не подготовлен (npm ci) — остановка до трат: ни bench, ни агента", async () => {
    const t = setup({ bench: [], agent: [] });
    t.deps.prepareWorktree = async () => false;
    const st = await runNight(t.cfg, t.deps);
    expect(st.stop!.reason).toMatch(/не подготовлен/);
    expect(t.calls).toEqual([]);
  });

  it("M1: после агента — уборка его процессов; хранилище занято перед bench — остановка, итерация в фазе bench", async () => {
    const t = setup({ bench: [B([6, 6])], agent: [{ pid: 4242 }] }, { maxIterations: 1 });
    const cleaned: unknown[] = [];
    t.deps.cleanupAgent = async (a) => {
      cleaned.push(a);
      return ["pid 777 (npm run dev) — cwd в worktree ночи"];
    };
    let busy: string | null = null;
    t.deps.ownerBusy = async () => busy;
    t.deps.runCheck = async () => {
      busy = "owner_busy: хранилище занято другим процессом (server, pid 777)";
      return true;
    };
    const st = await runNight(t.cfg, t.deps);
    expect(cleaned).toEqual([{ cwd: t.cfg.worktree, pid: 4242, since: expect.any(Date) }]);
    expect(st.iterations[0]!.cleanup).toEqual(["pid 777 (npm run dev) — cwd в worktree ночи"]);
    expect(st.stop!.reason).toMatch(/хранилище занято: owner_busy/);
    expect(st.iterations[0]!.phase).toBe("bench");
  });

  it("базовая линия из evidence для текущего коммита — без прогона", async () => {
    const t = setup({ bench: [B([6.5, 6.5]), B([6.5, 6.5])], agent: [{}] }, { maxIterations: 1 });
    const dir = join(t.root, "ev");
    mkdirSync(dir, { recursive: true });
    for (const [set, v] of [["explainer", 6], ["user", 5]] as const) {
      writeFileSync(join(dir, `${set}.json`), JSON.stringify({
        summary: { run: `ev-${set}`, judge_model: "opus", judge: FP },
        rows: SETS[set].map((id) => ({ id, judge: { overall: v, criteria: Object.fromEntries(CRITERIA.map((c) => [c, v])) }, gen: { job_status: "completed", stage_wall_ms: { total: 300_000 } }, gen_cost_total_usd: 2 })),
      }));
    }
    t.deps.findBaseline = () => ({ explainer: join(dir, "explainer.json"), user: join(dir, "user.json") });
    const st = await runNight(t.cfg, t.deps);
    expect(t.calls.filter((c) => c.includes("-0-"))).toEqual([]);
    expect(st.iterations[0]!.outcome).toBe("принято");
  });
});

describe("forbiddenTouched", () => {
  it("хуки, check, bootstrap, измеритель, обёртка цикла, бэклог, зависимости — запрещены; код генератора — нет", () => {
    expect(forbiddenTouched([
      ".githooks/pre-push", "check", "bootstrap.sh", "finish", "quality-loop", "night", ".claude/settings.json", "docs/quality-backlog.md",
      "app/motion-studio/server/src/bench/sets.ts", "app/motion-studio/scripts/bench-set.mts", "app/motion-studio/scripts/night.mts",
      "app/motion-studio/prompts/rubric-judge.md", "app/motion-studio/package.json", "app/motion-studio/render/package.json",
      "app/motion-studio/server/src/pipeline/generate.ts", "app/motion-studio/prompts/engineer.md", "docs/checklist.md", "checker",
    ])).toEqual([
      ".githooks/pre-push", "check", "bootstrap.sh", "finish", "quality-loop", ".claude/settings.json", "docs/quality-backlog.md",
      "app/motion-studio/server/src/bench/sets.ts", "app/motion-studio/scripts/bench-set.mts", "app/motion-studio/scripts/night.mts",
      "app/motion-studio/prompts/rubric-judge.md", "app/motion-studio/package.json", "app/motion-studio/render/package.json",
    ]);
  });
});

describe("infraKind", () => {
  it("EPERM, owner_busy, хранилище — сбой окружения; обычная ошибка теста — нет", () => {
    expect(infraKind("Error: spawn EPERM")).toBe("eperm");
    expect(infraKind("OwnerBusyError: owner_busy: хранилище занято")).toBe("owner_busy");
    expect(infraKind("StorageError: storage_unavailable")).toBe("storage");
    expect(infraKind("AssertionError: expected 1 to be 2")).toBeNull();
  });
});

describe("latestNight", () => {
  it("выбирает по дате, времени и номеру smoke; старый ключ раньше временного того же дня", () => {
    const names = [
      "2026-10-22-2359", "2026-10-23", "2026-10-23-0915", "2026-10-23-1740",
      "2026-10-23-smoke10", "2026-10-23-0915-smoke", "2026-10-23-1740-smoke", "мусор",
    ];
    expect(latestNight(names, false)).toBe("2026-10-23-1740");
    expect(latestNight(names, true)).toBe("2026-10-23-1740-smoke");
    expect(latestNight(["2026-10-23-smoke", "2026-10-23-smoke2", "2026-10-23-smoke10"], true)).toBe("2026-10-23-smoke10");
    expect(latestNight(["2026-10-24-smoke", "2026-10-23-smoke9"], true)).toBe("2026-10-24-smoke");
    expect(latestNight([], true)).toBeUndefined();
  });
});

describe("runKeyOf", () => {
  it("по умолчанию включает местные дату и время; два старта одного дня дают разные ключи", () => {
    const first = runKeyOf(new Date(2026, 9, 23, 9, 15), false);
    const second = runKeyOf(new Date(2026, 9, 23, 17, 40), false);
    expect(first).toBe("2026-10-23-0915");
    expect(second).toBe("2026-10-23-1740");
    expect(first).not.toBe(second);
    expect(runKeyOf(new Date(2026, 9, 23, 17, 40), true)).toBe("2026-10-23-1740-smoke");
  });

  it("принимает новые и старые ключи, но проверяет календарь и время", () => {
    expect(["2026-10-23-1740", "2026-10-23-1740-smoke", "2026-10-23", "2026-10-23-smoke10"].every(isRunKey)).toBe(true);
    expect(["2026-02-30-1200", "2026-10-23-2460", "23-10-2026"].some(isRunKey)).toBe(false);
  });
});

describe("parseUntil", () => {
  const now = new Date("2026-10-23T22:30:00");
  it("ЧЧ:ММ — ближайшее такое время впереди; ISO — как есть; прошлое — ошибка", () => {
    expect(parseUntil("07:00", now).getTime()).toBe(new Date("2026-10-24T07:00:00").getTime());
    expect(parseUntil("23:15", now).getTime()).toBe(new Date("2026-10-23T23:15:00").getTime());
    expect(parseUntil("2026-10-24T03:00", now).getTime()).toBe(new Date("2026-10-24T03:00").getTime());
    expect(() => parseUntil("2026-10-23T21:00", now)).toThrow(/прошлом/);
    expect(() => parseUntil("утром", now)).toThrow(/--until/);
  });
});

describe("parseWindow", () => {
  const now = new Date("2026-10-23T12:00:00");

  it("--hours задаёт окно от старта, без флагов внутренний предел — 14 дней", () => {
    expect(parseWindow(undefined, "2.5", now).getTime()).toBe(now.getTime() + 2.5 * 3600_000);
    expect(parseWindow(undefined, undefined, now).getTime()).toBe(now.getTime() + 14 * 24 * 3600_000);
  });

  it("--hours несовместим с --until и должен быть положительным", () => {
    expect(() => parseWindow("18:00", "2", now)).toThrow(/вместе с --until/);
    expect(() => parseWindow(undefined, "0", now)).toThrow(/число > 0/);
  });
});

describe("describePlan", () => {
  it("план прогона: окно, бюджет, ветки, worktree, базовая линия, порядок пунктов; без побочных эффектов", () => {
    const t = setup({ bench: [], agent: [] });
    const txt = describePlan(t.cfg, { now: new Date("2026-10-23T22:00:00"), backlogMd: BACKLOG, state: null, baseline: null, worktreeExists: false, agentCommand: "claude -p …" });
    expect(txt).toMatch(/night\/2026-10-23/);
    expect(txt).toMatch(/night\/2026-10-23-<n>/);
    expect(txt).toMatch(/Q01 — Первый/);
    expect(txt).toMatch(/базовая линия: прогон/);
    expect(txt).toMatch(/\$150/);
    expect(existsSync(t.cfg.stateDir)).toBe(false);
  });

  it("без окна пишет стоп по бюджету и бэклогу, число итераций оценивает по бюджету", () => {
    const now = new Date("2026-10-23T22:00:00");
    const t = setup({ bench: [], agent: [] }, { until: new Date(now.getTime() + 14 * 24 * 3600_000).toISOString() });
    const txt = describePlan(t.cfg, { now, backlogMd: BACKLOG, state: null, baseline: null, worktreeExists: false, agentCommand: "claude -p …" });
    expect(txt).toMatch(/окно: не задано — стоп по бюджету и бэклогу/);
    expect(txt).toMatch(/оценка: ~2 итераций/);
  });
});
