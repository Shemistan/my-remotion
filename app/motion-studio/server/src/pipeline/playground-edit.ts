// Обработчик задачи `playground.edit` (P1-13; `04` §3): правка версии через чат или кнопку
// Render. План: готовый (`input.plan`, кнопка Render), из патча настроек или от Edit Planner
// (сбой — этап `edit_planner`). Путь `param` — `applyParamEdit` в draft-копии базы: код базы,
// новый props.json, рендер и QA без Engineer (Engineer — только исправлять). Иначе (или props
// базы не по контракту, M18) — Motion Director (база + план) → Engineer правит копию src/
// базы → gate (props/spec/settings, H4) → QA. Всё после плана — общий движок `runGeneration`:
// тот же цикл исправлений, выбор лучшей попытки, общий бюджет задачи, `stage_wall_ms`. Что
// план обещал сохранить, сверяет `checkPreserve` (spec и раскладка props.content), а «сохрани
// композицию» — ещё и реестр раскладки кадра hold базы и правки (`compareHoldLayout`). Публикация — от базы (`parent_version_id`),
// с `edit_plan` и `changed_files`; ответ Edit Planner — в чат.
import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  ComponentSelectionSchema,
  type EditPlan,
  EditPlanSchema,
  type HistoryEntry,
  type MotionSpec,
  MotionSpecSchema,
  type QAIssue,
  type ScriptSceneContext,
  ScriptSceneContextSchema,
  ScriptPlanRevisionDocSchema,
  type Settings,
  SettingsFieldsSchema,
  SettingsSchema,
} from "@ms/contracts";
import { z } from "zod";
import { buildEditPlannerTask } from "../agents/prompts.js";
import type { Db } from "../db/open.js";
import * as chat from "../db/repos/chat.js";
import * as jobs from "../db/repos/jobs.js";
import * as plans from "../db/repos/plans.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { setOutputRefs } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import type { CapabilityView } from "../knowledge/types.js";
import { versionHistoryDigest } from "../scenes/history.js";
import { overlayChecks } from "../script/overlay-check.js";
import type { StepRef } from "./checkpoints.js";
import { type EditRequest, type GenerateDeps, type PlanOutcome, readKitApi, runGeneration } from "./generate.js";
import { applyParamEdit, hardcodedFrameProps, touchesGeometry } from "./param-edit.js";
import { type PlaygroundDeps, abortKind, record, toHandlerResult } from "./playground-generate.js";
import { checkPreserve, compareHoldLayout } from "./preserve.js";
import { type CheckpointOpts, type RunCtx, type SpeechWindow, directorStep, errText, sceneStyle, startPropsStyle, toolless } from "./steps.js";

export const PlaygroundEditInputSchema = z.object({
  sceneId: z.string().min(1),
  /** Сообщение пользователя в чате сцены (текст правки). */
  messageId: z.string().min(1).optional(),
  /** Версия-основа; по умолчанию — текущая версия сцены. */
  baseVersionId: z.string().min(1).optional(),
  /** Готовый план (кнопка Render, Task 20): Edit Planner не вызывается. */
  plan: EditPlanSchema.optional(),
  /** Патч настроек (кнопка Render); итог проверяется `SettingsSchema`. */
  settings_patch: SettingsFieldsSchema.partial().optional(),
  allowRestricted: z.boolean().optional(),
}).passthrough();
export type PlaygroundEditInput = z.infer<typeof PlaygroundEditInputSchema>;

/** Версия-основа правки: строка, каталог, spec, props (как есть), выбор KB. */
interface Base {
  row: versions.VersionRow;
  dir: string;
  spec: MotionSpec;
  props: unknown;
  selection: z.infer<typeof ComponentSelectionSchema>;
}

async function loadBase(root: string, row: versions.VersionRow): Promise<Base> {
  const dir = join(root, row.path);
  const json = async (name: string) => JSON.parse(await readFile(join(dir, name), "utf8")) as unknown;
  const spec = MotionSpecSchema.parse(await json("spec.json"));
  const props = await json("props.json").catch(() => undefined);
  const sel = ComponentSelectionSchema.safeParse({ items: ((await json("selection.json").catch(() => ({}))) as { items?: unknown }).items ?? [] });
  return { row, dir, spec, props, selection: sel.success ? sel.data : { items: [] } };
}

/** Кадры числом в коде сцены базы (`src/**.tsx`, M-R2); каталог не прочитан — пусто. */
async function codeFramesOf(dir: string): Promise<string[]> {
  const files = await readdir(join(dir, "src"), { recursive: true }).catch(() => [] as string[]);
  const out: string[] = [];
  for (const f of files.filter((x) => /\.(tsx|ts|jsx|js)$/.test(x)).sort()) {
    const code = await readFile(join(dir, "src", f), "utf8").catch(() => "");
    out.push(...hardcodedFrameProps(code));
  }
  return [...new Set(out)];
}

/** Исходный запрос сцены: промпт корня цепочки версий (правки и восстановления — его потомки). */
function rootPrompt(db: JobContext["db"], row: versions.VersionRow): string {
  let r = row;
  for (let i = 0; i < 1000 && r.parent_version_id; i++) {
    const p = versions.get(db, r.parent_version_id);
    if (!p) break;
    r = p;
  }
  return r.prompt;
}

/** Готовая версия, ближайшая по номеру к `n` (при равенстве — более ранняя). */
function nearestReady(history: HistoryEntry[], n: number): HistoryEntry | undefined {
  return history.filter((h) => h.status === "ready").sort((a, b) => Math.abs(a.number - n) - Math.abs(b.number - n) || a.number - b.number)[0];
}

/**
 * План к базе и истории: id базы — фактическая база; заимствование у неудавшейся версии →
 * у ближайшей готовой по номеру (для «первой версии» — первая готовая, Q5), с пояснением; из
 * `preserve` убирается то, что меняет план или патч настроек (кнопка Render: пресет и палитра
 * настроек — палитра, длительность — тайминги, M5).
 */
export function normalizePlan(p: EditPlan, baseId: string, history: HistoryEntry[], patch: Partial<Settings> = {}, baseSpec?: MotionSpec): { plan: EditPlan; notes: string[] } {
  const notes: string[] = [];
  const borrow = p.borrow.map((b) => {
    const donor = history.find((h) => h.version_id === b.from_version_id);
    const near = donor && donor.status !== "ready" ? nearestReady(history, donor.number) : undefined;
    if (!donor || !near) return b;
    const first = history.find((h) => h.status === "ready") === near && near.number > donor.number;
    notes.push(`Версия ${donor.number} не удалась, поэтому ${b.what === "palette" ? "палитру" : "параметры"} беру из ${first ? "первой готовой" : "ближайшей готовой"} — версии ${near.number}.`);
    return { ...b, from_version_id: near.version_id };
  });
  const changes = new Set<string>();
  if (p.timing_scale !== undefined && p.timing_scale !== 1) changes.add("timing");
  if (borrow.some((b) => b.what === "palette") || p.param_patch?.style?.palette_overrides || p.param_patch?.style?.preset) changes.add("palette");
  if (patch.style_preset !== undefined || patch.color_palette !== undefined) changes.add("palette");
  if (patch.duration_frames !== undefined) changes.add("timing");
  if (borrow.some((b) => b.what === "timing")) changes.add("timing");
  // замена текста снимает `text`, но не `composition` (I-R1): место подписи сохраняется, а рост
  // ширины и перенос строки от нового текста сверка кадра hold терпит (якорь, не центр)
  if (p.param_patch?.content) changes.add("text");
  const textIds = baseSpec?.elements.filter((e) => e.kind === "text").map((e) => e.id) ?? [];
  if (p.changes.some((c) => c.target.startsWith("content.")) || textIds.some((id) => planTargets(p, id))) changes.add("text");
  const preserve = p.preserve.filter((x) => !changes.has(x));
  return { plan: { ...p, base_version_id: baseId, borrow, preserve }, notes };
}

/** План из одного патча настроек (кнопка Render, `POST /scenes/:id/render`): геометрия — путь spec (H8). */
export function planFromPatch(patch: Partial<Settings>, baseId: string): EditPlan {
  const path = touchesGeometry(patch) ? "spec" : "param";
  return {
    base_version_id: baseId,
    path,
    changes: Object.entries(patch).map(([k, v]) => ({ target: `settings.${k}`, kind: path, description: `${k} = ${JSON.stringify(v)}` })),
    borrow: [],
    preserve: path === "param" ? ["composition", "text"] : [],
    reply: "Применяю новые настройки сцены.",
  };
}

/** Настройки правки кода: патч, длительность × timing_scale, стиль из param_patch. */
function codeSettings(base: Settings, plan: EditPlan, patch: Partial<Settings>): Settings {
  const s: Settings = { ...base, ...patch };
  if (plan.timing_scale !== undefined) s.duration_frames = Math.max(1, Math.round(s.duration_frames * plan.timing_scale));
  const st = plan.param_patch?.style;
  if (st?.preset) s.style_preset = st.preset;
  if (st?.intensity) s.animation_intensity = st.intensity;
  if (st?.transparent !== undefined) s.transparent_export = st.transparent;
  return SettingsSchema.parse(s);
}

/** Изменение плана нацелено на элемент `id` (цель — сам id или путь с ним: `badge`, `elements.badge`). */
const planTargets = (plan: EditPlan, id: string) => plan.changes.some((c) => c.target.split(/[^\p{L}\p{N}_-]+/u).includes(id));

/**
 * Что Director обещал не трогать (`preserve`): раскладка и тексты элементов базы
 * возвращаются в spec (Engineer spec не правит — исправить это в цикле было бы некому).
 * Элемент базы с раскладкой, которого нет в новом spec (M-R1): правка нацелена на него — убран
 * по плану (`dropped`, сверка композиции его не ждёт); иначе при `composition` он возвращается из
 * базы вместе с местом в битах (бит с тем же id, иначе — наибольшее пересечение по кадрам) и
 * фазах — Engineer этого не исправит, и каждая попытка цикла падала бы на одной и той же сверке.
 */
function keepFromBase(spec: MotionSpec, base: MotionSpec, plan: EditPlan): { spec: MotionSpec; restored: string[]; dropped: string[] } {
  const preserve = plan.preserve;
  const byId = new Map(base.elements.map((e) => [e.id, e]));
  const restored: string[] = [];
  const dropped: string[] = [];
  const elements = spec.elements.map((e) => {
    const b = byId.get(e.id);
    if (!b) return e;
    let next = e;
    if (preserve.includes("composition") && b.layout && checkPreserve(base, { ...spec, elements: [e] }, undefined, undefined, ["composition"]).some((x) => x.area === e.id)) {
      next = { ...next, layout: { ...b.layout } };
      restored.push(`${e.id}: раскладка`);
    }
    if (preserve.includes("text") && e.kind === "text" && b.kind === "text" && JSON.stringify(e.content) !== JSON.stringify(b.content)) {
      next = { ...next, content: structuredClone(b.content) };
      restored.push(`${e.id}: текст`);
    }
    return next;
  });
  let beats = spec.beats;
  let phases = spec.phases;
  const ids = new Set(spec.elements.map((e) => e.id));
  for (const b of base.elements) {
    if (!b.layout || ids.has(b.id)) continue;
    if (planTargets(plan, b.id)) {
      dropped.push(b.id);
      continue;
    }
    if (!preserve.includes("composition")) continue;
    // бит элемента в базе → бит нового spec: тот же id, иначе наибольшее пересечение по кадрам
    const homes = base.beats.filter((x) => x.element_ids.includes(b.id)).map((hb) => {
      const same = beats.find((x) => x.id === hb.id);
      if (same) return same.id;
      const overlap = (x: (typeof beats)[number]) => Math.min(x.end_frame, hb.end_frame) - Math.max(x.start_frame, hb.start_frame);
      return [...beats].sort((x, y) => overlap(y) - overlap(x))[0]?.id;
    });
    const target = new Set(homes.filter((x): x is string => x !== undefined));
    if (target.size === 0) {
      restored.push(`${b.id}: убран Director — не возвращён (в базе он не стоял в битах)`);
      continue;
    }
    elements.push(structuredClone(b));
    ids.add(b.id);
    beats = beats.map((x) => (target.has(x.id) && !x.element_ids.includes(b.id) ? { ...x, element_ids: [...x.element_ids, b.id] } : x));
    const basePhases = new Set(base.phases?.filter((p) => p.element_ids.includes(b.id)).map((p) => p.id));
    phases = phases?.map((p) => (basePhases.has(p.id) && !p.element_ids.includes(b.id) ? { ...p, element_ids: [...p.element_ids, b.id] } : p));
    restored.push(`${b.id}: возвращён (Director его убрал)`);
  }
  return { spec: { ...spec, elements, beats, ...(phases ? { phases } : {}) }, restored, dropped };
}

/** Строки текста элементов spec (для сверки кадра hold: убранный по плану текст не ждём). */
function elementTexts(spec: MotionSpec, ids: string[]): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const e of spec.elements) if (ids.includes(e.id)) walk(e.content);
  return out;
}

/** Заголовок первого вызова Engineer в правке кода: копия базы и что менять. */
/** F7: ограничение длительности сцены сценария для Engineer. */
function durationBrief(planned: number | undefined): string {
  return planned === undefined ? "" : `\n\n## Длительность\nДлительность сцены фиксирована планом сценария: ${planned} кадров — \`duration_frames\` в spec и props.timing не меняй; темп меняй внутри сцены.`;
}

function editBrief(plan: EditPlan, baseNumber: number): string {
  return [
    `# Правка версии ${baseNumber}`,
    `В текущем каталоге — копия сцены версии ${baseNumber} (src/ и props.json), spec.json уже обновлён под правку. Внеси правку в существующий код: не переписывай сцену с нуля и не меняй то, что правка не трогает.`,
    "",
    "## Что изменить",
    ...plan.changes.map((c) => `- ${c.target} (${c.kind}): ${c.description}`),
    ...(plan.preserve.length > 0 ? ["", `## Сохранить как в базе: ${plan.preserve.join(", ")}`] : []),
    ...(plan.preserve.includes("composition") ? ["Композиция: `layout` в props.json и координаты в коде — как в базе; пайплайн сверит раскладку props и кадр hold с базой (± 2 % кадра)."] : []),
    ...(plan.preserve.includes("composition") && !plan.preserve.includes("text") ? ["Новый текст может стать шире или перенестись на другую строку — это не нарушение композиции: якорь подписи (левый край, центр или правый край по выравниванию и верх) оставь как в базе; новый текст не откатывай."] : []),
    ...(plan.timing_scale !== undefined && plan.timing_scale !== 1
      ? ["", `## Темп × ${Math.round(plan.timing_scale * 1000) / 1000}`, "Биты spec уже пересчитаны. Кадровые величины props.content (`travel`, `delay`, `stagger`, `hold`, `frame`, `enterAt`, `until`, `at`, `duration`, `flash`, `writes`, `frames`, `*_frames`, `*At`) умножь на тот же множитель; кадры числом в коде (`until={150}`) вынеси в props.content под этими ключами."]
      : []),
    ...(plan.param_patch ? ["", "## Параметры (props.json)", "```json", JSON.stringify(plan.param_patch, null, 2), "```"] : []),
  ].join("\n");
}

/**
 * Окно речи сцены сценария (S5 fix M3): `lead`/`tail` из входа `script` последней генерации
 * сцены, речь — остаток длины правки. Сцена не сценарная (или окна нет) — `undefined`.
 */
export function scriptSpeechWindow(db: Db, sceneId: string, total: number): SpeechWindow | undefined {
  const c = scriptContextOf(db, sceneId);
  if (!c) return undefined;
  const speech = total - c.lead_frames - c.tail_frames;
  return speech > 0 ? { lead: c.lead_frames, speech, tail: c.tail_frames } : undefined;
}

/**
 * S16a F7: длительность сцены сценария по плану — `frames.total` сцены плана из входа `script`
 * генерации: по текущей ревизии того же плана (ревью M3: «скорость чтения» после генерации), а если
 * сцены там нет — по ревизии генерации; ревизии или сцены нет, файл не читается — `undefined`
 * (длительность не фиксируется).
 */
export function scriptPlannedFrames(db: Db, root: string, c: ScriptSceneContext): number | undefined {
  const at = (rev: number): number | undefined => {
    const row = plans.revision(db, c.plan_id, rev);
    if (!row) return undefined;
    try {
      const doc = ScriptPlanRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
      return doc.items.find((x) => x.id === c.item_id && x.status === "accepted")?.frames.total;
    } catch {
      return undefined;
    }
  };
  const current = plans.get(db, c.plan_id)?.current_revision;
  return (current !== undefined && current !== null && current !== c.plan_revision ? at(current) : undefined) ?? at(c.plan_revision);
}

/** S16a F7: длительность версии сцены сценария не по плану — blocking `duration_changed`. */
export function durationChecks(v: { spec: MotionSpec; settings: Settings }, planned: number): QAIssue[] {
  const got = v.settings.duration_frames !== planned ? v.settings.duration_frames : v.spec.duration_frames;
  if (got === planned) return [];
  return [{
    source: "programmatic", code: "duration_changed", severity: "blocking",
    description: `длительность сцены ${got} кадров вместо ${planned} по плану сценария — клип не встанет на свою фразу`,
    fix_hint: `верни duration_frames = ${planned} в spec и props.timing; темп меняй внутри сцены (биты, задержки), не её длиной`,
  }];
}

/** Вход `script` последней генерации сцены с ним (сцена сценария); нет — `undefined`. */
export function scriptContextOf(db: Db, sceneId: string): ScriptSceneContext | undefined {
  const gens = jobs.list(db, { sceneId }).filter((j) => j.type === "playground.generate").reverse();
  for (const j of gens) {
    const p = ScriptSceneContextSchema.safeParse((j.input as { script?: unknown } | null)?.script);
    if (p.success) return p.data;
  }
  return undefined;
}

export function playgroundEdit(d: PlaygroundDeps): JobHandler {
  return async (ctx) => {
    const fail = (message: string, stage: "prepare" | "edit_planner" = "prepare"): HandlerResult => ({ status: "failed", error: { code: "pipeline", stage, message } });
    const parsed = PlaygroundEditInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return fail(`вход playground.edit не годится: ${parsed.error.message}`);
    const input = parsed.data;
    const { sceneId } = input;
    // замок сцены взят по job.scene_id (M3): писать в другую сцену — гонка с её генерацией
    if (ctx.job.scene_id !== sceneId) return fail(`input.sceneId ${sceneId} не совпадает с scene_id задачи ${ctx.job.scene_id ?? "—"}`);
    const root = d.repo.root;
    const scene = scenes.get(ctx.db, sceneId);
    if (!scene) return fail(`сцены нет: ${sceneId}`);
    const message = input.messageId ? chat.list(ctx.db, sceneId).find((m) => m.id === input.messageId)?.text : undefined;
    if (input.messageId && message === undefined) return fail(`сообщения ${input.messageId} нет в чате сцены`);
    const patch = { ...(input.settings_patch ?? {}) } as Partial<Settings>;
    if (!input.plan && message === undefined && Object.keys(patch).length === 0) return fail("правка без сообщения, плана и патча настроек");
    // S16a F7: сцена сценария — длительность фиксирована планом (клип стоит на своей фразе)
    const scriptCtx = scriptContextOf(ctx.db, sceneId);
    const planned = scriptCtx ? scriptPlannedFrames(ctx.db, d.repo.root, scriptCtx) : undefined;
    const lockNotes: string[] = [];
    const lockNote = (fps: { num: number; den: number }) =>
      `Длительность сцены сценария фиксирована планом: ${planned} кадров (${(((planned ?? 0) * fps.den) / fps.num).toFixed(1).replace(".", ",")} с) — темп меняется внутри сцены, не её длиной.`;
    if (planned !== undefined && patch.duration_frames !== undefined && patch.duration_frames !== planned) {
      delete patch.duration_frames;
      lockNotes.push("lock");
    }

    const sceneRow = (id: string | undefined) => {
      const r = id ? versions.get(ctx.db, id) : undefined;
      return r && r.scene_id === sceneId ? r : undefined;
    };
    const baseId = input.baseVersionId ?? sceneRow(input.plan?.base_version_id)?.id ?? scene.current_version_id ?? undefined;
    const startRow = sceneRow(baseId);
    if (!startRow) return fail(`базовой версии нет у сцены ${sceneId}: ${baseId ?? "у сцены нет текущей версии"}`);
    if (startRow.status !== "ready" || startRow.broken_reason) return fail(`база правки ${startRow.id} (v${startRow.number}) не готова: ${startRow.broken_reason ?? startRow.status}`);
    let base: Base;
    try {
      base = await loadBase(root, startRow);
    } catch (e) {
      return fail(`база правки ${startRow.id} не прочитана: ${errText(e)}`);
    }
    const history = versionHistoryDigest(ctx.db, root, sceneId);
    const jobId = ctx.job.id;
    const fence = { jobId, attempt: ctx.attempt };
    const prompt = message ?? input.plan?.reply ?? `настройки: ${JSON.stringify(patch)}`;
    const qaPrompt = `${rootPrompt(ctx.db, startRow)}\n\nПравка: ${prompt}`;
    const gd = d.deps(ctx);

    const steps: Partial<Record<"edit_planner" | "motion_director", StepRef>> = {};
    const stepRefs = () => ({ ...(steps.edit_planner ? { edit_planner: steps.edit_planner } : {}), ...(steps.motion_director ? { director: steps.motion_director } : {}) });
    const cp: CheckpointOpts = {
      jobId,
      onStep: (role, ref) => {
        if (role !== "edit_planner" && role !== "motion_director") return;
        steps[role] = ref;
        try {
          setOutputRefs(ctx.db, jobId, ctx.attempt, { steps: stepRefs() });
        } catch {
          // журнал шагов — не причина ронять попытку
        }
      },
    };
    let final: EditPlan | undefined;
    let notes: string[] = [];
    /**
     * «Сохрани композицию» — ещё и кадр hold базы и правки по реестру раскладки (`09` §4).
     * Другой размер кадра (путь spec) — позиции в px несравнимы, сверки кадра нет.
     */
    const holdFor = (preserve: EditPlan["preserve"], next: Settings, removed: string[] = []): Pick<EditRequest, "preserveHold"> => {
      const s = base.row.settings;
      if (!preserve.includes("composition") || s.width !== next.width || s.height !== next.height) return {};
      return { preserveHold: { versionDir: base.dir, settings: s, check: (a, b, size) => compareHoldLayout(a, b, size, 0.02, { removed }) } };
    };

    const planEdit = async (rc: RunCtx): Promise<PlanOutcome> => {
      // --- 1. План: готовый, из патча или от Edit Planner ---
      let raw: EditPlan;
      if (input.plan) raw = input.plan;
      else if (message === undefined) raw = planFromPatch(patch, base.row.id);
      else {
        ctx.progress(0.05, "edit_planner");
        const r = await toolless(rc, "edit_planner", "edit_planner", "Edit Planner", (workdir) =>
          buildEditPlannerTask({ message, current: { version_id: base.row.id, spec: base.spec, props: base.props, settings: base.row.settings }, history, workdir }, rc.taskRun), EditPlanSchema, cp);
        if (!r.ok) return { kind: "failed", stage: r.stage, message: r.message };
        raw = r.output;
        // Edit Planner вправе выбрать основой другую готовую версию, если её назвал пользователь
        const chosen = !input.baseVersionId && raw.base_version_id !== base.row.id ? sceneRow(raw.base_version_id) : undefined;
        if (chosen && chosen.status === "ready" && !chosen.broken_reason) {
          try {
            base = await loadBase(root, chosen);
            rc.log(`Edit Planner: основа — версия ${chosen.number}`);
          } catch (e) {
            rc.warnings.push(`основа Edit Planner ${chosen.id} не прочитана (${errText(e)}) — остаётся версия ${base.row.number}`);
          }
        }
      }
      // F7: «медленнее/быстрее» у сцены сценария — не длина, а темп внутри: Director перестроит биты в той же длительности
      if (planned !== undefined && raw.timing_scale !== undefined && raw.timing_scale !== 1) {
        const k = Math.round(raw.timing_scale * 1000) / 1000;
        const { timing_scale: _scale, ...rest } = raw;
        void _scale;
        raw = {
          ...rest, path: raw.path === "param" ? "spec" : raw.path,
          changes: [...raw.changes.map((c) => (raw.path === "param" ? { ...c, kind: "spec" as const } : c)),
            { target: "timing", kind: "spec", description: `темп × ${k} внутри сцены: длительность ${planned} кадров (план сценария) не меняется` }],
        };
        lockNotes.push("lock");
      }
      if (touchesGeometry(patch) && raw.path === "param") raw = { ...raw, path: "spec", changes: raw.changes.map((c) => ({ ...c, kind: "spec" })) };
      const norm = normalizePlan(raw, base.row.id, history, patch, base.spec);
      let plan = norm.plan;
      notes = [...norm.notes, ...(lockNotes.length > 0 ? [lockNote(base.row.settings.fps)] : [])];
      for (const n of notes) rc.warnings.push(n);
      rc.log(`план правки: ${plan.path}; ${plan.changes.map((c) => c.target).join(", ") || "—"}${plan.preserve.length > 0 ? `; сохранить: ${plan.preserve.join(", ")}` : ""}`);
      const baseCaps = base.selection.items.map((i) => gd.kb.getCapability(i.kb_id)).filter((v): v is CapabilityView => v !== undefined);
      const common = { baseVersionId: base.row.id, baseDir: base.dir, qaPrompt } satisfies Partial<EditRequest>;

      // --- 2. Путь param: props без агентов кода ---
      if (plan.path === "param") {
        let r: ReturnType<typeof applyParamEdit>;
        try {
          r = applyParamEdit({ spec: base.spec, props: base.props, settings: base.row.settings }, plan, history, patch);
        } catch (e) {
          return { kind: "failed", stage: "edit_planner", message: `план правки не применить: ${errText(e)}` };
        }
        if (r.kind === "param") {
          final = plan;
          const pr = plan.preserve;
          const baseSpec = base.spec;
          const baseProps = base.props;
          rc.log(`правка параметров: ${r.changed.join(", ") || "без изменений"}`);
          for (const w of r.warnings) rc.warnings.push(w);
          if (r.spec.duration_frames !== base.spec.duration_frames) {
            const hard = await codeFramesOf(base.dir);
            if (hard.length > 0) rc.warnings.push(`Темп изменён параметрами, но в коде сцены кадры заданы числом (${hard.join(", ")}) — эти моменты не масштабированы; держи их в props.content под кадровыми ключами.`);
          }
          return {
            kind: "plan",
            director: { selection: base.selection, rationale: `правка параметров версии ${base.row.number}` },
            spec: r.spec,
            candidates: baseCaps,
            settings: r.settings,
            edit: { ...common, plan, props: JSON.stringify(r.props, null, 2) + "\n", preserveCheck: (props, spec) => checkPreserve(baseSpec, spec, baseProps, props, pr, 0.02, { size: r.settings }), ...holdFor(pr, r.settings) },
          };
        }
        rc.warnings.push(`правка параметрами невозможна (${base.props === undefined ? "нет props.json" : "props базы не по контракту или заимствуется раскладка/типографика"}) — путь ${r.plan.path}`);
        plan = r.plan;
      }

      // --- 3. Путь spec/code: Director (база + план) → Engineer правит копию src/ базы ---
      let settings: Settings;
      try {
        settings = codeSettings(base.row.settings, plan, patch);
        if (planned !== undefined) settings = SettingsSchema.parse({ ...settings, duration_frames: planned });
      } catch (e) {
        return { kind: "failed", stage: "prepare", message: `настройки правки не годятся: ${errText(e)}` };
      }
      const extra = message ? gd.kb.search(message, {}, 8).map((h) => h.view).filter((v) => !baseCaps.some((c) => c.id === v.id)) : [];
      const candidates = [...baseCaps, ...extra];
      const style = sceneStyle(startPropsStyle(settings, base.spec.palette_overrides), settings);
      ctx.progress(0.15, "director");
      // сцена сценария (S5 fix M3): окно речи исходной генерации — и в правке
      const speechWindow = scriptSpeechWindow(ctx.db, sceneId, settings.duration_frames);
      if (speechWindow) rc.log(`сцена сценария: окно речи [${speechWindow.lead}; ${speechWindow.lead + speechWindow.speech}), удержание ≥ ${speechWindow.tail}`);
      const dr = await directorStep(rc, { prompt, settings, candidates, patternTexts: [], kitApi: await readKitApi(), style, base: { spec: base.spec, props: base.props }, editPlan: plan, ...(speechWindow ? { speechWindow } : {}) }, cp);
      if (!dr.ok) return { kind: "failed", stage: dr.stage, message: dr.message };
      const kept = keepFromBase(dr.spec, base.spec, plan);
      if (kept.restored.length > 0) rc.warnings.push(`Director изменил то, что правка обещала сохранить — возвращено из базы: ${kept.restored.join("; ")}`);
      if (kept.dropped.length > 0) rc.log(`убраны по плану: ${kept.dropped.join(", ")} — сверка композиции их не ждёт`);
      // «темп тот же» (M2): биты строит Director, Engineer их не исправит — честное предупреждение
      if (plan.preserve.includes("timing") && checkPreserve(base.spec, kept.spec, undefined, undefined, ["timing"]).length > 0) {
        const n = `Темп не сохранён: Director перестроил тайминги (${base.spec.duration_frames} → ${kept.spec.duration_frames} кадров или границы битов), хотя правка просила оставить темп.`;
        rc.warnings.push(n);
        notes = [...notes, n];
      }
      final = plan;
      // убранное по плану — не часть сохраняемой композиции
      const baseSpec = kept.dropped.length > 0 ? { ...base.spec, elements: base.spec.elements.filter((e) => !kept.dropped.includes(e.id)) } : base.spec;
      const removedTexts = elementTexts(base.spec, kept.dropped);
      const baseProps = base.props;
      // тайминги после Director пересчитаны планировщиком битов — их сверка тут не исправима Engineer
      const loopPreserve = plan.preserve.filter((x) => x !== "timing");
      return {
        kind: "plan",
        director: dr.director,
        spec: kept.spec,
        candidates,
        settings,
        edit: { ...common, plan, brief: editBrief(plan, base.row.number) + durationBrief(planned), preserveCheck: (props, spec) => checkPreserve(baseSpec, spec, baseProps, props, loopPreserve, 0.02, { size: settings }), ...holdFor(loopPreserve, settings, removedTexts) },
      };
    };

    const deps: GenerateDeps = {
      ...gd,
      log: (line) => {
        gd.log?.(line);
        ctx.emit("log", line);
      },
      sceneId,
      projectId: scene.project_id,
      run: { runId: jobId, attempt: ctx.attempt, registry: ctx.run.registry },
      fenceOk: () => ctx.fenceOk() && !ctx.signal.aborted,
      abortReason: () => abortKind(ctx),
      publish: async (draft, meta) => {
        const v = await d.repo.publish(draft, meta, fence);
        return { dir: v.dir, warnings: v.warnings.map((w) => `${w.code}: ${w.message}`), versionId: v.versionId, number: v.manifest.number };
      },
      permits: { agents: ctx.agents, renders: ctx.renders },
      progress: (p, stage) => ctx.progress(p, stage),
    };
    // сцена сценария (I3): проверка наложения с transparent и в правке — как в генерации; F7 — длительность по плану
    const r = await runGeneration(
      {
        prompt, settings: base.row.settings, qa: { allowRestricted: input.allowRestricted ?? false }, keepBrief: true, plan: planEdit,
        ...(scriptCtx ? { extraQa: async (v) => [...(await overlayChecks(v)), ...(planned !== undefined ? durationChecks(v, planned) : [])] } : {}),
      },
      deps,
      ctx.signal,
    );
    d.onResult?.(ctx.job, r);
    record(ctx, root, sceneId, r, (auto) => [final?.reply, ...notes, auto].filter(Boolean).join("\n"));
    const out = toHandlerResult(r, sceneId);
    if (out.status !== "completed") return out;
    return { status: "completed", outputRefs: { ...(out.outputRefs as object), path: final?.path ?? null, base_version_id: final?.base_version_id ?? null, steps: stepRefs() } };
  };
}
