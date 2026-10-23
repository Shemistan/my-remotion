// Проверка «сохрани …» правки (Task 18, `04` §3): QA сверяет новую версию с базой по тому,
// что план обещал не трогать. Композиция — положения элементов spec (± tol кадра), палитра —
// разрешённые токены (resolveStyle от props.style, у версии среза — от spec), тексты —
// content текстовых элементов, тайминги — длительность и границы битов.
import { type EditPlan, type MotionSpec, type QAIssue, ScenePropsBaseSchema } from "@ms/contracts";
import { resolveStyle } from "@ms/render";

const issue = (code: string, area: string | undefined, description: string, fix_hint: string): QAIssue => ({
  source: "programmatic", code, severity: "blocking", ...(area ? { area } : {}), description, fix_hint,
});

/** Разрешённая палитра версии: props.style по контракту, иначе пресет и palette_overrides spec. */
export function resolvedPalette(spec: MotionSpec, props: unknown) {
  const p = ScenePropsBaseSchema.safeParse(props);
  if (p.success) return resolveStyle({ preset: p.data.style.preset, intensity: p.data.style.intensity, ...(p.data.style.palette_overrides ? { palette_overrides: p.data.style.palette_overrides } : {}) }).palette;
  return resolveStyle({ preset: spec.style_preset, intensity: "balanced", ...(spec.palette_overrides ? { palette_overrides: spec.palette_overrides } : {}) }).palette;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`;

export function checkPreserve(
  base: MotionSpec,
  next: MotionSpec,
  baseProps: unknown,
  nextProps: unknown,
  preserve: EditPlan["preserve"],
  tol = 0.02,
): QAIssue[] {
  const out: QAIssue[] = [];
  const baseEl = new Map(base.elements.map((e) => [e.id, e]));
  if (preserve.includes("composition")) {
    for (const e of next.elements) {
      const b = baseEl.get(e.id);
      if (!e.layout || !b?.layout) continue;
      const dx = Math.abs(e.layout.x - b.layout.x);
      const dy = Math.abs(e.layout.y - b.layout.y);
      // 1e-9 — запас на сложение долей с плавающей точкой
      if (dx > tol + 1e-9 || dy > tol + 1e-9) {
        out.push(issue(
          "composition_changed", e.id,
          `${e.id} сдвинут: x ${b.layout.x} → ${e.layout.x}, y ${b.layout.y} → ${e.layout.y} (сдвиг ${pct(Math.max(dx, dy))}, допуск ${pct(tol)} кадра)`,
          `верни ${e.id} на место базовой версии: layout.x/y как в базе — правка обещала сохранить композицию`,
        ));
      }
    }
  }
  if (preserve.includes("palette")) {
    const a = resolvedPalette(base, baseProps);
    const b = resolvedPalette(next, nextProps);
    if (!same(a, b)) out.push(issue("palette_changed", undefined, `палитра изменилась: ${JSON.stringify(a)} → ${JSON.stringify(b)}`, "верни palette_overrides и пресет базовой версии — правка обещала сохранить палитру"));
  }
  if (preserve.includes("text")) {
    for (const e of next.elements) {
      const b = baseEl.get(e.id);
      if (e.kind !== "text" || !b || same(b.content, e.content)) continue;
      out.push(issue("text_changed", e.id, `текст ${e.id} изменился: ${JSON.stringify(b.content)} → ${JSON.stringify(e.content)}`, `верни content ${e.id} как в базе — правка обещала сохранить тексты`));
    }
  }
  if (preserve.includes("timing")) {
    const frames = (s: MotionSpec) => [s.duration_frames, ...s.beats.map((b) => [b.id, b.start_frame, b.end_frame])];
    if (!same(frames(base), frames(next))) {
      out.push(issue("timing_changed", undefined, `тайминги изменились: ${base.duration_frames} → ${next.duration_frames} кадров или границы битов`, "верни длительность и границы битов базовой версии — правка обещала сохранить тайминги"));
    }
  }
  return out;
}
