// Ночной цикл качества: ./night в корне репозитория (обёртка над этим скриптом).
// Как пользоваться — scripts/NIGHT.md; логика ночи — server/src/bench/night.ts.
//
//   ./night --dry-run                       # предпроверки и план ночи, ничего не создаёт и не тратит
//   ./night                                 # ночь до 07:00, бюджет $150
//   ./night --until 06:30 --budget-usd 120
//   ./night --smoke --until 15:30           # короткая проверка: 2+2 сцены, одна итерация (дата <день>-smoke)
//   ./night --resume [--smoke] [--date ГГГГ-ММ-ДД]   # продолжить прерванную ночь
// Флаги: --item Q07 (только этот пункт), --max-iterations N, --agent-min N (потолок агента, мин),
//   --agent-usd N (потолок агента, $), --date ГГГГ-ММ-ДД (по умолчанию — сегодня),
//   --skip-probe (без пробного агента предпроверки — только для проверки механики с тестовым
//   двойником агента MS_NIGHT_CLAUDE_BIN, см. NIGHT.md).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARKER_FILE, OwnerBusyError, acquireOwnerLock, procInfo } from "@ms/core";
import type { BenchScores } from "../server/src/bench/night-accept.js";
import { missingScenes } from "../server/src/bench/night-accept.js";
import { PROBE_MARK, benchRunSpent, children, createNightGit, killGroupOf, parseAgentOutput, parseLsofCwd, probeVerdict, runProcess } from "../server/src/bench/night-io.js";
import { nightReport } from "../server/src/bench/night-report.js";
import {
  type AgentResult, BACKLOG, type NightConfig, type NightDeps, type NightState, SMOKE_SETS, type Sets,
  describePlan, latestNight, parseUntil, runNight,
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
const skipProbe = flag("--skip-probe");
const NIGHT_ROOT = join(REPO, "tmp", "night");
// smoke — своя «дата» с суффиксом: не мешает настоящей ночи того же дня
let date = opt("--date") ?? `${localDate(now)}${smoke ? "-smoke" : ""}`;
if (!/^\d{4}-\d{2}-\d{2}(-smoke\d*)?$/.test(date)) fail(`--date: ГГГГ-ММ-ДД[-smoke[N]], получено ${date}`);
if (resume && !opt("--date")) {
  // ночь, начатая до полуночи, продолжается под своей датой; -smoke10 позже -smoke2
  const started = existsSync(NIGHT_ROOT) ? readdirSync(NIGHT_ROOT).filter((d) => existsSync(join(NIGHT_ROOT, d, "state.json"))) : [];
  const last = latestNight(started, smoke);
  if (!last) fail("--resume: нет начатых ночей в tmp/night");
  date = last!;
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
// MS_NIGHT_CLAUDE_BIN — только тестовый двойник агента для проверки механики (NIGHT.md)
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
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    say(`${sig}: останавливаю дочерние процессы; продолжить — ./night --resume --date ${date}`);
    for (const c of children) killGroupOf(c, "SIGTERM");
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
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const dataDir = process.env.MS_DATA_DIR?.trim();
const storageOnline = () => !!dataDir && existsSync(join(dataDir, MARKER_FILE));

/** Хранилище занято (owner lock ADR 0007): причина или null. */
async function ownerBusy(): Promise<string | null> {
  try {
    const lock = await acquireOwnerLock(dataDir!, "cli");
    await lock.release();
    return null;
  } catch (e) {
    if (e instanceof OwnerBusyError) return e.message;
    throw e;
  }
}

/**
 * Остатки агента после итерации (ревью ночи M1): его группа процесса и процессы, запущенные
 * после старта итерации с рабочим каталогом в worktree ночи (например, забытый `npm run dev`,
 * который держит owner lock). Адресно, по pid: SIGTERM, через 5 с — SIGKILL тем, кто жив.
 * Записи реестра процессов хранилища разбирает reap ADR 0007 при старте bench (`bootCore`).
 */
async function cleanupAgent(a: { cwd: string; pid?: number; since: Date }): Promise<string[]> {
  const notes: string[] = [];
  if (a.pid) {
    try {
      process.kill(-a.pid, "SIGTERM");
      notes.push(`группа агента ${a.pid}: SIGTERM`);
    } catch {
      // группы уже нет
    }
  }
  let txt: string;
  try {
    txt = execFileSync("lsof", ["-n", "-d", "cwd", "-Fpn"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // lsof отдаёт код 1, если к части процессов нет доступа, — вывод при этом есть
    txt = String((e as { stdout?: string }).stdout ?? "");
  }
  const victims: { pid: number; startedAt: string }[] = [];
  for (const pid of parseLsofCwd(txt, a.cwd)) {
    if (pid === process.pid) continue;
    const info = await procInfo(pid).catch(() => undefined);
    if (!info || new Date(`${info.startedAt} UTC`).getTime() < a.since.getTime() - 1000) continue;
    let cmd: string;
    try {
      cmd = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim().slice(0, 80);
      process.kill(pid, "SIGTERM");
    } catch {
      continue;
    }
    victims.push(info);
    notes.push(`pid ${pid} (${cmd}) — cwd в worktree ночи`);
  }
  if (victims.length) {
    await pause(5000);
    for (const v of victims) {
      if ((await procInfo(v.pid).catch(() => undefined))?.startedAt === v.startedAt) {
        try {
          process.kill(v.pid, "SIGKILL");
          notes.push(`pid ${v.pid}: SIGKILL`);
        } catch {
          // уже завершён
        }
      }
    }
  }
  return notes;
}

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

async function runAgent(a: { cwd: string; brief: string; logDir: string; timeoutMs: number; budgetUsd: number; name?: string }): Promise<AgentResult> {
  const out = join(a.logDir, "agent.json");
  const errFile = join(a.logDir, "agent.err");
  const r = await runProcess(claudeBin, agentArgs(a.budgetUsd, a.name ?? `night-${date}-${a.logDir.split("/").at(-1)}`), {
    cwd: a.cwd, out, err: errFile, input: a.brief, timeoutMs: a.timeoutMs, pidFile: join(a.logDir, "agent.pid"),
  });
  const res = parseAgentOutput(existsSync(out) ? readFileSync(out, "utf8") : "", {
    code: r.code, timedOut: r.timedOut, budgetUsd: a.budgetUsd, errText: existsSync(errFile) ? readFileSync(errFile, "utf8") : "",
  });
  const pid = Number(existsSync(join(a.logDir, "agent.pid")) ? readFileSync(join(a.logDir, "agent.pid"), "utf8") : "0");
  return { ...res, wall_ms: r.ms, ...(pid > 0 ? { pid } : {}) };
}

const deps: NightDeps = {
  now: () => new Date(),
  log: say,
  storageOnline,
  git: createNightGit(),
  runAgent,
  runCheck: async ({ cwd, logFile }) => (await runProcess("./check", [], { cwd, out: logFile, timeoutMs: 45 * 60_000 })).code === 0,
  runBench: async ({ cwd, runId, set, only, logFile, timeoutMs, maxCostUsd }) => {
    const args = ["npx", "tsx", "scripts/bench-set.mts", "--run", runId, ...(set === "user" ? ["--set", "user", "--gen-timeout-min", "180"] : []), ...(only ? ["--only", only.join(",")] : [])];
    const runDir = join(cwd, "tmp", "bench", runId);
    // потолок трат (M3): bench сам его не знает — ночь следит по файлам сцен и гасит прогон
    const r = await runProcess("./scripts/with-node.sh", args, {
      cwd: join(cwd, "app", "motion-studio"), out: logFile, timeoutMs, graceSignal: "SIGINT", watchMs: 60_000,
      watch: () => (benchRunSpent(runDir) > maxCostUsd ? "budget" : null),
    });
    if (r.stopped) return { ok: false, stopped: "budget", error: `потолок трат $${maxCostUsd.toFixed(0)}` };
    if (r.timedOut) return { ok: false, stopped: "timeout", error: `таймаут ${Math.round(timeoutMs / 60_000)} мин` };
    return r.code === 0 ? { ok: true } : { ok: false, error: `код выхода ${r.code} (журнал ${logFile})` };
  },
  findBaseline,
  prepareWorktree: async (cwd) => (await runProcess("make", ["-C", "app/motion-studio", "install"], { cwd, out: join(stateDir, "prepare.log"), timeoutMs: 30 * 60_000 })).code === 0,
  cleanupAgent,
  ownerBusy: () => (dataDir ? ownerBusy() : Promise.resolve(null)),
};

// ---------- предпроверки ----------
const PROBE_BRIEF = `Это пробный запуск ночного цикла качества, а не задача. Ничего не меняй и не коммить.
Выполни инструментом Bash ровно одну команду в текущем каталоге: \`./check\` (таймаут Bash — 600000 мс).
Последней строкой ответа напиши \`${PROBE_MARK}<код выхода ./check>\`. Если команду не дали выполнить,
напиши \`${PROBE_MARK}blocked\` и дословно текст блока. Если в выводе есть \`EPERM\` — процитируй
одну такую строку.`;

async function preflight(): Promise<string[]> {
  const ok: string[] = [];
  if (!dataDir) fail("MS_DATA_DIR не задан (export MS_DATA_DIR=\"/Volumes/External SSD/MotionStudio\")");
  if (!storageOnline()) fail(`хранилище недоступно: нет ${join(dataDir!, MARKER_FILE)} — подключи SSD`);
  ok.push(`SSD: ${dataDir}`);
  const busy = await ownerBusy();
  if (busy) fail(`${busy} — дождись конца bench или останови сервер`);
  ok.push("хранилище свободно (owner lock, ADR 0007): bench и сервер не запущены");
  const lockFile = join(stateDir, "night.pid");
  if (existsSync(lockFile) && alive(Number(readFileSync(lockFile, "utf8").trim() || "0"))) fail(`ночь ${date} уже идёт (pid ${readFileSync(lockFile, "utf8").trim()})`);
  for (const it of prior?.iterations ?? []) {
    const pf = join(stateDir, String(it.n), "agent.pid");
    if (it.phase === "agent" && existsSync(pf) && alive(Number(readFileSync(pf, "utf8").trim() || "0"))) fail(`агент итерации ${it.n} прошлого запуска ещё жив (pid ${readFileSync(pf, "utf8").trim()}) — заверши его`);
  }
  if (git(REPO, "status", "--porcelain", "--untracked-files=no") !== "") fail("рабочее дерево не чистое — закоммить правки");
  ok.push("рабочее дерево чистое");
  if (!prior && existsSync(join(worktree, ".git"))) fail(`worktree ${worktree} уже есть, а tmp/night/${date}/state.json нет — разбери руками`);
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
  const c = await runProcess("./check", [], { cwd: REPO, out: checkLog, timeoutMs: 45 * 60_000 });
  if (c.code !== 0) fail(`./check красный (журнал ${checkLog})`);
  ok.push(`./check зелёный (${Math.round(c.ms / 1000)} с)`);
  // пробный агент (B1): ./check в песочнице агента — иначе агент не сможет коммитить (pre-commit),
  // и ночь сожжёт бэклог сбоями. Стоит центы, поэтому не в --dry-run.
  if (dryRun) ok.push("пробный агент (./check в песочнице агента): при запуске ночи, ~$0.1–0.5");
  else if (skipProbe) ok.push("пробный агент пропущен (--skip-probe)");
  else {
    const dir = join(stateDir, "probe");
    mkdirSync(dir, { recursive: true });
    say("пробный агент: ./check в песочнице агента…");
    const a = await runAgent({ cwd: REPO, brief: PROBE_BRIEF, logDir: dir, timeoutMs: 25 * 60_000, budgetUsd: 2, name: `night-${date}-probe` });
    const v = probeVerdict(a);
    if (!v.ok) fail(`${v.reason} — ночь не начата, траты на bench не сделаны. Журнал ${dir}; что делать — NIGHT.md, «EPERM»`);
    ok.push(`пробный агент: ./check в песочнице агента зелёный ($${a.cost_usd.toFixed(2)})`);
  }
  return ok;
}

const checks = await preflight();
if (dryRun) {
  const backlogFile = existsSync(join(worktree, ".git")) ? join(worktree, BACKLOG) : join(REPO, BACKLOG);
  console.log(describePlan(cfg, {
    now, backlogMd: readFileSync(backlogFile, "utf8"), state: prior,
    baseline: prior ? null : findBaseline({ commit: cfg.source.commit, sets: cfg.sets }),
    worktreeExists: existsSync(join(worktree, ".git")),
    agentCommand: `${claudeBin} ${agentArgs(cfg.agentBudgetUsd, `night-${date}-<n>`).join(" ")} < бриф (scripts/night-brief.md)`,
    preflight: checks,
  }));
  process.exit(0);
}
mkdirSync(stateDir, { recursive: true });
writeFileSync(join(stateDir, "night.pid"), String(process.pid));
say(`${prior ? "продолжение" : "старт"} ночи ${date}${cfg.smoke ? " (smoke)" : ""}: до ${new Date(cfg.until).toLocaleString("ru-RU")}, бюджет $${cfg.budgetUsd}; ${checks.join("; ")}`);
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
