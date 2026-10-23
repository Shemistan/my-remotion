// Оркестратор ночи (спека 2026-10-23-night-quality-loop) на фейковых git, агенте и bench:
// ветки итераций, fast-forward принятого, пометки бэклога, остановки (окно, бюджет, SSD,
// пустой бэклог), сбой итерации не останавливает ночь, продолжение без второй базовой линии.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CRITERIA } from "../../src/bench/metrics.js";
import { type AgentResult, type NightConfig, type NightDeps, type NightGit, type NightState, describePlan, parseUntil, runNight } from "../../src/bench/night.js";
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

/** Фейковый git: ветки → коммит, текущая ветка, счётчик коммитов. */
class FakeGit implements NightGit {
  branches = new Map<string, string>();
  cur = "";
  seq = 0;
  dirty = false;
  wt = new Set<string>();
  pushed: string[] = [];
  history = new Map<string, string[]>();
  private nextSha() {
    this.seq += 1;
    return `c${String(this.seq).padStart(7, "0")}`;
  }
  constructor(start: string) {
    this.branches.set("task", start);
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
    this.cur = b;
  }
  ffMerge(_cwd: string, ref: string) {
    const target = this.branches.get(ref)!;
    const here = this.head();
    if (!(this.history.get(target) ?? []).includes(here) && target !== here) throw new Error("не fast-forward");
    this.branches.set(this.cur, target);
  }
  /** Коммит агента на текущей ветке. */
  commit() {
    const parent = this.head();
    const sha = this.nextSha();
    this.history.set(sha, [parent, ...(this.history.get(parent) ?? [])]);
    this.branches.set(this.cur, sha);
    return sha;
  }
  log(_cwd: string, from: string) {
    const h = this.head();
    const chain = [h, ...(this.history.get(h) ?? [])];
    const i = chain.indexOf(from);
    return (i < 0 ? chain : chain.slice(0, i)).map((s) => `${s} коммит`);
  }
  commitFile() { this.commit(); }
  stashLeftover() {
    this.dirty = false;
    return "stash-sha";
  }
  push(_cwd: string, bs: string[]) {
    this.pushed.push(...bs);
    return null;
  }
}

interface Plan {
  /** Оценки explainer/user, которые bench «получит» на очередном прогоне. */
  bench: { explainer: number[]; user: number[]; incomplete?: boolean; error?: string }[];
  agent: (Partial<AgentResult> & { commits?: number })[];
}

function setup(plan: Plan, over: Partial<NightConfig> = {}, now0 = new Date("2026-10-23T22:00:00")) {
  const root = mkdtempSync(join(tmpdir(), "night-test-"));
  const git = new FakeGit("c0000000");
  let clock = now0.getTime();
  const calls: string[] = [];
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
      for (let i = 0; i < (p.commits ?? 1); i++) git.commit();
      clock += p.wall_ms ?? 30 * 60_000;
      return { status: "ok", cost_usd: 5, wall_ms: 30 * 60_000, denials: [], ...p };
    },
    runCheck: async () => {
      calls.push(`check ${git.cur}`);
      return true;
    },
    runBench: async (a) => {
      calls.push(`bench ${a.set} ${a.runId}`);
      const p = a.set === "explainer" ? plan.bench[0]! : plan.bench.shift()!;
      clock += 20 * 60_000;
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
  return { cfg, deps, git, calls, root, setStorage: (v: boolean) => (storage = v), advance: (ms: number) => (clock += ms) };
}

const backlogOf = (wt: string) => parseBacklog(readFileSync(join(wt, "docs", "quality-backlog.md"), "utf8"));

describe("runNight", () => {
  it("базовая линия, принятая итерация (ff night/<дата>), не принятая (пункт вниз), остановка по окну; отчёт", async () => {
    const t = setup({
      bench: [{ explainer: [6, 6], user: [5, 5] }, { explainer: [6.5, 6.5], user: [5, 5] }, { explainer: [6.5, 6.5], user: [5, 5] }],
      agent: [{}, {}],
    }, { until: new Date(new Date("2026-10-23T22:00:00").getTime() + 4 * 3600_000).toISOString() });
    const st = await runNight(t.cfg, t.deps);
    expect(t.calls).toEqual([
      expect.stringMatching(/^bench explainer night-2026-10-23-0-c000000$/),
      "bench user night-2026-10-23-0-c000000-user",
      expect.stringMatching(/^agent night\/2026-10-23-1 Пункт Q01: Первый/),
      "check night/2026-10-23-1",
      expect.stringMatching(/^bench explainer night-2026-10-23-1-c000000/),
      expect.stringMatching(/^bench user night-2026-10-23-1-.*-user$/),
      expect.stringMatching(/^agent night\/2026-10-23-2 Пункт Q02/),
      "check night/2026-10-23-2",
      expect.stringMatching(/^bench explainer night-2026-10-23-2-/),
      expect.stringMatching(/^bench user night-2026-10-23-2-/),
    ]);
    expect(st.iterations.map((i) => [i.n, i.item.id, i.outcome])).toEqual([[1, "Q01", "принято"], [2, "Q02", "не дало роста"]]);
    // принятая итерация: night/<дата> — fast-forward на её коммит (+ пометка бэклога)
    const it1 = st.iterations[0]!;
    expect(t.git.history.get(t.git.branches.get("night/2026-10-23")!)).toContain(it1.head_commit);
    // не принятая: ветка осталась, night/<дата> её коммита не содержит, следующая — от принятого
    const it2 = st.iterations[1]!;
    expect(t.git.branches.get("night/2026-10-23-2")).toBe(it2.head_commit);
    expect(t.git.history.get(t.git.branches.get("night/2026-10-23")!)).not.toContain(it2.head_commit);
    expect(it2.start_commit).not.toBe(it1.start_commit);
    expect(it2.verdict!.reasons.join(" ")).toMatch(/explainer \+0\.00/);
    // бэклог в ветке ночи: Q01 принят, Q02 внизу «не дало роста»
    const b = backlogOf(t.cfg.worktree);
    expect(b.items.map((i) => [i.id, i.status.split(" ")[0]])).toEqual([["Q01", "принято"], ["Q03", "открыт"], ["Q02", "не"]]);
    expect(st.stop!.reason).toMatch(/окно/);
    const report = readFileSync(join(t.cfg.stateDir, "REPORT.md"), "utf8");
    expect(report).toMatch(/# Ночь 2026-10-23/);
    expect(report).toMatch(/Q01.*принято/);
    expect(report).toMatch(/6\.00 → 6\.50/);
    // ролики принятой итерации скопированы с README
    expect(existsSync(join(t.cfg.examplesDir, "night-2026-10-23-1", "README.md"))).toBe(true);
    expect(existsSync(join(t.cfg.examplesDir, "night-2026-10-23-1", "explainer-test1.mp4"))).toBe(true);
    expect(t.git.pushed).toContain("night/2026-10-23");
    // бюджет: 2 агента по $5 + 3 пары bench по $10
    expect(st.spent_usd).toBe(40);
  });

  it("сбой агента (таймаут) — пункт «сбой», ночь идёт к следующему пункту; оставленные правки — в stash с меткой", async () => {
    const t = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }, { explainer: [7, 7], user: [5, 5] }], agent: [{ status: "timeout", commits: 1 }, {}] }, { maxIterations: 2 });
    t.git.dirty = false;
    const orig = t.deps.runAgent;
    let first = true;
    t.deps.runAgent = async (a) => {
      const r = await orig(a);
      if (first) t.git.dirty = true;
      first = false;
      return r;
    };
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations.map((i) => [i.item.id, i.outcome])).toEqual([["Q01", "сбой"], ["Q02", "принято"]]);
    expect(st.iterations[0]!.leftover).toBe("stash-sha");
    expect(t.calls.filter((c) => c.startsWith("check"))).toEqual(["check night/2026-10-23-2"]);
    expect(st.stop!.reason).toMatch(/предел итераций/);
    expect(backlogOf(t.cfg.worktree).items.at(-1)!.status).toMatch(/^сбой \(ночь 2026-10-23\): агент: timeout/);
  });

  it("агент без коммитов — сбой без bench", async () => {
    const t = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }], agent: [{ commits: 0 }] }, { maxIterations: 1 });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.outcome).toBe("сбой");
    expect(st.iterations[0]!.note).toMatch(/коммит/);
    expect(t.calls.filter((c) => c.startsWith("bench"))).toHaveLength(2);
  });

  it("bench неполный (сцена без оценки) — не принято как сбой, базовая линия прежняя", async () => {
    const t = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }, { explainer: [9, 9], user: [9, 9], incomplete: true }], agent: [{}] }, { maxIterations: 1 });
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations[0]!.outcome).toBe("сбой");
    expect(st.iterations[0]!.verdict!.reasons[0]).toMatch(/неполный прогон explainer/);
    expect(st.baseline!.runs.explainer).toMatch(/-0-/);
  });

  it("SSD отключён перед bench итерации — остановка с причиной, bench не зовётся; продолжение доводит итерацию без второй базовой линии", async () => {
    const t = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }, { explainer: [7, 7], user: [5, 5] }], agent: [{}] }, { maxIterations: 1 });
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
    expect(t.calls.filter((c) => c.startsWith("bench"))).toHaveLength(4);
    expect(t.calls.filter((c) => c.includes("-0-"))).toHaveLength(2);
    expect(t.calls.filter((c) => c.startsWith("agent"))).toHaveLength(1);
    expect(st.iterations.map((i) => i.outcome)).toEqual(["принято"]);
  });

  it("прерывание во время агента: продолжение помечает итерацию сбоем и идёт дальше", async () => {
    const t = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }, { explainer: [7, 7], user: [5, 5] }], agent: [{}] }, { maxIterations: 2 });
    await runNight({ ...t.cfg, maxIterations: 0 }, t.deps);
    // имитация обрыва: итерация 1 в фазе agent
    const sp = join(t.cfg.stateDir, "state.json");
    const st0 = JSON.parse(readFileSync(sp, "utf8")) as NightState;
    t.git.switchNew("", "night/2026-10-23-1", st0.accepted_commit);
    st0.iterations.push({ n: 1, item: { id: "Q01", title: "Первый", acceptance: "рост" }, branch: "night/2026-10-23-1", start_commit: st0.accepted_commit, phase: "agent", started_at: "x" });
    delete st0.stop;
    writeFileSync(sp, JSON.stringify(st0));
    const st = await runNight(t.cfg, t.deps);
    expect(st.iterations.map((i) => [i.item.id, i.outcome])).toEqual([["Q01", "сбой"], ["Q02", "принято"]]);
    expect(st.iterations[0]!.note).toMatch(/прерван/);
  });

  it("пустой бэклог — досрочный конец с отчётом", async () => {
    const t = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }], agent: [] });
    t.git.addWorktree("", t.cfg.worktree, "night/2026-10-23", "c0000000");
    writeFileSync(join(t.cfg.worktree, "docs", "quality-backlog.md"), "## Q01 — a\nстатус: принято (ночь 2026-10-20)\n");
    const st = await runNight(t.cfg, t.deps);
    expect(st.stop!.reason).toMatch(/нет открытых/);
    expect(existsSync(join(t.cfg.stateDir, "REPORT.md"))).toBe(true);
  });

  it("бюджет не вмещает итерацию — остановка; выбранный пункт (--item) — только он", async () => {
    const t = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }], agent: [] }, { budgetUsd: 20 });
    expect((await runNight(t.cfg, t.deps)).stop!.reason).toMatch(/бюджет/);
    const u = setup({ bench: [{ explainer: [6, 6], user: [5, 5] }, { explainer: [6, 6], user: [5, 5] }], agent: [{}] }, { item: "Q03" });
    const st = await runNight(u.cfg, u.deps);
    expect(st.iterations.map((i) => i.item.id)).toEqual(["Q03"]);
    expect(st.stop!.reason).toMatch(/выбранный пункт/);
  });

  it("worktree не подготовлен (npm ci) — остановка до трат: ни bench, ни агента", async () => {
    const t = setup({ bench: [], agent: [] });
    t.deps.prepareWorktree = async () => false;
    const st = await runNight(t.cfg, t.deps);
    expect(st.stop!.reason).toMatch(/не подготовлен/);
    expect(t.calls).toEqual([]);
  });

  it("базовая линия из evidence для текущего коммита — без прогона", async () => {
    const t = setup({ bench: [{ explainer: [6.5, 6.5], user: [5, 5] }], agent: [{}] }, { maxIterations: 1 });
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

describe("describePlan", () => {
  it("план ночи: окно, бюджет, ветки, worktree, базовая линия, порядок пунктов; без побочных эффектов", () => {
    const t = setup({ bench: [], agent: [] });
    const txt = describePlan(t.cfg, { now: new Date("2026-10-23T22:00:00"), backlogMd: BACKLOG, state: null, baseline: null, worktreeExists: false, agentCommand: "claude -p …" });
    expect(txt).toMatch(/night\/2026-10-23/);
    expect(txt).toMatch(/night\/2026-10-23-<n>/);
    expect(txt).toMatch(/Q01 — Первый/);
    expect(txt).toMatch(/базовая линия: прогон/);
    expect(txt).toMatch(/\$150/);
    expect(existsSync(t.cfg.stateDir)).toBe(false);
  });
});
