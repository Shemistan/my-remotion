// Task 37′: проверки кадров видеосцены по альфе (transparent = true): графика на лице автора —
// `face_ink`, вне зоны плана — `outside_zone`; fullscreen — без проверок. Кадр-композит «сцена
// поверх кадра исходника» — ffmpeg overlay (реальный ffmpeg).
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import { type NormRect, type VideoSceneContext, VideoSceneContextSchema, ZONE_RECTS, placementFor } from "@ms/contracts";
import type { SweepFrame } from "@ms/render";
import { loadPng } from "../../src/qa/image.js";
import { contextFrameFor, storePath, videoSceneChecks } from "../../src/video-scenes/checks.js";
import { composeOverContext } from "../../src/video-scenes/compose-frame.js";

const dir = mkdtempSync(join(tmpdir(), "ms-v37-checks-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const W = 200;
const H = 100;
let n = 0;
/** PNG W×H: прозрачный, непрозрачные (α = 255) прямоугольники `rects` цвета `rgb`. */
function alphaPng(rects: NormRect[], rgb: [number, number, number] = [240, 240, 240], w = W, h = H): string {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const on = rects.some((r) => x >= r.x * w && x < (r.x + r.w) * w && y >= r.y * h && y < (r.y + r.h) * h);
      p.data[i] = rgb[0];
      p.data[i + 1] = rgb[1];
      p.data[i + 2] = rgb[2];
      p.data[i + 3] = on ? 255 : 0;
    }
  }
  const path = join(dir, `a${++n}.png`);
  writeFileSync(path, PNG.sync.write(p));
  return path;
}

const FACE: NormRect = { x: 0.4, y: 0.1, w: 0.2, h: 0.4 };
const ctx = (over: Partial<VideoSceneContext> = {}): VideoSceneContext => ({
  project_id: "p1", plan_id: "pln_1", plan_revision: 1, item_id: "sp_001", style: { preset: "dark-premium", intensity: "balanced", depth: 1 },
  lead_frames: 6, tail_frames: 30, placement: placementFor("overlay", "lower_third"), face: FACE, ...over,
});
const inZone: NormRect = { x: 0.1, y: 0.75, w: 0.5, h: 0.15 };

describe("videoSceneChecks", () => {
  it("альфа в lower_third — без замечаний", async () => {
    expect(await videoSceneChecks({ alphaFrames: [{ frame: 10, path: alphaPng([inZone]) }, { frame: 80, path: alphaPng([]) }], ctx: ctx() })).toEqual([]);
  });

  it("альфа на лице — face_ink blocking (кадр — худший); с override_reason — warning", async () => {
    const frames = [{ frame: 10, path: alphaPng([inZone]) }, { frame: 40, path: alphaPng([inZone, { x: 0.45, y: 0.2, w: 0.1, h: 0.1 }]) }];
    const issues = await videoSceneChecks({ alphaFrames: frames, ctx: ctx({ placement: placementFor("overlay", "full") }) });
    expect(issues).toEqual([expect.objectContaining({ code: "face_ink", severity: "blocking", frame: 40, source: "programmatic" })]);
    const ok = await videoSceneChecks({ alphaFrames: frames, ctx: ctx({ placement: placementFor("overlay", "full") }), overrideReason: "автор показывает на график" });
    expect(ok).toEqual([expect.objectContaining({ code: "face_ink", severity: "warning" })]);
  });

  it("крошечное касание лица (≤ 1 % его площади) — не замечание", async () => {
    // 1×1 px на лице 40×40 px = 0,06 %
    const issues = await videoSceneChecks({ alphaFrames: [{ frame: 5, path: alphaPng([{ x: 0.45, y: 0.2, w: 0.005, h: 0.01 }]) }], ctx: ctx({ placement: placementFor("overlay", "full") }) });
    expect(issues).toEqual([]);
  });

  it("альфа вне зоны (с запасом 0,02) — outside_zone blocking; полоса в запасе — нет", async () => {
    const out = await videoSceneChecks({ alphaFrames: [{ frame: 12, path: alphaPng([inZone, { x: 0.7, y: 0.05, w: 0.2, h: 0.1 }]) }], ctx: ctx({ face: undefined }) });
    expect(out).toEqual([expect.objectContaining({ code: "outside_zone", severity: "blocking", frame: 12 })]);
    const r = ZONE_RECTS.lower_third;
    const margin = await videoSceneChecks({ alphaFrames: [{ frame: 1, path: alphaPng([{ x: r.x, y: r.y - 0.015, w: r.w, h: 0.02 }]) }], ctx: ctx({ face: undefined }) });
    expect(margin).toEqual([]);
  });

  it("fullscreen — проверок нет", async () => {
    const all = alphaPng([{ x: 0, y: 0, w: 1, h: 1 }]);
    expect(await videoSceneChecks({ alphaFrames: [{ frame: 3, path: all }], ctx: ctx({ placement: placementFor("fullscreen", "full") }) })).toEqual([]);
  });
});

describe("composeOverContext", () => {
  it("сцена поверх кадра исходника: размер — кадра сцены, вне графики — видео, на графике — сцена", async () => {
    const alpha = alphaPng([inZone], [255, 0, 0]);
    // кадр исходника меньше (как ключевой кадр 640 px) — растягивается под сцену
    const bg = new PNG({ width: 64, height: 32 });
    for (let i = 0; i < bg.data.length; i += 4) bg.data.set([0, 0, 200, 255], i);
    const ctxPath = join(dir, "ctx-src.png");
    writeFileSync(ctxPath, PNG.sync.write(bg));
    const out = join(dir, "ctx-10.png");
    await composeOverContext(alpha, ctxPath, out, { signal: new AbortController().signal });
    const img = await loadPng(out);
    expect([img.width, img.height]).toEqual([W, H]);
    const px = (x: number, y: number) => Array.from(img.data.slice((y * W + x) * 4, (y * W + x) * 4 + 3));
    expect(px(50, 82)[0]).toBeGreaterThan(200); // графика
    expect(px(50, 82)[2]).toBeLessThan(50);
    expect(px(150, 20)[2]).toBeGreaterThan(150); // видео
    expect(px(150, 20)[0]).toBeLessThan(50);
  });
});

/** Кадр временного прохода пробы (480×270): строки текста `rects` (доли кадра). */
function sweepFrame(frame: number, rects: NormRect[]): SweepFrame {
  const size = { w: 480, h: 270 };
  return {
    frame, size, boxes: [], areas: { text: 0.05, graphic: 0 }, cells: "", content: 0, heroes: [], accents: 0,
    items: rects.map((r, k) => ({ id: `text::${k}`, role: "text", text: "слово", rect: { x: r.x * size.w, y: r.y * size.h, w: r.w * size.w, h: r.h * size.h } })),
  };
}

describe("fix I2: рамки раскладки каждого кадра пробы", () => {
  it("графика пересекает лицо между QA-кадрами → face_ink blocking на кадре пробы", async () => {
    const qa = [{ frame: 10, path: alphaPng([inZone]) }, { frame: 170, path: alphaPng([inZone]) }];
    // перелёт подписи через лицо на кадрах 60–66 — ни один QA-кадр его не видит
    const sweep = [sweepFrame(54, [inZone]), sweepFrame(60, [inZone, { x: 0.42, y: 0.2, w: 0.15, h: 0.1 }]), sweepFrame(66, [inZone])];
    const issues = await videoSceneChecks({ alphaFrames: qa, sweep, ctx: ctx({ placement: placementFor("overlay", "full") }) });
    expect(issues).toEqual([expect.objectContaining({ code: "face_ink", severity: "blocking", frame: 60 })]);
    expect(issues[0]!.description).toContain("проба кадров");
    expect(await videoSceneChecks({ alphaFrames: qa, ctx: ctx({ placement: placementFor("overlay", "full") }) })).toEqual([]);
  });

  it("рамка вне зоны на кадре пробы → outside_zone; рамки в зоне — пусто", async () => {
    const out = await videoSceneChecks({ alphaFrames: [], sweep: [sweepFrame(30, [inZone, { x: 0.7, y: 0.05, w: 0.2, h: 0.1 }])], ctx: ctx({ face: undefined }) });
    expect(out).toEqual([expect.objectContaining({ code: "outside_zone", frame: 30 })]);
    expect(await videoSceneChecks({ alphaFrames: [], sweep: [sweepFrame(30, [inZone])], ctx: ctx() })).toEqual([]);
  });

  it("кадр исходника для композита — ближайший к кадру сцены; без списка — context_frame_rel", () => {
    const c = ctx({ context_frame_rel: "w/mid.png", context_frames: [{ frame: 0, rel: "w/k0.png" }, { frame: 60, rel: "w/k60.png" }, { frame: 150, rel: "w/k150.png" }] });
    expect([contextFrameFor(c, 5), contextFrameFor(c, 80), contextFrameFor(c, 140)]).toEqual(["w/k0.png", "w/k60.png", "w/k150.png"]);
    expect(contextFrameFor(ctx({ context_frame_rel: "w/mid.png" }), 80)).toBe("w/mid.png");
  });
});

describe("fix I4: context_frame_rel — только путь в хранилище", () => {
  it("схема входа: относительный без `..`; абсолютный, `..`, диск — отказ", () => {
    for (const bad of ["/etc/passwd", "../x.png", "a/../../b.png", "C:/x.png", "a\\b.png", "a//b.png"]) {
      expect(VideoSceneContextSchema.safeParse(ctx({ context_frame_rel: bad })).success, bad).toBe(false);
      expect(VideoSceneContextSchema.safeParse(ctx({ context_frames: [{ frame: 0, rel: bad }] })).success, bad).toBe(false);
    }
    expect(VideoSceneContextSchema.safeParse(ctx({ context_frame_rel: "workspace/projects/p1/k/0001.jpg" })).success).toBe(true);
  });

  it("storePath: внутри корня — путь; выход из корня — ошибка", () => {
    expect(storePath("/store", "workspace/a.png")).toBe("/store/workspace/a.png");
    expect(() => storePath("/store", "../a.png")).toThrow(/не в хранилище/);
    expect(() => storePath("/store", "/etc/passwd")).toThrow(/не в хранилище/);
  });
});
