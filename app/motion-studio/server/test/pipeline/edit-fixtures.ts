// Фикстуры правок (Task 18): spec на 180 кадров с раскладкой узлов, props по контракту,
// история версий с палитрами.
import { type EditPlan, type HistoryEntry, type MotionSpec, type ScenePropsBase, type Settings, defaultSettings } from "@ms/contracts";
import { resolveStyle } from "@ms/render";

export const spec180: MotionSpec = {
  title: "Архитектура агента",
  purpose: "показать путь запроса",
  duration_frames: 180,
  fps: { num: 30, den: 1 },
  style_preset: "dark-premium",
  composition: { archetype: "network-centric", idea: "оркестратор в центре", focus: "оркестратор", transitions: "импульсы" },
  elements: [
    { id: "title", kind: "text", role: "заголовок", entrance: "rise", content: { text: "AI-агент" }, layout: { x: 0.1, y: 0.05, w: 0.8, h: 0.1 } },
    { id: "user", kind: "card", role: "node-user", entrance: "pop", content: { text: "Пользователь" }, layout: { x: 0.05, y: 0.4, w: 0.15, h: 0.15 } },
    { id: "orch", kind: "card", role: "node-orchestrator", entrance: "scale", content: { text: "Оркестратор" }, layout: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 } },
  ],
  beats: [
    { id: "b1", start_frame: 0, end_frame: 45, action: "title-entrance", description: "", element_ids: ["title"] },
    { id: "b2", start_frame: 30, end_frame: 120, action: "nodes-enter", description: "", element_ids: ["user", "orch"] },
    { id: "b3", start_frame: 120, end_frame: 150, action: "final-emphasis", description: "", element_ids: ["orch"] },
    { id: "b4", start_frame: 150, end_frame: 180, action: "hold", description: "пульс", element_ids: ["orch"] },
  ],
  camera: [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 150, scale: 1.1, x: 0, y: 0 }],
};

export const settings180: Settings = { ...defaultSettings(), duration_frames: 180 };

export const props180: ScenePropsBase = {
  timing: { duration_frames: 180, beats: spec180.beats.map((b) => ({ id: b.id, start_frame: b.start_frame, end_frame: b.end_frame })) },
  style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false, safe_area: { x: 0.05, y: 0.05 } },
  content: { title: "AI-агент" },
};

/** props версии среза: не ScenePropsBase (M18). */
export const sliceProps = { title: "AI-агент", nodes: 5 };

const purple = { bg: "#120a1f", surface: "#1d1230", text: "#f4efff", muted: "#a596c4", accent: ["#a06bff", "#d18cff", "#7d5cff"], positive: "#7fe0b0", negative: "#ff7a9a" };
const v1Palette = resolveStyle({ preset: "tech-neon", intensity: "balanced" }).palette;

export const history: HistoryEntry[] = [
  { version_id: "ver_v1", number: 1, status: "ready", parent_version_id: null, prompt: "Test 2", palette: v1Palette, depth: 1, duration_frames: 180, qa: null, created_at: "2026-10-23T10:00:00.000Z" },
  { version_id: "ver_v2", number: 2, status: "ready", parent_version_id: "ver_v1", prompt: "фиолетовый", palette: { ...resolveStyle({ preset: "dark-premium", intensity: "balanced" }).palette, ...purple }, depth: 1, duration_frames: 180, qa: null, created_at: "2026-10-23T11:00:00.000Z" },
];

export function plan(over: Partial<EditPlan> = {}): EditPlan {
  return { base_version_id: "ver_v2", path: "param", changes: [{ target: "timing", kind: "param", description: "медленнее" }], borrow: [], preserve: [], reply: "Готово.", ...over };
}

/** Spec, где элемент `id` сдвинут на `d` (доли кадра). */
export function moved(spec: MotionSpec, id: string, d: { x?: number; y?: number }): MotionSpec {
  return {
    ...spec,
    elements: spec.elements.map((e) => (e.id === id && e.layout ? { ...e, layout: { ...e.layout, x: e.layout.x + (d.x ?? 0), y: e.layout.y + (d.y ?? 0) } } : e)),
  };
}
