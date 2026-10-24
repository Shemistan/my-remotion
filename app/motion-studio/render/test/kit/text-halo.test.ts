// Ореол текста в transparent-режиме (S6, Р18): тень цвета palette.bg — текст читается поверх
// светлого и тёмного видео; без transparent kit не меняется.
import { describe, expect, it } from "vitest";
import { posterStyle } from "../../src/motion-kit/choreo/enter.js";
import { HALO_VAR, dimText, haloLayerStyle, textHalo, withHalo } from "../../src/motion-kit/style/halo.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";
import { presets } from "../../src/motion-kit/presets.js";
import { alpha, luminance, mix } from "../../src/motion-kit/tokens.js";

const dark = (transparent: boolean) => resolveStyle({ preset: "dark-premium", intensity: "balanced", transparent });
const light = (transparent: boolean) => resolveStyle({ preset: "light-clean", intensity: "balanced", transparent });

describe("textHalo", () => {
  it("transparent: text-shadow цвета palette.bg (тёмный у тёмного пресета, светлый у светлого)", () => {
    const d = textHalo(dark(true))!;
    expect(d).toContain(alpha(dark(true).palette.bg, 0.9));
    const l = textHalo(light(true))!;
    expect(l).toContain(alpha(light(true).palette.bg, 0.9));
    // ореол вокруг глифа без сдвига плюс мягкая подложка: в em — растёт с кеглем
    expect(d).toMatch(/^0 0 [\d.]+em /);
  });

  it("без transparent — ореола нет", () => {
    expect(textHalo(dark(false))).toBeUndefined();
    expect(textHalo(light(false))).toBeUndefined();
  });
});

describe("haloLayerStyle: слой StyleProvider", () => {
  it("transparent: display contents (раскладка не меняется), наследуемый text-shadow и переменная ореола", () => {
    const st = haloLayerStyle(dark(true))!;
    expect(st.display).toBe("contents");
    expect(st.textShadow).toBe(textHalo(dark(true)));
    expect((st as Record<string, unknown>)[HALO_VAR]).toBe(textHalo(dark(true)));
  });
  it("без transparent — слоя нет (DOM сцены прежний)", () => {
    expect(haloLayerStyle(dark(false))).toBeNull();
  });
});

describe("withHalo: своя тень компонента не гасит ореол", () => {
  it("transparent: ореол через переменную + своя тень", () => {
    expect(withHalo(dark(true), "0 4px 18px #000")).toBe(`var(${HALO_VAR}), 0 4px 18px #000`);
    expect(withHalo(dark(true), undefined)).toBe(`var(${HALO_VAR})`);
  });
  it("без transparent — тень как была", () => {
    expect(withHalo(dark(false), "0 4px 18px #000")).toBe("0 4px 18px #000");
    expect(withHalo(dark(false), undefined)).toBeUndefined();
  });
});

it("силуэт кадра-постера гасит ореол (прозрачные глифы не оставляют теней)", () => {
  const sil = posterStyle("silhouette", 0) as Record<string, unknown>;
  expect(sil.textShadow).toBe("none");
  expect(sil[HALO_VAR]).toBe("0 0 0 transparent");
});

describe("читаемость в transparent (ревью S6)", () => {
  it("(c) плотный внутренний ореол: первый слой 0.08em, bg 0.9", () => {
    expect(textHalo(dark(true))!.startsWith(`0 0 0.08em ${alpha(dark(true).palette.bg, 0.9)}`)).toBe(true);
  });

  it("(a) muted (подписи, оси, тики) ближе к text: mix(muted, text, 0.5); без transparent — как в пресете", () => {
    for (const id of ["dark-premium", "light-clean"] as const) {
      const p = presets[id].palette;
      const on = resolveStyle({ preset: id, intensity: "balanced", transparent: true });
      const off = resolveStyle({ preset: id, intensity: "balanced" });
      expect(on.palette.muted, id).toBe(mix(p.muted, p.text, 0.5));
      expect(off.palette.muted, id).toBe(p.muted);
      // контраст подписи с ореолом (bg) вырос
      expect(Math.abs(luminance(on.palette.muted) - luminance(p.bg))).toBeGreaterThan(Math.abs(luminance(p.muted) - luminance(p.bg)));
    }
    // правка палитры проекта тоже приглушается мягче
    const o = resolveStyle({ preset: "dark-premium", intensity: "balanced", transparent: true, palette_overrides: { muted: "#666666", text: "#ffffff" } });
    expect(o.palette.muted).toBe(mix("#666666", "#ffffff", 0.5));
  });

  it("(b) dimText: в transparent приглушение цветом к muted (не к bg — глиф не сливается с ореолом), opacity 1; без transparent — opacity", () => {
    const on = dark(true);
    expect(dimText(on, "#ffffff", 0.4)).toEqual({ color: mix("#ffffff", on.palette.muted, 0.4), opacity: 1 });
    // muted — нижняя граница: приглушённая подпись не темнее muted
    expect(dimText(on, on.palette.muted, 0.35).color).toBe(mix(on.palette.muted, on.palette.muted, 0.35));
    expect(dimText(dark(false), "#ffffff", 0.4)).toEqual({ color: "#ffffff", opacity: 0.6 });
    expect(dimText(on, "#ffffff", 0)).toEqual({ color: "#ffffff", opacity: 1 });
  });
});
