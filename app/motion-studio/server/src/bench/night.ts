// Ночной цикл качества (спека docs/superpowers/specs/2026-10-23-night-quality-loop-design.md).
// Логика ночи без побочных эффектов вне `deps`: git, агент, ./check и bench подставляются
// (настоящие — `scripts/night.mts`, в тестах — фейки). Состояние — `<stateDir>/state.json`
// после каждого шага, отчёт `REPORT.md` — там же; повторный запуск продолжает с того же шага.
//
// Ветки: `night/<дата>` — последний принятый коммит, итерация n — `night/<дата>-<n>` от него
// (git не держит ветку `night/<дата>` и ветки `night/<дата>/<n>` одновременно). Принято —
// fast-forward `night/<дата>`; не принято — ветка итерации остаётся для разбора. Ничего не
// удаляется и не переписывается.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CRITERIA } from "./metrics.js";
import { type BenchScores, type NightVerdict, acceptNight } from "./night-accept.js";
import { nightReport } from "./night-report.js";
import { type Acceptance, OPEN, markItem, nextItem, parseBacklog } from "./quality-backlog.js";

export const BACKLOG = "docs/quality-backlog.md";
/** Набор `--smoke`: по 2 сцены explainer и user. */
export const SMOKE_SETS: Sets = { explainer: ["test1", "bench-abtest"], user: ["user-02", "user-06"] };
/** Оценка времени `./check` в итерации. */
export const CHECK_ESTIMATE_MS = 10 * 60_000;
/** Меньше этого бюджета агенту итерацию не начинать, $. */
export const MIN_AGENT_USD = 3;

export type SetKey = "explainer" | "user";
export interface Sets {
  explainer: string[];
  user: string[];
}

export interface NightConfig {
  /** Дата ночи (день старта), YYYY-MM-DD. */
  date: string;
  /** Конец окна, ISO. */
  until: string;
  budgetUsd: number;
  smoke: boolean;
  /** Только этот пункт бэклога (`--item`). */
  item?: string;
  maxIterations?: number;
  /** Потолок времени и денег агента на итерацию (дальше режется окном и остатком бюджета). */
  agentTimeoutMs: number;
  agentBudgetUsd: number;
  /** Меньше этого времени агенту — итерация не начинается. */
  minAgentMs: number;
  /** Оценка прогона bench обоих наборов до замера базовой линии. */
  benchEstimateMs: number;
  benchCostEstimateUsd: number;
  /** Сцены наборов: полные или `SMOKE_SETS`. */
  sets: Sets;
  /** Откуда ночь стартует: ветка, коммит и корень worktree запуска. */
  source: { branch: string; commit: string; root: string };
  worktree: string;
  stateDir: string;
  /** Куда копировать ролики принятых итераций. */
  examplesDir: string;
  /** Шаблон брифа агента (`scripts/night-brief.md`), плейсхолдеры `{{…}}`. */
  briefTemplate: string;
}

export interface AgentResult {
  status: "ok" | "timeout" | "error";
  cost_usd: number;
  wall_ms: number;
  turns?: number;
  session_id?: string;
  /** Итоговое сообщение агента (его отчёт). */
  summary?: string;
  /** Отказы в правах (инструмент и начало команды) — блоки guard/песочницы. */
  denials: string[];
  error?: string;
  pid?: number;
}

export interface NightGit {
  worktreeExists(path: string): boolean;
  /** `git worktree add -b <branch> <path> <at>` из корня запуска. */
  addWorktree(fromRoot: string, path: string, branch: string, at: string): void;
  head(cwd: string): string;
  branch(cwd: string): string;
  isClean(cwd: string): boolean;
  switchNew(cwd: string, branch: string, from: string): void;
  switchTo(cwd: string, branch: string): void;
  /** `git merge --ff-only <ref>` в текущую ветку. */
  ffMerge(cwd: string, ref: string): void;
  /** Коммиты `from..HEAD`, строки «sha тема». */
  log(cwd: string, from: string): string[];
  /** Коммит одного файла (хуки работают); ошибка — исключение. */
  commitFile(cwd: string, file: string, message: string): void;
  /** Незакоммиченные правки — в stash с меткой (не удаляются); sha записи или null. */
  stashLeftover(cwd: string, tag: string): string | null;
  /** Резервная копия веток в origin; текст ошибки или null. */
  push(cwd: string, branches: string[]): string | null;
}

export interface NightDeps {
  now(): Date;
  log(line: string): void;
  /** Хранилище на SSD подключено (`MS_DATA_DIR` с маркером). */
  storageOnline(): boolean;
  git: NightGit;
  runAgent(a: { cwd: string; brief: string; logDir: string; timeoutMs: number; budgetUsd: number }): Promise<AgentResult>;
  runCheck(a: { cwd: string; logFile: string }): Promise<boolean>;
  runBench(a: { cwd: string; runId: string; set: SetKey; only?: string[]; logFile: string; timeoutMs: number }): Promise<{ ok: boolean; error?: string }>;
  /** Принятый прогон из docs/evidence на коммите старта: пути к scores.json обоих наборов. */
  findBaseline(a: { commit: string; sets: Sets }): { explainer: string; user: string } | null;
  /** Зависимости worktree ночи (`make install`: npm ci + браузер рендера); false — не вышло. */
  prepareWorktree?(cwd: string): Promise<boolean>;
}

export interface Baseline {
  commit: string;
  /** Откуда: `ночь` (прогон -0-), `evidence`, `итерация <n>`. */
  source: string;
  runs: { explainer: string; user: string };
  scores: { explainer: string; user: string };
  done: boolean;
  wall_ms?: number;
}

export type Outcome = "принято" | "не дало роста" | "сбой";
export interface Iteration {
  n: number;
  item: { id: string; title: string; acceptance: Acceptance };
  branch: string;
  start_commit: string;
  head_commit?: string;
  phase: "agent" | "check" | "bench" | "done";
  started_at: string;
  ended_at?: string;
  limits?: { agent_ms: number; agent_usd: number };
  agent?: AgentResult;
  commits?: string[];
  leftover?: string | null;
  bench?: { runs: { explainer: string; user: string }; wall_ms?: number; error?: string };
  verdict?: Pick<NightVerdict, "accepted" | "reasons" | "metrics">;
  outcome?: Outcome;
  note?: string;
  videos?: string;
  push_error?: string;
}

export interface NightState {
  version: 1;
  date: string;
  created_at: string;
  updated_at?: string;
  source: NightConfig["source"];
  worktree: string;
  /** `night/<дата>`. */
  branch: string;
  until: string;
  budget_usd: number;
  smoke: boolean;
  sets: Sets;
  accepted_commit: string;
  baseline: Baseline | null;
  /** Стоимость прогонов bench по id (итог run-а, без двойного счёта при продолжении). */
  bench_cost: Record<string, number>;
  iterations: Iteration[];
  spent_usd: number;
  stop?: { reason: string; at: string };
}

export const nightBranch = (date: string) => `night/${date}`;
export const runIdOf = (date: string, n: number, sha: string, set: SetKey) => `night-${date}-${n}-${sha.slice(0, 7)}${set === "user" ? "-user" : ""}`;
export const benchScoresPath = (wt: string, runId: string) => join(wt, "tmp", "bench", runId, "scores.json");

/** `--until`: `ЧЧ:ММ` — ближайшее такое время впереди, иначе дата-время ISO (локальное). */
export function parseUntil(s: string, now: Date): Date {
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  let d: Date;
  if (hm) {
    d = new Date(now);
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  } else {
    d = new Date(s);
    if (!/^\d{4}-\d{2}-\d{2}T/.test(s) || Number.isNaN(d.getTime())) throw new Error(`--until: ЧЧ:ММ или ГГГГ-ММ-ДДTЧЧ:ММ, получено «${s}»`);
    if (d.getTime() <= now.getTime()) throw new Error(`--until: ${s} — в прошлом`);
  }
  return d;
}

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const fmtTime = (iso: string) => iso.replace("T", " ").slice(0, 16);
const localIso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function renderBrief(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

function readScores(path: string): BenchScores | null {
  return existsSync(path) ? readJson<BenchScores>(path) : null;
}
const runCost = (path: string): number => {
  const s = readScores(path) as (BenchScores & { summary: { gen_cost_usd?: number; judge_cost_usd?: number } }) | null;
  return s ? (s.summary.gen_cost_usd ?? 0) + (s.summary.judge_cost_usd ?? 0) : 0;
};

/** Сводка цифр вердикта для статуса пункта бэклога. */
function verdictShort(v: Pick<NightVerdict, "metrics">): string {
  const sg = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
  const m = v.metrics;
  return [m.explainer ? `explainer ${sg(m.explainer.delta)}` : null, m.user ? `user ${sg(m.user.delta)}` : null].filter(Boolean).join(", ");
}

export async function runNight(cfg: NightConfig, deps: NightDeps): Promise<NightState> {
  const { git } = deps;
  const wt = cfg.worktree;
  const statePath = join(cfg.stateDir, "state.json");
  mkdirSync(cfg.stateDir, { recursive: true });
  const nowIso = () => deps.now().toISOString();
  let st: NightState;
  if (existsSync(statePath)) {
    st = readJson<NightState>(statePath);
    if (st.stop) deps.log(`продолжение после остановки: ${st.stop.reason}`);
    delete st.stop;
    // новые окно и бюджет запуска действуют и при продолжении
    st.until = cfg.until;
    st.budget_usd = cfg.budgetUsd;
  } else {
    st = {
      version: 1, date: cfg.date, created_at: nowIso(), source: cfg.source, worktree: wt, branch: nightBranch(cfg.date),
      until: cfg.until, budget_usd: cfg.budgetUsd, smoke: cfg.smoke, sets: cfg.sets, accepted_commit: cfg.source.commit,
      baseline: null, bench_cost: {}, iterations: [], spent_usd: 0,
    };
  }
  const recount = () => {
    st.spent_usd = Math.round((st.iterations.reduce((a, i) => a + (i.agent?.cost_usd ?? 0), 0) + Object.values(st.bench_cost).reduce((a, b) => a + b, 0)) * 100) / 100;
  };
  const save = () => {
    recount();
    st.updated_at = nowIso();
    writeFileSync(statePath, JSON.stringify(st, null, 2) + "\n");
    writeFileSync(join(cfg.stateDir, "REPORT.md"), nightReport(st, { examplesDir: cfg.examplesDir }));
  };
  const stop = (reason: string): NightState => {
    st.stop = { reason, at: nowIso() };
    deps.log(`остановка: ${reason}`);
    save();
    return st;
  };
  const SSD_OFF = "SSD отключён (MS_DATA_DIR недоступен) — ночь остановлена, данные на системный диск не пишутся";

  // ---------- изоляция ----------
  if (!git.worktreeExists(wt)) {
    deps.log(`worktree ${wt}, ветка ${st.branch} от ${st.accepted_commit.slice(0, 7)}`);
    git.addWorktree(cfg.source.root, wt, st.branch, st.accepted_commit);
  }
  save();
  // зависимости и браузер рендера в worktree ночи (идемпотентно): без них bench упадёт после трат
  if (deps.prepareWorktree && !(await deps.prepareWorktree(wt))) return stop(`worktree ночи не подготовлен (npm ci, браузер рендера) — журнал ${join(cfg.stateDir, "prepare.log")}`);

  // ---------- прогон обоих наборов ----------
  const benchBoth = async (runs: { explainer: string; user: string }, tag: string): Promise<{ ok: boolean; error?: string; wall_ms: number }> => {
    const t0 = deps.now().getTime();
    const timeoutMs = Math.max(2 * (st.baseline?.wall_ms ?? cfg.benchEstimateMs), 60 * 60_000);
    for (const set of ["explainer", "user"] as const) {
      if (!deps.storageOnline()) return { ok: false, error: "SSD отключён", wall_ms: deps.now().getTime() - t0 };
      deps.log(`bench ${set} ${runs[set]} (${tag})`);
      const r = await deps.runBench({
        cwd: wt, runId: runs[set], set, ...(cfg.smoke ? { only: cfg.sets[set] } : {}),
        logFile: join(cfg.stateDir, `${tag}-bench-${set}.log`), timeoutMs: Math.max(timeoutMs - (deps.now().getTime() - t0), 10 * 60_000),
      });
      st.bench_cost[runs[set]] = runCost(benchScoresPath(wt, runs[set]));
      save();
      if (!r.ok) return { ok: false, error: `bench ${set}: ${r.error ?? "ошибка"}`, wall_ms: deps.now().getTime() - t0 };
    }
    return { ok: true, wall_ms: deps.now().getTime() - t0 };
  };
  const scoresOf = (p: { explainer: string; user: string }) => {
    const e = readScores(p.explainer);
    const u = readScores(p.user);
    return e && u ? { explainer: e, user: u } : null;
  };

  // ---------- базовая линия ----------
  if (!st.baseline?.done) {
    if (!deps.storageOnline()) return stop(SSD_OFF);
    const found = st.baseline ? null : deps.findBaseline({ commit: st.accepted_commit, sets: cfg.sets });
    if (found) {
      st.baseline = { commit: st.accepted_commit, source: "evidence", runs: { explainer: found.explainer, user: found.user }, scores: found, done: true };
      deps.log(`базовая линия из evidence: ${found.explainer}, ${found.user}`);
    } else {
      const sha = git.head(wt);
      const runs = st.baseline?.runs ?? { explainer: runIdOf(cfg.date, 0, sha, "explainer"), user: runIdOf(cfg.date, 0, sha, "user") };
      st.baseline = { commit: sha, source: "ночь", runs, scores: { explainer: benchScoresPath(wt, runs.explainer), user: benchScoresPath(wt, runs.user) }, done: false };
      save();
      const r = await benchBoth(runs, "0");
      if (!deps.storageOnline()) return stop(SSD_OFF);
      if (!r.ok) return stop(`базовая линия не снята: ${r.error}`);
      st.baseline.wall_ms = r.wall_ms;
      const sc = scoresOf(st.baseline.scores);
      const incomplete = sc ? acceptNight(sc, sc, cfg.sets).reasons.filter((x) => x.startsWith("неполная базовая")) : ["нет scores.json"];
      if (incomplete.length) return stop(`базовая линия неполная: ${incomplete.join("; ")}`);
    }
    st.baseline.done = true;
    save();
  }

  // ---------- итог итерации ----------
  const finish = (it: Iteration, outcome: Outcome, note?: string) => {
    if (note) it.note = note;
    if (git.branch(wt) !== st.branch) git.switchTo(wt, st.branch);
    const tail = outcome === "принято" ? "" : `: ${note ?? (it.verdict ? verdictShort(it.verdict) : "")}`.replace(/\s+/g, " ").slice(0, 200);
    const status = `${outcome} (ночь ${cfg.date})${tail}`;
    try {
      const file = join(wt, BACKLOG);
      writeFileSync(file, markItem(readFileSync(file, "utf8"), it.item.id, status, { date: cfg.date, toEnd: outcome !== "принято" }));
      git.commitFile(wt, BACKLOG, `docs(night): ${it.item.id} — ${outcome}`);
      st.accepted_commit = git.head(wt);
    } catch (e) {
      it.note = `${it.note ? `${it.note}; ` : ""}пометка бэклога не закоммичена: ${(e as Error).message.slice(0, 300)}`;
    }
    it.push_error = git.push(wt, [st.branch, it.branch]) ?? undefined;
    if (outcome === "принято") it.videos = copyVideos(st, cfg, it);
    it.outcome = outcome;
    it.phase = "done";
    it.ended_at = nowIso();
    deps.log(`итерация ${it.n} (${it.item.id}): ${status}`);
    save();
  };

  // ---------- итерации ----------
  for (;;) {
    let it = st.iterations.at(-1);
    if (it?.phase === "agent") {
      // прерванный агент не продолжается: итог неизвестен, правки (если есть) — в stash
      if (!git.isClean(wt)) it.leftover = git.stashLeftover(wt, `night-${cfg.date}-${it.n}`);
      it.head_commit = git.branch(wt) === it.branch ? git.head(wt) : it.head_commit;
      finish(it, "сбой", "ночь прервана во время работы агента");
      continue;
    }
    if (!it || it.phase === "done") {
      if (cfg.maxIterations !== undefined && st.iterations.length >= cfg.maxIterations) return stop(`достигнут предел итераций (${cfg.maxIterations})`);
      if (!deps.storageOnline()) return stop(SSD_OFF);
      const backlog = parseBacklog(readFileSync(join(wt, BACKLOG), "utf8"));
      let item;
      if (cfg.item) {
        if (st.iterations.some((i) => i.item.id === cfg.item)) return stop(`выбранный пункт ${cfg.item} пройден`);
        item = nextItem(backlog, cfg.item);
      } else item = nextItem(backlog);
      if (!item) return stop(`в бэклоге нет открытых пунктов (статус «${OPEN}»)`);
      const left = new Date(st.until).getTime() - deps.now().getTime();
      const benchMs = st.baseline!.wall_ms ?? cfg.benchEstimateMs;
      const agentMs = Math.min(cfg.agentTimeoutMs, left - benchMs - CHECK_ESTIMATE_MS);
      if (agentMs < cfg.minAgentMs) {
        return stop(`окно до ${fmtTime(localIso(new Date(st.until)))} не вмещает итерацию (агент ≥ ${Math.round(cfg.minAgentMs / 60_000)} мин + bench ~${Math.round(benchMs / 60_000)} мин)`);
      }
      const benchUsd = (st.baseline!.source === "evidence" ? 0 : st.bench_cost[st.baseline!.runs.explainer]! + st.bench_cost[st.baseline!.runs.user]!) || cfg.benchCostEstimateUsd;
      const agentUsd = Math.min(cfg.agentBudgetUsd, st.budget_usd - st.spent_usd - benchUsd);
      if (agentUsd < MIN_AGENT_USD) return stop(`бюджет $${st.budget_usd}: потрачено $${st.spent_usd.toFixed(2)}, на итерацию (агент ≥ $${MIN_AGENT_USD} + bench ~$${benchUsd.toFixed(0)}) не хватает`);
      const n = st.iterations.length + 1;
      const branch = `${st.branch}-${n}`;
      git.switchNew(wt, branch, st.accepted_commit);
      it = {
        n, item: { id: item.id, title: item.title, acceptance: item.acceptance }, branch, start_commit: st.accepted_commit, phase: "agent",
        started_at: nowIso(), limits: { agent_ms: agentMs, agent_usd: Math.round(agentUsd * 100) / 100 },
      };
      st.iterations.push(it);
      save();
      const deadline = localIso(new Date(deps.now().getTime() + agentMs));
      const brief = renderBrief(cfg.briefTemplate, {
        item_id: item.id, item_title: item.title, item_body: item.body, branch, date: cfg.date, n: String(n),
        deadline: fmtTime(deadline), budget_usd: agentUsd.toFixed(0), acceptance: item.acceptance,
        baseline: baselineLine(st), worktree: wt, sdd: join(cfg.source.root, ".superpowers", "sdd"),
      });
      const logDir = join(cfg.stateDir, String(n));
      mkdirSync(logDir, { recursive: true });
      writeFileSync(join(logDir, "brief.md"), brief);
      deps.log(`итерация ${n}: ${item.id} «${item.title}», агент до ${fmtTime(deadline)}, $${agentUsd.toFixed(0)}`);
      const ar = await deps.runAgent({ cwd: wt, brief, logDir, timeoutMs: agentMs, budgetUsd: agentUsd });
      it.agent = ar;
      if (!git.isClean(wt)) it.leftover = git.stashLeftover(wt, `night-${cfg.date}-${n}`);
      const onBranch = git.branch(wt);
      if (onBranch !== branch) {
        it.note = `агент оставил ветку ${onBranch} вместо ${branch}`;
        git.switchTo(wt, branch);
      }
      it.head_commit = git.head(wt);
      it.commits = git.log(wt, it.start_commit);
      save();
      if (ar.status !== "ok") {
        finish(it, "сбой", `агент: ${ar.status}${ar.error ? ` (${ar.error.slice(0, 160)})` : ""}`);
        continue;
      }
      if (it.commits.length === 0) {
        finish(it, "сбой", "агент не сделал ни одного коммита");
        continue;
      }
      it.phase = "check";
      save();
    }
    if (it.phase === "check") {
      deps.log(`итерация ${it.n}: ./check`);
      const ok = await deps.runCheck({ cwd: wt, logFile: join(cfg.stateDir, String(it.n), "check.log") });
      if (!ok) {
        finish(it, "сбой", "./check красный на ветке итерации");
        continue;
      }
      const sha = it.head_commit ?? git.head(wt);
      it.bench = { runs: { explainer: runIdOf(cfg.date, it.n, sha, "explainer"), user: runIdOf(cfg.date, it.n, sha, "user") } };
      it.phase = "bench";
      save();
    }
    if (it.phase === "bench") {
      if (!deps.storageOnline()) return stop(SSD_OFF);
      if (git.branch(wt) !== it.branch) git.switchTo(wt, it.branch);
      const runs = it.bench!.runs;
      const r = await benchBoth(runs, String(it.n));
      // SSD пропал посреди bench — остановка; продолжение доведёт эту же итерацию
      if (!deps.storageOnline()) return stop(SSD_OFF);
      it.bench!.wall_ms = r.wall_ms;
      if (!r.ok) it.bench!.error = r.error;
      const cand = scoresOf({ explainer: benchScoresPath(wt, runs.explainer), user: benchScoresPath(wt, runs.user) });
      const base = scoresOf(st.baseline!.scores);
      if (!cand || !base) {
        finish(it, "сбой", r.error ?? "нет scores.json прогона");
        continue;
      }
      const v = acceptNight(base, cand, cfg.sets, { requireGain: it.item.acceptance === "рост" });
      it.verdict = { accepted: v.accepted, reasons: v.reasons, metrics: { ...v.metrics, compare: null } };
      if (v.accepted) {
        git.switchTo(wt, st.branch);
        git.ffMerge(wt, it.branch);
        st.accepted_commit = git.head(wt);
        st.baseline = {
          commit: it.head_commit!, source: `итерация ${it.n}`, runs,
          scores: { explainer: benchScoresPath(wt, runs.explainer), user: benchScoresPath(wt, runs.user) }, done: true, wall_ms: r.wall_ms,
        };
        finish(it, "принято");
      } else if (v.reasons.some((x) => x.startsWith("неполн")) || !r.ok) {
        finish(it, "сбой", `${r.error ? `${r.error}; ` : ""}${v.reasons.join("; ")}`);
      } else {
        finish(it, "не дало роста");
      }
    }
  }
}

function baselineLine(st: NightState): string {
  const b = st.baseline;
  if (!b) return "нет";
  const m = (p: string) => {
    const s = readScores(p);
    const xs = s?.rows.filter((r) => r.judge).map((r) => r.judge!.overall) ?? [];
    return xs.length ? (xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(2) : "—";
  };
  return `explainer ${m(b.scores.explainer)}, user ${m(b.scores.user)} (${b.source}, коммит ${b.commit.slice(0, 7)})`;
}

/** Ролики принятой итерации → `<examples>/night-<дата>-<n>/` с README; путь каталога. */
function copyVideos(st: NightState, cfg: NightConfig, it: Iteration): string | undefined {
  if (!it.bench) return undefined;
  const dir = join(cfg.examplesDir, `night-${cfg.date}-${it.n}`);
  const lines: string[] = [];
  for (const set of ["explainer", "user"] as const) {
    for (const scene of cfg.sets[set]) {
      const src = join(cfg.worktree, "tmp", "bench", it.bench.runs[set], scene, "preview.mp4");
      if (!existsSync(src)) continue;
      mkdirSync(dir, { recursive: true });
      copyFileSync(src, join(dir, `${set}-${scene}.mp4`));
      lines.push(`- \`${set}-${scene}.mp4\` — прогон \`${it.bench.runs[set]}\``);
    }
  }
  if (!lines.length) return undefined;
  const m = it.verdict?.metrics;
  const crit = m ? CRITERIA.map((c) => `${c} ${(m.explainer_criteria[c] ?? 0) >= 0 ? "+" : ""}${(m.explainer_criteria[c] ?? 0).toFixed(2)}`).join(", ") : "";
  writeFileSync(join(dir, "README.md"), [
    `# Ночь ${cfg.date}, итерация ${it.n}: ${it.item.id} — ${it.item.title}`,
    "",
    `Принято. Ветка \`${it.branch}\`, коммит \`${it.head_commit?.slice(0, 7)}\` (влито в \`${st.branch}\`).`,
    m?.explainer ? `explainer ${m.explainer.before.toFixed(2)} → ${m.explainer.after.toFixed(2)}; user ${m.user ? `${m.user.before.toFixed(2)} → ${m.user.after.toFixed(2)}` : "—"}.` : "",
    crit ? `Дельты по критериям (explainer): ${crit}.` : "",
    "",
    "Ролики:",
    "",
    ...lines,
    "",
  ].join("\n"));
  return dir;
}

/** План ночи для `--dry-run`: ничего не создаёт и не тратит. */
export function describePlan(cfg: NightConfig, a: {
  now: Date;
  backlogMd: string;
  state: NightState | null;
  baseline: { explainer: string; user: string } | null;
  worktreeExists: boolean;
  agentCommand: string;
  preflight?: string[];
}): string {
  const b = parseBacklog(a.backlogMd);
  const open = cfg.item ? b.items.filter((i) => i.id === cfg.item) : b.items.filter((i) => i.status === OPEN);
  const hours = (new Date(cfg.until).getTime() - a.now.getTime()) / 3600_000;
  const iterMs = cfg.agentTimeoutMs + cfg.benchEstimateMs + CHECK_ESTIMATE_MS;
  const est = Math.max(0, Math.floor((new Date(cfg.until).getTime() - a.now.getTime() - (a.baseline || a.state?.baseline?.done ? 0 : cfg.benchEstimateMs)) / iterMs));
  const lines = [
    `Ночь ${cfg.date}${cfg.smoke ? " (smoke)" : ""} — план (--dry-run: ничего не создано и не потрачено)`,
    "",
    `- окно: до ${fmtTime(localIso(new Date(cfg.until)))} (${hours.toFixed(1)} ч); бюджет $${cfg.budgetUsd}; агент на итерацию ≤ ${Math.round(cfg.agentTimeoutMs / 60_000)} мин и ≤ $${cfg.agentBudgetUsd}`,
    `- источник: ${cfg.source.branch} @ ${cfg.source.commit.slice(0, 7)}`,
    `- worktree: ${cfg.worktree}${a.worktreeExists ? " (уже есть)" : " (будет создан)"}`,
    `- ветки: ${nightBranch(cfg.date)} (принятое, fast-forward), итерации ${nightBranch(cfg.date)}-<n>`,
    `- наборы: explainer ${cfg.sets.explainer.length} сцен (${cfg.sets.explainer.join(", ")}), user ${cfg.sets.user.length} (${cfg.sets.user.join(", ")})`,
    a.state
      ? `- продолжение: итераций ${a.state.iterations.length}, потрачено $${a.state.spent_usd.toFixed(2)}${a.state.stop ? `, прошлая остановка: ${a.state.stop.reason}` : ""}`
      : `- базовая линия: ${a.baseline ? `evidence (${a.baseline.explainer}, ${a.baseline.user})` : `прогон ${runIdOf(cfg.date, 0, cfg.source.commit, "explainer")} и ${runIdOf(cfg.date, 0, cfg.source.commit, "user")}`}`,
    `- оценка: ~${est} итераций (агент ${Math.round(cfg.agentTimeoutMs / 60_000)} мин + bench ~${Math.round(cfg.benchEstimateMs / 60_000)} мин + ./check)`,
    `- агент: ${a.agentCommand}`,
    "",
    `Пункты бэклога по порядку (${open.length}):`,
    ...open.map((i, k) => `${k + 1}. ${i.id} — ${i.title}${i.acceptance === "без регрессии" ? " [без регрессии]" : ""}`),
  ];
  if (a.preflight?.length) lines.push("", "Предпроверки:", ...a.preflight.map((p) => `- ${p}`));
  return lines.join("\n") + "\n";
}
