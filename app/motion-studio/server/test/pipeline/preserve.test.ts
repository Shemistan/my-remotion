// checkPreserve (Task 18): что правка обещала сохранить — композиция (± 2 % кадра), палитра,
// тексты, тайминги.
import { describe, expect, it } from "vitest";
import { checkPreserve } from "../../src/pipeline/preserve.js";
import { moved, props180, spec180 } from "./edit-fixtures.js";

const p = props180;

describe("checkPreserve", () => {
  it("composition: сдвиг на 3 % — blocking composition_changed, на 1,5 % — норма", () => {
    expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.03 }), p, p, ["composition"])[0]).toMatchObject({ code: "composition_changed", severity: "blocking", area: "orch" });
    expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.015 }), p, p, ["composition"])).toEqual([]);
    expect(checkPreserve(spec180, moved(spec180, "user", { y: -0.025 }), p, p, ["composition"])).toHaveLength(1);
    // без preserve composition сдвиг не проверяется
    expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.1 }), p, p, [])).toEqual([]);
  });

  it("palette: другая разрешённая палитра — blocking palette_changed; та же — норма", () => {
    const purple = { ...p, style: { ...p.style, palette_overrides: { accent: ["#a06bff"] } } };
    expect(checkPreserve(spec180, spec180, p, purple, ["palette"])[0]).toMatchObject({ code: "palette_changed", severity: "blocking" });
    expect(checkPreserve(spec180, spec180, p, { ...p, style: { ...p.style, depth: 3 } }, ["palette"])).toEqual([]);
  });

  it("text: content текстовых элементов", () => {
    const next = { ...spec180, elements: spec180.elements.map((e) => (e.id === "title" ? { ...e, content: { text: "Другой" } } : e)) };
    expect(checkPreserve(spec180, next, p, p, ["text"])[0]).toMatchObject({ code: "text_changed", area: "title" });
    expect(checkPreserve(spec180, spec180, p, p, ["text"])).toEqual([]);
  });

  it("timing: длительность и границы битов", () => {
    const next = { ...spec180, duration_frames: 240 };
    expect(checkPreserve(spec180, next, p, p, ["timing"])[0]).toMatchObject({ code: "timing_changed" });
  });
});
