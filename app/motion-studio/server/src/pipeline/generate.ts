// Пайплайн Motion Playground (04-agent-workflows.md §2): запрос → KB → Motion Director →
// draft + refs/ → Engineer → static check → typecheck → рендер → probe gate → публикация.
// Ошибки static/typecheck/render/probe уходят Engineer на исправление (не больше
// `scene.maxAutoFixes`), затем версия публикуется `failed` с логами.
//
// Хранилище: проверка перед стартом, перед каждым вызовом агента и рендером, перед
// публикацией; во время дочерних процессов — сторож `watchStorage`. Сбой хранилища —
// `storage`, без публикации; draft в карантин, если процесс не завершился подтверждённо.
import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ComponentSelection,
  type DirectorOutput,
  DirectorOutputSchema,
  type EngineerReport,
  EngineerReportSchema,
  type KnowledgeRef,
  type MotionSpec,
  type Settings,
  type VersionManifest,
} from "@ms/contracts";
import { StorageError, type StorageStatus, safeMkdir, watchStorage } from "@ms/core";
import { MOTION_KIT_DIR, probeGate, type renderVersion } from "@ms/render";
import type { AgentResult, AgentRuntimeAdapter, AgentTask, Role } from "../agents/runtime.js";
import type { AppConfig } from "../config.js";
import { sha256File } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import type { checkSceneDir } from "../scenes/static-check.js";
import { type Draft, createDraft, publishVersion, quarantineDraft, writeBrief } from "../scenes/store.js";
import type { typecheckVersion } from "../scenes/typecheck.js";
import { canSpend } from "./budget.js";
import {
  type KnowledgeSource,
  SKILLS_REL,
  candidateBrief,
  knowledgeRefs,
  prepareRefs,
  searchCandidates,
  topPatterns,
} from "./refs.js";
import { renderEnv } from "./render-env.js";

export type FailureStage =
  | "storage"
  | "director"
  | "engineer"
  | "static"
  | "typecheck"
  | "render"
  | "probe"
  | "budget"
  /** Процесс агента или рендера не исчез (ADR 0007, stale_process): draft в карантине. */
  | "orphaned"
  /** Отмена вызывающим (Ctrl-C в CLI). */
  | "cancelled";

export interface GenerateDeps {
  storage: () => Promise<StorageStatus>;
  kb: KnowledgeSource;
  agents: AgentRuntimeAdapter;
  render: typeof renderVersion;
  /** Static check каталога версии; идёт до typecheck и рендера (rulings п. 16). */
  check: typeof checkSceneDir;
  typecheck: typeof typecheckVersion;
  config: AppConfig;
  /** Период сторожа хранилища, мс (10 000). */
  watchIntervalMs?: number;
  /** Каталог official skills (`<kb.sourceRoot>/official_skills/skills/skills`). */
  skillsRoot?: string;
  /** Строки прогресса (CLI печатает в stderr). */
  log?: (line: string) => void;
}

export interface GenerateResult {
  status: "ready" | "failed";
  runId: string;
  sceneId?: string;
  /** Есть, если создан draft: опубликованная версия или draft (при `storage`/`orphaned`). */
  versionDir?: string;
  previewPath?: string;
  costUsd: number;
  engineerCalls: number;
  failure?: { stage: FailureStage; message: string };
  /** Предупреждения (отказы прав Engineer, неизвестные kb_id, ошибки консоли браузера). */
  warnings: string[];
  /** Длительность этапов, мс. */
  timings: Record<string, number>;
}

const PREVIEW = { scale: 0.5, crf: 23 };
const RENDER_TIMEOUT_MS = 5 * 60_000;
const WATCH_MS = 10_000;
const ENGINEER_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"] as const;
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const MAX_QA_FRAMES = 6;
const MAX_ISSUE_CHARS = 6000;

type Issue = { stage: "engineer" | "static" | "typecheck" | "render" | "probe"; message: string };

/**
 * Кадры QA (06-motion-engine.md §6): первый кадр после входа (конец первого бита),
 * середины остальных битов, последний кадр. Уникальные, по возрастанию, внутри сцены, не больше 6
 * (последний кадр сохраняется всегда).
 */
export function qaFrames(spec: MotionSpec, durationFrames: number): number[] {
  const last = durationFrames - 1;
  const clamp = (f: number) => Math.max(0, Math.min(last, Math.round(f)));
  const beats = [...spec.beats].sort((a, b) => a.start_frame - b.start_frame);
  const out = new Set<number>();
  if (beats[0]) out.add(clamp(beats[0].end_frame));
  // середина первого бита — ещё вход, её заменяет кадр после входа
  for (const b of beats.slice(1)) out.add(clamp((b.start_frame + b.end_frame) / 2));
  const sorted = [...out].filter((f) => f !== last).sort((a, b) => a - b);
  // прореживаем равномерно, если битов много
  const keep = MAX_QA_FRAMES - 1;
  const picked = sorted.length <= keep ? sorted : Array.from({ length: keep }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (keep - 1))]!);
  return [...new Set([...picked, last])].sort((a, b) => a - b);
}

const PROMPTS_DIR = fileURLToPath(new URL("../../../prompts/", import.meta.url));
/** Каталог системных промптов ролей (`prompts/<role>.md`). */
export const DEFAULT_PROMPTS_DIR = PROMPTS_DIR;

function clip(s: string, n = MAX_ISSUE_CHARS): string {
  return s.length > n ? `${s.slice(0, n)}\n…(обрезано)` : s;
}

function isStorageError(e: unknown): boolean {
  return e instanceof StorageError || (e instanceof Error && /^storage(_unavailable)?:/.test(e.message));
}

function json(v: unknown): string {
  return "```json\n" + JSON.stringify(v, null, 2) + "\n```";
}

/** Отказ касается записи внутри draft (Write/Edit по пути в workdir) — rulings п. 14. */
function deniedWriteInside(denial: unknown, workdir: string): boolean {
  const d = denial as { tool_name?: unknown; tool_input?: { file_path?: unknown; path?: unknown } } | null;
  if (!d || typeof d.tool_name !== "string" || !EDIT_TOOLS.has(d.tool_name)) return false;
  const p = d.tool_input?.file_path ?? d.tool_input?.path;
  if (typeof p !== "string") return true; // запись без пути — считаем отказом внутри
  const abs = resolve(workdir, p);
  return abs === resolve(workdir) || abs.startsWith(resolve(workdir) + sep);
}

/** Пути `files_written`, которых нет внутри draft (или они вне его). */
function missingWritten(report: EngineerReport, workdir: string): string[] {
  const root = resolve(workdir);
  return report.files_written.filter((p) => {
    const abs = resolve(root, p);
    if (!(abs === root || abs.startsWith(root + sep))) return true;
    return !existsSync(abs);
  });
}

function describeDenial(d: unknown): string {
  const x = d as { tool_name?: unknown; tool_input?: Record<string, unknown> } | null;
  const target = x?.tool_input ? (x.tool_input.file_path ?? x.tool_input.path ?? x.tool_input.pattern ?? "") : "";
  return `${String(x?.tool_name ?? "?")} ${String(target)}`.trim();
}

async function listFiles(dir: string, rel = ""): Promise<string[]> {
  if (!existsSync(join(dir, rel))) return [];
  const out: string[] = [];
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, r)));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

export async function generateScene(prompt: string, settings: Settings, deps: GenerateDeps, signal?: AbortSignal): Promise<GenerateResult> {
  const t0 = Date.now();
  const runId = newId("run");
  const attempt = 1;
  const { config } = deps;
  const log = deps.log ?? (() => undefined);
  const warnings: string[] = [];
  const timings: Record<string, number> = {};
  const history: { at: string; stage: string; message: string }[] = [];
  const agentRuns: string[] = [];
  let spent = 0;
  let engineerCalls = 0;
  const sceneId = newId("scn");
  let draft: Draft | undefined;
  let root = "";

  const result = (status: GenerateResult["status"], extra: Partial<GenerateResult> = {}): GenerateResult => {
    timings.total = Date.now() - t0;
    return { status, runId, sceneId, versionDir: draft?.dir, costUsd: spent, engineerCalls, warnings, timings, ...extra };
  };
  const failed = (stage: FailureStage, message: string, extra: Partial<GenerateResult> = {}) => {
    log(`✗ ${stage}: ${message}`);
    return result("failed", { failure: { stage, message }, ...extra });
  };
  const quarantine = async (reason: string) => {
    if (!draft) return;
    await quarantineDraft(draft, reason).catch((e: unknown) => warnings.push(`карантин draft не записан: ${(e as Error).message}`));
  };
  const timed = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const s = Date.now();
    try {
      return await fn();
    } finally {
      timings[key] = (timings[key] ?? 0) + Date.now() - s;
    }
  };
  /** Проверка хранилища; не в порядке — строка причины. */
  const storageProblem = async (): Promise<string | undefined> => {
    let st: StorageStatus;
    try {
      st = await deps.storage();
    } catch (e) {
      return `проверка хранилища упала: ${(e as Error).message}`;
    }
    return st.ok ? undefined : `${st.reason}: ${st.detail}`;
  };
  const lostOf = (w: ReturnType<typeof watchStorage>): string | undefined => {
    const f = w.lastFailure();
    return f && !f.ok ? `${f.reason}: ${f.detail}` : undefined;
  };
  /**
   * Вызов под сторожем хранилища: сигнал прерывается при сбое хранилища или отмене.
   * `lost` — сбой, замеченный сторожем; `error` — отказ самого вызова.
   */
  const underWatch = async <T>(fn: (sig: AbortSignal) => Promise<T>): Promise<{ value?: T; error?: unknown; lost?: string }> => {
    const w = watchStorage(deps.storage, deps.watchIntervalMs ?? WATCH_MS);
    const sig = signal ? AbortSignal.any([w.signal, signal]) : w.signal;
    try {
      const value = await fn(sig);
      return { value, lost: lostOf(w) };
    } catch (e) {
      return { error: e, lost: lostOf(w) };
    } finally {
      w.stop();
    }
  };
  const recordRun = (r: AgentResult<unknown>) => {
    spent += r.usage.costUsd;
    if (r.stdoutPath && root) {
      const rel = relative(root, dirname(r.stdoutPath));
      if (rel && !rel.startsWith("..") && !isAbsolute(rel)) agentRuns.push(rel.split(sep).join("/"));
    }
  };
  const task = <I>(role: Role, input: I, workdir: string, tools: AgentTask<I>["tools"], seq: number): AgentTask<I> => ({
    role,
    input,
    inputRefs: [],
    workdir,
    tools,
    model: config.agents[role].model,
    limits: { timeoutMs: config.agents[role].timeoutMs, maxBudgetUsd: config.agents[role].maxBudgetUsd },
    idempotencyKey: `${runId}-a${attempt}-${role}-${seq}`,
    run: { root, runId, attempt },
  });

  // --- 1. Хранилище до любой записи ---
  let status: StorageStatus;
  try {
    status = await deps.storage();
  } catch (e) {
    return failed("storage", `проверка хранилища упала: ${(e as Error).message}`);
  }
  if (!status.ok) return failed("storage", `${status.reason}: ${status.detail}`);
  root = status.root;

  try {
    await writeBrief(root, sceneId, { prompt, settings, created_at: new Date().toISOString() });
  } catch (e) {
    if (isStorageError(e)) return failed("storage", (e as Error).message);
    throw e;
  }

  // --- 2. KB и Motion Director ---
  const cands = searchCandidates(deps.kb, prompt, 12);
  const patterns = topPatterns(cands, 2);
  const patternTexts: string[] = [];
  for (const p of patterns) {
    try {
      patternTexts.push(await deps.kb.getVisualPatterns(p));
    } catch (e) {
      warnings.push(`паттерн ${p} не прочитан: ${(e as Error).message}`);
    }
  }
  const apiMd = await readFile(join(MOTION_KIT_DIR, "API.md"), "utf8");
  log(`KB: ${cands.length} кандидатов, паттерны: ${patterns.join(", ") || "—"}`);

  if (!canSpend(spent, config)) return failed("budget", `бюджет сцены исчерпан до Motion Director: $${spent.toFixed(2)} из $${config.scene.maxCostUsd}`);
  const problem = await storageProblem();
  if (problem) return failed("storage", problem);

  let directorDir: string;
  try {
    directorDir = await safeMkdir(root, `run/agent-cwd/${runId}-a${attempt}-director`);
  } catch (e) {
    if (isStorageError(e)) return failed("storage", (e as Error).message);
    throw e;
  }
  const directorInput = directorPrompt(prompt, settings, cands.map(candidateBrief), patternTexts, apiMd);
  log("Motion Director…");
  const d = await timed("director", () => underWatch((sig) => deps.agents.run(task("motion_director", directorInput, directorDir, [], 1), DirectorOutputSchema, sig)));
  await rm(directorDir, { recursive: true, force: true }).catch(() => undefined);
  if (d.error !== undefined) return failed("storage", `вызов Motion Director отклонён: ${(d.error as Error)?.message ?? String(d.error)}`);
  const dr = d.value!;
  recordRun(dr);
  if (d.lost) return failed("storage", `хранилище пропало во время Motion Director: ${d.lost}`);
  if (dr.error?.kind === "orphaned") return failed("orphaned", `Motion Director: ${dr.error.message}`);
  if (signal?.aborted) return failed("cancelled", "отменено во время Motion Director");
  if (dr.status !== "completed" || !dr.output) {
    return failed("director", `Motion Director: ${dr.status}${dr.error ? ` (${dr.error.kind}): ${dr.error.message}` : ""}`);
  }
  const director: DirectorOutput = dr.output;
  const spec = director.spec;
  if (spec.duration_frames !== settings.duration_frames) {
    return failed("director", `spec.duration_frames ${spec.duration_frames} ≠ настройкам ${settings.duration_frames}`);
  }
  if (spec.fps.num * settings.fps.den !== settings.fps.num * spec.fps.den) {
    return failed("director", `spec.fps ${spec.fps.num}/${spec.fps.den} ≠ настройкам ${settings.fps.num}/${settings.fps.den}`);
  }
  if (spec.style_preset !== settings.style_preset) {
    warnings.push(`Director выбрал пресет ${spec.style_preset}, в настройках ${settings.style_preset}: оставлен пресет настроек`);
    spec.style_preset = settings.style_preset;
  }
  const { refs, unknown } = knowledgeRefs(director.selection, deps.kb);
  if (unknown.length > 0) warnings.push(`Director выбрал неизвестные kb_id (пропущены): ${unknown.join(", ")}`);
  if (refs.length === 0) warnings.push("knowledge-refs пуст: Director не выбрал ни одной записи KB");
  const selection: ComponentSelection = { items: director.selection.items.filter((i) => refs.some((r) => r.kb_id === i.kb_id)) };
  log(`Director: «${spec.title}», ${spec.beats.length} битов, KB: ${refs.map((r) => `${r.kb_id} (${r.strategy})`).join(", ") || "—"}`);

  // --- 3. Draft и refs/ ---
  try {
    draft = await createDraft(root, { runId, attempt, sceneId });
    await writeFile(join(draft.dir, "spec.json"), JSON.stringify(spec, null, 2) + "\n");
    await writeFile(join(draft.dir, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
    await writeFile(join(draft.dir, "selection.json"), JSON.stringify({ ...director.selection, rationale: director.rationale }, null, 2) + "\n");
    await writeFile(join(draft.dir, "knowledge-refs.json"), JSON.stringify(refs satisfies KnowledgeRef[], null, 2) + "\n");
    await prepareRefs(draft.dir, selection, deps.kb, deps.skillsRoot ?? join(config.kb.sourceRoot, SKILLS_REL));
  } catch (e) {
    if (isStorageError(e) || (await storageProblem())) return failed("storage", (e as Error).message);
    return failed("engineer", `подготовка draft/refs не удалась: ${(e as Error).message}`);
  }
  const draftDir = draft.dir;
  const frames = qaFrames(spec, settings.duration_frames);
  let cacheDir: string;
  try {
    cacheDir = await safeMkdir(root, "cache");
  } catch (e) {
    if (isStorageError(e)) return failed("storage", (e as Error).message);
    throw e;
  }

  // --- Публикация ---
  const publish = async (
    outcome: { status: "ready"; previewSha: string; framesSha: string[] } | { status: "failed"; stage: FailureStage; message: string },
  ): Promise<GenerateResult> => {
    const previewFile = join(draftDir, "preview.mp4");
    if (warnings.length > 0 || deniedLog.length > 0) {
      await writeFile(join(draftDir, "warnings.json"), JSON.stringify({ warnings, permission_denials: deniedLog }, null, 2) + "\n");
    }
    await writeFile(join(draftDir, "pipeline-log.json"), JSON.stringify({ run_id: runId, cost_usd: spent, engineer_calls: engineerCalls, timings, history }, null, 2) + "\n");
    const changed = [...(await listFiles(draftDir, "src")), ...(existsSync(join(draftDir, "props.json")) ? ["props.json"] : [])];
    const preview =
      outcome.status === "ready"
        ? { path: "preview.mp4", sha256: outcome.previewSha }
        : existsSync(previewFile)
          ? { path: "preview.mp4", sha256: await sha256File(previewFile) }
          : null;
    const meta = {
      schema_version: 1 as const,
      scene_id: sceneId,
      parent_version_id: null,
      prompt,
      edit_plan: null,
      settings,
      changed_files: changed,
      render_env: await renderEnv(),
      knowledge_refs: refs.map((r) => ({ kb_id: r.kb_id, commit: r.commit, license: r.license, strategy: r.strategy })),
      agent_runs: agentRuns,
      qa: outcome.status === "ready" ? ({ technical: "pass", visual: "warn", semantic: "warn", style: "warn" } as const) : null,
      preview,
      status: outcome.status,
      ...(outcome.status === "failed" ? { failure: { stage: outcome.stage, message: outcome.message } } : {}),
      qa_frames: outcome.status === "ready" ? frames : [],
      qa_frames_sha256: outcome.status === "ready" ? outcome.framesSha : [],
    } satisfies Omit<VersionManifest, "files" | "version_id" | "number" | "created_at">;
    let published: Awaited<ReturnType<typeof publishVersion>>;
    try {
      published = await timed("publish", () => publishVersion(draft!, meta, deps.storage));
    } catch (e) {
      if (isStorageError(e) || (await storageProblem())) return failed("storage", `публикация не удалась: ${(e as Error).message}`);
      throw e;
    }
    warnings.push(...published.warnings);
    const extra = { versionDir: published.dir, previewPath: preview ? join(published.dir, "preview.mp4") : undefined };
    if (outcome.status === "ready") {
      log(`✓ ready: ${published.dir}`);
      return result("ready", extra);
    }
    return failed(outcome.stage, outcome.message, extra);
  };

  // --- 4. Engineer + технический gate с автоисправлениями ---
  const deniedLog: unknown[] = [];
  const maxCalls = 1 + config.scene.maxAutoFixes;
  let issue: Issue | undefined;
  for (let call = 1; call <= maxCalls; call++) {
    if (!canSpend(spent, config)) {
      const why = issue ? `; последняя ошибка (${issue.stage}): ${clip(issue.message, 1000)}` : "";
      return publish({ status: "failed", stage: "budget", message: `бюджет сцены исчерпан: $${spent.toFixed(2)} из $${config.scene.maxCostUsd}${why}` });
    }
    const p = await storageProblem();
    if (p) return failed("storage", p);
    if (signal?.aborted) return failed("cancelled", "отменено");

    engineerCalls++;
    const input = engineerPrompt({ prompt, settings, spec, selection, refs, call, maxCalls, issue });
    log(call === 1 ? "Engineer…" : `Engineer: исправление ${call - 1} из ${maxCalls - 1} (${issue?.stage})…`);
    const e = await timed(`engineer_${call}`, () =>
      underWatch((sig) => deps.agents.run(task("engineer", input, draftDir, [...ENGINEER_TOOLS], call), EngineerReportSchema, sig)),
    );
    if (e.error !== undefined) {
      // процесс агента мог остаться: подтверждения его смерти нет
      await quarantine(`agents.run отклонён: ${(e.error as Error)?.message ?? String(e.error)}`);
      return failed("storage", `вызов Engineer отклонён: ${(e.error as Error)?.message ?? String(e.error)}`);
    }
    const er = e.value!;
    recordRun(er);
    if (er.error?.kind === "orphaned") {
      await quarantine(`Engineer orphaned: ${er.error.message}`);
      return failed("orphaned", `Engineer: ${er.error.message}`);
    }
    if (e.lost) return failed("storage", `хранилище пропало во время Engineer: ${e.lost}`);
    if (signal?.aborted) return failed("cancelled", "отменено во время Engineer");

    if (er.permissionDenials.length > 0) {
      deniedLog.push(...er.permissionDenials);
      const w = `Engineer: отказано в доступе (${er.permissionDenials.length}): ${er.permissionDenials.map(describeDenial).join("; ")}`;
      warnings.push(w);
      log(`⚠ ${w}`);
      const inside = er.permissionDenials.filter((x) => deniedWriteInside(x, draftDir));
      if (inside.length > 0) {
        return publish({ status: "failed", stage: "engineer", message: `denied: запись внутри draft отклонена: ${inside.map(describeDenial).join("; ")}` });
      }
    }
    if (er.status !== "completed" || !er.output) {
      issue = { stage: "engineer", message: `вызов Engineer завершился ${er.status}${er.error ? ` (${er.error.kind}): ${er.error.message}` : ""}` };
      history.push({ at: new Date().toISOString(), ...issue });
      continue;
    }
    const missing = missingWritten(er.output, draftDir);
    if (missing.length > 0) {
      return publish({ status: "failed", stage: "engineer", message: `denied: files_written ссылается на несуществующие файлы: ${missing.join(", ")}` });
    }

    // static check — до typecheck и бандла (rulings п. 16)
    const violations = await timed("static", () => deps.check(draftDir));
    if (violations.length > 0) {
      issue = { stage: "static", message: violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`).join("\n") };
      history.push({ at: new Date().toISOString(), ...issue });
      log(`static check: ${violations.length} нарушений`);
      continue;
    }
    const typeErrors = await timed("typecheck", () => deps.typecheck(draftDir));
    if (typeErrors.length > 0) {
      issue = { stage: "typecheck", message: typeErrors.map((t) => `${t.file}:${t.line} ${t.message}`).join("\n") };
      history.push({ at: new Date().toISOString(), ...issue });
      log(`typecheck: ${typeErrors.length} ошибок`);
      continue;
    }

    const rp = await storageProblem();
    if (rp) return failed("storage", rp);
    log(`рендер: кадры ${frames.join(", ")} + превью…`);
    const req = { versionDir: draftDir, settings, cacheDir, stills: frames, preview: PREVIEW, timeoutMs: RENDER_TIMEOUT_MS, run: { root, runId, attempt } };
    const r = await timed(`render_${call}`, () => underWatch((sig) => deps.render(req, sig)));
    if (r.error !== undefined) {
      await quarantine(`рендер отклонён: ${(r.error as Error)?.message ?? String(r.error)}`);
      if (isStorageError(r.error) || r.lost || (await storageProblem())) {
        return failed("storage", `рендер: ${(r.error as Error)?.message ?? String(r.error)}`);
      }
      return failed("render", `рендер невозможен: ${(r.error as Error)?.message ?? String(r.error)}`);
    }
    const rr = r.value!;
    if (rr.error?.stage === "orphaned") {
      await quarantine(`рендер orphaned: ${rr.error.message}`);
      return failed("orphaned", `рендер: ${rr.error.message}`);
    }
    if (r.lost) return failed("storage", `хранилище пропало во время рендера: ${r.lost}`);
    if (signal?.aborted) return failed("cancelled", "отменено во время рендера");
    const consoleErrors = rr.browserLogs.filter((l) => l.startsWith("[error]"));
    if (!rr.ok || !rr.probe || !rr.previewPath) {
      const err = rr.error ?? { stage: "media", message: "рендер не вернул превью" };
      const logs = consoleErrors.length > 0 ? `\nконсоль браузера:\n${consoleErrors.slice(-20).join("\n")}` : "";
      issue = { stage: "render", message: `${err.stage}: ${err.message}${logs}` };
      history.push({ at: new Date().toISOString(), ...issue });
      log(`рендер: ${err.stage}`);
      continue;
    }
    const gate = probeGate(rr.probe, settings, PREVIEW.scale);
    if (gate.length > 0) {
      issue = { stage: "probe", message: `превью не прошло проверку ffprobe: ${gate.join("; ")}` };
      history.push({ at: new Date().toISOString(), ...issue });
      continue;
    }
    if (consoleErrors.length > 0) warnings.push(`консоль браузера: ${consoleErrors.slice(0, 5).join(" | ")}`);
    const framesSha: string[] = [];
    for (const s of rr.stills) framesSha.push(await sha256File(s));
    const previewSha = await sha256File(rr.previewPath);
    history.push({ at: new Date().toISOString(), stage: "ready", message: `технический gate пройден с вызова ${call}` });
    return publish({ status: "ready", previewSha, framesSha });
  }
  return publish({ status: "failed", stage: issue!.stage, message: clip(issue!.message, 4000) });
}

// --- Промпты задач (системные промпты ролей — prompts/<role>.md) ---

export function directorPrompt(
  prompt: string,
  settings: Settings,
  candidates: ReturnType<typeof candidateBrief>[],
  patternTexts: string[],
  apiMd: string,
): string {
  return [
    "# Запрос пользователя",
    prompt,
    "",
    "# Настройки сцены (обязательны для spec)",
    json({
      width: settings.width,
      height: settings.height,
      aspect_ratio: settings.aspect_ratio,
      fps: settings.fps,
      duration_frames: settings.duration_frames,
      style_preset: settings.style_preset,
      animation_intensity: settings.animation_intensity,
      safe_area: settings.safe_area,
    }),
    `spec.duration_frames = ${settings.duration_frames}, spec.fps = ${JSON.stringify(settings.fps)}, spec.style_preset = "${settings.style_preset}" — ровно так.`,
    "",
    "# Кандидаты из Knowledge Base",
    "Выбирай kb_id только из этого списка (selection.items, 1–3 записи).",
    json(candidates),
    "",
    "# Паттерны визуализации",
    patternTexts.length > 0 ? patternTexts.join("\n\n---\n\n") : "(нет)",
    "",
    "# API motion-kit (что получит Engineer)",
    apiMd,
  ].join("\n");
}

export function engineerPrompt(o: {
  prompt: string;
  settings: Settings;
  spec: MotionSpec;
  selection: ComponentSelection;
  refs: KnowledgeRef[];
  call: number;
  maxCalls: number;
  issue?: Issue;
}): string {
  const parts: string[] = [];
  if (o.call > 1 && o.issue) {
    parts.push(
      `# Исправление ${o.call - 1} из ${o.maxCalls - 1}`,
      `Предыдущая версия кода не прошла этап «${o.issue.stage}». Прочитай текущие файлы src/ и props.json, исправь причину и всё, что ей подобно. Не переписывай сцену с нуля без нужды и не упрощай замысел.`,
      "",
      "## Причины",
      "```",
      clip(o.issue.message),
      "```",
      "",
    );
  }
  parts.push(
    "# Задача",
    "Собери Remotion-сцену по спецификации в текущем каталоге (draft):",
    "- `src/Scene.tsx` с `export const Scene` (можно добавить модули в `src/`);",
    "- `props.json` — JSON-объект с данными сцены (может быть `{}`).",
    "Справка в каталоге: `refs/motion-kit/API.md` (прочитай первым), `refs/skills/remotion-markup/*.md`, исходники выбранных компонентов KB в `refs/kb/<id>/` (карточка — `CARD.md`).",
    "",
    "# Запрос пользователя",
    o.prompt,
    "",
    "# Настройки",
    json({ width: o.settings.width, height: o.settings.height, fps: o.settings.fps, duration_frames: o.settings.duration_frames, style_preset: o.settings.style_preset, animation_intensity: o.settings.animation_intensity, safe_area: o.settings.safe_area }),
    "",
    "# Спецификация (spec.json)",
    json(o.spec),
    "",
    "# Выбранные компоненты KB",
    json(o.selection.items.map((i) => ({ ...i, refs_dir: `refs/kb/${i.kb_id}/`, license: o.refs.find((r) => r.kb_id === i.kb_id)?.license }))),
    "",
    "В ответе: files_written — пути относительно текущего каталога, kit_components_used, kb_ids_used, notes (кратко: что и как сделано).",
  );
  return parts.join("\n");
}
