// Правка параметров (Task 18, `04` §3): новый props.json без агентов кода — тайминги
// («медленнее на 25 %» → `scaleTiming`), палитра и глубина версии-донора, патч стиля и
// настроек. spec, props и settings меняются согласованно (H4): технический gate сверяет
// `props.timing.duration_frames == spec.duration_frames == settings.duration_frames` и
// `props.style.{preset,intensity,transparent} == settings.*`.
import {
  type EditPlan,
  type HistoryEntry,
  type MotionSpec,
  type ScenePropsBase,
  ScenePropsBaseSchema,
  type Settings,
  scaleContentFrames,
  scaleTiming,
} from "@ms/contracts";

export type ParamEditResult =
  | { kind: "param"; spec: MotionSpec; props: ScenePropsBase; settings: Settings; changed: string[] }
  | { kind: "code"; plan: EditPlan };

/** Поля настроек, которые меняют размер кадра или fps: такая правка идёт через spec (Director). */
export const GEOMETRY_KEYS = ["width", "height", "fps", "aspect_ratio"] as const;

/** Патч настроек меняет геометрию кадра (путь `spec`). */
export const touchesGeometry = (patch: Partial<Settings> | undefined): boolean => GEOMETRY_KEYS.some((k) => patch?.[k] !== undefined);

/** spec с масштабом времени: биты (`scaleTiming`) и ключи камеры. */
function scaleSpec(spec: MotionSpec, factor: number): MotionSpec {
  const s = scaleTiming(spec, factor);
  if (!s.camera) return s;
  return { ...s, camera: s.camera.map((k) => ({ ...k, frame: Math.min(Math.round(k.frame * factor), s.duration_frames) })) };
}

/**
 * Правка параметров копии базы. Вход не меняется. Порядок: патч настроек → заимствования
 * (`borrow`) → `param_patch` (явный патч сильнее заимствования) → время. `kind: "code"` —
 * правку параметрами не сделать: props базы не по контракту (версия среза, M18),
 * заимствуются раскладка или типографика, патч меняет геометрию кадра (`path: "spec"`).
 * Донора нет в истории — ошибка (план ссылается на чужую версию).
 */
export function applyParamEdit(
  base: { spec: MotionSpec; props: unknown; settings: Settings },
  plan: EditPlan,
  history: HistoryEntry[],
  settingsPatch: Partial<Settings> = {},
): ParamEditResult {
  const parsed = ScenePropsBaseSchema.safeParse(base.props);
  if (!parsed.success) return { kind: "code", plan: { ...plan, path: "code" } };
  if (touchesGeometry(settingsPatch)) return { kind: "code", plan: { ...plan, path: "spec" } };
  if (plan.borrow.some((b) => b.what === "layout" || b.what === "typography")) return { kind: "code", plan: { ...plan, path: "code" } };

  let spec: MotionSpec = structuredClone(base.spec);
  const props: ScenePropsBase = structuredClone(parsed.data);
  const settings: Settings = structuredClone(base.settings);
  const changed = new Set<string>();
  // целевая длительность до масштаба: из патча или из базы
  let duration = base.spec.duration_frames;

  const setPreset = (p: Settings["style_preset"]) => {
    props.style.preset = p;
    spec.style_preset = p;
    settings.style_preset = p;
    changed.add("style_preset");
  };
  const setIntensity = (x: Settings["animation_intensity"]) => {
    props.style.intensity = x;
    settings.animation_intensity = x;
    changed.add("intensity");
  };
  const setPalette = (p: NonNullable<ScenePropsBase["style"]["palette_overrides"]>) => {
    props.style.palette_overrides = structuredClone(p);
    spec.palette_overrides = structuredClone(p);
    changed.add("palette");
  };
  const setTransparent = (t: boolean) => {
    props.style.transparent = t;
    settings.transparent_export = t;
    changed.add("transparent");
  };

  // --- патч настроек (кнопка Render) ---
  if (settingsPatch.duration_frames !== undefined) duration = settingsPatch.duration_frames;
  if (settingsPatch.style_preset) setPreset(settingsPatch.style_preset);
  if (settingsPatch.animation_intensity) setIntensity(settingsPatch.animation_intensity);
  if (settingsPatch.transparent_export !== undefined) setTransparent(settingsPatch.transparent_export);
  if (settingsPatch.safe_area) {
    props.style.safe_area = { ...settingsPatch.safe_area };
    settings.safe_area = { ...settingsPatch.safe_area };
    changed.add("safe_area");
  }
  if (settingsPatch.font !== undefined) {
    props.style.font = settingsPatch.font;
    settings.font = settingsPatch.font;
    changed.add("font");
  }
  if (settingsPatch.background !== undefined) settings.background = settingsPatch.background;
  if (settingsPatch.color_palette !== undefined) settings.color_palette = [...settingsPatch.color_palette];

  // --- заимствования из других версий ---
  for (const b of plan.borrow) {
    const donor = history.find((h) => h.version_id === b.from_version_id);
    if (!donor) throw new Error(`правка: версии-донора ${b.from_version_id} нет в истории сцены`);
    if (b.what === "palette") setPalette(donor.palette);
    else if (b.what === "depth") {
      props.style.depth = donor.depth;
      changed.add("depth");
    } else if (b.what === "timing") duration = donor.duration_frames;
  }

  // --- явный патч стиля и контента ---
  const st = plan.param_patch?.style;
  if (st?.preset) setPreset(st.preset);
  if (st?.intensity) setIntensity(st.intensity);
  if (st?.palette_overrides) setPalette(st.palette_overrides);
  if (st?.transparent !== undefined) setTransparent(st.transparent);
  if (st?.depth !== undefined) {
    props.style.depth = st.depth;
    changed.add("depth");
  }
  if (st?.safe_area) {
    props.style.safe_area = { ...st.safe_area };
    settings.safe_area = { ...st.safe_area };
    changed.add("safe_area");
  }
  if (st?.font) {
    props.style.font = st.font;
    settings.font = st.font;
    changed.add("font");
  }
  if (plan.param_patch?.content) {
    props.content = { ...props.content, ...structuredClone(plan.param_patch.content) };
    changed.add("content");
  }

  // --- время: целевая длительность × timing_scale ---
  const factor = (duration / base.spec.duration_frames) * (plan.timing_scale ?? 1);
  if (factor !== 1) {
    spec = scaleSpec(spec, factor);
    const scaled = scaleTiming(props.timing, factor);
    const byId = new Map(spec.beats.map((b) => [b.id, b]));
    // биты props — ровно биты spec (по id); чужие биты props масштабируются сами
    props.timing = {
      duration_frames: spec.duration_frames,
      beats: scaled.beats.map((b) => {
        const s = byId.get(b.id);
        return s ? { id: b.id, start_frame: s.start_frame, end_frame: s.end_frame } : b;
      }),
    };
    // кадровые величины content (travel, stagger, задержки — договор isContentFrameKey):
    // без них «медленнее» удлинило бы только паузы между битами, а движение осталось бы прежним
    props.content = scaleContentFrames(props.content, factor).content;
    settings.duration_frames = spec.duration_frames;
    changed.add("timing");
  }

  return { kind: "param", spec, props: ScenePropsBaseSchema.parse(props), settings, changed: [...changed] };
}
