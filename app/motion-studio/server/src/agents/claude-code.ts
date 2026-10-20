// ClaudeCodeRuntime: агент — неизменённый `claude -p --restricted` (ADR 0003,
// 04-agent-workflows.md §5). Флаги сверены с `claude --help` 2.1.304.
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, readFile, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { assertRunRef, safeMkdir, spawnTracked } from "@ms/core";
import { toJsonSchema } from "@ms/contracts";
import type { ZodType, ZodTypeAny } from "zod";
import { childEnv } from "./env.js";
import {
  AGENT_TOOLS,
  type AgentErrorKind,
  type AgentResult,
  type AgentRuntimeAdapter,
  type AgentTask,
  type AgentUsage,
  MODEL_RE,
  type Role,
} from "./runtime.js";

/** Права на правку в cwd без вопросов нужны только ролям с Write/Edit. */
const EDIT_TOOLS = new Set(["Write", "Edit"]);

/**
 * Аргументы `claude`. Промпт сюда не входит — он идёт через stdin: аргументы пишутся
 * в `run/processes/*.json` открытым текстом. Системный промпт — текст роли без секретов.
 */
export function buildClaudeArgs(task: AgentTask<unknown>, jsonSchema: object, systemPrompt: string): string[] {
  const bad = task.tools.filter((t) => !(AGENT_TOOLS as readonly string[]).includes(t));
  if (bad.length > 0) throw new Error(`agents: инструменты вне allowlist: ${bad.join(", ")}`);
  if (!MODEL_RE.test(task.model)) throw new Error(`agents: недопустимое имя модели: ${JSON.stringify(task.model)}`);
  const budget = task.limits.maxBudgetUsd;
  if (!(Number.isFinite(budget) && budget > 0)) throw new Error(`agents: maxBudgetUsd должен быть > 0: ${budget}`);

  const args = [
    "-p",
    "--restricted",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--model",
    task.model,
    "--tools",
    task.tools.join(","),
  ];
  if (task.tools.some((t) => EDIT_TOOLS.has(t))) args.push("--permission-mode", "acceptEdits");
  args.push("--output-format", "json", "--json-schema", JSON.stringify(jsonSchema), "--max-budget-usd", String(budget));
  if (systemPrompt !== "") args.push("--append-system-prompt", systemPrompt);
  return args;
}

type Parsed<O> = Pick<AgentResult<O>, "status" | "output" | "error" | "usage" | "permissionDenials" | "sessionId">;
/** `noResult` — в stdout не нашлось итогового объекта `type:"result"`. */
export type ParsedClaudeOutput<O> = Parsed<O> & { noResult: boolean };

const EMPTY_USAGE: AgentUsage = { model: "", inputTokens: 0, outputTokens: 0, costUsd: 0 };

/**
 * Разбирает итоговый JSON `claude -p --output-format json`. Если весь stdout не JSON
 * (например, перед ответом напечатано предупреждение), берётся последняя непустая
 * строка, начинающаяся с `{`.
 */
export function parseClaudeOutput<O>(stdout: string, schema: ZodType<O>): ParsedClaudeOutput<O> {
  let v = tryJson(stdout);
  if (v === undefined) {
    const last = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("{"))
      .pop();
    if (last !== undefined) v = tryJson(last);
  }
  if (v === undefined) return fail("cli", `ответ CLI — не JSON: ${clip(stdout) || "<пусто>"}`);
  if (typeof v !== "object" || v === null || Array.isArray(v) || (v as { type?: unknown }).type !== "result") {
    return fail("cli", `ответ CLI — не объект result: ${clip(stdout)}`);
  }
  const j = v as Record<string, unknown>;

  const base = {
    usage: usageOf(j),
    permissionDenials: Array.isArray(j.permission_denials) ? (j.permission_denials as unknown[]) : [],
    sessionId: typeof j.session_id === "string" ? j.session_id : undefined,
    noResult: false,
  };
  const failed = (kind: AgentErrorKind, message: string): ParsedClaudeOutput<O> => ({
    ...base,
    status: "failed",
    error: { kind, message },
  });

  if (j.is_error === true) {
    const subtype = String(j.subtype ?? "");
    const errors = Array.isArray(j.errors) ? j.errors.map(String).join("; ") : "";
    const message = errors || (typeof j.result === "string" ? j.result : "") || subtype || "is_error";
    if (subtype === "error_max_budget_usd" || j.terminal_reason === "budget_exhausted") return failed("budget", message);
    if (subtype.includes("structured_output")) return failed("schema", message);
    return failed("cli", `${subtype}: ${message}`);
  }
  if (j.structured_output === undefined || j.structured_output === null) {
    return failed("schema", "в ответе нет structured_output");
  }
  const r = schema.safeParse(j.structured_output);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    return failed("schema", `structured_output не прошёл схему: ${issues}`);
  }
  return { ...base, status: "completed", output: r.data };

  function fail(kind: AgentErrorKind, message: string): ParsedClaudeOutput<O> {
    return { status: "failed", error: { kind, message }, usage: { ...EMPTY_USAGE }, permissionDenials: [], noResult: true };
  }
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}

function usageOf(j: Record<string, unknown>): AgentUsage {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const usage = { ...EMPTY_USAGE };
  let topCost = -1;
  const mu = j.modelUsage;
  if (mu && typeof mu === "object") {
    for (const [model, raw] of Object.entries(mu as Record<string, Record<string, unknown>>)) {
      if (!raw || typeof raw !== "object") continue;
      usage.inputTokens += num(raw.inputTokens) + num(raw.cacheReadInputTokens) + num(raw.cacheCreationInputTokens);
      usage.outputTokens += num(raw.outputTokens);
      usage.costUsd += num(raw.costUSD);
      if (num(raw.costUSD) > topCost) {
        topCost = num(raw.costUSD);
        usage.model = model;
      }
    }
  }
  // итоговая стоимость CLI точнее суммы по моделям
  if (typeof j.total_cost_usd === "number") usage.costUsd = j.total_cost_usd;
  return usage;
}

function clip(s: string, n = 300): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export interface ClaudeCodeRuntimeOptions {
  /** `claude` (поиск по PATH) или путь; относительный путь разрешается от cwd один раз. */
  bin: string;
  /**
   * Каталог журналов внутри хранилища `task.run.root` (каталоги — через `safeMkdir`);
   * журнал вызова — `<logRoot>/<runId>/a<attempt>-<role>-<seq>/{prompt.md,stdout.json,stderr.log}`.
   */
  logRoot: string;
  /** Каталог `prompts/` с `<role>.md` (`motion_director` → `motion-director.md`). */
  promptsDir?: string;
  /** Подмена `spawnTracked` в тестах. */
  spawn?: typeof spawnTracked;
}

export class ClaudeCodeRuntime implements AgentRuntimeAdapter {
  private readonly bin: string;

  constructor(private readonly opts: ClaudeCodeRuntimeOptions) {
    this.bin = opts.bin.includes("/") ? resolve(opts.bin) : opts.bin;
  }

  /**
   * Короткий вызов `<bin> --version` вне прогона: `execFile` с таймаутом 15 с,
   * в `run/processes/` не регистрируется (нет run-ссылки).
   */
  async capabilities(): Promise<{ available: boolean; version?: string; reason?: string }> {
    const env = childEnv(process.env);
    const bin = await resolveBin(this.bin, env.PATH);
    if (!bin) return { available: false, reason: `claude не найден: ${this.bin}` };
    try {
      const { stdout } = await promisify(execFile)(bin, ["--version"], { env, timeout: 15_000 });
      const version = stdout.trim().split(/\s+/)[0];
      return { available: true, version };
    } catch (e) {
      return { available: false, reason: (e as Error).message };
    }
  }

  /**
   * Ошибки задачи (runId, logRoot вне хранилища, инструменты, модель, бюджет, промпт роли,
   * нет бинарника) — `failed`, не исключение. Исключение — только сбой хранилища
   * (`StorageError` из `safeMkdir`) и записи журнала.
   */
  async run<I, O>(task: AgentTask<I>, schema: ZodType<O>, signal: AbortSignal): Promise<AgentResult<O>> {
    const startedAt = new Date().toISOString();
    let stdoutPath = "";
    let stderrPath = "";
    const done = (r: Parsed<O>): AgentResult<O> => ({
      status: r.status,
      output: r.output,
      error: r.error,
      usage: r.usage,
      permissionDenials: r.permissionDenials,
      sessionId: r.sessionId,
      stdoutPath,
      stderrPath,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    const stop = (status: AgentResult<O>["status"], kind: AgentErrorKind, message: string, from?: Parsed<O>) =>
      done({
        status,
        error: { kind, message },
        usage: from?.usage ?? { ...EMPTY_USAGE },
        permissionDenials: from?.permissionDenials ?? [],
        sessionId: from?.sessionId,
      });

    let rel: string;
    try {
      assertRunRef(task.run);
      rel = logRel(task.run.root, this.opts.logRoot);
    } catch (e) {
      return stop("failed", "cli", (e as Error).message);
    }
    const dir = await this.logDir(task, rel);
    stdoutPath = join(dir, "stdout.json");
    stderrPath = join(dir, "stderr.log");

    // всё проверяется до записи prompt.md и запуска
    const env = childEnv(process.env);
    const bin = await resolveBin(this.bin, env.PATH);
    if (!bin) return stop("failed", "cli", `claude не найден: ${this.bin}`);
    let args: string[];
    try {
      args = buildClaudeArgs(task, toJsonSchema(schema as unknown as ZodTypeAny), await this.systemPrompt(task.role));
    } catch (e) {
      return stop("failed", "cli", (e as Error).message);
    }

    // промпт пишется в журнал до запуска; в нём только данные задачи
    const prompt = typeof task.input === "string" ? task.input : "````json\n" + JSON.stringify(task.input, null, 2) + "\n````\n";
    await writeFile(join(dir, "prompt.md"), prompt);
    if (signal.aborted) return stop("cancelled", "cancelled", "отменено до запуска");

    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, task.limits.timeoutMs);
    const onAbort = () => ctrl.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    let res: Awaited<ReturnType<typeof spawnTracked>>;
    try {
      res = await (this.opts.spawn ?? spawnTracked)(task.run.root, task.run, bin, args, {
        cwd: task.workdir,
        env,
        signal: ctrl.signal,
        stdin: prompt,
      });
    } catch (e) {
      return stop("failed", "cli", `запуск claude не удался: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
    await writeFile(stdoutPath, res.stdout);
    await writeFile(stderrPath, res.stderr);

    const parsed = parseClaudeOutput(res.stdout, schema);
    if (res.orphaned) {
      return stop("failed", "orphaned", "группа процессов claude не завершилась; запись осталась в run/processes", parsed);
    }
    if (timedOut) return stop("timeout", "timeout", `таймаут ${task.limits.timeoutMs} мс`, parsed);
    if (signal.aborted) return stop("cancelled", "cancelled", "отменено", parsed);
    if (parsed.status === "completed" && res.code !== 0) {
      return stop("failed", "cli", `claude завершился с кодом ${res.code}: ${clip(res.stderr)}`, parsed);
    }
    if (parsed.noResult) {
      // итогового JSON нет — причина в коде выхода (127: бинарник не найден) и stderr
      const why = `код ${res.code ?? res.signal}; stderr: ${clip(res.stderr) || "<пусто>"}`;
      return stop("failed", "cli", `${parsed.error?.message}; ${why}`);
    }
    return done(parsed);
  }

  /** Первый свободный `<rel>/<runId>/a<attempt>-<role>-<seq>` — через `safeMkdir`. */
  private async logDir(task: AgentTask<unknown>, rel: string): Promise<string> {
    const base = join(rel, task.run.runId);
    for (let seq = 1; ; seq++) {
      const leaf = join(base, `a${task.run.attempt}-${task.role}-${seq}`);
      if (await exists(join(task.run.root, leaf))) continue;
      return safeMkdir(task.run.root, leaf);
    }
  }

  private async systemPrompt(role: Role): Promise<string> {
    if (!this.opts.promptsDir) return "";
    try {
      return await readFile(join(this.opts.promptsDir, `${role.replace(/_/g, "-")}.md`), "utf8");
    } catch (e) {
      throw new Error(`системный промпт роли не прочитан: ${(e as Error).message}`, { cause: e });
    }
  }
}

/** `logRoot` относительно корня хранилища; вне корня (или сам корень) — ошибка. */
function logRel(root: string, logRoot: string): string {
  const rel = relative(resolve(root), resolve(logRoot));
  if (rel === "" || isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep)) {
    throw new Error(`agents: logRoot вне хранилища ${root}: ${logRoot}`);
  }
  return rel;
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}

/** Путь к исполняемому `bin` (поиск по PATH для голого имени) или `undefined`. */
async function resolveBin(bin: string, path: string | undefined): Promise<string | undefined> {
  const candidates = bin.includes("/") ? [bin] : (path ?? "").split(delimiter).filter(Boolean).map((d) => join(d, bin));
  for (const c of candidates) {
    try {
      await access(c, constants.X_OK);
      return c;
    } catch {
      // следующий
    }
  }
  return undefined;
}
