// Task 36 (Р-V5): прозрачные props — общие для альфа-экспорта S6 и прозрачных размещений таймлайна.
import { describe, expect, it } from "vitest";
import { overlayInputProps } from "../../src/node/overlay-props.js";

const base = {
  timing: { duration_frames: 90, beats: [{ id: "a", start_frame: 0, end_frame: 90 }] },
  style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false },
  content: { title: "x" },
};

describe("overlayInputProps", () => {
  it("ScenePropsBase → style.transparent = true, остальное как было, вход не меняется", () => {
    const input = structuredClone(base);
    const out = overlayInputProps(input);
    expect(out).toEqual({ ...base, style: { ...base.style, transparent: true } });
    expect(input).toEqual(base);
  });

  it("уже прозрачные и с layout.rect — без изменений по смыслу", () => {
    const p = { ...base, style: { ...base.style, transparent: true }, layout: { rect: { x: 0.04, y: 0.7, w: 0.92, h: 0.24 } } };
    expect(overlayInputProps(p)).toEqual(p);
  });

  it("props вне договора ScenePropsBase — overlay_unsupported", () => {
    expect(overlayInputProps({ title: "срез" })).toEqual({ error: "overlay_unsupported" });
    expect(overlayInputProps({ ...base, extra: 1 })).toEqual({ error: "overlay_unsupported" });
  });
});
