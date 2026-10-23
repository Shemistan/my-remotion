// Обработчик задачи `playground.edit` (P1-13; `04` §3): правка версии через чат или кнопку
// Render. План: готовый (`input.plan`, кнопка Render), из патча настроек или от Edit Planner
// (сбой — этап `edit_planner`). Путь `param` — `applyParamEdit` в draft-копии базы: код базы,
// новый props.json, рендер и QA без Engineer (Engineer — только исправлять). Иначе (или props
// базы не по контракту, M18) — Motion Director (база + план) → Engineer правит копию src/
// базы → gate (props/spec/settings, H4) → QA. Всё после плана — общий движок `runGeneration`:
// тот же цикл исправлений, выбор лучшей попытки, общий бюджет задачи, `stage_wall_ms`. Что
// план обещал сохранить, сверяет `checkPreserve`. Публикация — от базы (`parent_version_id`),
// с `edit_plan` и `changed_files`; ответ Edit Planner — в чат.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ComponentSelectionSchema,
  type EditPlan,
  EditPlanSchema,
  type HistoryEntry,
  type MotionSpec,
  MotionSpecSchema,
  type Settings,
  SettingsFieldsSchema,
  SettingsSchema,
} from "@ms/contracts";
import { z } from "zod";
import { buildEditPlannerTask } from "../agents/prompts.js";
import * as chat from "../db/repos/chat.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { setOutputRefs } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import type { CapabilityView } from "../knowledge/types.js";
import { versionHistoryDigest } from "../scenes/history.js";
import type { StepRef } from "./checkpoints.js";
import { type EditRequest, type GenerateDeps, type PlanOutcome, readKitApi, runGeneration } from "./generate.js";
import { applyParamEdit, touchesGeometry } from "./param-edit.js";
import { type PlaygroundDeps, abortKind, record, toHandlerResult } from "./playground-generate.js";
import { checkPreserve } from "./preserve.js";
import { type CheckpointOpts, type RunCtx, directorStep, errText, scenePropsStyle, sceneStyle, toolless } from "./steps.js";

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

/**
 * План к базе и истории: id базы — фактическая база; заимствование у неудавшейся версии →
 * у первой готовой (Q5), с пояснением; из `preserve` убирается то, что план меняет сам.
 */
export function normalizePlan(p: EditPlan, baseId: string, history: HistoryEntry[]): { plan: EditPlan; notes: string[] } {
  const notes: string[] = [];
  const firstReady = history.find((h) => h.status === "ready");
  const borrow = p.borrow.map((b) => {
    const donor = history.find((h) => h.version_id === b.from_version_id);
    if (!donor || donor.status === "ready" || !firstReady) return b;
    notes.push(`Версия ${donor.number} не удалась, поэтому ${b.what === "palette" ? "палитру" : "параметры"} беру из первой готовой — версии ${firstReady.number}.`);
    return { ...b, from_version_id: firstReady.version_id };
  });
  const changes = new Set<string>();
  if (p.timing_scale !== undefined && p.timing_scale !== 1) changes.add("timing");
  if (borrow.some((b) => b.what === "palette") || p.param_patch?.style?.palette_overrides || p.param_patch?.style?.preset) changes.add("palette");
  if (borrow.some((b) => b.what === "timing")) changes.add("timing");
  if (p.param_patch?.content) changes.add("text");
  const preserve = p.preserve.filter((x) => !changes.has(x));
  return { plan: { ...p, base_version_id: baseId, borrow, preserve }, notes };
}

/** План из одного патча настроек (кнопка Render без плана): геометрия — путь spec. */
function planFromPatch(patch: Partial<Settings>, baseId: string): EditPlan {
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

/**
 * Что Director обещал не трогать (`preserve`): раскладка и тексты элементов базы
 * возвращаются в spec (Engineer spec не правит — исправить это в цикле было бы некому).
 */
function keepFromBase(spec: MotionSpec, base: MotionSpec, preserve: EditPlan["preserve"]): { spec: MotionSpec; restored: string[] } {
  const byId = new Map(base.elements.map((e) => [e.id, e]));
  const restored: string[] = [];
  const elements = spec.elements.map((e) => {
    const b = byId.get(e.id);
    if (!b) return e;
    let next = e;
    if (preserve.includes("composition") && b.layout && checkPreserve(base, { ...spec, elements: [e] }, undefined, undefined, ["composition"]).length > 0) {
      next = { ...next, layout: { ...b.layout } };
      restored.push(`${e.id}: раскладка`);
    }
    if (preserve.includes("text") && e.kind === "text" && b.kind === "text" && JSON.stringify(e.content) !== JSON.stringify(b.content)) {
      next = { ...next, content: structuredClone(b.content) };
      restored.push(`${e.id}: текст`);
    }
    return next;
  });
  return { spec: { ...spec, elements }, restored };
}

/** Заголовок первого вызова Engineer в правке кода: копия базы и что менять. */
function editBrief(plan: EditPlan, baseNumber: number): string {
  return [
    `# Правка версии ${baseNumber}`,
    `В текущем каталоге — копия сцены версии ${baseNumber} (src/ и props.json), spec.json уже обновлён под правку. Внеси правку в существующий код: не переписывай сцену с нуля и не меняй то, что правка не трогает.`,
    "",
    "## Что изменить",
    ...plan.changes.map((c) => `- ${c.target} (${c.kind}): ${c.description}`),
    ...(plan.preserve.length > 0 ? ["", `## Сохранить как в базе: ${plan.preserve.join(", ")}`] : []),
    ...(plan.param_patch ? ["", "## Параметры (props.json)", "```json", JSON.stringify(plan.param_patch, null, 2), "```"] : []),
  ].join("\n");
}

export function playgroundEdit(d: PlaygroundDeps): JobHandler {
  return async (ctx) => {
    const fail = (message: string, stage: "prepare" | "edit_planner" = "prepare"): HandlerResult => ({ status: "failed", error: { code: "pipeline", stage, message } });
    const parsed = PlaygroundEditInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return fail(`вход playground.edit не годится: ${parsed.error.message}`);
    const input = parsed.data;
    const { sceneId } = input;
    const root = d.repo.root;
    const scene = scenes.get(ctx.db, sceneId);
    if (!scene) return fail(`сцены нет: ${sceneId}`);
    const message = input.messageId ? chat.list(ctx.db, sceneId).find((m) => m.id === input.messageId)?.text : undefined;
    if (input.messageId && message === undefined) return fail(`сообщения ${input.messageId} нет в чате сцены`);
    const patch = (input.settings_patch ?? {}) as Partial<Settings>;
    if (!input.plan && message === undefined && Object.keys(patch).length === 0) return fail("правка без сообщения, плана и патча настроек");

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
      if (touchesGeometry(patch) && raw.path === "param") raw = { ...raw, path: "spec", changes: raw.changes.map((c) => ({ ...c, kind: "spec" })) };
      const norm = normalizePlan(raw, base.row.id, history);
      let plan = norm.plan;
      notes = norm.notes;
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
          return {
            kind: "plan",
            director: { selection: base.selection, rationale: `правка параметров версии ${base.row.number}` },
            spec: r.spec,
            candidates: baseCaps,
            settings: r.settings,
            edit: { ...common, plan, props: JSON.stringify(r.props, null, 2) + "\n", preserveCheck: (props, spec) => checkPreserve(baseSpec, spec, baseProps, props, pr) },
          };
        }
        rc.warnings.push(`правка параметрами невозможна (${base.props === undefined ? "нет props.json" : "props базы не по контракту или заимствуется раскладка/типографика"}) — путь ${r.plan.path}`);
        plan = r.plan;
      }

      // --- 3. Путь spec/code: Director (база + план) → Engineer правит копию src/ базы ---
      let settings: Settings;
      try {
        settings = codeSettings(base.row.settings, plan, patch);
      } catch (e) {
        return { kind: "failed", stage: "prepare", message: `настройки правки не годятся: ${errText(e)}` };
      }
      const extra = message ? gd.kb.search(message, {}, 8).map((h) => h.view).filter((v) => !baseCaps.some((c) => c.id === v.id)) : [];
      const candidates = [...baseCaps, ...extra];
      const style = sceneStyle({ ...scenePropsStyle(settings), ...(base.spec.palette_overrides ? { palette_overrides: base.spec.palette_overrides } : {}) }, settings);
      ctx.progress(0.15, "director");
      const dr = await directorStep(rc, { prompt, settings, candidates, patternTexts: [], kitApi: await readKitApi(), style, base: { spec: base.spec, props: base.props }, editPlan: plan }, cp);
      if (!dr.ok) return { kind: "failed", stage: dr.stage, message: dr.message };
      const kept = keepFromBase(dr.spec, base.spec, plan.preserve);
      if (kept.restored.length > 0) rc.warnings.push(`Director изменил то, что правка обещала сохранить — возвращено из базы: ${kept.restored.join("; ")}`);
      final = plan;
      const baseSpec = base.spec;
      const baseProps = base.props;
      // тайминги после Director пересчитаны планировщиком битов — их сверка тут не исправима Engineer
      const loopPreserve = plan.preserve.filter((x) => x !== "timing");
      return {
        kind: "plan",
        director: dr.director,
        spec: kept.spec,
        candidates,
        settings,
        edit: { ...common, plan, brief: editBrief(plan, base.row.number), preserveCheck: (props, spec) => checkPreserve(baseSpec, spec, baseProps, props, loopPreserve) },
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
    const r = await runGeneration(
      { prompt, settings: base.row.settings, qa: { allowRestricted: input.allowRestricted ?? false }, keepBrief: true, plan: planEdit },
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
