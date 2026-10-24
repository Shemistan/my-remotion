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
import { dirname, join } from "node:path";
import { CRITERIA } from "./metrics.js";
import { type BenchScores, type NightBench, type NightVerdict, acceptNight, averageScores } from "./night-accept.js";
import { benchRunSpent, readAgentLog } from "./night-io.js";
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
  /** Пути, изменённые коммитами `from..HEAD` (переименование — оба имени). */
  changedFiles(cwd: string, from: string): string[];
  /** Снимок защищённых веток (main/staging, локальные и origin): ref → sha. */
  refs(cwd: string): Record<string, string>;
  /** Коммит одного файла (хуки работают); ошибка — исключение. */
  commitFile(cwd: string, file: string, message: string): void;
  /**
   * Незакоммиченные правки — патч `<dir>/wip.patch` и копии неотслеживаемых файлов в
   * `<dir>/wip-untracked/`, дерево возвращается к HEAD; null — дерево было чистым. Не stash:
   * его стек общий для всех worktree и сессий.
   */
  saveLeftover(cwd: string, dir: string): Leftover | null;
  /** Резервная копия веток в origin; текст ошибки или null. */
  push(cwd: string, branches: string[]): string | null;
}

export interface Leftover {
  dir: string;
  patch: boolean;
  untracked: string[];
}

export interface NightDeps {
  now(): Date;
  log(line: string): void;
  /** Хранилище на SSD подключено (`MS_DATA_DIR` с маркером). */
  storageOnline(): boolean;
  git: NightGit;
  runAgent(a: { cwd: string; brief: string; logDir: string; timeoutMs: number; budgetUsd: number }): Promise<AgentResult>;
  runCheck(a: { cwd: string; logFile: string }): Promise<boolean>;
  /**
   * Прогон bench набора. `maxCostUsd` — потолок трат прогона (с уже потраченным им при
   * продолжении): выше — остановка, `stopped: "budget"`; таймаут — `stopped: "timeout"`.
   */
  runBench(a: { cwd: string; runId: string; set: SetKey; only?: string[]; logFile: string; timeoutMs: number; maxCostUsd: number }): Promise<{ ok: boolean; error?: string; stopped?: "budget" | "timeout" }>;
  /** Принятый прогон из docs/evidence на коммите старта: пути к scores.json обоих наборов. */
  findBaseline(a: { commit: string; sets: Sets }): { explainer: string; user: string } | null;
  /** Зависимости worktree ночи (`make install`: npm ci + браузер рендера); false — не вышло. */
  prepareWorktree?(cwd: string): Promise<boolean>;
  /**
   * После агента (M1): погасить его остатки — группу процесса и процессы, запущенные после
   * `since` с рабочим каталогом в worktree ночи (их держатель owner lock освобождает
   * хранилище; записи реестра процессов разберёт reap ADR 0007 при старте bench). Строки — что
   * погашено.
   */
  cleanupAgent?(a: { cwd: string; pid?: number; since: Date }): Promise<string[]>;
  /** Хранилище занято другим владельцем (owner lock, ADR 0007): причина или null. */
  ownerBusy?(): Promise<string | null>;
}

export interface Baseline {
  commit: string;
  /** Откуда: `ночь` (прогон -0-), `evidence`, `итерация <n>`. */
  source: string;
  runs: { explainer: string; user: string };
  scores: { explainer: string; user: string };
  done: boolean;
  wall_ms?: number;
  /** Принято по одному прогону без подтверждающего (не уместился): среднее может быть завышено. */
  single_run?: boolean;
}

export type Outcome = "принято" | "не дало роста" | "отклонено" | "сбой";
/**
 * Род сбоя итерации. `infra` — сбой окружения (песочница, хранилище, судья, обрыв ночи), а не
 * изменения: пункт остаётся «открыт», пишется только строка истории.
 */
export interface Failure {
  kind: string;
  infra: boolean;
}
type Runs = { explainer: string; user: string };
export interface Iteration {
  n: number;
  item: { id: string; title: string; acceptance: Acceptance };
  branch: string;
  start_commit: string;
  head_commit?: string;
  phase: "agent" | "check" | "bench" | "confirm" | "done";
  started_at: string;
  ended_at?: string;
  limits?: { agent_ms: number; agent_usd: number };
  agent?: AgentResult;
  /** Снимок защищённых веток до агента (M5). */
  refs_before?: Record<string, string>;
  /** Что погашено после агента (M1). */
  cleanup?: string[];
  commits?: string[];
  /** Незакоммиченные правки агента: патч и копии в `tmp/night/<дата>/<n>/`. */
  leftover?: Leftover | null;
  /** Изменённые агентом запрещённые пути (I2). */
  forbidden?: string[];
  bench?: { runs: Runs; wall_ms?: number; error?: string };
  /** Подтверждающий прогон кандидата (I4) и среднее двух прогонов. */
  confirm?: { runs: Runs; avg: Runs; wall_ms?: number; error?: string };
  verdict?: Pick<NightVerdict, "accepted" | "reasons" | "metrics" | "borderline">;
  /** Вердикт первого прогона, если решение принималось по среднему двух. */
  first_verdict?: Pick<NightVerdict, "accepted" | "reasons" | "metrics" | "borderline">;
  outcome?: Outcome;
  failure?: Failure;
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

/**
 * Пути, которые агент ночи менять не вправе (ревью ночи I2, rulings 2026-10-23): измеритель
 * (bench, судья, наборы), проверки и хуки, сама ночь, бэклог, настройки, зависимости. Итерация
 * с их изменением отклоняется до любых commit/push оркестратора и до запуска её кода.
 * `…/` — каталог целиком; `package.json`/`package-lock.json` — на любом уровне.
 */
export const FORBIDDEN_PATHS = [
  ".githooks/", "check", "bootstrap.sh", "finish", "night", ".claude/", "tools/", "global/", ".nvmrc",
  BACKLOG,
  "app/motion-studio/server/src/bench/", "app/motion-studio/server/test/bench/",
  "app/motion-studio/scripts/bench-set.mts", "app/motion-studio/scripts/BENCH.md",
  "app/motion-studio/scripts/night.mts", "app/motion-studio/scripts/night-brief.md", "app/motion-studio/scripts/NIGHT.md",
  "app/motion-studio/scripts/with-node.sh", "app/motion-studio/prompts/rubric-judge.md",
  "app/motion-studio/Makefile", "app/motion-studio/vitest.config.ts", "app/motion-studio/eslint.config.js", "app/motion-studio/.nvmrc",
] as const;
const ANY_LEVEL = new Set(["package.json", "package-lock.json"]);

/** Запрещённые пути среди изменённых. */
export function forbiddenTouched(paths: readonly string[]): string[] {
  return paths.filter((p) => ANY_LEVEL.has(p.split("/").at(-1)!) || FORBIDDEN_PATHS.some((f) => (f.endsWith("/") ? p.startsWith(f) : p === f)));
}

/** Признаки сбоя окружения в тексте (журнал, отчёт агента): род или null. */
export function infraKind(text: string): string | null {
  if (/\bEPERM\b/.test(text)) return "eperm";
  if (/owner_busy|OwnerBusy/.test(text)) return "owner_busy";
  if (/storage_unavailable|storage_offline|StorageError|ENOSPC/.test(text)) return "storage";
  return null;
}
const API_TROUBLE = /overloaded|rate.?limit|\b5\d\d\b|ECONNRESET|ETIMEDOUT|ENOTFOUND|api_error/i;

const KIND_TEXT: Record<string, string> = {
  eperm: "песочница не даёт запускать дочерние процессы (spawn EPERM) — см. NIGHT.md, «EPERM»",
  owner_busy: "хранилище занято другим владельцем (owner_busy)",
  storage: "хранилище недоступно",
  interrupted: "ночь прерывалась во время агента",
  no_commits: "агент не сделал ни одного коммита",
  check_red: "./check красный",
  bench: "bench не дал полного прогона",
  agent_timeout: "агент не уложился во время",
  agent_error: "агент завершился с ошибкой",
  api: "сбой API модели",
  judge: "разные судьи у прогонов",
};

/** Последняя начатая ночь среди каталогов `tmp/night` (`-smokeN` — по числу, L3). */
export function latestNight(names: readonly string[], smoke: boolean): string | undefined {
  const key = (d: string): readonly [string, number] | null => {
    const m = /^(\d{4}-\d{2}-\d{2})(?:-smoke(\d*))?$/.exec(d);
    return m ? ([m[1]!, m[2] === undefined ? -1 : m[2] === "" ? 1 : Number(m[2])] as const) : null;
  };
  return names
    .filter((d) => key(d) !== null && /-smoke\d*$/.test(d) === smoke)
    .sort((a, b) => {
      const ka = key(a)!;
      const kb = key(b)!;
      return ka[0] === kb[0] ? ka[1] - kb[1] : ka[0] < kb[0] ? -1 : 1;
    })
    .at(-1);
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
  // серия сбоев считается с этого запуска: продолжение после остановки по серии даёт новый запас
  const runFrom = st.iterations.filter((i) => i.phase === "done").length;
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
  const untilMs = () => new Date(st.until).getTime();
  const untilText = () => fmtTime(localIso(new Date(st.until)));
  const readLog = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").slice(-200_000) : "");

  // ---------- изоляция ----------
  if (!git.worktreeExists(wt)) {
    deps.log(`worktree ${wt}, ветка ${st.branch} от ${st.accepted_commit.slice(0, 7)}`);
    git.addWorktree(cfg.source.root, wt, st.branch, st.accepted_commit);
  }
  save();
  // зависимости и браузер рендера в worktree ночи (идемпотентно): без них bench упадёт после трат
  if (deps.prepareWorktree && !(await deps.prepareWorktree(wt))) return stop(`worktree ночи не подготовлен (npm ci, браузер рендера) — журнал ${join(cfg.stateDir, "prepare.log")}`);

  // ---------- перед bench: SSD и владелец хранилища (M1) ----------
  const preBench = async (): Promise<NightState | null> => {
    if (!deps.storageOnline()) return stop(SSD_OFF);
    const busy = await deps.ownerBusy?.();
    if (busy) return stop(`хранилище занято: ${busy} — bench не запущен (останови сервер или bench и продолжи: ./night --resume --date ${cfg.date})`);
    return null;
  };

  // ---------- прогон обоих наборов: окно и бюджет ограничивают и сам bench (M3) ----------
  type BenchRes = { ok: boolean; error?: string; stopped?: string; wall_ms: number; logs: string[] };
  const benchBoth = async (runs: Runs, tag: string): Promise<BenchRes> => {
    const t0 = deps.now().getTime();
    const base = Math.max(2 * (st.baseline?.wall_ms ?? cfg.benchEstimateMs), 60 * 60_000);
    const logs: string[] = [];
    const res = (o: Omit<BenchRes, "wall_ms" | "logs">): BenchRes => ({ ...o, wall_ms: deps.now().getTime() - t0, logs });
    for (const set of ["explainer", "user"] as const) {
      if (!deps.storageOnline()) return res({ ok: false, error: "SSD отключён" });
      const left = untilMs() - deps.now().getTime();
      if (left <= 0) return res({ ok: false, stopped: `окно до ${untilText()} закончилось перед bench ${set}` });
      const maxCostUsd = Math.round((st.budget_usd - st.spent_usd + (st.bench_cost[runs[set]] ?? 0)) * 100) / 100;
      if (maxCostUsd <= 0) return res({ ok: false, stopped: `бюджет $${st.budget_usd} исчерпан перед bench ${set}` });
      const logFile = join(cfg.stateDir, `${tag}-bench-${set}.log`);
      logs.push(logFile);
      const timeoutMs = Math.min(Math.max(base - (deps.now().getTime() - t0), 10 * 60_000), left);
      deps.log(`bench ${set} ${runs[set]} (${tag}), до $${maxCostUsd.toFixed(0)}, ≤ ${Math.round(timeoutMs / 60_000)} мин`);
      const r = await deps.runBench({ cwd: wt, runId: runs[set], set, ...(cfg.smoke ? { only: cfg.sets[set] } : {}), logFile, timeoutMs, maxCostUsd });
      // траты прогона — по итогу или по файлам сцен (остановленный прогон итога не пишет)
      st.bench_cost[runs[set]] = Math.round(Math.max(runCost(benchScoresPath(wt, runs[set])), benchRunSpent(join(wt, "tmp", "bench", runs[set]))) * 100) / 100;
      save();
      if (r.stopped === "budget") return res({ ok: false, stopped: `бюджет $${st.budget_usd} исчерпан во время bench ${set} (${runs[set]})` });
      if (r.stopped === "timeout" && deps.now().getTime() >= untilMs() - 60_000) return res({ ok: false, stopped: `окно до ${untilText()} закончилось во время bench ${set} (${runs[set]})` });
      if (!r.ok) return res({ ok: false, error: `bench ${set}: ${r.error ?? "ошибка"}` });
    }
    return res({ ok: true });
  };
  const scoresOf = (p: Runs): NightBench | null => {
    const e = readScores(p.explainer);
    const u = readScores(p.user);
    return e && u ? { explainer: e, user: u } : null;
  };
  const scorePaths = (runs: Runs): Runs => ({ explainer: benchScoresPath(wt, runs.explainer), user: benchScoresPath(wt, runs.user) });

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
      st.baseline = { commit: sha, source: "ночь", runs, scores: scorePaths(runs), done: false };
      save();
      const pre = await preBench();
      if (pre) return pre;
      const r = await benchBoth(runs, "0");
      if (!deps.storageOnline()) return stop(SSD_OFF);
      if (r.stopped) return stop(`базовая линия не снята: ${r.stopped}`);
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
  const finish = (it: Iteration, outcome: Outcome, note?: string, failure?: Failure) => {
    if (note && !it.note?.includes(note)) it.note = it.note ? `${it.note}; ${note}` : note;
    if (failure) it.failure = failure;
    if (git.branch(wt) !== st.branch) git.switchTo(wt, st.branch);
    const tag = `(ночь ${cfg.date}, #${it.n})`;
    const infra = outcome === "сбой" && failure?.infra === true;
    const tail = outcome === "принято" ? "" : `: ${note ?? (it.verdict ? verdictShort(it.verdict) : "")}`.replace(/\s+/g, " ").slice(0, 200);
    const status = `${outcome} ${tag}${tail}`;
    try {
      const file = join(wt, BACKLOG);
      const md = readFileSync(file, "utf8");
      // продолжение после обрыва между коммитом пометки и записью состояния — без второго коммита (L1)
      const marked = parseBacklog(md).items.find((i) => i.id === it.item.id)?.history.some((h) => h.includes(tag));
      if (!marked) {
        // сбой окружения пункт не «сжигает»: статус прежний, только строка истории (B1)
        const next = infra
          ? markItem(md, it.item.id, OPEN, { date: cfg.date, history: `сбой инфраструктуры ${tag}${tail}` })
          : markItem(md, it.item.id, status, { date: cfg.date, toEnd: outcome !== "принято" });
        writeFileSync(file, next);
        git.commitFile(wt, BACKLOG, `docs(night): ${it.item.id} — ${infra ? "сбой инфраструктуры" : outcome}`);
      }
      st.accepted_commit = git.head(wt);
    } catch (e) {
      it.note = `${it.note ? `${it.note}; ` : ""}пометка бэклога не закоммичена: ${(e as Error).message.slice(0, 300)}`;
    }
    it.push_error = git.push(wt, [st.branch, it.branch]) ?? undefined;
    if (outcome === "принято") it.videos = copyVideos(st, cfg, it);
    it.outcome = outcome;
    it.phase = "done";
    it.ended_at = nowIso();
    deps.log(`итерация ${it.n} (${it.item.id}): ${infra ? `сбой инфраструктуры, пункт остаётся открытым${tail}` : status}`);
    save();
  };
  /** Два сбоя подряд одного рода в этом запуске — род, иначе null (B1). */
  const streak = (): Failure | null => {
    const [a, b] = st.iterations.slice(runFrom).slice(-2);
    return a?.outcome === "сбой" && b?.outcome === "сбой" && a.failure && b.failure && a.failure.kind === b.failure.kind ? b.failure : null;
  };
  const accept = (it: Iteration, scores: Runs, single: boolean) => {
    git.switchTo(wt, st.branch);
    git.ffMerge(wt, it.branch);
    st.accepted_commit = git.head(wt);
    st.baseline = {
      commit: it.head_commit!, source: `итерация ${it.n}${single ? " (один прогон)" : " (среднее двух прогонов)"}`, runs: it.bench!.runs,
      scores, done: true, ...(it.bench!.wall_ms === undefined ? {} : { wall_ms: it.bench!.wall_ms }), ...(single ? { single_run: true } : {}),
    };
    finish(it, "принято");
  };
  const pickVerdict = (v: NightVerdict) => ({ accepted: v.accepted, reasons: v.reasons, borderline: v.borderline, metrics: { ...v.metrics, compare: null } });

  /** Разбор итерации после агента: остатки, ветка, защищённые ветки, запрещённые пути, коммиты. */
  const afterAgent = async (it: Iteration, interrupted: boolean): Promise<NightState | "next" | "check"> => {
    const ar = it.agent!;
    it.cleanup = (await deps.cleanupAgent?.({ cwd: wt, ...(ar.pid ? { pid: ar.pid } : {}), since: new Date(it.started_at) })) ?? [];
    if (!git.isClean(wt)) it.leftover = git.saveLeftover(wt, join(cfg.stateDir, String(it.n)));
    const onBranch = git.branch(wt);
    if (onBranch !== it.branch) {
      it.note = `агент оставил ветку ${onBranch} вместо ${it.branch}`;
      git.switchTo(wt, it.branch);
    }
    it.head_commit = git.head(wt);
    it.commits = git.log(wt, it.start_commit);
    save();
    // M5: агент не вправе двигать main/staging — сдвиг останавливает ночь
    if (it.refs_before) {
      const before = it.refs_before;
      const after = git.refs(wt);
      const moved = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]);
      if (moved.length) {
        const what = moved.map((k) => `${k.replace(/^refs\/(heads|remotes)\//, "")} ${before[k]?.slice(0, 7) ?? "—"} → ${after[k]?.slice(0, 7) ?? "—"}`).join(", ");
        finish(it, "сбой", `во время агента сдвинуты защищённые ветки: ${what}`, { kind: "refs", infra: true });
        return stop(`во время агента итерации ${it.n} сдвинуты защищённые ветки (${what}) — ночь остановлена, разбери руками`);
      }
    }
    // I2: правки измерителя, проверок, хуков и самой ночи — отклонение до любых commit/push и до запуска кода
    const bad = forbiddenTouched(git.changedFiles(wt, it.start_commit));
    if (bad.length) {
      it.forbidden = bad;
      finish(it, "отклонено", `запрещённые пути: ${bad.slice(0, 8).join(", ")}${bad.length > 8 ? ` и ещё ${bad.length - 8}` : ""}`, { kind: "forbidden", infra: false });
      return "next";
    }
    if (interrupted) {
      finish(it, "сбой", "ночь прервана во время работы агента", { kind: "interrupted", infra: true });
      return "next";
    }
    const said = `${ar.summary ?? ""}\n${ar.error ?? ""}\n${ar.denials.join("\n")}`;
    if (ar.status !== "ok") {
      const k = ar.status === "timeout" ? null : (infraKind(said) ?? (API_TROUBLE.test(ar.error ?? "") ? "api" : null));
      finish(it, "сбой", `агент: ${ar.status}${ar.error ? ` (${ar.error.slice(0, 160)})` : ""}`, { kind: k ?? (ar.status === "timeout" ? "agent_timeout" : "agent_error"), infra: k !== null });
      return "next";
    }
    if (it.commits.length === 0) {
      const k = infraKind(said);
      finish(it, "сбой", k ? `агент не сделал ни одного коммита: ${KIND_TEXT[k]}` : "агент не сделал ни одного коммита", { kind: k ?? "no_commits", infra: k !== null });
      return "next";
    }
    it.phase = "check";
    save();
    return "check";
  };

  // ---------- итерации ----------
  for (;;) {
    let it = st.iterations.at(-1);
    if (it?.phase === "agent") {
      // прерванный агент не продолжается. Траты — по его итогу, если он успел его записать,
      // иначе по лимиту итерации (оценка сверху, M2); итог есть — итерация идёт дальше обычным путём
      const rec = readAgentLog(join(cfg.stateDir, String(it.n)));
      it.agent = rec ?? { status: "error", cost_usd: it.limits?.agent_usd ?? cfg.agentBudgetUsd, wall_ms: 0, denials: [], error: "ночь прервана во время работы агента" };
      save();
      const r = await afterAgent(it, rec === null);
      if (typeof r === "object") return r;
      if (r === "next") continue;
    }
    if (!it || it.phase === "done") {
      const s = streak();
      if (s) return stop(`два сбоя подряд одного рода: ${KIND_TEXT[s.kind] ?? s.kind} — дальше ночь тратила бы деньги впустую; причина в REPORT.md, продолжение — ./night --resume --date ${cfg.date}`);
      if (cfg.maxIterations !== undefined && st.iterations.length >= cfg.maxIterations) return stop(`достигнут предел итераций (${cfg.maxIterations})`);
      if (!deps.storageOnline()) return stop(SSD_OFF);
      const backlog = parseBacklog(readFileSync(join(wt, BACKLOG), "utf8"));
      let item;
      if (cfg.item) {
        if (st.iterations.some((i) => i.item.id === cfg.item)) return stop(`выбранный пункт ${cfg.item} пройден`);
        try {
          item = nextItem(backlog, cfg.item);
        } catch (e) {
          return stop(`--item: ${(e as Error).message}`);
        }
      } else item = nextItem(backlog);
      if (!item) return stop(`в бэклоге нет открытых пунктов (статус «${OPEN}»)`);
      const left = untilMs() - deps.now().getTime();
      const benchMs = st.baseline!.wall_ms ?? cfg.benchEstimateMs;
      const agentMs = Math.min(cfg.agentTimeoutMs, left - benchMs - CHECK_ESTIMATE_MS);
      if (agentMs < cfg.minAgentMs) {
        return stop(`окно до ${untilText()} не вмещает итерацию (агент ≥ ${Math.round(cfg.minAgentMs / 60_000)} мин + bench ~${Math.round(benchMs / 60_000)} мин)`);
      }
      const benchUsd = baselineBenchUsd(st) || cfg.benchCostEstimateUsd;
      const agentUsd = Math.min(cfg.agentBudgetUsd, st.budget_usd - st.spent_usd - benchUsd);
      if (agentUsd < MIN_AGENT_USD) return stop(`бюджет $${st.budget_usd}: потрачено $${st.spent_usd.toFixed(2)}, на итерацию (агент ≥ $${MIN_AGENT_USD} + bench ~$${benchUsd.toFixed(0)}) не хватает`);
      const n = st.iterations.length + 1;
      const branch = `${st.branch}-${n}`;
      git.switchNew(wt, branch, st.accepted_commit);
      it = {
        n, item: { id: item.id, title: item.title, acceptance: item.acceptance }, branch, start_commit: st.accepted_commit, phase: "agent",
        started_at: nowIso(), limits: { agent_ms: agentMs, agent_usd: Math.round(agentUsd * 100) / 100 }, refs_before: git.refs(wt),
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
      it.agent = await deps.runAgent({ cwd: wt, brief, logDir, timeoutMs: agentMs, budgetUsd: agentUsd });
      save();
      const r = await afterAgent(it, false);
      if (typeof r === "object") return r;
      if (r === "next") continue;
    }
    if (it.phase === "check") {
      deps.log(`итерация ${it.n}: ./check`);
      const logFile = join(cfg.stateDir, String(it.n), "check.log");
      const ok = await deps.runCheck({ cwd: wt, logFile });
      if (!ok) {
        const k = infraKind(readLog(logFile));
        finish(it, "сбой", k ? `./check красный из-за окружения: ${KIND_TEXT[k]}` : "./check красный на ветке итерации", { kind: k ?? "check_red", infra: k !== null });
        continue;
      }
      const sha = it.head_commit ?? git.head(wt);
      it.bench = { runs: { explainer: runIdOf(cfg.date, it.n, sha, "explainer"), user: runIdOf(cfg.date, it.n, sha, "user") } };
      it.phase = "bench";
      save();
    }
    if (it.phase === "bench" || it.phase === "confirm") {
      const cur = it;
      const confirming = cur.phase === "confirm";
      const pre = await preBench();
      if (pre) return pre;
      if (git.branch(wt) !== cur.branch) git.switchTo(wt, cur.branch);
      const runs = confirming ? cur.confirm!.runs : cur.bench!.runs;
      const r = await benchBoth(runs, confirming ? `${cur.n}-r2` : String(cur.n));
      // SSD пропал, кончились окно или бюджет посреди bench — остановка; продолжение доведёт эту же итерацию
      if (!deps.storageOnline()) return stop(SSD_OFF);
      if (r.stopped) return stop(r.stopped);
      const slot = confirming ? cur.confirm! : cur.bench!;
      slot.wall_ms = r.wall_ms;
      if (!r.ok) slot.error = r.error;
      const cand = scoresOf(scorePaths(runs));
      const base = scoresOf(st.baseline!.scores);
      const benchFail = (what: string) => {
        const k = infraKind(r.logs.map(readLog).join("\n"));
        finish(cur, "сбой", `${what}${k ? ` (${KIND_TEXT[k]})` : ""}`, { kind: k ?? "bench", infra: k !== null || confirming });
      };
      if (!cand || !base) {
        benchFail(`${confirming ? "подтверждающий прогон: " : ""}${r.error ?? "нет scores.json прогона"}`);
        continue;
      }
      let v: NightVerdict;
      let candPaths = scorePaths(runs);
      if (confirming) {
        // решение — по среднему двух прогонов кандидата: базовая линия не завышается удачным прогоном (I4)
        const first = scoresOf(scorePaths(cur.bench!.runs))!;
        const avg = cur.confirm!.avg;
        for (const set of ["explainer", "user"] as const) {
          const p = benchScoresPath(wt, avg[set]);
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p, JSON.stringify(averageScores(first[set], cand[set], avg[set]), null, 2) + "\n");
        }
        candPaths = scorePaths(avg);
        v = acceptNight(base, scoresOf(candPaths)!, cfg.sets, { requireGain: cur.item.acceptance === "рост" });
        cur.first_verdict = cur.verdict;
      } else {
        v = acceptNight(base, cand, cfg.sets, { requireGain: cur.item.acceptance === "рост" });
      }
      cur.verdict = pickVerdict(v);
      if (v.infra) {
        finish(cur, "сбой", v.infra, { kind: "judge", infra: true });
      } else if (!v.accepted) {
        if (v.reasons.some((x) => x.startsWith("неполн")) || !r.ok) benchFail(`${r.error ? `${r.error}; ` : ""}${v.reasons.join("; ")}`);
        else finish(cur, "не дало роста", confirming ? `не подтвердилось повтором: ${verdictShort(v)}` : undefined);
      } else if (confirming) {
        accept(cur, candPaths, false);
      } else {
        // принято по одному прогону: подтверждающий повтор, если помещается в бюджет и окно
        const costUsd = (st.bench_cost[runs.explainer] ?? 0) + (st.bench_cost[runs.user] ?? 0);
        const fits = st.budget_usd - st.spent_usd >= costUsd && untilMs() - deps.now().getTime() >= r.wall_ms;
        if (fits) {
          cur.confirm = { runs: { explainer: `${runs.explainer}-r2`, user: `${runs.user}-r2` }, avg: { explainer: `${runs.explainer}-avg`, user: `${runs.user}-avg` } };
          cur.phase = "confirm";
          deps.log(`итерация ${cur.n}: принято по первому прогону${v.borderline ? " (у порога)" : ""} — подтверждающий прогон`);
          save();
        } else if (v.borderline) {
          finish(cur, "сбой", `пограничное «принято» (${verdictShort(v)}), а подтверждающий прогон не помещается в бюджет или окно — пункт остаётся открытым`, { kind: "unconfirmed", infra: true });
        } else {
          accept(cur, candPaths, true);
        }
      }
    }
  }
}

/** Стоимость прогона базовой линии (оценка стоимости bench итерации). */
function baselineBenchUsd(st: NightState): number {
  const b = st.baseline!;
  if (b.source === "evidence") return 0;
  return (st.bench_cost[b.runs.explainer] ?? 0) + (st.bench_cost[b.runs.user] ?? 0);
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
