// CodexRuntime: агент — `codex exec` в собственной песочнице Codex (ADR 0011, спека
// docs/superpowers/specs/2026-11-04-codex-delegation-design.md §1). Флаги сверены с
// `codex exec --help` 0.165.0. Журналы, TMPDIR, реестр процессов, таймаут и отмена — как
// у ClaudeCodeRuntime.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { StorageError, assertRunRef, safeMkdir, spawnTracked } from "@ms/core";
import { toJsonSchema } from "@ms/contracts";
import type { ZodType, ZodTypeAny } from "zod";
import { CLAIMED_LOG_DIRS, EMPTY_USAGE, allocLogDir, clip, logRel, resolveBin, storageWrite } from "./claude-code.js";
import { childEnv } from "./env.js";
import { loadPrompt } from "./prompts.js";
import { redact } from "../diagnostics/redact.js";
import { AGENT_TOOLS, type AgentErrorKind, type AgentResult, type AgentRuntimeAdapter, type AgentTask, type AgentUsage, MODEL_RE, type ReasoningEffort, type Role } from "./runtime.js";

/** Префикс модели в журнале: прогоны Codex отличимы в `agent_runs.model`. */
export const CODEX_MODEL_PREFIX = "codex:";


export interface CodexRuntimeOptions {
  /** `codex` (поиск по PATH) или путь. */
  bin: string;
  /** Модель Codex; без неё — модель по умолчанию из конфигурации Codex. */
  model?: string;
  reasoningEffort?: ReasoningEffort;
  /** Каталог журналов внутри хранилища (как у ClaudeCodeRuntime). */
  logRoot: string;
  promptLoader?: (role: Role) => string;
  /** Подмена `spawnTracked` в тестах. */
  spawn?: typeof spawnTracked;
}

const WRITE_TOOLS = new Set(["Write", "Edit"]);

/**
 * Аргументы `codex exec`. Промпт — через stdin (`-`). Роли без Write/Edit — песочница
 * `read-only`; engineer — `workspace-write`: писать можно только в cwd (draft), сети нет.
 */
export function buildCodexArgs(task: AgentTask<unknown>, opts: { schemaPath: string; lastPath: string; model?: string; reasoningEffort?: ReasoningEffort }): string[] {
  const bad = task.tools.filter((t) => !(AGENT_TOOLS as readonly string[]).includes(t));
  if (bad.length > 0) throw new Error(`agents: инструменты вне allowlist: ${bad.join(", ")}`);
  if (opts.model !== undefined && !MODEL_RE.test(opts.model)) throw new Error(`agents: недопустимое имя модели Codex: ${JSON.stringify(opts.model)}`);
  const sandbox = task.tools.some((t) => WRITE_TOOLS.has(t)) ? "workspace-write" : "read-only";
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "--color", "never",
    "-C", task.workdir,
    "-s", sandbox,
    "--output-schema", opts.schemaPath,
    "-o", opts.lastPath,
  ];
  if (opts.model) args.push("-m", opts.model);
  if (opts.reasoningEffort) args.push("-c", `model_reasoning_effort="${opts.reasoningEffort}"`);
  args.push("-");
  return args;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Строгая JSON Schema для structured outputs: у каждого объекта все свойства в `required`,
 * `additionalProperties: false`; необязательные свойства допускают `null` (`anyOf`).
 * Ответ потом проходит `dropNulls` и ту же Zod-схему.
 */
export function toStrictSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStrictSchema);
  if (!isObj(schema)) return schema;
  const out: Json = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "properties" && isObj(v)) out[k] = Object.fromEntries(Object.entries(v).map(([p, s]) => [p, toStrictSchema(s)]));
    else if (k === "$schema") continue;
    else out[k] = toStrictSchema(v);
  }
  if (isObj(out.properties)) {
    const req = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    const props = out.properties as Json;
    for (const p of Object.keys(props)) if (!req.has(p)) props[p] = { anyOf: [props[p], { type: "null" }] };
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  return out;
}

/** Удаляет ключи объектов со значением `null` (так строгая схема передаёт «поле не задано»). */
export function dropNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dropNulls);
  if (!isObj(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, dropNulls(x)]));
}

export interface ParsedCodexOutput<O> {
  status: "completed" | "failed";
  output?: O;
  error?: { kind: AgentErrorKind; message: string };
  usage: AgentUsage;
  sessionId?: string;
  /** Итогового сообщения нет (ни `-o`, ни `agent_message` в JSONL). */
  noResult: boolean;
}

/**
 * Разбор `codex exec --json`: JSONL-события в stdout и последнее сообщение агента (`-o`).
 * Usage — из `turn.completed`; стоимость 0 (подписка Codex), модель — `codex:<model>`.
 */
export function parseCodexOutput<O>(stdout: string, lastMessage: string | undefined, schema: ZodType<O>, model: string): ParsedCodexOutput<O> {
  const usage: AgentUsage = { ...EMPTY_USAGE, model: `${CODEX_MODEL_PREFIX}${model || "default"}` };
  let sessionId: string | undefined;
  let lastAgentText: string | undefined;
  let failure: string | undefined;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let e: Json;
    try {
      const v = JSON.parse(t) as unknown;
      if (!isObj(v)) continue;
      e = v;
    } catch {
      continue;
    }
    if (e.type === "thread.started" && typeof e.thread_id === "string") sessionId = e.thread_id;
    else if (e.type === "turn.completed" && isObj(e.usage)) {
      const u = e.usage;
      const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
      usage.inputTokens += n(u.input_tokens);
      usage.outputTokens += n(u.output_tokens);
    } else if (e.type === "turn.failed") failure = isObj(e.error) && typeof e.error.message === "string" ? e.error.message : "turn.failed";
    else if (e.type === "error" && typeof e.message === "string" && !e.message.startsWith("Reconnecting")) failure = e.message;
    else if (e.type === "item.completed" && isObj(e.item) && e.item.type === "agent_message" && typeof e.item.text === "string") lastAgentText = e.item.text;
  }
  const base = { usage, ...(sessionId ? { sessionId } : {}) };
  const text = (lastMessage ?? "").trim() || lastAgentText?.trim();
  if (!text) return { ...base, status: "failed", error: { kind: "cli", message: failure ?? "нет итогового сообщения Codex" }, noResult: true };
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, ""));
  } catch {
    return { ...base, status: "failed", error: { kind: "schema", message: `ответ Codex — не JSON: ${clip(text)}` }, noResult: false };
  }
  let r = schema.safeParse(json);
  if (!r.success) r = schema.safeParse(dropNulls(json));
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    return { ...base, status: "failed", error: { kind: "schema", message: `ответ Codex не прошёл схему: ${issues}` }, noResult: false };
  }
  return { ...base, status: "completed", output: r.data, noResult: false };
}

export class CodexRuntime implements AgentRuntimeAdapter {
  private readonly bin: string;

  constructor(private readonly opts: CodexRuntimeOptions) {
    this.bin = opts.bin.includes("/") ? resolve(opts.bin) : opts.bin;
  }

  async capabilities(sourceEnv: NodeJS.ProcessEnv = process.env): Promise<{ available: boolean; version?: string; reason?: string }> {
    const env = childEnv(sourceEnv);
    const bin = await resolveBin(this.bin, env.PATH);
    if (!bin) return { available: false, reason: `codex не найден: ${this.bin}` };
    try {
      const { stdout } = await promisify(execFile)(bin, ["--version"], { env, timeout: 15_000 });
      return { available: true, version: stdout.trim().split(/\s+/).pop() };
    } catch (e) {
      return { available: false, reason: (e as Error).message };
    }
  }

  /** Контракт ошибок — как у `ClaudeCodeRuntime.run`. */
  async run<I, O>(task: AgentTask<I>, schema: ZodType<O>, signal: AbortSignal): Promise<AgentResult<O>> {
    const startedAt = new Date().toISOString();
    const model = this.opts.model ?? "";
    let stdoutPath = "";
    let stderrPath = "";
    const emptyUsage = (): AgentUsage => ({ ...EMPTY_USAGE, model: `${CODEX_MODEL_PREFIX}${model || "default"}` });
    const done = (r: { status: AgentResult<O>["status"]; output?: O; error?: AgentResult<O>["error"]; usage?: AgentUsage; sessionId?: string }): AgentResult<O> => ({
      status: r.status,
      output: r.output,
      error: r.error,
      usage: r.usage ?? emptyUsage(),
      permissionDenials: [],
      sessionId: r.sessionId,
      stdoutPath,
      stderrPath,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    const stop = (status: AgentResult<O>["status"], kind: AgentErrorKind, message: string, from?: ParsedCodexOutput<O>) =>
      done({ status, error: { kind, message }, usage: from?.usage, sessionId: from?.sessionId });

    let rel: string;
    try {
      assertRunRef(task.run);
      rel = logRel(task.run.root, this.opts.logRoot);
    } catch (e) {
      return stop("failed", "cli", (e as Error).message);
    }
    const dir = await allocLogDir(task, rel, CLAIMED_LOG_DIRS);
    stdoutPath = join(dir, "stdout.jsonl");
    stderrPath = join(dir, "stderr.log");
    const schemaPath = join(dir, "schema.json");
    const lastPath = join(dir, "last-message.json");

    const bin = await resolveBin(this.bin, childEnv(process.env).PATH);
    if (!bin) return stop("failed", "cli", `codex не найден: ${this.bin}`);
    let args: string[];
    let system: string;
    try {
      args = buildCodexArgs(task, { schemaPath, lastPath, ...(this.opts.model ? { model: this.opts.model } : {}), ...(this.opts.reasoningEffort ? { reasoningEffort: this.opts.reasoningEffort } : {}) });
      system = this.opts.promptLoader ? this.opts.promptLoader(task.role) : loadPrompt(task.role);
    } catch (e) {
      return stop("failed", "cli", (e as Error).message);
    }

    const data = typeof task.input === "string" ? task.input : "````json\n" + JSON.stringify(task.input, null, 2) + "\n````\n";
    const tools = task.tools.length === 0
      ? "Файлы не создавай и не меняй: ответ — только итоговый JSON."
      : `Работай только в текущем каталоге. Разрешено: ${task.tools.join(", ")}${task.tools.some((t) => WRITE_TOOLS.has(t)) ? " (создавать и править файлы в текущем каталоге)" : " (только чтение)"}. Сеть недоступна.`;
    const prompt = [system, "", "---", "", tools, "Итоговое сообщение — один JSON-объект по заданной схеме, без пояснений.", "", "---", "", data].join("\n");
    await storageWrite(join(dir, "prompt.md"), prompt);
    await storageWrite(schemaPath, JSON.stringify(toStrictSchema(toJsonSchema(schema as unknown as ZodTypeAny)), null, 2));
    if (signal.aborted) return stop("cancelled", "cancelled", "отменено до запуска");

    const tmpRoot = await safeMkdir(task.run.root, "run/tmp");
    let runTmp: string;
    try {
      runTmp = await mkdtemp(join(tmpRoot, `${task.run.runId}-a${task.run.attempt}-${task.role}-`));
    } catch (e) {
      throw new StorageError("not_writable", `${tmpRoot}: ${(e as Error).message}`);
    }
    const env = childEnv(process.env, runTmp);

    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, task.limits.timeoutMs);
    const onAbort = () => ctrl.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    let res: Awaited<ReturnType<typeof spawnTracked>> | undefined;
    try {
      res = await (this.opts.spawn ?? spawnTracked)(task.run.root, task.run, bin, args, {
        cwd: task.workdir,
        env,
        signal: ctrl.signal,
        stdin: prompt,
        registry: task.run.registry,
      });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (res === undefined || res.orphaned) await rename(runTmp, `${runTmp}.quarantined`).catch(() => undefined);
      else await rm(runTmp, { recursive: true, force: true }).catch(() => undefined);
    }
    await storageWrite(stdoutPath, res.stdout);
    await storageWrite(stderrPath, redact(res.stderr));
    const last = await readFile(lastPath, "utf8").catch(() => undefined);

    const parsed = parseCodexOutput(res.stdout, last, schema, model);
    if (res.orphaned) return stop("failed", "orphaned", "группа процессов codex не завершилась; запись осталась в run/processes", parsed);
    if (timedOut) return stop("timeout", "timeout", `таймаут ${task.limits.timeoutMs} мс`, parsed);
    if (signal.aborted) return stop("cancelled", "cancelled", "отменено", parsed);
    if (parsed.status === "completed" && res.code !== 0) return stop("failed", "cli", `codex завершился с кодом ${res.code}: ${clip(res.stderr)}`, parsed);
    if (parsed.noResult) {
      const why = `код ${res.code ?? res.signal}; stderr: ${clip(res.stderr) || "<пусто>"}`;
      return stop("failed", "cli", `${parsed.error?.message}; ${why}`, parsed);
    }
    return done(parsed);
  }
}
