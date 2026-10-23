// Ночной цикл качества: ./night в корне репозитория (обёртка над этим скриптом).
// Как пользоваться — scripts/NIGHT.md; логика ночи — server/src/bench/night.ts.
//
//   ./night --dry-run                       # предпроверки и план ночи, ничего не создаёт и не тратит
//   ./night                                 # ночь до 07:00, бюджет $150
//   ./night --until 06:30 --budget-usd 120
//   ./night --smoke --until 15:30           # короткая проверка: 2+2 сцены, одна итерация (дата <день>-smoke)
//   ./night --resume [--smoke] [--date ГГГГ-ММ-ДД]   # продолжить прерванную ночь
// Флаги: --item Q07 (только этот пункт), --max-iterations N, --agent-min N (потолок агента, мин),
//   --agent-usd N (потолок агента, $), --date ГГГГ-ММ-ДД (по умолчанию — сегодня).
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKER_FILE, OwnerBusyError, acquireOwnerLock } from "@ms/core";
import type { BenchScores } from "../server/src/bench/night-accept.js";
import { missingScenes } from "../server/src/bench/night-accept.js";
import { nightReport } from "../server/src/bench/night-report.js";
import {
  type AgentResult, BACKLOG, type NightConfig, type NightDeps, type NightGit, type NightState, SMOKE_SETS, type Sets,
  describePlan, parseUntil, runNight,
} from "../server/src/bench/night.js";
import { setItems } from "../server/src/bench/sets.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url)).replace(/\/$/, "");
const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const opt = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (flag("--help") || flag("-h")) {
  const head = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(head.slice(0, head.findIndex((l) => !l.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const num = (n: string, d: number) => {
  const v = opt(n);
  const x = v === undefined ? d : Number(v);
  if (!Number.isFinite(x) || x <= 0) throw new Error(`${n}: нужно число > 0`);
  return x;
};
const say = (s: string) => console.log(`[night ${new Date().toTimeString().slice(0, 5)}] ${s}`);
const fail = (s: string): never => {
  console.error(`⛔ night: ${s}`);
  process.exit(1);
};

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const localDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

// ---------- конфигурация ----------
const now = new Date();
const dryRun = flag("--dry-run");
const smoke = flag("--smoke");
const resume = flag("--resume");
const NIGHT_ROOT = join(REPO, "tmp", "night");
// smoke — своя «дата» с суффиксом: не мешает настоящей ночи того же дня
let date = opt("--date") ?? `${localDate(now)}${smoke ? "-smoke" : ""}`;
if (!/^\d{4}-\d{2}-\d{2}(-smoke)?$/.test(date)) fail(`--date: ГГГГ-ММ-ДД[-smoke], получено ${date}`);
if (resume && !opt("--date")) {
  // ночь, начатая до полуночи, продолжается под своей датой
  const nights = existsSync(NIGHT_ROOT)
    ? readdirSync(NIGHT_ROOT).filter((d) => d.endsWith("-smoke") === smoke && existsSync(join(NIGHT_ROOT, d, "state.json"))).sort()
    : [];
  if (!nights.length) fail("--resume: нет начатых ночей в tmp/night");
  date = nights.at(-1)!;
}
const stateDir = join(NIGHT_ROOT, date);
const statePath = join(stateDir, "state.json");
const prior = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as NightState) : null;
if (resume && !prior) fail(`--resume: нет tmp/night/${date}/state.json`);
// общий каталог .git → корень основного checkout: там .claude/worktrees, настройки и примеры
const MAIN = dirname(git(REPO, "rev-parse", "--path-format=absolute", "--git-common-dir"));
const worktree = join(MAIN, ".claude", "worktrees", `night-${date}`);
const fullSets = (): Sets => ({ explainer: setItems("explainer").map((i) => i.id), user: setItems("user").map((i) => i.id) });
const isSmoke = prior ? prior.smoke : smoke;
const cfg: NightConfig = {
  date,
  until: parseUntil(opt("--until") ?? (prior && !opt("--until") && new Date(prior.until) > now ? prior.until : "07:00"), now).toISOString(),
  budgetUsd: num("--budget-usd", prior?.budget_usd ?? 150),
  smoke: isSmoke,
  item: opt("--item"),
  maxIterations: opt("--max-iterations") ? num("--max-iterations", 1) : isSmoke ? 1 : undefined,
  agentTimeoutMs: num("--agent-min", isSmoke ? 40 : 120) * 60_000,
  agentBudgetUsd: num("--agent-usd", isSmoke ? 10 : 30),
  minAgentMs: (isSmoke ? 15 : 30) * 60_000,
  benchEstimateMs: (isSmoke ? 60 : 150) * 60_000,
  benchCostEstimateUsd: isSmoke ? 20 : 80,
  sets: prior?.sets ?? (isSmoke ? SMOKE_SETS : fullSets()),
  source: prior?.source ?? { branch: git(REPO, "symbolic-ref", "--short", "HEAD"), commit: git(REPO, "rev-parse", "HEAD"), root: REPO },
  worktree,
  stateDir,
  examplesDir: join(MAIN, "tmp", "motion-studio-examples"),
  briefTemplate: readFileSync(join(REPO, "app", "motion-studio", "scripts", "night-brief.md"), "utf8"),
};
const settingsFile = join(MAIN, ".claude", "settings.json");
const claudeBin = process.env.MS_NIGHT_CLAUDE_BIN ?? "claude";
const agentArgs = (budgetUsd: number, name: string) => [
  "-p", "--output-format", "json",
  // те же права, что у сессий проекта: его settings.json (dontAsk, sandbox, allow), без расширения;
  // запрос разрешения ночью некому подтвердить — такой вызов отклоняется и попадает в отчёт
  "--permission-mode", "dontAsk", "--permission-prompts", "none",
  ...(existsSync(settingsFile) ? ["--settings", settingsFile] : []),
  "--max-budget-usd", budgetUsd.toFixed(2), "--name", name,
];

// ---------- процессы ----------
const children = new Set<ChildProcess>();
const killGroup = (c: ChildProcess, sig: NodeJS.Signals) => {
  try {
    if (c.pid) process.kill(-c.pid, sig);
  } catch {
    // уже завершён
  }
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    say(`${sig}: останавливаю дочерние процессы; продолжить — ./night --resume --date ${date}`);
    for (const c of children) killGroup(c, "SIGTERM");
    setTimeout(() => process.exit(130), 3000).unref();
  });
}
const alive = (pid: number) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Процесс в своей группе (таймаут гасит всё дерево), вывод — в файлы. */
function run(cmd: string, args: string[], o: { cwd: string; out: string; err?: string; input?: string; timeoutMs: number; pidFile?: string; graceSignal?: NodeJS.Signals }): Promise<{ code: number | null; timedOut: boolean; ms: number }> {
  mkdirSync(dirname(o.out), { recursive: true });
  const out = openSync(o.out, "a");
  const err = o.err ? openSync(o.err, "a") : out;
  const t0 = Date.now();
  return new Promise((res) => {
    const c = spawn(cmd, args, { cwd: o.cwd, detached: true, env: process.env, stdio: [o.input === undefined ? "ignore" : "pipe", out, err] });
    children.add(c);
    if (o.pidFile && c.pid) writeFileSync(o.pidFile, String(c.pid));
    if (o.input !== undefined) c.stdin!.end(o.input);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(c, o.graceSignal ?? "SIGTERM");
      setTimeout(() => killGroup(c, "SIGTERM"), 120_000).unref();
      setTimeout(() => killGroup(c, "SIGKILL"), 180_000).unref();
    }, o.timeoutMs);
    const done = (code: number | null) => {
      clearTimeout(timer);
      children.delete(c);
      closeSync(out);
      if (err !== out) closeSync(err);
      res({ code, timedOut, ms: Date.now() - t0 });
    };
    c.on("error", () => done(127));
    c.on("exit", (code) => done(code));
  });
}

const gitImpl: NightGit = {
  worktreeExists: (p) => existsSync(join(p, ".git")),
  addWorktree: (from, path, branch, at) => {
    git(from, "worktree", "add", "-b", branch, path, at);
  },
  head: (cwd) => git(cwd, "rev-parse", "HEAD"),
  branch: (cwd) => git(cwd, "symbolic-ref", "--short", "HEAD"),
  isClean: (cwd) => git(cwd, "status", "--porcelain") === "",
  switchNew: (cwd, b, from) => {
    git(cwd, "switch", "-c", b, from);
  },
  switchTo: (cwd, b) => {
    git(cwd, "switch", b);
  },
  ffMerge: (cwd, ref) => {
    git(cwd, "merge", "--ff-only", ref);
  },
  log: (cwd, from) => {
    const s = git(cwd, "log", "--format=%h %s", `${from}..HEAD`);
    return s ? s.split("\n") : [];
  },
  commitFile: (cwd, file, message) => {
    git(cwd, "add", "--", file);
    git(cwd, "commit", "-q", "-m", message);
  },
  stashLeftover: (cwd, tag) => {
    // правки не удаляются: stash с уникальной меткой, sha — в отчёт; pop/drop ночь не делает
    git(cwd, "stash", "push", "-u", "-m", tag);
    const line = git(cwd, "stash", "list", "--format=%H %gs").split("\n").find((l) => l.endsWith(tag));
    return line ? line.split(" ")[0]! : null;
  },
  push: (cwd, branches) => {
    try {
      git(cwd, "push", "-q", "-u", "origin", ...branches);
      return null;
    } catch (e) {
      return ((e as { stderr?: string }).stderr || (e as Error).message).trim();
    }
  },
};

const dataDir = process.env.MS_DATA_DIR?.trim();
const storageOnline = () => !!dataDir && existsSync(join(dataDir, MARKER_FILE));

function findBaseline(a: { commit: string; sets: Sets }): { explainer: string; user: string } | null {
  const root = join(REPO, "docs", "evidence", "phase-1", "bench");
  if (!existsSync(root)) return null;
  const pick = (set: "explainer" | "user") => {
    const found = readdirSync(root)
      .map((d) => join(root, d, "scores.json"))
      .filter((p) => existsSync(p))
      .map((p) => ({ p, s: JSON.parse(readFileSync(p, "utf8")) as BenchScores & { summary: { set?: string; gen_commits?: string[] } }, t: statSync(p).mtimeMs }))
      .filter(({ s }) => (s.summary.set ?? "explainer") === set && (s.summary.gen_commits ?? []).length === 1 && a.commit.startsWith(s.summary.gen_commits![0]!))
      .filter(({ s }) => missingScenes(s, a.sets[set]).length === 0)
      .sort((x, y) => y.t - x.t);
    return found[0]?.p;
  };
  const e = pick("explainer");
  const u = pick("user");
  return e && u ? { explainer: e, user: u } : null;
}

async function runAgent(a: { cwd: string; brief: string; logDir: string; timeoutMs: number; budgetUsd: number }): Promise<AgentResult> {
  const out = join(a.logDir, "agent.json");
  const r = await run(claudeBin, agentArgs(a.budgetUsd, `night-${date}-${a.logDir.split("/").at(-1)}`), {
    cwd: a.cwd, out, err: join(a.logDir, "agent.err"), input: a.brief, timeoutMs: a.timeoutMs, pidFile: join(a.logDir, "agent.pid"),
  });
  let j: Record<string, unknown> = {};
  try {
    const txt = readFileSync(out, "utf8").trim();
    j = JSON.parse(txt.slice(txt.lastIndexOf("\n{") + 1)) as Record<string, unknown>;
  } catch {
    // таймаут или падение до ответа: JSON нет
  }
  const denials = ((j.permission_denials as { tool_name?: string; tool_input?: Record<string, unknown> }[] | undefined) ?? [])
    .map((d) => `${d.tool_name ?? "?"}: ${String(d.tool_input?.command ?? d.tool_input?.file_path ?? JSON.stringify(d.tool_input ?? {})).replace(/\s+/g, " ").slice(0, 160)}`);
  const cost = typeof j.total_cost_usd === "number" ? j.total_cost_usd : r.timedOut ? a.budgetUsd : 0;
  const isErr = j.is_error === true || (r.code !== 0 && !r.timedOut);
  return {
    status: r.timedOut ? "timeout" : isErr ? "error" : "ok",
    cost_usd: cost, wall_ms: r.ms,
    ...(typeof j.num_turns === "number" ? { turns: j.num_turns } : {}),
    ...(typeof j.session_id === "string" ? { session_id: j.session_id } : {}),
    ...(typeof j.result === "string" ? { summary: j.result } : {}),
    denials,
    ...(isErr ? { error: `${String(j.subtype ?? `код ${r.code}`)}${existsSync(join(a.logDir, "agent.err")) ? `; ${readFileSync(join(a.logDir, "agent.err"), "utf8").trim().slice(-300)}` : ""}` } : {}),
  };
}

const deps: NightDeps = {
  now: () => new Date(),
  log: say,
  storageOnline,
  git: gitImpl,
  runAgent,
  runCheck: async ({ cwd, logFile }) => (await run("./check", [], { cwd, out: logFile, timeoutMs: 45 * 60_000 })).code === 0,
  runBench: async ({ cwd, runId, set, only, logFile, timeoutMs }) => {
    const args = ["npx", "tsx", "scripts/bench-set.mts", "--run", runId, ...(set === "user" ? ["--set", "user", "--gen-timeout-min", "180"] : []), ...(only ? ["--only", only.join(",")] : [])];
    const r = await run("./scripts/with-node.sh", args, { cwd: join(cwd, "app", "motion-studio"), out: logFile, timeoutMs, graceSignal: "SIGINT" });
    return r.code === 0 ? { ok: true } : { ok: false, error: r.timedOut ? `таймаут ${Math.round(timeoutMs / 60_000)} мин` : `код выхода ${r.code} (журнал ${logFile})` };
  },
  findBaseline,
  prepareWorktree: async (cwd) => (await run("make", ["-C", "app/motion-studio", "install"], { cwd, out: join(stateDir, "prepare.log"), timeoutMs: 30 * 60_000 })).code === 0,
};

// ---------- предпроверки ----------
async function preflight(): Promise<string[]> {
  const ok: string[] = [];
  if (!dataDir) fail("MS_DATA_DIR не задан (export MS_DATA_DIR=\"/Volumes/External SSD/MotionStudio\")");
  if (!storageOnline()) fail(`хранилище недоступно: нет ${join(dataDir!, MARKER_FILE)} — подключи SSD`);
  ok.push(`SSD: ${dataDir}`);
  try {
    const lock = await acquireOwnerLock(dataDir!, "cli");
    await lock.release();
    ok.push("хранилище свободно (owner lock, ADR 0007): bench и сервер не запущены");
  } catch (e) {
    if (e instanceof OwnerBusyError) fail(`${e.message} — дождись конца bench или останови сервер`);
    throw e;
  }
  const lockFile = join(stateDir, "night.pid");
  if (existsSync(lockFile) && alive(Number(readFileSync(lockFile, "utf8").trim() || "0"))) fail(`ночь ${date} уже идёт (pid ${readFileSync(lockFile, "utf8").trim()})`);
  for (const it of prior?.iterations ?? []) {
    const pf = join(stateDir, String(it.n), "agent.pid");
    if (it.phase === "agent" && existsSync(pf) && alive(Number(readFileSync(pf, "utf8").trim() || "0"))) fail(`агент итерации ${it.n} прошлого запуска ещё жив (pid ${readFileSync(pf, "utf8").trim()}) — заверши его`);
  }
  if (git(REPO, "status", "--porcelain", "--untracked-files=no") !== "") fail("рабочее дерево не чистое — закоммить правки");
  ok.push("рабочее дерево чистое");
  if (!prior && gitImpl.worktreeExists(worktree)) fail(`worktree ${worktree} уже есть, а tmp/night/${date}/state.json нет — разбери руками`);
  if (!prior && (() => { try { git(REPO, "rev-parse", "--verify", "-q", `refs/heads/night/${date}`); return true; } catch { return false; } })()) {
    fail(`ветка night/${date} уже есть без state.json — разбери руками (ночь ничего не удаляет)`);
  }
  try {
    ok.push(`агент: ${execFileSync(claudeBin, ["--version"], { encoding: "utf8" }).trim()}${existsSync(settingsFile) ? `, настройки ${settingsFile}` : " (нет .claude/settings.json основного checkout — агент без прав проекта)"}`);
  } catch {
    fail(`нет ${claudeBin} в PATH`);
  }
  const checkLog = dryRun ? join(tmpdir(), `night-${date}-preflight-check.log`) : join(stateDir, "preflight-check.log");
  if (!dryRun) mkdirSync(stateDir, { recursive: true });
  say("./check в worktree запуска…");
  const c = await run("./check", [], { cwd: REPO, out: checkLog, timeoutMs: 45 * 60_000 });
  if (c.code !== 0) fail(`./check красный (журнал ${checkLog})`);
  ok.push(`./check зелёный (${Math.round(c.ms / 1000)} с)`);
  return ok;
}

const checks = await preflight();
if (dryRun) {
  const backlogFile = gitImpl.worktreeExists(worktree) ? join(worktree, BACKLOG) : join(REPO, BACKLOG);
  console.log(describePlan(cfg, {
    now, backlogMd: readFileSync(backlogFile, "utf8"), state: prior,
    baseline: prior ? null : findBaseline({ commit: cfg.source.commit, sets: cfg.sets }),
    worktreeExists: gitImpl.worktreeExists(worktree),
    agentCommand: `${claudeBin} ${agentArgs(cfg.agentBudgetUsd, `night-${date}-<n>`).join(" ")} < бриф (scripts/night-brief.md)`,
    preflight: checks,
  }));
  process.exit(0);
}
mkdirSync(stateDir, { recursive: true });
writeFileSync(join(stateDir, "night.pid"), String(process.pid));
say(`${prior ? "продолжение" : "старт"} ночи ${date}${cfg.smoke ? " (smoke)" : ""}: до ${cfg.until}, бюджет $${cfg.budgetUsd}; ${checks.join("; ")}`);
try {
  const st = await runNight(cfg, deps);
  say(`итог: ${st.stop?.reason ?? "—"}; потрачено $${st.spent_usd.toFixed(2)}; отчёт ${join(stateDir, "REPORT.md")}`);
} catch (e) {
  // сбой оркестратора: причина — в state и отчёт, продолжение — --resume
  const msg = (e as Error).stack ?? String(e);
  say(`ошибка: ${msg}`);
  if (existsSync(statePath)) {
    const st = JSON.parse(readFileSync(statePath, "utf8")) as NightState;
    st.stop = { reason: `ошибка оркестратора: ${(e as Error).message.slice(0, 400)}`, at: new Date().toISOString() };
    writeFileSync(statePath, JSON.stringify(st, null, 2) + "\n");
    writeFileSync(join(stateDir, "REPORT.md"), nightReport(st, { examplesDir: cfg.examplesDir }));
  }
  process.exitCode = 1;
} finally {
  writeFileSync(join(stateDir, "night.pid"), "");
}
