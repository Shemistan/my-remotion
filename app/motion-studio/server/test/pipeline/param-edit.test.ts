// applyParamEdit (Task 18): правка параметров без агентов кода — тайминги, палитра донора,
// глубина, патч настроек; props версии среза уводят правку в код (M18).
import { describe, expect, it } from "vitest";
import { applyParamEdit } from "../../src/pipeline/param-edit.js";
import { history, plan, props180, settings180, sliceProps, spec180 } from "./edit-fixtures.js";

const v1 = { id: "ver_v1" };

describe("applyParamEdit", () => {
  it("медленнее на 25 % + палитра v1 + глубина 2: spec, props.timing и settings — 240 кадров, палитра донора, depth 2", () => {
    const r = applyParamEdit({ spec: spec180, props: props180, settings: settings180 }, plan({ path: "param", timing_scale: 1 / 0.75, borrow: [{ from_version_id: v1.id, what: "palette" }], param_patch: { style: { depth: 2 } } }), history);
    if (r.kind !== "param") throw new Error("ожидался param");
    expect(r.spec.duration_frames).toBe(240);
    expect(r.props.timing.duration_frames).toBe(240);
    expect(r.settings.duration_frames).toBe(240);
    expect(r.props.style.palette_overrides).toEqual(history[0]!.palette);
    expect(r.spec.palette_overrides).toEqual(history[0]!.palette);
    expect(r.props.style.depth).toBe(2);
    // границы битов × 4/3 ± 1 кадр, props.timing.beats = биты spec
    r.spec.beats.forEach((b, i) => expect(Math.abs(b.end_frame - Math.round(spec180.beats[i]!.end_frame / 0.75))).toBeLessThanOrEqual(1));
    expect(r.props.timing.beats).toEqual(r.spec.beats.map((b) => ({ id: b.id, start_frame: b.start_frame, end_frame: b.end_frame })));
    // ключи камеры — тоже
    expect(r.spec.camera!.map((k) => k.frame)).toEqual([0, 200]);
    expect(r.changed).toEqual(expect.arrayContaining(["timing", "palette", "depth"]));
    // вход не меняется
    expect(spec180.duration_frames).toBe(180);
    expect(props180.style.depth).toBe(1);
  });

  it("props версии среза (не ScenePropsBase) → kind code, path code (M18)", () => {
    const r = applyParamEdit({ spec: spec180, props: sliceProps, settings: settings180 }, plan({ path: "param", timing_scale: 2 }), history);
    expect(r.kind).toBe("code");
    if (r.kind === "code") expect(r.plan.path).toBe("code");
  });

  it("settingsPatch: duration_frames 240, style_preset, animation_intensity → props, spec и settings согласованы (H4)", () => {
    const r = applyParamEdit({ spec: spec180, props: props180, settings: settings180 }, plan({ path: "param", changes: [] }), history, { duration_frames: 240, style_preset: "light-clean", animation_intensity: "calm" });
    if (r.kind !== "param") throw new Error("ожидался param");
    expect([r.spec.duration_frames, r.props.timing.duration_frames, r.settings.duration_frames]).toEqual([240, 240, 240]);
    expect([r.spec.style_preset, r.props.style.preset, r.settings.style_preset]).toEqual(["light-clean", "light-clean", "light-clean"]);
    expect([r.props.style.intensity, r.settings.animation_intensity]).toEqual(["calm", "calm"]);
  });

  it("param_patch.style.intensity и palette_overrides → props, settings и spec; content сливается", () => {
    const r = applyParamEdit({ spec: spec180, props: props180, settings: settings180 }, plan({ param_patch: { style: { intensity: "energetic", palette_overrides: { accent: ["#a06bff"] } }, content: { title: "Агент" } } }), history);
    if (r.kind !== "param") throw new Error("ожидался param");
    expect(r.settings.animation_intensity).toBe("energetic");
    expect(r.props.style.intensity).toBe("energetic");
    expect(r.props.style.palette_overrides).toEqual({ accent: ["#a06bff"] });
    expect(r.props.content).toEqual({ title: "Агент" });
  });

  it("донора нет в истории — ошибка; заимствование раскладки или типографики — код", () => {
    expect(() => applyParamEdit({ spec: spec180, props: props180, settings: settings180 }, plan({ borrow: [{ from_version_id: "ver_nope", what: "palette" }] }), history)).toThrow(/ver_nope/);
    expect(applyParamEdit({ spec: spec180, props: props180, settings: settings180 }, plan({ borrow: [{ from_version_id: "ver_v1", what: "layout" }] }), history).kind).toBe("code");
  });

  it("borrow depth и timing — из донора", () => {
    const h = [{ ...history[0]!, depth: 3 as const, duration_frames: 240 }, history[1]!];
    const r = applyParamEdit({ spec: spec180, props: props180, settings: settings180 }, plan({ borrow: [{ from_version_id: "ver_v1", what: "depth" }, { from_version_id: "ver_v1", what: "timing" }] }), h);
    if (r.kind !== "param") throw new Error("ожидался param");
    expect(r.props.style.depth).toBe(3);
    expect(r.settings.duration_frames).toBe(240);
  });
});
