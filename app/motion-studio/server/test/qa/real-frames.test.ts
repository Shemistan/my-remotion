// Регрессия ложных срабатываний на РЕАЛЬНЫХ кадрах рендера (ревью Task 16, раунд 1).
// fixtures/qa-frames/*.png — кадры 1920×1080 из рендеров render/test/fixtures, уменьшенные
// вдвое (усреднение 2×2): tech-neon `patterns-gallery` (варианты code: сетка пола у краёв,
// карточка у границы safe area) и `choreo-gallery` кадр 16 (тёмный пресет, видимый текст).
// `clipped-text-67.png` — кадр фикстуры qa-scenes/clipped-text (960×540, как есть): край
// срезает букву по касательной — обрезка должна ловиться и так.
// Кадры среза — fixtures/slice/test{1,2}/{frames,spec.json,settings.json}: копия
// docs/evidence/phase-1/slice (960×540, как есть; settings — из manifest.json). Evidence
// перезаписывают новые прогоны — регрессия не должна от них зависеть.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MotionSpecSchema, type QAIssue, type Settings, SettingsSchema, defaultSettings } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
import { describe, expect, it } from "vitest";
import { selectQaFrames, uncoveredElements } from "../../src/pipeline/qa-frames.js";
import { loadPng, lumaStats } from "../../src/qa/image.js";
import { POSTER_INK, posterInk, programmaticChecks } from "../../src/qa/programmatic.js";
import { Canvas, beat, makeTmp, removeTmp, renderResult, spec } from "./helpers.js";

const FRAMES = fileURLToPath(new URL("../fixtures/qa-frames/", import.meta.url));
const SLICE = fileURLToPath(new URL("../fixtures/slice/", import.meta.url));
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

// S5: user-06 (user3-32243aa) упал на blocking clipping облаков и домов, уходящих за край в
// иллюстрации на 60 с; ни один элемент spec не имел раскладки во весь кадр (fullBleedAt молчал).
describe("S5: сцена-мир — крупные фоновые объекты за краем кадра", () => {
  const settings: Settings = { ...defaultSettings(), width: 960, height: 540 };
  const sp = spec({ beats: [beat("b0", 0, 10, ["a"]), beat("b1", 10, 2000, ["a"], "hold")] });
  const run = (files: [number, string][], extra: Partial<Settings> = {}) =>
    programmaticChecks({
      frames: files.map(([frame, f]) => ({ frame, path: FRAMES + f })), spec: sp, settings: { ...settings, ...extra },
      style: resolveStyle({ preset: settings.style_preset, intensity: settings.animation_intensity }),
      render: renderResult(), previewBytes: 1000,
    });

  it("кадр-мир user-06 (слои у трёх краёв) — его clipping только warning, и отдельно, и в сцене", async () => {
    for (const files of [[[1251, "world-rain-1251.png"]], [[354, "world-rain-354.png"], [1251, "world-rain-1251.png"]]] as [number, string][][]) {
      const clips = (await run(files)).filter((i) => i.code === "clipping" && i.frame === 1251);
      expect(clips.length).toBeGreaterThan(0);
      expect(clips.every((i) => i.severity === "warning")).toBe(true);
      expect(clips[0]!.description).toContain("сцена-мир");
    }
  });

  it("I3: исключение покадровое — кадр-мир в сцене не смягчает обрезку на других кадрах", async () => {
    const withText = await run([[67, "clipped-text-67.png"], [1251, "world-rain-1251.png"]], { safe_area: { x: 0.05, y: 0.05 } });
    expect(withText).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", frame: 67, area: "right" }));
    // кадр 354 (облако у края, тёмная палитра) сам миром не распознан — его обрезка не смягчается
    const withCloud = await run([[354, "world-rain-354.png"], [1251, "world-rain-1251.png"]]);
    expect(withCloud).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", frame: 354, area: "left" }));
  });

  it("I3: крупная карточка 60 %×60 %, срезанная углом кадра, сама «миром» не делает — blocking", async () => {
    const tmp = await makeTmp();
    try {
      // светлая карточка уходит за левый и верхний край (как герой, пересекающий угол)
      const c = new Canvas(960, 540, "#151820").rect(-40, -30, 576, 324, "#e6e6ea");
      writeFileSync(join(tmp, "corner-card.png"), c.png());
      for (const files of [[[25, join(tmp, "corner-card.png")]], [[25, join(tmp, "corner-card.png")], [1251, FRAMES + "world-rain-1251.png"]]] as [number, string][][]) {
        const r = await programmaticChecks({
          frames: files.map(([frame, path]) => ({ frame, path })), spec: sp, settings,
          style: resolveStyle({ preset: settings.style_preset, intensity: settings.animation_intensity }),
          render: renderResult(), previewBytes: 1000,
        });
        const at25 = r.filter((i) => i.code === "clipping" && i.frame === 25);
        expect(at25.map((i) => [i.area, i.severity]).sort()).toEqual([["left", "blocking"], ["top", "blocking"]]);
      }
    } finally {
      await removeTmp(tmp);
    }
  });

  it("тот же кадр с облаком у края без кадра-мира в сцене — blocking (одиночный объект у края)", async () => {
    const r = await run([[354, "world-rain-354.png"]]);
    expect(r).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", area: "left" }));
  });

  it("обрезанный заголовок на тёмном фоне остаётся blocking рядом с обычными кадрами kit", async () => {
    const r = await run([[67, "clipped-text-67.png"], [100, "dark-choreo-16.png"]], { safe_area: { x: 0.05, y: 0.05 } });
    expect(r).toContainEqual(expect.objectContaining({ code: "clipping", severity: "blocking", area: "right" }));
  });
});

describe("кадры среза (Test 1, Test 2) с их spec — без blocking программных замечаний", () => {
  it.each(["test1", "test2"])("%s", async (t) => {
    const dir = `${SLICE}${t}/`;
    const sp = MotionSpecSchema.parse(JSON.parse(readFileSync(`${dir}spec.json`, "utf8")));
    const settings = SettingsSchema.parse(JSON.parse(readFileSync(`${dir}settings.json`, "utf8")));
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

// Кадр удержания N−1 пяти сцен прогона 4 (их смотрел ревьюер, motion-review-1) и среза.
// Сцены прогона 4 — fixtures/empty-region/<сцена>/{179.png,spec.json,settings.json}: копия
// docs/evidence/phase-1/pipeline на d35c69f^ (evidence перезаписывают новые прогоны —
// регрессия не должна от них зависеть). Срез — fixtures/slice.
describe("empty_region на реальных кадрах удержания (Fix G)", () => {
  const ER = fileURLToPath(new URL("../fixtures/empty-region/", import.meta.url));
  const load = (dir: string) =>
    dir.startsWith("slice/")
      ? { base: `${SLICE}${dir.slice(6)}`, frame: "frames/179.png", settings: JSON.parse(readFileSync(`${SLICE}${dir.slice(6)}/settings.json`, "utf8")) }
      : { base: `${ER}${dir}`, frame: "179.png", settings: JSON.parse(readFileSync(`${ER}${dir}/settings.json`, "utf8")) };
  const run = async (dir: string) => {
    const { base, frame, settings: raw } = load(dir);
    const sp = MotionSpecSchema.parse(JSON.parse(readFileSync(`${base}/spec.json`, "utf8")));
    const settings = SettingsSchema.parse(raw);
    const r = await programmaticChecks({
      frames: [{ frame: 179, path: `${base}/${frame}` }], spec: sp, settings,
      style: resolveStyle({ preset: settings.style_preset, intensity: settings.animation_intensity }), render: renderResult(), previewBytes: 1000,
    });
    return r.filter((i) => i.code === "empty_region");
  };

  it.each([["test1", "middle"], ["gen-compare", "top-right"]])("%s: пустой регион по ревью (%s) — warning", async (dir, area) => {
    expect(await run(dir)).toEqual([expect.objectContaining({ severity: "warning", frame: 179, area })]);
  });

  it.each(["test2", "gen-timeline", "gen-cache", "slice/test1", "slice/test2"])("%s: без empty_region", async (dir) => {
    expect(await run(dir)).toEqual([]);
  });
});

// Кадр-постер (S2-fix, I3): fixtures/poster/*-0.png — кадры 0 превью прогона s2-807e41b
// (960×540, как есть). Пусты по виду: test1 (бледные подписи оси), gen-timeline (один фон),
// bench-abtest (бледная ось); постер есть: held-mobile (силуэт кольца), gen-compare,
// bench-funnel (силуэт воронки), bench-oauth (каркас схемы).
describe("frame0_coverage на реальных кадрах 0 (калибровка posterInk)", () => {
  const POSTER = fileURLToPath(new URL("../fixtures/poster/", import.meta.url));
  it.each(["test1", "gen-timeline", "bench-abtest"])("%s: кадр 0 пуст — ниже POSTER_INK", async (s) => {
    expect(posterInk(await loadPng(`${POSTER}${s}-0.png`))).toBeLessThan(POSTER_INK);
  });
  it.each(["held-mobile", "gen-compare", "bench-funnel", "bench-oauth"])("%s: силуэты — постер, не ниже POSTER_INK", async (s) => {
    expect(posterInk(await loadPng(`${POSTER}${s}-0.png`))).toBeGreaterThanOrEqual(POSTER_INK);
  });
});
