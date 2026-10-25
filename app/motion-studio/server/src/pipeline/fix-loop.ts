// Цикл Engineer → технический gate → рендер → QA (04 §2). Один счётчик исправлений
// `scene.maxAutoFixes` на технический gate и QA. Технический gate: граница draft, отказы
// прав, static check (до typecheck, R16), typecheck, provenance, контракт props (H4),
// рендер кадров QA и превью, probe gate. QA по реальным кадрам (Task 16): программные
// проверки, проверки spec, Visual QA; исправление вызывают только blocking-замечания,
// warnings идут Engineer подсказками вместе с ними, но цикл не запускают.
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, readdir, readlink, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import {
  type EngineerReport,
  EngineerReportSchema,
  type FailureStage,
  type KnowledgeRef,
  type MotionSpec,
  type QAIssue,
  type QAReport,
  QA_SCORE_AXES,
  type QaScoreAxis,
  type QaScoreNote,
  type QaScores,
  type ScenePropsBase,
  ScenePropsBaseSchema,
  type ScenePropsStyle,
  ScenePropsStyleSchema,
  type Settings,
  TECHNIQUES,
  type Technique,
  type VisualQAOutput,
} from "@ms/contracts";
import { type ReapOptions, fileProcessRegistry, reapAttempt, safeMkdir } from "@ms/core";
import { FfmpegError, type RenderRequest, type RenderResult, SWEEP_EVERY, type renderVersion, probeGate } from "@ms/render";
import { ACCENT_HOLD_GAP, programmaticChecks } from "../qa/programmatic.js";
import { ACCENT_CONFLICT_FRAMES, type LayoutFrame, accentConflictFrames, parseLayout, scriptLayoutIssues } from "../qa/layout.js";
import { acceptedAsWarn, fixHints, meaningFails, mergeQA, qaBlocks, repeatsAsWarning } from "../qa/report.js";
import { type KeyMoment, specChecks } from "../qa/spec-checks.js";
import { reconcileMissing, runVisualQA } from "../qa/visual-agent.js";
import { sha256File } from "../scenes/hash.js";
import { kitImportsInDir, kitJsxInDir } from "../scenes/kit-imports.js";
import { copyTree } from "../scenes/store.js";
import { type checkSceneDir, frameLiteralsInDir } from "../scenes/static-check.js";
import type { typecheckVersion } from "../scenes/typecheck.js";
import { provenanceGate } from "./provenance.js";
import type { KnowledgeSource } from "./refs.js";
import { isNetworkError } from "./transient.js";
import { scriptSceneIssues } from "./script-temporal.js";
import { type RunCtx, type SpeechWindow, buildEngineerTask, clip, errText, isStorageError, scenePropsStyle, sceneStyle, styleLockOf } from "./steps.js";

export const PREVIEW = { scale: 0.5, crf: 23 };
/** Масштаб временного прохода пробы (S15b): только DOM-замеры, снимков нет. */
const SWEEP_SCALE = 0.25;
/** Время рендера по умолчанию; длинные сцены — `renderTimeoutMs`. */
const RENDER_TIMEOUT_MS = 5 * 60_000;
/** Вызовов Visual QA на один рендер: первый и один повтор (ruling P5). */
const VISUAL_QA_TRIES = 2;
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

/** Причина исправления: этап и текст для Engineer. */
export interface Issue {
  stage: FailureStage;
  message: string;
}

/** Рендер для журнала задачи (`render_jobs`). */
export interface RenderRecord {
  kind: "still" | "preview";
  frames: number;
  width: number;
  height: number;
  fps: Settings["fps"];
  outputPath: string;
  ffprobe?: RenderResult["probe"];
  durationMs: number;
}

/** Вызов Visual QA: время по часам (`wallMs`, Task 16), стоимость, итог. */
export interface VisualQaRun {
  call: number;
  wall_ms: number;
  cost_usd: number;
  status: string;
  gate?: QAReport["gate"];
}

/**
 * Итог работы после создания draft. `alive` — процесс агента или рендера не завершён
 * подтверждённо (отказ вызова, orphaned): draft только в карантин.
 */
export type Exit =
  | { ok: true; previewSha: string; framesSha: string[]; qa?: QAReport; spec?: MotionSpec }
  | { ok: false; stage: FailureStage; message: string; alive?: boolean; qa?: QAReport; transient?: true };

/** Файлы пайплайна в draft: пишутся из памяти, восстанавливаются после нарушения границы. */
export interface DraftFiles {
  write(): Promise<void>;
  set(name: string, text: string): void;
  restore(before: Map<string, string>, d: ZoneDiff): Promise<void>;
}

export interface LoopDeps {
  kb: Pick<KnowledgeSource, "getCapability">;
  render: typeof renderVersion;
  check: typeof checkSceneDir;
  typecheck: typeof typecheckVersion;
  /** Опции разбора процессов дубля 2 после итога (m2; подменяются в тестах). */
  reapOptions?: Omit<ReapOptions, "registry">;
}

export interface LoopInput {
  rc: RunCtx;
  deps: LoopDeps;
  draftDir: string;
  cacheDir: string;
  settings: Settings;
  spec: MotionSpec;
  refs: KnowledgeRef[];
  frames: number[];
  files: DraftFiles;
  /**
   * Полный gate задачи: provenance, контракт props (H4) и QA по кадрам. Без него — только
   * технический gate среза (static, typecheck, рендер, probe).
   */
  qa?: { brief: unknown; allowRestricted: boolean };
  /** Spec последних версий других сцен проекта: проверка повтора подписи кадра. */
  previous?: readonly MotionSpec[];
  progress?: (p: number, stage: string) => void;
  /**
   * Каталог второго дубля (S5) со своим spec: файлы пайплайна и refs/ (generate.ts). Без
   * него второго дубля нет.
   */
  takeDir?: (spec: MotionSpec) => Promise<{ dir: string; files: DraftFiles }>;
  /**
   * Правка параметров (Task 18): первый проход первого дубля — без Engineer (код базы и
   * новый props.json уже в draft); исправления — обычным циклом.
   */
  skipFirstEngineer?: boolean;
  /** Заголовок первого вызова Engineer первого дубля (правка: что менять в копии базы). */
  brief?: string;
  /** Сверка с базой того, что правка обещала сохранить (`checkPreserve`); blocking — исправление. */
  preserveCheck?: (props: ScenePropsBase, spec: MotionSpec) => QAIssue[];
  /**
   * «Сохрани композицию» по кадру hold (`09` §4): база рендерится один раз только кадром N−1
   * (без превью, проба раскладки), её реестр сверяется `check` с реестром кадра N−1 каждой
   * попытки; blocking — исправление тем же циклом. Сбой пробы базы — предупреждение.
   */
  preserveHold?: {
    versionDir: string;
    settings: Settings;
    check: (base: LayoutFrame, next: LayoutFrame, size: { width: number; height: number }) => QAIssue[];
  };
  /** Второй дубль только `revise` (правка: новое кадрирование `fresh` сломало бы композицию базы). */
  reviseOnly?: boolean;
  /** Дополнительная проверка попытки (S6); blocking — исправление тем же циклом. */
  extraQa?: ExtraQa;
  /** Сцена сценария (S11): Engineer получает носителя финала (`finaleLine`). */
  script?: boolean;
  /**
   * Время сцены сценария (S15b): окно речи и моменты слов — проверки по всей сцене (временной
   * проход пробы и энергия превью: dead_air, empty_half, empty_open, late_hero).
   */
  scriptTiming?: { window: SpeechWindow; moments?: readonly KeyMoment[] };
  /**
   * Приём сцены сценария (S14): код без ключевого компонента приёма (`TECHNIQUES[t].kit`) —
   * исправление до рендера (`technique_not_realized`, этап static); на последнем вызове —
   * предупреждение (сцена не падает из-за вкуса).
   */
  technique?: Technique;
}

/**
 * Хук дополнительной проверки попытки (S6, сцена сценария: наложение с `transparent`).
 * Вызывается после программных проверок каждой попытки с QA, его замечания идут в отчёт
 * попытки. `renderStills` — кадры попытки с другими props (`inputProps`) в отдельный каталог
 * `run/tmp` (не `frames/` draft) под семафором рендеров; каталог убирается после хука. Сбой
 * хука — предупреждение `extra_qa_failed`, не blocking.
 */
export type ExtraQa = (v: {
  versionDir: string;
  spec: MotionSpec;
  settings: Settings;
  signal: AbortSignal;
  /** Контекст попытки для своих процессов (ffmpeg): реестр и `run/tmp`. */
  run: RenderRequest["run"];
  renderStills: (stills: number[], inputProps: Record<string, unknown>) => Promise<RenderResult>;
  /** Реестр раскладки kit QA-кадров попытки (`[motion-kit:layout]`; S10: интерфейс Shorts). */
  layout: LayoutFrame[];
  /** Контекст задачи (S15b): вызов малой модели (смысл по фрагменту) — с бюджетом и журналом задачи. */
  rc: RunCtx;
}) => Promise<QAIssue[]>;

/**
 * Попытка, прошедшая технический gate (и QA по кадрам, если он есть): снимок файлов сцены,
 * кадров и превью в `run/tmp/<runId>-a<attempt>/attempts/<n>/` и оценка Visual QA.
 */
export interface Attempt {
  /** Сквозной номер попытки в задаче (оба дубля). */
  n: number;
  take: 1 | 2;
  /** Вызов Engineer в дубле. */
  call: number;
  /** Каталог снимка относительно корня хранилища. */
  snapshot: string;
  spec: MotionSpec;
  qa?: QAReport;
  notes: QaScoreNote[];
  style?: ScenePropsStyle;
  report?: EngineerReport;
  /** Цена попытки: её вызов Engineer и её Visual QA (без трат параллельного дубля). */
  costUsd: number;
  blocking: boolean;
}

/** Попытка в журнале (pipeline-log.json, GenerateResult). */
export interface AttemptRecord {
  n: number;
  take: 1 | 2;
  call: number;
  overall?: number;
  scores?: QaScores;
  /** Коды blocking-замечаний попытки (до публикации с warn). */
  blocking: string[];
  cost_usd: number;
  published: boolean;
}

/** Итоги цикла для журнала и публикации. */
export interface LoopState {
  engineerCalls: number;
  renders: RenderRecord[];
  visualQa: VisualQaRun[];
  report?: EngineerReport;
  /** `props.style` после нормализации (для style.json). */
  style?: ScenePropsStyle;
  deniedLog: unknown[];
  /** Попытки с оценкой (S5). */
  attempts?: AttemptRecord[];
}

/** Кадры только для программных проверок, если их нет среди QA-кадров: N−20 (акцент жив, застывшая схема; N−1 там всегда), 0 и 4 (кадр-постер). */
function accentExtra(durationFrames: number, frames: number[]): number[] {
  // N−20 — «акцент жив» и застывшая схема; 0 и 4 — кадр-постер (frame0_coverage)
  return [durationFrames - ACCENT_HOLD_GAP, ...POSTER_FRAMES].filter((f, i, all) => f >= 0 && f < durationFrames && !frames.includes(f) && all.indexOf(f) === i);
}

/** Кадры-постер для frame0_coverage. */
const POSTER_FRAMES = [0, 4];

/** Зона Engineer в draft: `src/**` и `props.json`. Всё остальное — файлы пайплайна. */
function engineerZone(rel: string): boolean {
  return rel === "src" || rel.startsWith("src/") || rel === "props.json";
}

/** Снимок draft вне зоны Engineer: путь → `dir` | `file:<sha256>` | `link:<цель>` | `special`. */
export async function snapshotOutsideZone(dir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (rel: string): Promise<void> => {
    const entries = await readdir(rel ? join(dir, rel) : dir, { withFileTypes: true });
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (engineerZone(r)) continue;
      const abs = join(dir, r);
      if (e.isSymbolicLink()) out.set(r, `link:${await readlink(abs)}`);
      else if (e.isDirectory()) {
        out.set(r, "dir");
        await walk(r);
      } else if (e.isFile()) out.set(r, `file:${await sha256File(abs)}`);
      else out.set(r, "special");
    }
  };
  await walk("");
  return out;
}

export interface ZoneDiff {
  added: string[];
  changed: string[];
  removed: string[];
}

export function diffSnapshots(before: Map<string, string>, after: Map<string, string>): ZoneDiff {
  const d: ZoneDiff = { added: [], changed: [], removed: [] };
  for (const [p, v] of after) {
    if (!before.has(p)) d.added.push(p);
    else if (before.get(p) !== v) d.changed.push(p);
  }
  for (const p of before.keys()) if (!after.has(p)) d.removed.push(p);
  for (const k of ["added", "changed", "removed"] as const) d[k].sort();
  return d;
}

export function describeDiff(d: ZoneDiff): string {
  const part = (what: string, xs: string[]) => (xs.length > 0 ? `${what}: ${xs.slice(0, 20).join(", ")}${xs.length > 20 ? ` (+${xs.length - 20})` : ""}` : "");
  return [part("добавлены", d.added), part("изменены", d.changed), part("удалены", d.removed)].filter(Boolean).join("; ");
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

export function describeDenial(d: unknown): string {
  const x = d as { tool_name?: unknown; tool_input?: Record<string, unknown> } | null;
  const target = x?.tool_input ? (x.tool_input.file_path ?? x.tool_input.path ?? x.tool_input.pattern ?? "") : "";
  return `${String(x?.tool_name ?? "?")} ${String(target)}`.trim();
}

const technical = (code: string, description: string, fix_hint: string, severity: QAIssue["severity"] = "blocking"): QAIssue => ({
  source: "technical", code, severity, description, fix_hint,
});

/**
 * Контракт props (Task 11, H4). `props.style` перезаписывается из настроек
 * (`scenePropsStyle`; `palette_overrides` и `depth` сцены сохраняются — их меняет правка
 * параметров), затем `ScenePropsBaseSchema` и согласованность: `props.timing.duration_frames
 * == spec.duration_frames == settings.duration_frames`, `props.style.{preset, intensity,
 * transparent} == settings.*` — иначе blocking `props_settings_mismatch`. Биты props, не
 * совпавшие с биты spec, — warning.
 */
export function checkProps(text: string | undefined, spec: MotionSpec, settings: Settings): { props?: ScenePropsBase; text?: string; issues: QAIssue[] } {
  if (text === undefined) return { issues: [technical("props_contract", "props.json нет", "запиши props.json: { timing, style, content } по контракту сцены")] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { issues: [technical("props_contract", `props.json — не JSON: ${errText(e)}`, "props.json — JSON-объект { timing, style, content }")] };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { issues: [technical("props_contract", "props.json — не объект", "props.json — JSON-объект { timing, style, content }")] };
  }
  const obj = raw as Record<string, unknown>;
  const own = ScenePropsStyleSchema.partial().safeParse(obj.style);
  const kept = own.success ? own.data : {};
  const style: ScenePropsStyle = {
    ...scenePropsStyle(settings),
    ...(kept.palette_overrides ? { palette_overrides: kept.palette_overrides } : spec.palette_overrides ? { palette_overrides: spec.palette_overrides } : {}),
    ...(kept.depth !== undefined ? { depth: kept.depth } : {}),
    // стиль проекта сценария (`settings.style_lock`) важнее палитры и глубины сцены
    ...styleLockOf(settings),
  };
  const parsed = ScenePropsBaseSchema.safeParse({ ...obj, style });
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`).join("; ");
    return { issues: [technical("props_contract", `props.json не проходит ScenePropsBaseSchema: ${where}`, "props.json — ровно { timing: { duration_frames, beats: [{ id, start_frame, end_frame }] }, style, content }, без лишних полей")] };
  }
  const props = parsed.data;
  const issues: QAIssue[] = [];
  const mismatch: string[] = [];
  if (props.timing.duration_frames !== settings.duration_frames) mismatch.push(`props.timing.duration_frames ${props.timing.duration_frames} ≠ settings.duration_frames ${settings.duration_frames}`);
  if (spec.duration_frames !== settings.duration_frames) mismatch.push(`spec.duration_frames ${spec.duration_frames} ≠ settings.duration_frames ${settings.duration_frames}`);
  if (props.style.preset !== settings.style_preset) mismatch.push(`props.style.preset ${props.style.preset} ≠ ${settings.style_preset}`);
  if (props.style.intensity !== settings.animation_intensity) mismatch.push(`props.style.intensity ${props.style.intensity} ≠ ${settings.animation_intensity}`);
  if (props.style.transparent !== settings.transparent_export) mismatch.push(`props.style.transparent ${props.style.transparent} ≠ ${settings.transparent_export}`);
  if (mismatch.length > 0) {
    issues.push(technical("props_settings_mismatch", mismatch.join("; "), "props.timing — биты и duration_frames ровно как в spec.json и settings.json; тайминги сцены — только из props.timing"));
  }
  const specBeats = new Map(spec.beats.map((b) => [b.id, b]));
  const odd = props.timing.beats.filter((b) => {
    const s = specBeats.get(b.id);
    return !s || s.start_frame !== b.start_frame || s.end_frame !== b.end_frame;
  });
  const lost = spec.beats.filter((b) => !props.timing.beats.some((x) => x.id === b.id));
  if (odd.length + lost.length > 0) {
    issues.push(technical(
      "props_timing",
      `props.timing.beats расходятся со spec: ${[...odd.map((b) => `${b.id} ${b.start_frame}–${b.end_frame}`), ...lost.map((b) => `нет ${b.id}`)].join(", ")}`,
      "перенеси в props.timing.beats все биты spec с их start_frame и end_frame",
      "warning",
    ));
  }
  return { props, text: JSON.stringify(props, null, 2) + "\n", issues };
}

const asText = (issues: QAIssue[]) => issues.map((i) => `- [${i.severity}] ${i.code}${i.area ? ` (${i.area})` : ""}: ${i.description} → ${i.fix_hint}`).join("\n");

/** Сквозное состояние дублей одной попытки задачи: номера попыток и что лежит в draft. */
interface TakeCtl {
  attempts: Attempt[];
  next: number;
  /** Оценённая попытка, чьи файлы сейчас в draft (первый дубль); новый вызов Engineer в draft её сбрасывает. */
  draftHead?: Attempt;
}

/** Дубль: каталог, spec, файлы пайплайна, лимит вызовов Engineer. */
interface Take {
  no: 1 | 2;
  dir: string;
  spec: MotionSpec;
  files: DraftFiles;
  maxCalls: number;
  /** Заголовок первого вызова (второй дубль: критика или новое кадрирование). */
  brief?: string;
  onScored?: (a: Attempt) => void;
  /** Отмена дубля (второй — при исключении или жёстком выходе первого, S5-fix I5). */
  signal?: AbortSignal;
}

/** Итог дубля: чистая попытка, последняя причина исправления или выход до конца цикла. */
interface TakeEnd {
  clean?: Attempt;
  issue?: Issue;
  exit?: Exit & { ok: false };
}

/**
 * Выход первого дубля, после которого публиковать нельзя ни одну попытку: процесс жив
 * (его draft), хранилище, отмена, отказ прав внутри draft.
 */
function hardExit(e: (Exit & { ok: false }) | undefined): boolean {
  if (!e) return false;
  if (e.alive || e.stage === "storage" || e.stage === "cancelled" || e.stage === "orphaned") return true;
  return e.message.startsWith("denied:");
}

/**
 * Выход второго дубля, который роняет задачу (S5-fix I6): только хранилище и отмена самой
 * задачи. Остальное (отказ вызова, orphaned, отмена дубля) — предупреждение: дубль 2
 * работает в своём каталоге `take2`, draft первого дубля его процессы не трогают.
 */
function take2Fatal(e: (Exit & { ok: false }) | undefined, rc: RunCtx): boolean {
  return e !== undefined && (e.stage === "storage" || rc.aborted);
}

/**
 * Группа попытки (rulings 2026-10-23): 0 — без blocking, 1 — blocking только визуальные
 * (публикуется с warn), 2 — semantic/style fail (не публикуется как ready).
 */
const group = (a: { qa?: QAReport; blocking: boolean }) => (!a.blocking ? 0 : a.qa && meaningFails(a.qa) ? 2 : 1);

/**
 * Лучшая попытка (S5, rulings 2026-10-23): попытка без blocking всегда выигрывает у попытки
 * с blocking; внутри группы — наибольший `overall`, затем ранняя. Попытки без оценки (срез
 * без QA) — по порядку.
 */
export function pickBest<T extends { n: number; qa?: QAReport; blocking: boolean }>(attempts: readonly T[]): T | undefined {
  const score = (a: T) => a.qa?.scores?.overall ?? -1;
  return [...attempts].sort((a, b) => group(a) - group(b) || score(b) - score(a) || a.n - b.n)[0];
}

/**
 * Уборка снимков попыток и каталогов второго дубля (M1: на любом выходе, кроме живых
 * процессов первого дубля). `keepTake2` — процесс дубля 2 не подтверждён мёртвым: его
 * рабочие каталоги (`take2` у Engineer, `qa-t2` у Visual QA) остаются до разбора.
 */
async function dropTakeDirs(rc: RunCtx, keepTake2: boolean): Promise<void> {
  for (const x of ["attempts", ...(keepTake2 ? [] : ["take2", "qa-t2"])]) {
    await rm(join(rc.root, "run", "tmp", `${rc.runId}-a${rc.attempt}`, x), { recursive: true, force: true }).catch((e: unknown) => rc.warnings.push(`run/tmp/${x} не убран: ${errText(e)}`));
  }
}

/**
 * Цикл генерации (04 §2) с попытками и вторым дублем (S5). Первый дубль — в draft: Engineer →
 * технический gate → рендер → QA, исправления до `maxAutoFixes`. Каждая попытка с QA по кадрам
 * хранится снимком с оценкой; публикуется лучшая (`pickBest`). Если у лучшей остались blocking
 * (исправления или бюджет кончились), она публикуется с `qa.visual = warn` — решение за
 * человеком. Первая оценённая попытка ниже порога (`scene.secondTake`) и бюджет позволяет —
 * второй дубль в своём каталоге, параллельно с исправлениями первого.
 */
export async function runFixLoop(i: LoopInput, state: LoopState): Promise<Exit> {
  const t2 = { alive: false };
  const exit = await fixLoop(i, state, t2);
  // m2: процесс дубля 2 не подтверждён мёртвым, а итог его не несёт (`alive` итога — карантин,
  // разбор за восстановлением) — разбираем попытку сами: процессы дубля 1 к этому моменту
  // подтверждённо мертвы, так что разбор касается только дубля 2 (ADR 0007, «до разбора»)
  if (!t2.alive || (!exit.ok && exit.alive)) return exit;
  if (await reapTake2(i)) return exit;
  // опубликованная версия остаётся (процесс дубля 2 в неё не пишет), неудача — в карантин
  return exit.ok ? exit : { ...exit, alive: true };
}

/**
 * Разбор процессов попытки после итога (m2): чисто — каталоги дубля 2 убираются; нет —
 * остаются, предупреждение с PID.
 */
async function reapTake2(i: LoopInput): Promise<boolean> {
  const { rc } = i;
  let r: Awaited<ReturnType<typeof reapAttempt>>;
  try {
    r = await reapAttempt(rc.registry ?? fileProcessRegistry(rc.root), { runId: rc.runId, attempt: rc.attempt }, i.deps.reapOptions);
  } catch (e) {
    rc.warnings.push(`разбор процессов дубля 2 не удался: ${errText(e)} — каталоги take2 и qa-t2 оставлены`);
    return false;
  }
  if (!r.clean) {
    const pids = r.alive.map((p) => p.pid).join(", ");
    rc.warnings.push(`процессы дубля 2 не завершились (PID ${pids}) — каталоги take2 и qa-t2 оставлены до разбора`);
    rc.note("second_take", `разбор после итога: живы PID ${pids}`);
    return false;
  }
  rc.note("second_take", "разбор после итога: процессов дубля 2 нет");
  await dropTakeDirs(rc, false);
  return true;
}

/** Тело цикла; `t2.alive` — процесс дубля 2 не подтверждён мёртвым (разбор — в `runFixLoop`). */
async function fixLoop(i: LoopInput, state: LoopState, t2out: { alive: boolean }): Promise<Exit> {
  const { rc } = i;
  const maxCalls = 1 + rc.config.scene.maxAutoFixes;
  const cfg = rc.config.scene.secondTake;
  const st = i.reviseOnly && cfg.mode === "fresh" ? { ...cfg, mode: "revise" as const } : cfg;
  const ctl: TakeCtl = { attempts: [], next: 0 };
  let take2: Promise<TakeEnd> | undefined;
  // отмена второго дубля: исключение или жёсткий выход первого (S5-fix I5)
  const stop2 = new AbortController();

  const onScored = (a: Attempt) => {
    if (take2 || a.take !== 1 || !i.qa || !i.takeDir || st.mode === "off") return;
    const overall = a.qa?.scores?.overall;
    if (overall === undefined || overall >= st.threshold) return;
    // допуск по бюджету (rulings 2026-10-23): свободного остатка за вычетом резерва идущих
    // вызовов хватает на две попытки — дубль 2 и исправление первого; иначе лучше не начинать
    if (rc.spent + rc.reserved + 2 * a.costUsd > rc.config.scene.maxCostUsd) {
      rc.note("second_take", `пропущен: $${rc.spent.toFixed(2)} + резерв $${rc.reserved.toFixed(2)} + 2 × цена попытки $${a.costUsd.toFixed(2)} > $${rc.config.scene.maxCostUsd}`);
      return;
    }
    rc.log(`второй дубль (${st.mode}): overall ${overall} < ${st.threshold}`);
    rc.note("second_take", `${st.mode}: overall попытки ${a.n} — ${overall} < ${st.threshold}`);
    take2 = (async (): Promise<TakeEnd> => {
      const spec2 = st.mode === "fresh" ? freshSpec(i.spec) : a.spec;
      const t = await i.takeDir!(spec2);
      if (st.mode === "revise") await copyAttemptFiles(rc.root, a, t.dir, ["src", "props.json"]);
      const brief = st.mode === "revise" ? critique(a) : freshBrief(i.spec, spec2, a);
      return runTake(i, state, ctl, { no: 2, dir: t.dir, spec: spec2, files: t.files, maxCalls: 1 + st.fixes, brief, signal: stop2.signal });
    })().catch((e: unknown): TakeEnd => {
      const storage = isStorageError(e);
      rc.warnings.push(`второй дубль не состоялся: ${errText(e)}`);
      return { exit: { ok: false, stage: storage ? "storage" : "engineer", message: `второй дубль: ${errText(e)}` } };
    });
  };

  let t1: TakeEnd;
  try {
    t1 = await runTake(i, state, ctl, { no: 1, dir: i.draftDir, spec: i.spec, files: i.files, maxCalls, onScored, ...(i.brief ? { brief: i.brief } : {}) });
  } catch (e) {
    // первый дубль упал исключением: второй отменяем и дожидаемся — после итога задачи он
    // не должен ни звать агентов, ни рендерить, ни писать в run/tmp
    stop2.abort();
    const t2 = take2 ? await take2 : undefined;
    if (!t2?.exit?.alive) {
      await dropTakeDirs(rc, false);
      throw e;
    }
    // m3: процесс дубля 2 не подтверждён мёртвым — исключение несёт `alive`, задача уходит
    // в карантин (generate.ts), а не публикует failed-версию; каталоги дубля 2 — до разбора
    rc.warnings.push(`второй дубль: ${t2.exit.stage}: ${clip(t2.exit.message, 300)} (процесс не подтверждён мёртвым — take2 и qa-t2 оставлены до разбора)`);
    throw Object.assign(e instanceof Error ? e : new Error(errText(e)), { alive: true });
  }
  if (hardExit(t1.exit)) stop2.abort();
  const t2 = take2 ? await take2 : undefined;
  // процесс дубля 2 не подтверждён мёртвым — его каталог не трогаем до разбора
  const t2alive = t2?.exit?.alive === true;
  t2out.alive = t2alive;
  if (hardExit(t1.exit)) {
    if (!t1.exit!.alive && !t2alive) await dropTakeDirs(rc, false);
    return t1.exit!;
  }
  if (take2Fatal(t2?.exit, rc)) {
    if (!t2alive) await dropTakeDirs(rc, false);
    return t2!.exit!;
  }
  if (t2?.exit) rc.warnings.push(`второй дубль: ${t2.exit.stage}: ${clip(t2.exit.message, 300)}${t2alive ? " (процесс не подтверждён мёртвым — разбор после итога)" : ""}`);

  const best = pickBest(ctl.attempts);
  state.attempts = ctl.attempts.map((a) => attemptRecord(a, a === best));
  if (!best) {
    await dropTakeDirs(rc, t2alive);
    if (t1.exit) return t1.exit;
    const last = t1.issue!;
    return { ok: false, stage: last.stage, message: clip(last.message, 4000) };
  }

  // лучшая попытка — в draft (файлы сцены, кадры, превью) и в файлы пайплайна
  if (best !== ctl.draftHead) await restoreAttempt(rc.root, best, i.draftDir);
  if (best.style) {
    state.style = best.style;
    i.files.set("style.json", JSON.stringify(sceneStyle(best.style, i.settings), null, 2) + "\n");
  }
  if (best.spec !== i.spec) i.files.set("spec.json", JSON.stringify(best.spec, null, 2) + "\n");
  if (best.report) state.report = best.report;
  await i.files.write();
  // снимки попыток и каталог второго дубля больше не нужны: лучшая — в draft
  await dropTakeDirs(rc, t2alive);

  let qa = best.qa;
  if (qa && best.blocking && meaningFails(qa)) {
    // rulings 2026-10-23: semantic/style fail не смягчается — версия failed с отчётом QA
    const what = (["semantic", "style"] as const).filter((k) => qa!.gate[k] === "fail").join(", ");
    rc.note("qa", `лучшая попытка ${best.n}: ${what} fail — не ready`);
    return { ok: false, stage: "qa", message: `QA: ${what} fail у лучшей попытки ${best.n} из ${ctl.attempts.length} — неверные данные или смысл не публикуются как ready\n${clip(fixHints(qa), 3000)}`, qa };
  }
  if (qa && best.blocking) {
    const why = t1.exit?.stage === "budget"
      ? "— бюджет сцены исчерпан"
      : t1.exit?.stage === "qa"
        ? "— Visual QA не оценил следующую попытку"
        : t1.exit
          ? `— ${t1.exit.stage}`
          : `после ${maxCalls - 1} исправлений`;
    qa = acceptedAsWarn(qa, why);
    rc.warnings.push(`опубликована лучшая попытка ${best.n} с blocking QA (${why}): visual = warn, решение за человеком`);
  }
  const framesSha: string[] = [];
  for (const f of i.frames) framesSha.push(await sha256File(join(i.draftDir, "frames", `${f}.png`)));
  const previewSha = await sha256File(join(i.draftDir, "preview.mp4"));
  const sc = best.qa?.scores?.overall;
  rc.note("ready", `опубликована попытка ${best.n} (дубль ${best.take}, вызов ${best.call}${sc !== undefined ? `, overall ${sc}` : ""}) из ${ctl.attempts.length}`);
  return { ok: true, previewSha, framesSha, ...(qa ? { qa } : {}), ...(best.spec !== i.spec ? { spec: best.spec } : {}) };
}

/** Строка журнала попыток. */
function attemptRecord(a: Attempt, published: boolean): AttemptRecord {
  return {
    n: a.n, take: a.take, call: a.call,
    ...(a.qa?.scores ? { overall: a.qa.scores.overall, scores: a.qa.scores } : {}),
    blocking: (a.qa?.issues ?? []).filter((x) => x.severity === "blocking").map((x) => x.code),
    cost_usd: Math.round(a.costUsd * 10000) / 10000,
    published,
  };
}

/** Файлы попытки в снимке: код сцены, props, превью, QA-кадры. */
const ATTEMPT_FILES = ["src", "props.json", "preview.mp4", "frames"];
const posixRel = (root: string, p: string) => relative(root, p).split(sep).join("/");

/** Снимок попытки: `run/tmp/<runId>-a<attempt>/attempts/<n>/` (каталоги — через safeMkdir). */
async function snapshotAttempt(rc: RunCtx, dir: string, frames: number[], n: number): Promise<string> {
  const rel = `run/tmp/${rc.runId}-a${rc.attempt}/attempts/${n}`;
  await rm(join(rc.root, rel), { recursive: true, force: true });
  await safeMkdir(rc.root, rel);
  for (const x of ["src", "props.json", "preview.mp4"]) if (existsSync(join(dir, x))) await copyTree(rc.root, join(dir, x), `${rel}/${x}`);
  await safeMkdir(rc.root, `${rel}/frames`);
  for (const f of frames) {
    const p = join(dir, "frames", `${f}.png`);
    if (existsSync(p)) await copyFile(p, join(rc.root, rel, "frames", `${f}.png`));
  }
  return rel;
}

/** Файлы снимка в каталог (прежние — удаляются). */
async function copyAttemptFiles(root: string, a: Attempt, to: string, items: string[]): Promise<void> {
  const toRel = posixRel(root, to);
  for (const x of items) {
    await rm(join(to, x), { recursive: true, force: true });
    if (existsSync(join(root, a.snapshot, x))) await copyTree(root, join(root, a.snapshot, x), `${toRel}/${x}`);
  }
}

/** Лучшая попытка — в draft: её код, props, кадры и превью. */
const restoreAttempt = (root: string, a: Attempt, draftDir: string) => copyAttemptFiles(root, a, draftDir, ATTEMPT_FILES);

/** Кадрирование второго дубля `fresh`: другой archetype вместо выбранного Director. */
const OTHER_FRAMING: Record<NonNullable<MotionSpec["composition"]>["archetype"], NonNullable<MotionSpec["composition"]>["archetype"]> = {
  "centered-hero": "split",
  split: "centered-hero",
  diagonal: "centered-hero",
  "full-bleed-data": "split",
  "network-centric": "orbit",
  stacked: "split",
  orbit: "network-centric",
  other: "centered-hero",
};

/** Раскладка во всю safe area (фон, мир) — не кадрирование: её второй дубль сохраняет. */
const fullLayout = (l: NonNullable<MotionSpec["elements"][number]["layout"]>) => l.x <= 0.01 && l.y <= 0.01 && l.x + l.w >= 0.99 && l.y + l.h >= 0.99;

/** Spec дубля `fresh`: другой archetype, раскладки элементов (кроме слоёв во весь кадр) — на Engineer. */
export function freshSpec(spec: MotionSpec): MotionSpec {
  if (!spec.composition) return spec;
  return {
    ...spec,
    composition: { ...spec.composition, archetype: OTHER_FRAMING[spec.composition.archetype] },
    elements: spec.elements.map((e) => {
      if (!e.layout || fullLayout(e.layout)) return e;
      const rest = { ...e };
      delete rest.layout;
      return rest;
    }),
  };
}

/** Что значит ось оценки — для критики второго дубля. */
const AXIS_HINT: Record<QaScoreAxis, string> = {
  hierarchy: "один герой крупнее и заметнее всего, итог владеет кадром",
  composition: "кадр заполнен и уравновешен, без пустых третей и мёртвой полосы под заголовком",
  entrance: "кадр 0 уже собран (фон, якорь героя), входы чистые",
  choreography: "причина → следствие, синхронность, кульминация в верном порядке, без двоящегося текста",
  hold: "финал живёт в смысле сцены, а не застыл и не приглушён",
  legibility: "текст читается на телефоне, контраст, без наложений",
  meaning: "числа и имена запроса на экране, «почему» процесса видно",
};

/** Три слабейшие оси оценки попытки с кадрами-доказательствами. */
function weakest(a: Attempt): string[] {
  const s = a.qa!.scores!;
  return QA_SCORE_AXES.map((ax) => [ax, s[ax]] as const)
    .sort((x, y) => x[1] - y[1])
    .slice(0, 3)
    .map(([ax, v]) => {
      const notes = a.notes.filter((x) => x.axis === ax).map((x) => `кадр ${x.frame}: ${x.note}`);
      return `- **${ax}** ${v}/10 — ${AXIS_HINT[ax]}${notes.length > 0 ? `. Видно: ${notes.join("; ")}` : ""}`;
    });
}

/** Заголовок дубля `revise`: доработка по трём слабым осям и замечаниям QA. */
export function critique(a: Attempt): string {
  const hints = a.qa ? fixHints(a.qa) : "";
  return [
    "# Второй дубль: доработка",
    `Сцена в текущем каталоге собрана и прошла технический gate; Visual QA оценил её на ${a.qa?.scores?.overall}/10 — ниже планки.`,
    "Прочитай src/ и props.json и доработай сцену: подними три самые слабые оси оценки, не ломая то, что уже работает. Замысел, данные и тайминги spec не меняй; с нуля не переписывай.",
    "",
    "## Слабые оси",
    ...weakest(a),
    ...(hints ? ["", "## Замечания QA", "```", clip(hints, 3000), "```"] : []),
  ].join("\n");
}

/** Заголовок дубля `fresh`: та же сцена заново в другом кадрировании. */
export function freshBrief(spec: MotionSpec, spec2: MotionSpec, a: Attempt): string {
  const was = spec.composition?.archetype;
  const now = spec2.composition?.archetype;
  return [
    "# Второй дубль: другое кадрирование",
    `Первый дубль${was ? ` (кадрирование ${was})` : ""} Visual QA оценил на ${a.qa?.scores?.overall}/10. Собери сцену заново, с нуля, в другом кадрировании${now ? `: composition.archetype = ${now} (spec.json)` : ""}.`,
    "Раскладку элементов выбери сама под новое кадрирование; данные, биты и тайминги spec — те же. Слабые оси первого дубля — не повторяй их:",
    ...weakest(a),
  ].join("\n");
}

/** Один дубль: Engineer → технический gate → рендер → QA; исправления до `t.maxCalls`. */
async function runTake(i: LoopInput, state: LoopState, ctl: TakeCtl, t: Take): Promise<TakeEnd> {
  const { rc, deps, settings, frames } = i;
  const { dir, spec, maxCalls } = t;
  const pre = t.no === 1 ? "" : "t2_";
  const first = t.no === 1;
  let issue: Issue | undefined;
  let lastQa: QAReport | undefined;
  let style: ScenePropsStyle | undefined;
  let scored = false;
  const end = (stage: FailureStage, message: string, extra: { alive?: boolean; transient?: true } = {}): TakeEnd => ({
    exit: { ok: false, stage, message, ...extra, ...(lastQa ? { qa: lastQa } : {}) },
    ...(issue ? { issue } : {}),
  });
  const push = (x: Issue) => {
    issue = x;
    rc.note(first ? x.stage : `t2_${x.stage}`, x.message);
  };
  const stopped = () => rc.aborted || t.signal?.aborted === true;

  for (let call = 1; call <= maxCalls; call++) {
    if (rc.spent >= rc.config.scene.maxCostUsd) {
      const why = issue ? `; последняя ошибка (${issue.stage}): ${clip(issue.message, 1000)}` : "";
      return end("budget", `бюджет сцены исчерпан: $${rc.spent.toFixed(2)} из $${rc.config.scene.maxCostUsd}${why}`);
    }
    const p = await rc.storageProblem();
    if (p) return end("storage", p);
    if (stopped()) return end("cancelled", rc.aborted ? "отменено" : "дубль отменён");

    // правка параметров (Task 18): первый проход — код базы с новым props.json, без Engineer;
    // Engineer зовётся только исправлять то, что не прошло gate или QA
    const noEngineer = first && call === 1 && i.skipFirstEngineer === true;
    let report: EngineerReport | undefined;
    let engineerCost = 0;
    if (first) {
      i.progress?.(0.3 + 0.15 * (call - 1), noEngineer ? "check" : call === 1 ? "engineer" : `engineer_fix_${call - 1}`);
      ctl.draftHead = undefined;
    }
    if (noEngineer) rc.log("правка параметров: код базы, новый props.json — без Engineer");
    else {
      state.engineerCalls++;
      const zoneBefore = await snapshotOutsideZone(dir);
      const fix = call > 1 && issue
        ? [
            `# Исправление ${call - 1} из ${maxCalls - 1}`,
            `Предыдущая версия не прошла этап «${issue.stage}». Прочитай текущие файлы src/ и props.json, исправь причины и всё, что им подобно. Не переписывай сцену с нуля без нужды и не упрощай замысел.`,
            "",
            "## Причины",
            "```",
            clip(issue.message),
            "```",
          ].join("\n")
        : call === 1 ? t.brief : undefined;
      rc.log(`${first ? "" : "дубль 2: "}${call === 1 ? "Engineer…" : `Engineer: исправление ${call - 1} из ${maxCalls - 1} (${issue?.stage})…`}`);
      const e = await rc.timed(`${pre}engineer_${call}`, () => rc.call(buildEngineerTask({ draftDir: dir, ...(fix ? { fix } : {}), spec, ...(i.script ? { script: true } : {}), ...(i.technique ? { technique: i.technique } : {}) }, { ...rc.taskRun, seq: first ? call : 100 + call }), EngineerReportSchema, t.signal));
      if (e.budget !== undefined) return end("budget", `${e.budget}${issue ? `; последняя ошибка (${issue.stage}): ${clip(issue.message, 1000)}` : ""}`);
      if (e.skipped) return end("cancelled", "отменено до Engineer");
      if (e.error !== undefined) {
        // процесс агента мог остаться: подтверждения его смерти нет
        const storage = isStorageError(e.error) || e.lost !== undefined || (await rc.storageProblem()) !== undefined;
        return end(storage ? "storage" : "engineer", `вызов Engineer отклонён: ${errText(e.error)}`, { alive: true });
      }
      const er = e.value!;
      engineerCost = er.usage.costUsd;
      if (er.error?.kind === "orphaned") return end("orphaned", `Engineer: ${er.error.message}`, { alive: true });
      if (e.lost) return end("storage", `хранилище пропало во время Engineer: ${e.lost}`);
      if (stopped()) return end("cancelled", rc.aborted ? "отменено во время Engineer" : "дубль отменён во время Engineer");

      // Граница каталога: Engineer правит только src/** и props.json. Остальное (файлы
      // пайплайна, refs/, node_modules, package.json рядом с src/) меняло бы сборку
      // или опубликованные данные в обход static check — откат и причина на исправление.
      const zoneDiff = diffSnapshots(zoneBefore, await snapshotOutsideZone(dir));
      if (zoneDiff.added.length + zoneDiff.changed.length + zoneDiff.removed.length > 0) {
        const what = describeDiff(zoneDiff);
        await t.files.restore(zoneBefore, zoneDiff);
        rc.warnings.push(`Engineer писал вне src/ и props.json (откачено): ${what}`);
        push({
          stage: "static",
          message: `[draft-boundary] изменения вне src/ и props.json запрещены и откачены пайплайном: ${what}. ` +
            "Код сцены и ассеты — только в src/ (без node_modules и package.json), данные — в props.json; spec.json, settings.json, style.json, selection.json, knowledge-refs.json и refs/ не трогай.",
        });
        rc.log(`граница draft: ${what}`);
        continue;
      }

      if (er.permissionDenials.length > 0) {
        state.deniedLog.push(...er.permissionDenials);
        const w = `Engineer: отказано в доступе (${er.permissionDenials.length}): ${er.permissionDenials.map(describeDenial).join("; ")}`;
        rc.warnings.push(w);
        rc.log(`⚠ ${w}`);
        const inside = er.permissionDenials.filter((x) => deniedWriteInside(x, dir));
        if (inside.length > 0) return end("engineer", `denied: запись внутри draft отклонена: ${inside.map(describeDenial).join("; ")}`);
      }
      if (er.status !== "completed" || !er.output) {
        push({ stage: "engineer", message: `вызов Engineer завершился ${er.status}${er.error ? ` (${er.error.kind}): ${er.error.message}` : ""}` });
        continue;
      }
      report = er.output;
      if (first) state.report = report;
      const missing = missingWritten(report, dir);
      if (missing.length > 0) return end("engineer", `denied: files_written ссылается на несуществующие файлы: ${missing.join(", ")}`);
    }

    // static check — до typecheck и бандла (rulings п. 16)
    const violations = await rc.timed(`${pre}static`, () => deps.check(dir));
    if (violations.length > 0) {
      push({ stage: "static", message: violations.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.message}`).join("\n") });
      rc.log(`static check: ${violations.length} нарушений`);
      continue;
    }
    // кадры литералом — не блок, а предупреждение: темп таких мест не масштабируется (Task 19 F2)
    const literals = await frameLiteralsInDir(dir).catch(() => []);
    if (literals.length > 0) {
      const w = `static: кадры литералом (${literals.length}): ${literals.slice(0, 5).map((x) => `${x.file}:${x.line} ${x.message}`).join("; ")}${literals.length > 5 ? "; …" : ""}`;
      if (!rc.warnings.includes(w)) rc.warnings.push(w);
    }
    const typeErrors = await rc.timed(`${pre}typecheck`, () => deps.typecheck(dir));
    if (typeErrors.length > 0) {
      push({ stage: "typecheck", message: typeErrors.map((x) => `${x.file}:${x.line} ${x.message}`).join("\n") });
      rc.log(`typecheck: ${typeErrors.length} ошибок`);
      continue;
    }
    // приём сцены сценария (S14): герой — ключевой компонент приёма, а не «заголовок и плашка»
    if (i.technique && !noEngineer) {
      const miss = await techniqueMissing(dir, i.technique);
      if (miss) {
        if (call < maxCalls) {
          push({ stage: "static", message: miss });
          rc.log(`приём: technique_not_realized (${i.technique})`);
          continue;
        }
        if (!rc.warnings.includes(miss)) rc.warnings.push(miss);
      }
    }

    // provenance и контракт props (H4) — технический gate до рендера
    const techWarnings: QAIssue[] = [];
    if (i.qa) {
      // без вызова Engineer (правка параметров) код — базы, её provenance уже проверен
      const prov = report ? provenanceGate(report, i.refs, deps.kb, i.qa.allowRestricted) : [];
      if (prov.length > 0) {
        push({ stage: "static", message: asText(prov) });
        rc.log(`provenance: ${prov.map((x) => x.code).join(", ")}`);
        continue;
      }
      const propsPath = join(dir, "props.json");
      const checked = checkProps(existsSync(propsPath) ? await readFile(propsPath, "utf8") : undefined, spec, settings);
      const blocking = checked.issues.filter((x) => x.severity === "blocking");
      if (blocking.length > 0 || !checked.props) {
        push({ stage: "static", message: asText(checked.issues) });
        rc.log(`props: ${checked.issues.map((x) => x.code).join(", ")}`);
        continue;
      }
      // правка (Task 18): что план обещал сохранить — сверка с базой до рендера
      const kept = i.preserveCheck?.(checked.props, spec) ?? [];
      if (kept.some((x) => x.severity === "blocking")) {
        push({ stage: "static", message: asText(kept) });
        rc.log(`preserve: ${kept.map((x) => x.code).join(", ")}`);
        continue;
      }
      techWarnings.push(...checked.issues, ...kept);
      // нормализованный props.style — в props.json и style.json (что сцена увидит, то и QA)
      await writeFile(propsPath, checked.text!);
      style = checked.props.style;
      if (first) state.style = style;
      t.files.set("style.json", JSON.stringify(sceneStyle(style, settings), null, 2) + "\n");
      await t.files.write();
    }

    const rp = await rc.storageProblem();
    if (rp) return end("storage", rp);
    if (stopped()) return end("cancelled", rc.aborted ? "отменено до рендера" : "дубль отменён до рендера");
    if (first) i.progress?.(0.55, "render");
    rc.log(`рендер${first ? "" : " (дубль 2)"}: кадры ${frames.join(", ")} + превью…`);
    // кадр N−20 для «финальный акцент жив» (accent_static) — только для программной проверки
    const extra = i.qa ? accentExtra(settings.duration_frames, frames) : [];
    const req: RenderRequest = {
      versionDir: dir, settings, cacheDir: i.cacheDir, stills: [...frames, ...extra], preview: PREVIEW, timeoutMs: renderTimeoutMs(settings),
      run: { root: rc.root, runId: rc.runId, attempt: rc.attempt, registry: rc.registry },
      // S15b: сцена сценария — временной проход пробы после превью (проверки по всей сцене)
      ...(i.script ? { sweep: { every: SWEEP_EVERY, scale: SWEEP_SCALE } } : {}),
    };
    const t0 = Date.now();
    const r = await rc.timed(`${pre}render_${call}`, () =>
      rc.underWatch(async (sig) => {
        const release = await rc.acquire(rc.deps.permits?.renders, sig);
        try {
          return await deps.render(req, sig);
        } finally {
          release();
        }
      }, t.signal),
    );
    if (r.skipped) return end("cancelled", "отменено до рендера");
    if (r.error !== undefined) {
      const storage = isStorageError(r.error) || r.lost !== undefined || (await rc.storageProblem()) !== undefined;
      return end(storage ? "storage" : "render", `рендер отклонён: ${errText(r.error)}`, { alive: true });
    }
    const rr = r.value!;
    // лишний кадр N−20 (accent_static) — не QA-кадр: удаляется на любом исходе этого рендера
    try {
      if (rr.error?.stage === "orphaned") return end("orphaned", `рендер: ${rr.error.message}`, { alive: true });
      if (r.lost) return end("storage", `хранилище пропало во время рендера: ${r.lost}`);
      if (stopped()) return end("cancelled", rc.aborted ? "отменено во время рендера" : "дубль отменён во время рендера");
      const consoleErrors = rr.browserLogs.filter((l) => l.startsWith("[error]"));
      if (!rr.ok || !rr.probe || !rr.previewPath) {
        const err = rr.error ?? { stage: "media", message: "рендер не вернул превью" };
        const logs = consoleErrors.length > 0 ? `\nконсоль браузера:\n${consoleErrors.slice(-20).join("\n")}` : "";
        push({ stage: "render", message: `${err.stage}: ${err.message}${logs}` });
        rc.log(`рендер: ${err.stage}`);
        continue;
      }
      const ms = Date.now() - t0;
      state.renders.push(
        { kind: "still", frames: frames.length, width: settings.width, height: settings.height, fps: settings.fps, outputPath: join(dir, "frames"), durationMs: ms },
        { kind: "preview", frames: settings.duration_frames, width: rr.probe.width, height: rr.probe.height, fps: settings.fps, outputPath: rr.previewPath, ffprobe: rr.probe, durationMs: ms },
      );
      const gate = probeGate(rr.probe, settings, PREVIEW.scale);
      if (gate.length > 0) {
        push({ stage: "probe", message: `превью не прошло проверку ffprobe: ${gate.join("; ")}` });
        continue;
      }
      if (consoleErrors.length > 0) rc.warnings.push(`консоль браузера: ${consoleErrors.slice(0, 5).join(" | ")}`);

      // QA по реальным кадрам (Task 16)
      let report_: QAReport | undefined;
      let notes: QaScoreNote[] = [];
      let qaCost = 0;
      if (i.qa) {
        if (first) i.progress?.(0.7, "qa");
        const q = await runQa(i, state, t, rr, techWarnings, call, extra, style);
        if ("exit" in q) return { exit: q.exit, ...(issue ? { issue } : {}) };
        // S15a: тот же blocking после исправления — warning, раунд Engineer на него не тратится.
        // Только сцены сценария (ревью S15a, I-2): Playground крутит исправления, как раньше.
        const prev = i.script ? ctl.attempts.filter((x) => x.take === t.no && x.qa).map((x) => x.qa!) : [];
        const rep = repeatsAsWarning(q.report, prev);
        if (rep.repeated.length > 0) rc.note("qa", `повтор после исправления → warning: ${[...new Set(rep.repeated)].join(", ")}`);
        lastQa = report_ = rep.report;
        notes = q.notes;
        qaCost = q.costUsd;
      }
      const a: Attempt = {
        n: ++ctl.next, take: t.no, call, snapshot: "", spec, ...(report_ ? { qa: report_ } : {}), ...(style ? { style } : {}), report,
        notes, costUsd: engineerCost + qaCost, blocking: report_ ? qaBlocks(report_) : false,
      };
      a.snapshot = await snapshotAttempt(rc, dir, frames, a.n);
      ctl.attempts.push(a);
      if (first) ctl.draftHead = a;
      if (!scored && report_) {
        scored = true;
        t.onScored?.(a);
      }
      if (report_ && a.blocking) {
        const blocking = report_.issues.filter((x) => x.severity === "blocking");
        push({ stage: "qa", message: fixHints(report_) });
        rc.log(`QA${first ? "" : " (дубль 2)"}: blocking ${blocking.map((x) => `${x.code}${x.frame !== undefined ? `@${x.frame}` : ""}`).join(", ") || Object.entries(report_.gate).filter(([, v]) => v === "fail").map(([k]) => `gate.${k}`).join(", ")}`);
        continue;
      }
      rc.note(first ? "gate" : "t2_gate", `gate пройден с вызова ${call}${report_?.scores ? `, overall ${report_.scores.overall}` : ""}`);
      return { clean: a };
    } finally {
      for (const x of rr.stills.slice(frames.length)) await rm(x, { force: true });
    }
  }
  return issue ? { issue } : {};
}

/**
 * Сцена сценария (S14): два акцента сразу (`accent_conflict` Visual QA) — исправляемый брак, а
 * не предупреждение: Engineer гасит лишнее свечение, акцент — один в момент. S15a: только если
 * проба подтверждает (kit 0.5.6: ≥ 2 активных акцента одновременно в ≥ 2 QA-кадрах); иначе —
 * предупреждение зрения. Исправляется не больше одного раза (`FIX_ONCE`).
 */
export function scriptAccentFixable(agent: VisualQAOutput, layout: readonly LayoutFrame[] = []): VisualQAOutput {
  if (!agent.issues.some((x) => x.code === "accent_conflict" && x.severity === "warning")) return agent;
  if (accentConflictFrames(layout).length < ACCENT_CONFLICT_FRAMES) return agent;
  return {
    ...agent,
    issues: agent.issues.map((x) => (x.code === "accent_conflict" && x.severity === "warning"
      ? { ...x, severity: "blocking" as const, fix_hint: `${x.fix_hint}; один акцент в момент: свечение, обводка акцентом и Emphasis/Highlight — только у объекта текущего бита, остальные спокойные` }
      : x)),
  };
}

/**
 * Код без ключевого компонента приёма (S14): строка замечания для Engineer (имена kit — ему
 * можно) или `undefined`, если компонент приёма стоит в JSX (S15a; импорта мало).
 */
export async function techniqueMissing(dir: string, technique: Technique): Promise<string | undefined> {
  const t = TECHNIQUES.find((x) => x.slug === technique);
  if (!t) return undefined;
  // S15a: компонент приёма должен стоять в JSX (`<Timeline`), импорта мало
  const used = await kitJsxInDir(dir);
  const kit = t.kit as readonly string[];
  if (kit.some((c) => used.includes(c))) return undefined;
  const imported = await kitImportsInDir(dir);
  return `[technique_not_realized] приём сцены «${t.slug}» (${t.ru}) не реализован: в JSX src/ нет ${kit.map((c) => `<${c}>`).join(" или ")} из @ms/motion-kit (импортировано: ${imported.join(", ") || "—"}; в JSX: ${used.join(", ") || "—"}). ` +
    `Построй героя сцены на ${kit.map((c) => `<${c}>`).join(" / ")} по refs/motion-kit/API.md с данными spec; текст — подписи к нему, не замена.`;
}

/** Время рендера: 5 мин, на длинных сценах — 10 с на секунду сцены (60 с → 10 мин), потолок 20 мин. */
export function renderTimeoutMs(settings: Pick<Settings, "duration_frames" | "fps">): number {
  const sec = (settings.duration_frames * settings.fps.den) / settings.fps.num;
  return Math.min(4 * RENDER_TIMEOUT_MS, Math.max(RENDER_TIMEOUT_MS, Math.round(sec * 10_000)));
}

type BaseHold = { layout: LayoutFrame } | { warn: string } | { orphaned: string };
/** Проба кадра hold базы — одна на правку (оба дубля и все попытки сверяются с ней). */
const baseHolds = new WeakMap<NonNullable<LoopInput["preserveHold"]>, Promise<BaseHold>>();

/**
 * Реестр раскладки кадра hold (N−1) базы: рендер только этого кадра (без превью) в свой
 * каталог `run/tmp/…/base-hold` — опубликованная база только читается; каталог удаляется.
 */
function baseHoldLayout(i: LoopInput): Promise<BaseHold> {
  const h = i.preserveHold!;
  const cached = baseHolds.get(h);
  if (cached) return cached;
  const { rc } = i;
  const run = async (): Promise<BaseHold> => {
    const last = h.settings.duration_frames - 1;
    const out = await safeMkdir(rc.root, `run/tmp/${rc.runId}-a${rc.attempt}/base-hold`);
    try {
      const r = await rc.timed("preserve_hold_base", () =>
        rc.underWatch(async (sig) => {
          const release = await rc.acquire(rc.deps.permits?.renders, sig);
          try {
            return await i.deps.render({
              versionDir: h.versionDir, outDir: out, settings: h.settings, cacheDir: i.cacheDir, stills: [last], preview: null, timeoutMs: renderTimeoutMs(h.settings),
              run: { root: rc.root, runId: rc.runId, attempt: rc.attempt, registry: rc.registry },
            }, sig);
          } finally {
            release();
          }
        }),
      );
      if (r.value?.error?.stage === "orphaned") return { orphaned: `проба кадра hold базы: ${r.value.error.message}` };
      if (r.value === undefined || !r.value.ok) return { warn: `проба кадра hold базы не удалась: ${r.value?.error ? `${r.value.error.stage}: ${r.value.error.message}` : errText(r.error ?? r.lost ?? "отменено")}` };
      const layout = parseLayout(r.value.browserLogs).find((f) => f.frame === last);
      return layout ? { layout } : { warn: `проба кадра hold базы: нет реестра раскладки кадра ${last}` };
    } finally {
      await rm(out, { recursive: true, force: true }).catch(() => undefined);
    }
  };
  const p = run().catch((e: unknown): BaseHold => ({ warn: `проба кадра hold базы: ${errText(e)}` }));
  baseHolds.set(h, p);
  return p;
}

/**
 * «Сохрани композицию» по кадру hold (`09` §4): реестр N−1 попытки против реестра N−1 базы.
 * Нет данных — предупреждение (не blocking): без пробы сверку делает только props.content.
 */
async function preserveHoldIssues(i: LoopInput, rr: RenderResult): Promise<{ issues: QAIssue[] } | { orphaned: string }> {
  const h = i.preserveHold;
  if (!h) return { issues: [] };
  const b = await baseHoldLayout(i);
  if ("orphaned" in b) return b;
  if ("warn" in b) {
    i.rc.warnings.push(b.warn);
    return { issues: [] };
  }
  const last = i.settings.duration_frames - 1;
  const next = parseLayout(rr.browserLogs).find((f) => f.frame === last);
  if (!next) {
    i.rc.warnings.push(`сверка кадра hold: нет реестра раскладки кадра ${last} новой версии`);
    return { issues: [] };
  }
  const issues = h.check(b.layout, next, { width: i.settings.width, height: i.settings.height });
  i.rc.note("qa", `сверка кадра hold базы ${b.layout.frame} ↔ ${last}: ${b.layout.items.length} → ${next.items.length} текстов, расхождений ${issues.length}${issues.length > 0 ? ` (${issues.map((x) => x.area).join(", ")})` : ""}`);
  return { issues };
}

/**
 * Хук `extraQa` попытки (S6): его рендеры — в свой каталог `run/tmp/<run>-a<attempt>/extra-*`
 * под семафором рендеров, каталоги убираются после хука (кроме живых процессов `orphaned`).
 * Сбой или отмена хука — предупреждение `extra_qa_failed`.
 */
async function extraQaIssues(i: LoopInput, t: Take, settings: Settings, layout: LayoutFrame[]): Promise<{ issues: QAIssue[] } | { orphaned: string }> {
  const { rc } = i;
  const dirs: string[] = [];
  let orphaned: string | undefined;
  const r = await rc.underWatch(
    (sig) =>
      i.extraQa!({
        versionDir: t.dir, spec: t.spec, settings, signal: sig, layout, rc,
        run: { root: rc.root, runId: rc.runId, attempt: rc.attempt, registry: rc.registry },
        renderStills: async (stills, inputProps) => {
          const outDir = await mkdtemp(join(await safeMkdir(rc.root, `run/tmp/${rc.runId}-a${rc.attempt}`), "extra-"));
          dirs.push(outDir);
          const release = await rc.acquire(rc.deps.permits?.renders, sig);
          try {
            const rr = await i.deps.render(
              {
                versionDir: t.dir, outDir, settings, cacheDir: i.cacheDir, stills, preview: null, timeoutMs: renderTimeoutMs(settings), inputProps,
                run: { root: rc.root, runId: rc.runId, attempt: rc.attempt, registry: rc.registry },
              },
              sig,
            );
            if (rr.error?.stage === "orphaned") orphaned = rr.error.message;
            return rr;
          } finally {
            release();
          }
        },
      }),
    t.signal,
  );
  if (orphaned !== undefined) return { orphaned: `доп. проверка попытки: рендер: ${orphaned}` };
  for (const d of dirs) await rm(d, { recursive: true, force: true }).catch(() => undefined);
  if (r.value) return { issues: r.value };
  const why = r.skipped ? "отменена до запуска" : r.budget ?? errText(r.error);
  rc.warnings.push(`доп. проверка попытки не выполнена: ${why}`);
  return { issues: [technical("extra_qa_failed", `доп. проверка попытки не выполнена: ${why}`, "проверка повторится на следующей попытке; при повторе — смотри журнал задачи", "warning")] };
}

/** Программные проверки, проверки spec и Visual QA по кадрам рендера → QAReport (или выход). */
async function runQa(
  i: LoopInput, state: LoopState, t: Take, rr: RenderResult, techWarnings: QAIssue[], call: number, extra: number[], styleOverride: ScenePropsStyle | undefined,
): Promise<{ report: QAReport; notes: QaScoreNote[]; costUsd: number } | { exit: Exit & { ok: false } }> {
  const { rc, settings, frames } = i;
  const { spec, dir } = t;
  const pre = t.no === 1 ? "" : "t2_";
  const style = sceneStyle(styleOverride ?? scenePropsStyle(settings), settings);
  const all = [...frames, ...extra].map((f, k) => ({ frame: f, path: rr.stills[k]! }));
  const stills = all.slice(0, frames.length);
  const end = settings.duration_frames;
  const pair = [end - ACCENT_HOLD_GAP, end - 1].flatMap((f) => all.filter((x) => x.frame === f && x.path !== undefined).slice(0, 1));
  const poster = POSTER_FRAMES.flatMap((f) => all.filter((x) => x.frame === f && x.path !== undefined).slice(0, 1));
  const previewBytes = rr.previewPath ? (await stat(rr.previewPath)).size : 0;
  const programmatic = await rc.timed(`${pre}qa_programmatic`, () =>
    programmaticChecks({ frames: stills, spec, settings, style, render: rr, previewBytes, ...(pair.length === 2 ? { accentFrames: pair } : {}), ...(poster.length > 0 ? { posterFrames: poster } : {}) }),
  );
  // лишний кадр — не QA-кадр: Visual QA его не видит, в версию он не публикуется
  for (const x of all.slice(frames.length)) if (x.path) await rm(x.path, { force: true });
  const fromSpec = specChecks(spec, settings, { previous: i.previous ?? [] });
  // сцена сценария (S14): пустые контейнеры и подписи-заглушки в финале — брак (реестр раскладки
  // kit 0.5.5); S15b: по всей сцене (временной проход) и один герой (пик payoff, удержание)
  if (i.script) {
    const layout = parseLayout(rr.browserLogs);
    programmatic.push(...scriptLayoutIssues(layout).map((x) => ({ source: "programmatic" as const, ...x })));
    const propsPath = join(dir, "props.json");
    const sig = t.signal ?? rc.signal;
    let st: Awaited<ReturnType<typeof scriptSceneIssues>>;
    try {
      st = await rc.timed(`${pre}qa_temporal`, async () => scriptSceneIssues({
        spec, settings, browserLogs: rr.browserLogs, layout, ...(rr.previewPath ? { previewPath: rr.previewPath } : {}),
        ...(i.scriptTiming ? { window: i.scriptTiming.window, ...(i.scriptTiming.moments ? { moments: i.scriptTiming.moments } : {}) } : {}),
        ...(i.technique ? { technique: i.technique } : {}),
        propsText: existsSync(propsPath) ? await readFile(propsPath, "utf8") : "",
        ffmpeg: { run: { root: rc.root, runId: rc.runId, attempt: rc.attempt, registry: rc.registry }, ...(sig ? { signal: sig } : {}) },
      }));
    } catch (e) {
      // яркость превью (ffmpeg): живой процесс и отмена — как у рендера (ревью S15b, M-3)
      if (e instanceof FfmpegError && e.kind === "orphaned") return { exit: { ok: false, stage: "orphaned", message: `энергия движения превью: ${e.message}`, alive: true } };
      if (e instanceof FfmpegError && e.kind === "aborted") return { exit: { ok: false, stage: "cancelled", message: rc.aborted ? "отменено во время QA" : "дубль отменён во время QA" } };
      throw e;
    }
    for (const n of st.notes) rc.note("qa", n);
    programmatic.push(...st.issues);
  }
  const hold = await preserveHoldIssues(i, rr);
  if ("orphaned" in hold) return { exit: { ok: false, stage: "orphaned", message: hold.orphaned, alive: true } };
  programmatic.push(...hold.issues);
  if (i.extraQa) {
    const x = await extraQaIssues(i, t, settings, parseLayout(rr.browserLogs));
    if ("orphaned" in x) return { exit: { ok: false, stage: "orphaned", message: x.orphaned, alive: true } };
    programmatic.push(...x.issues);
  }

  // ruling P5: QA по реальным кадрам обязателен. Бюджет кончился до Visual QA — `budget`;
  // Visual QA не дал оценки — один повтор (без исправления Engineer), затем `qa`. Обе
  // неудачи публикуют failed-версию с отчётом программных проверок (если лучшей попытки нет).
  const partial = () => mergeQA({ technical: techWarnings, programmatic: [...programmatic, ...fromSpec] });
  let agent: VisualQAOutput | undefined;
  let cost = 0;
  const stopped = () => rc.aborted || t.signal?.aborted === true;
  for (let attempt = 1; agent === undefined; attempt++) {
    if (rc.spent >= rc.config.scene.maxCostUsd) {
      return { exit: { ok: false, stage: "budget", message: `бюджет сцены исчерпан до Visual QA: $${rc.spent.toFixed(2)} из $${rc.config.scene.maxCostUsd}`, qa: partial() } };
    }
    const p = await rc.storageProblem();
    if (p) return { exit: { ok: false, stage: "storage", message: p } };
    if (stopped()) return { exit: { ok: false, stage: "cancelled", message: rc.aborted ? "отменено до Visual QA" : "дубль отменён до Visual QA" } };
    rc.log(attempt === 1 ? `Visual QA${pre ? " (дубль 2)" : ""}…` : "Visual QA: повтор…");
    const v = await rc.timed(`${pre}visual_qa_${call}`, () =>
      rc.underWatch((sig) =>
        runVisualQA(
          { workdir: dir, frames, spec, style, durationFrames: end, brief: i.qa!.brief, runRef: { root: rc.root, runId: rc.runId, attempt: rc.attempt, registry: rc.registry }, signal: sig, ...(pre ? { dirName: "qa-t2" } : {}) },
          { agents: rc.recording, config: rc.config, log: (m) => rc.warnings.push(m) },
        ),
      t.signal),
    );
    if (v.budget !== undefined) return { exit: { ok: false, stage: "budget", message: `${v.budget} (до Visual QA)`, qa: partial() } };
    if (v.skipped) return { exit: { ok: false, stage: "cancelled", message: "отменено до Visual QA" } };
    if (v.error !== undefined) {
      // вызов отклонён: процесс агента не подтверждён мёртвым — без повтора, draft в карантин
      const storage = isStorageError(v.error) || v.lost !== undefined || (await rc.storageProblem()) !== undefined;
      // обрыв сети в вызове — сбой среды (bench --run генерирует сцену заново), не оценка сцены
      const net = !storage && isNetworkError(errText(v.error));
      return { exit: { ok: false, stage: storage ? "storage" : "qa", message: `вызов Visual QA отклонён: ${errText(v.error)}`, alive: true, ...(net ? { transient: true as const } : {}) } };
    }
    const vr = v.value!;
    cost += vr.usage.costUsd;
    state.visualQa.push({ call: pre ? 100 + call : call, wall_ms: vr.wallMs, cost_usd: vr.usage.costUsd, status: vr.status, ...(vr.output ? { gate: { technical: "pass", ...vr.output.gate } } : {}) });
    if (vr.error?.kind === "orphaned") return { exit: { ok: false, stage: "orphaned", message: `Visual QA: ${vr.error.message}`, alive: true } };
    if (v.lost) return { exit: { ok: false, stage: "storage", message: `хранилище пропало во время Visual QA: ${v.lost}` } };
    if (stopped()) return { exit: { ok: false, stage: "cancelled", message: rc.aborted ? "отменено во время Visual QA" : "дубль отменён во время Visual QA" } };
    if (vr.status === "completed" && vr.output) {
      agent = vr.output;
      break;
    }
    const why = `Visual QA не дал оценки: ${vr.status}${vr.error ? ` (${vr.error.kind}): ${vr.error.message}` : ""}`;
    rc.warnings.push(why);
    rc.note("qa", why);
    if (attempt >= VISUAL_QA_TRIES) {
      const net = vr.error !== undefined && isNetworkError(vr.error.message);
      return { exit: { ok: false, stage: "qa", message: `${why} (вызовов: ${attempt}); без оценки по кадрам версия не ready`, qa: partial(), ...(net ? { transient: true as const } : {}) } };
    }
  }
  // S5: missing_element только по зрению, который опровергает реестр раскладки, — warning
  agent = reconcileMissing(agent, spec, parseLayout(rr.browserLogs), end, settings);
  if (i.script) agent = scriptAccentFixable(agent, parseLayout(rr.browserLogs));
  const report = mergeQA({ technical: techWarnings, programmatic: [...programmatic, ...fromSpec], agent });
  rc.note("qa", `QA ${pre ? "дубля 2 " : ""}вызова ${call}: ${JSON.stringify(report.gate)}; overall ${agent.scores.overall}; blocking: ${report.issues.filter((x) => x.severity === "blocking").map((x) => x.code).join(", ") || "—"}`);
  return { report, notes: agent.score_notes, costUsd: cost };
}
