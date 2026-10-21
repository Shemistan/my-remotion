// Регрессия ложных срабатываний на РЕАЛЬНЫХ кадрах рендера (ревью Task 16, раунд 1).
// fixtures/qa-frames/*.png — кадры 1920×1080 из рендеров render/test/fixtures, уменьшенные
// вдвое (усреднение 2×2): tech-neon `patterns-gallery` (варианты code: сетка пола у краёв,
// карточка у границы safe area) и `choreo-gallery` кадр 16 (тёмный пресет, видимый текст).
// `clipped-text-67.png` — кадр фикстуры qa-scenes/clipped-text (960×540, как есть): край
// срезает букву по касательной — обрезка должна ловиться и так.
// Кадры среза — docs/evidence/phase-1/slice/test{1,2}/frames (960×540, как есть).
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MotionSpecSchema, type QAIssue, type Settings, SettingsSchema, defaultSettings } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
import { describe, expect, it } from "vitest";
import { selectQaFrames, uncoveredElements } from "../../src/pipeline/qa-frames.js";
import { loadPng, lumaStats } from "../../src/qa/image.js";
import { programmaticChecks } from "../../src/qa/programmatic.js";
import { beat, renderResult, spec } from "./helpers.js";

const FRAMES = fileURLToPath(new URL("../fixtures/qa-frames/", import.meta.url));
const SLICE = fileURLToPath(new URL("../../../../../docs/evidence/phase-1/slice/", import.meta.url));
const codes = (l: QAIssue[]) => l.map((i) => `${i.code}:${i.severity}`);

/** Настройки кадров kit-галерей после уменьшения: 960×540, поля 6 % × 8 %. */
const kitSettings = (style_preset: Settings["style_preset"]): Settings => ({
  ...defaultSettings(), width: 960, height: 540, style_preset, safe_area: { x: 0.06, y: 0.08 },
});

/** Один кадр внутри бита после входа первого бита. */
async function single(file: string, settings: Settings) {
  const sp = spec({ beats: [beat("b0", 0, 10, ["a"]), beat("b1", 10, 200, ["a"], "hold")] });
  return programmaticChecks({
    frames: [{ frame: 100, path: FRAMES + file }], spec: sp, settings,
    style: resolveStyle({ preset: settings.style_preset, intensity: settings.animation_intensity }),
    render: renderResult(), previewBytes: 1000,
  });
}

describe("реальные кадры kit: без ложных clipping / safe_area / blank", () => {
  it.each(readdirSync(FRAMES).filter((f) => f.startsWith("tech-neon-code")))("%s", async (file) => {
    expect(codes(await single(file, kitSettings("tech-neon")))).toEqual([]);
  });

  it("choreo-gallery кадр 16 (тёмный пресет, текст виден) — не blank", async () => {
    const img = await loadPng(FRAMES + "dark-choreo-16.png");
    expect(lumaStats(img).std).toBeGreaterThan(0.01);
    expect(codes(await single("dark-choreo-16.png", kitSettings("dark-premium")))).toEqual([]);
  });
});

describe("реальный кадр с обрезкой", () => {
  it("clipped-text кадр 67: заголовок за правым краем — clipping blocking right", async () => {
    const settings: Settings = { ...defaultSettings(), width: 960, height: 540, safe_area: { x: 0.05, y: 0.05 } };
    const r = await single("clipped-text-67.png", settings);
    expect(r).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", area: "right" }));
  });
});

describe("кадры среза (Test 1, Test 2) с их spec — без blocking программных замечаний", () => {
  it.each(["test1", "test2"])("%s", async (t) => {
    const dir = `${SLICE}${t}/`;
    const sp = MotionSpecSchema.parse(JSON.parse(readFileSync(`${dir}spec.json`, "utf8")));
    const settings = SettingsSchema.parse(JSON.parse(readFileSync(`${dir}manifest.json`, "utf8")).settings);
    const frames = readdirSync(`${dir}frames`).map((f) => Number(f.replace(".png", ""))).sort((a, b) => a - b);
    const r = await programmaticChecks({
      frames: frames.map((f) => ({ frame: f, path: `${dir}frames/${f}.png` })), spec: sp, settings,
      style: resolveStyle({ preset: settings.style_preset, intensity: settings.animation_intensity }),
      render: renderResult(), previewBytes: 1000,
    });
    expect(r.filter((i) => i.severity === "blocking").map((i) => i.code)).toEqual([]);
    expect(r.map((i) => i.code)).not.toContain("clipping");
    expect(r.map((i) => i.code)).not.toContain("safe_area");
    // и QA-кадры для этих spec попадают в биты каждого элемента
    expect(uncoveredElements(sp, selectQaFrames(sp))).toEqual([]);
  });
});

// fixtures/accent-hold/<версия>/{160,179}.png — кадры N−20 и N−1 перерендера версий на kit 0.3
// (1920×1080 → 960×540, ffmpeg area), spec.json — spec версии. r3-gen-cache — прогон 3 Fix D:
// Emphasis под непрозрачной карточкой узла, финал застыл. r4-* — прогон 4: живые финалы
// (gen-timeline — крупный регион Timeline с дышащей точкой «сейчас»; gen-cache — наименьший
// запас над фоном из пяти сцен).
describe("accent_static на реальных кадрах удержания (Fix G)", () => {
  const HOLD = fileURLToPath(new URL("../fixtures/accent-hold/", import.meta.url));
  const settings: Settings = { ...defaultSettings(), width: 960, height: 540, safe_area: { x: 0.05, y: 0.05 } };
  const run = async (n: string) => {
    const sp = MotionSpecSchema.parse(JSON.parse(readFileSync(`${HOLD}${n}/spec.json`, "utf8")));
    const at = (f: number) => ({ frame: f, path: `${HOLD}${n}/${f}.png` });
    const r = await programmaticChecks({
      frames: [at(179)], spec: sp, settings, style: resolveStyle({ preset: "dark-premium", intensity: "balanced" }),
      render: renderResult(), previewBytes: 1000, accentFrames: [at(160), at(179)],
    });
    return r.filter((i) => i.code === "accent_static");
  };

  it("r3-gen-cache: акцент под непрозрачной карточкой — accent_static warning", async () => {
    expect(await run("r3-gen-cache")).toEqual([expect.objectContaining({ severity: "warning", frame: 179 })]);
  });

  it.each(["r4-gen-timeline", "r4-gen-cache"])("%s: живой финал — без accent_static", async (n) => {
    expect(await run(n)).toEqual([]);
  });
});
