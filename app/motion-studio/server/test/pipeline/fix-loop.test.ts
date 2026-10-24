// Контракт props в техническом gate (H4) и граница исправлений: без LLM.
import { describe, expect, it } from "vitest";
import { type MotionSpec, defaultSettings } from "@ms/contracts";
import { checkProps } from "../../src/pipeline/fix-loop.js";
import { directorOutput } from "./helpers.js";

const spec: MotionSpec = directorOutput().spec;
const settings = defaultSettings();
const props = (over: Record<string, unknown> = {}, timing: Partial<{ duration_frames: number; beats: unknown[] }> = {}) =>
  JSON.stringify({
    timing: { duration_frames: 180, beats: spec.beats.map((b) => ({ id: b.id, start_frame: b.start_frame, end_frame: b.end_frame })), ...timing },
    style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false },
    content: {},
    ...over,
  });

describe("checkProps (H4)", () => {
  it("props по контракту — без замечаний; props.style — из настроек", () => {
    const r = checkProps(props(), spec, settings);
    expect(r.issues).toEqual([]);
    expect(r.props!.style).toEqual({ preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false, safe_area: settings.safe_area });
  });

  it("props.timing.duration_frames 180 при settings.duration_frames 240 → blocking props_settings_mismatch", () => {
    const long = { ...settings, duration_frames: 240 };
    const r = checkProps(props(), { ...spec, duration_frames: 240 }, long);
    expect(r.issues).toContainEqual(expect.objectContaining({ source: "technical", code: "props_settings_mismatch", severity: "blocking" }));
    expect(r.issues.find((i) => i.code === "props_settings_mismatch")!.description).toContain("props.timing.duration_frames 180 ≠ settings.duration_frames 240");
  });

  it("стиль Engineer не тот, что в настройках, — перезаписывается, а не ломает gate", () => {
    const r = checkProps(props({ style: { preset: "tech-neon", intensity: "calm", transparent: true } }), spec, settings);
    expect(r.issues).toEqual([]);
    expect(r.props!.style).toMatchObject({ preset: "dark-premium", intensity: "balanced", transparent: false });
  });

  it("не JSON, нет файла, лишнее поле — blocking props_contract", () => {
    expect(checkProps("{oops", spec, settings).issues[0]).toMatchObject({ code: "props_contract", severity: "blocking" });
    expect(checkProps(undefined, spec, settings).issues[0]).toMatchObject({ code: "props_contract", severity: "blocking" });
    expect(checkProps(props({ extra: 1 }), spec, settings).issues[0]).toMatchObject({ code: "props_contract", severity: "blocking" });
  });

  it("биты props расходятся со spec — warning props_timing (gate не останавливает)", () => {
    const r = checkProps(props({}, { beats: [{ id: "b1", start_frame: 0, end_frame: 40 }] }), spec, settings);
    expect(r.issues).toEqual([expect.objectContaining({ code: "props_timing", severity: "warning" })]);
    expect(r.props).toBeDefined();
  });
});
