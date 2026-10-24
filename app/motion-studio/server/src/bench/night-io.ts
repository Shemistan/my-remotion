// Адаптеры ночного цикла к ОС: git, процессы, ответ `claude -p`, стоимость прогона bench.
// Логика ночи — `night.ts` (на подставляемых зависимостях), сборка — `scripts/night.mts`.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentResult, NightGit } from "./night.js";

/** Переменные, которые направляют git в другой репозиторий, индекс или рабочее дерево. */
const GIT_LOCATION = /^GIT_(DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|PREFIX|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM)$/;
/**
 * Окружение для git ночи: без GIT_DIR, GIT_INDEX_FILE и т. п. Их выставляет git для хуков —
 * унаследованные, они направили бы команды мимо `cwd` (в smoke под pre-commit тест так
 * закоммитил в настоящий репозиторий, 2026-10-23).
 */
export function gitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !GIT_LOCATION.test(k)));
}
const git = (cwd: string, ...a: string[]) => gitRaw(cwd, ...a).trim();
const gitRaw = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", env: gitEnv(), stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });

/** Ветки, которые ночь и её агент двигать не вправе (M5): локальные и в origin. */
export const PROTECTED_REFS = ["refs/heads/main", "refs/heads/master", "refs/heads/staging", "refs/remotes/origin/main", "refs/remotes/origin/master", "refs/remotes/origin/staging"];

export function createNightGit(): NightGit {
  return {
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
    changedFiles: (cwd, from) => {
      const s = git(cwd, "diff", "--name-only", "--no-renames", `${from}..HEAD`);
      return s ? s.split("\n") : [];
    },
    refs: (cwd) => {
      const s = git(cwd, "for-each-ref", "--format=%(refname) %(objectname)", ...PROTECTED_REFS);
      return Object.fromEntries(s ? s.split("\n").map((l) => l.split(" ") as [string, string]) : []);
    },
    commitFile: (cwd, file, message) => {
      git(cwd, "add", "--", file);
      git(cwd, "commit", "-q", "-m", message);
    },
    saveLeftover: (cwd, dir) => {
      // не git stash: его стек общий для всех worktree и сессий (ревью ночи I3, rulings 2026-10-23)
      if (git(cwd, "status", "--porcelain") === "") return null;
      mkdirSync(dir, { recursive: true });
      const patch = gitRaw(cwd, "diff", "HEAD", "--binary");
      if (patch) writeFileSync(join(dir, "wip.patch"), patch);
      const untracked = gitRaw(cwd, "ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
      for (const f of untracked) {
        const dst = join(dir, "wip-untracked", f);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(join(cwd, f), dst);
      }
      // дерево — к HEAD: отслеживаемые из HEAD, неотслеживаемые (уже скопированные) — убрать
      git(cwd, "restore", "--source=HEAD", "--staged", "--worktree", "--", ".");
      for (const f of untracked) unlinkSync(join(cwd, f));
      return { dir, patch: patch !== "", untracked };
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
}

// ---------- процессы ----------

/** Живые дочерние процессы ночи (для гашения по SIGINT/TERM/HUP). */
export const children = new Set<ChildProcess>();

export function killGroupOf(c: ChildProcess, sig: NodeJS.Signals): void {
  try {
    if (c.pid) process.kill(-c.pid, sig);
  } catch {
    // уже завершён
  }
}

export interface RunOptions {
  cwd: string;
  out: string;
  err?: string;
  input?: string;
  timeoutMs: number;
  pidFile?: string;
  /** Первый сигнал при таймауте или остановке (по умолчанию SIGTERM); дальше SIGTERM и SIGKILL. */
  graceSignal?: NodeJS.Signals;
  /** Проверка во время работы: вернула причину — процесс останавливается досрочно. */
  watch?: () => string | null;
  watchMs?: number;
  env?: NodeJS.ProcessEnv;
}

/** Процесс в своей группе (таймаут и остановка гасят всё дерево), вывод — в файлы. */
export function runProcess(cmd: string, args: string[], o: RunOptions): Promise<{ code: number | null; timedOut: boolean; stopped?: string; ms: number }> {
  mkdirSync(dirname(o.out), { recursive: true });
  const out = openSync(o.out, "a");
  const err = o.err ? openSync(o.err, "a") : out;
  const t0 = Date.now();
  return new Promise((res) => {
    const c = spawn(cmd, args, { cwd: o.cwd, detached: true, env: o.env ?? process.env, stdio: [o.input === undefined ? "ignore" : "pipe", out, err] });
    children.add(c);
    if (o.pidFile && c.pid) writeFileSync(o.pidFile, String(c.pid));
    if (o.input !== undefined) c.stdin!.end(o.input);
    let timedOut = false;
    let stopped: string | undefined;
    const escalate = () => {
      killGroupOf(c, o.graceSignal ?? "SIGTERM");
      setTimeout(() => killGroupOf(c, "SIGTERM"), 120_000).unref();
      setTimeout(() => killGroupOf(c, "SIGKILL"), 180_000).unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      escalate();
    }, o.timeoutMs);
    const poll = o.watch
      ? setInterval(() => {
          if (stopped || timedOut) return;
          const why = o.watch!();
          if (why) {
            stopped = why;
            escalate();
          }
        }, o.watchMs ?? 60_000)
      : undefined;
    let finished = false;
    const done = (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (poll) clearInterval(poll);
      children.delete(c);
      closeSync(out);
      if (err !== out) closeSync(err);
      res({ code, timedOut, ...(stopped ? { stopped } : {}), ms: Date.now() - t0 });
    };
    c.on("error", () => done(127));
    c.on("exit", (code) => done(code));
  });
}

// ---------- агент ----------

/**
 * Итог `claude -p --output-format json`: последний JSON вывода. Нет JSON (таймаут, падение) —
 * стоимость по лимиту агента: оценка сверху, чтобы ночь не потратила больше бюджета (M2).
 */
export function parseAgentOutput(text: string, r: { code: number | null; timedOut: boolean; budgetUsd: number; errText?: string }): AgentResult {
  let j: Record<string, unknown> = {};
  const txt = text.trim();
  try {
    j = JSON.parse(txt.slice(txt.lastIndexOf("\n{") + 1)) as Record<string, unknown>;
  } catch {
    // таймаут или падение до ответа: JSON нет
  }
  const denials = ((j.permission_denials as { tool_name?: string; tool_input?: Record<string, unknown> }[] | undefined) ?? [])
    .map((d) => `${d.tool_name ?? "?"}: ${String(d.tool_input?.command ?? d.tool_input?.file_path ?? JSON.stringify(d.tool_input ?? {})).replace(/\s+/g, " ").slice(0, 160)}`);
  const cost = typeof j.total_cost_usd === "number" ? j.total_cost_usd : r.timedOut || r.code !== 0 ? r.budgetUsd : 0;
  const isErr = j.is_error === true || (r.code !== 0 && !r.timedOut);
  return {
    status: r.timedOut ? "timeout" : isErr ? "error" : "ok",
    cost_usd: cost, wall_ms: 0,
    ...(typeof j.num_turns === "number" ? { turns: j.num_turns } : {}),
    ...(typeof j.session_id === "string" ? { session_id: j.session_id } : {}),
    ...(typeof j.result === "string" ? { summary: j.result } : {}),
    denials,
    ...(isErr ? { error: `${String(j.subtype ?? `код ${r.code}`)}${r.errText?.trim() ? `; ${r.errText.trim().slice(-300)}` : ""}` } : {}),
  };
}

/**
 * Итог агента из каталога итерации (`agent.json`, `agent.err`) — для продолжения ночи,
 * прерванной во время агента. Агент не успел записать итог — null (траты оценивает вызывающий).
 */
export function readAgentLog(logDir: string): AgentResult | null {
  const out = join(logDir, "agent.json");
  if (!existsSync(out)) return null;
  const text = readFileSync(out, "utf8");
  if (!/"total_cost_usd"\s*:/.test(text)) return null;
  const errFile = join(logDir, "agent.err");
  return parseAgentOutput(text, { code: 0, timedOut: false, budgetUsd: 0, errText: existsSync(errFile) ? readFileSync(errFile, "utf8") : "" });
}

/** Метка итога пробного агента предпроверки. */
export const PROBE_MARK = "NIGHT_PROBE_EXIT=";

/**
 * Пробный агент предпроверки (ревью ночи B1): в песочнице агента `./check` должен пройти —
 * иначе настоящий агент не сможет коммитить (pre-commit), и ночь сожжёт бэклог сбоями.
 */
export function probeVerdict(a: AgentResult): { ok: boolean; reason?: string } {
  const text = `${a.summary ?? ""}\n${a.error ?? ""}`;
  const eperm = /\bEPERM\b/.test(text);
  if (a.status !== "ok") return { ok: false, reason: `пробный агент: ${a.status}${a.error ? ` (${a.error.slice(0, 200)})` : ""}` };
  const m = new RegExp(`${PROBE_MARK}(\\S+)`).exec(text);
  if (!m) return { ok: false, reason: `пробный агент не сообщил ${PROBE_MARK}<код>: ${text.trim().slice(0, 200)}` };
  if (m[1] !== "0" || eperm) {
    return { ok: false, reason: `./check в песочнице агента: ${PROBE_MARK}${m[1]}${eperm ? ", spawn EPERM — песочница не даёт запускать дочерние процессы" : ""}: ${text.trim().slice(-300)}` };
  }
  return { ok: true };
}

// ---------- bench ----------

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
const readJsonSafe = (p: string): Record<string, unknown> => {
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
};

/** Уже потрачено прогоном bench (по файлам сцен): генерация с прошлыми попытками + все вызовы судьи. */
export function benchRunSpent(runDir: string): number {
  if (!existsSync(runDir)) return 0;
  let sum = 0;
  for (const scene of readdirSync(runDir, { withFileTypes: true })) {
    if (!scene.isDirectory()) continue;
    const dir = join(runDir, scene.name);
    const gen = join(dir, "gen.json");
    if (existsSync(gen)) {
      const g = readJsonSafe(gen);
      sum += num(g.cost_usd) + ((g.prior_attempts as { cost_usd?: number }[] | undefined) ?? []).reduce((a, p) => a + num(p.cost_usd), 0);
    }
    const jr = join(dir, "judge-runs");
    if (existsSync(jr)) for (const f of readdirSync(jr)) if (f.endsWith(".json")) sum += num(readJsonSafe(join(jr, f)).cost_usd);
  }
  return sum;
}

// ---------- остаточные процессы агента (M1) ----------

/** pid из вывода `lsof -d cwd -Fpn`, у которых рабочий каталог — `root` или внутри него. */
export function parseLsofCwd(text: string, root: string): number[] {
  const out: number[] = [];
  let pid = 0;
  for (const l of text.split("\n")) {
    if (l.startsWith("p")) pid = Number(l.slice(1));
    else if (l.startsWith("n") && pid > 0) {
      const p = l.slice(1);
      if ((p === root || p.startsWith(`${root}/`)) && !out.includes(pid)) out.push(pid);
    }
  }
  return out;
}
