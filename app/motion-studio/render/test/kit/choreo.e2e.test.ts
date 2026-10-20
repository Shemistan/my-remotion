// Галерея хореографии motion-kit 0.2: реальный рендер 1920×1080, 180 кадров — шесть
// разных входов, наезд камеры, параллакс, глубина стиля. Запуск: `make e2e`. Пишет
// только в tmp/ репозитория.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { probeGate } from "../../src/node/ffprobe.js";
import { type RenderRequest, renderVersion } from "../../src/node/render-version.js";
import { REGIONS } from "../fixtures/choreo-gallery/src/layout.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 600_000;
const FRAMES = [0, 12, 24, 45, 90, 179];
const W = 1920;
const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** RGB-пиксели PNG (rawvideo rgb24 через ffmpeg). */
const raw = (png: string) => execFileSync("ffmpeg", ["-v", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 * 1024 * 1024 });

/** Средняя по каналам разность двух кадров в прямоугольнике, 0..255. */
function regionDiff(a: Buffer, b: Buffer, r: { x: number; y: number; w: number; h: number }): number {
  let sum = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const i = (y * W + x) * 3;
      sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    }
  }
  return sum / (r.w * r.h * 3);
}

let tmp: string;
let req: RenderRequest;

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  req = {
    versionDir: await copyFixture("choreo-gallery", join(tmp, "choreo")),
    settings: await fixtureSettings("choreo-gallery"),
    cacheDir,
    stills: FRAMES,
    preview: { scale: 0.5, crf: 23 },
    timeoutMs: 240_000,
    run: { root: await makeStore(tmp), runId: "choreo", attempt: 1 },
  };
}, T);

afterAll(async () => {
  if (tmp) await removeTmp(tmp);
});

it("choreo-gallery: рендер ok, probe gate пуст, входы в разных фазах, рендер детерминирован", async () => {
  const r = await renderVersion(req);
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(r.stills).toEqual(FRAMES.map((f) => join(req.versionDir, "frames", `${f}.png`)));
  expect(probeGate(r.probe!, req.settings, 0.5)).toEqual([]);
  expect(r.browserLogs.filter((l) => l.startsWith("[error]"))).toEqual([]);

  // кадры 12 и 24: каждый из шести элементов в своей фазе входа — область меняется
  const f12 = raw(r.stills[1]!);
  const f24 = raw(r.stills[2]!);
  for (const [name, rect] of Object.entries(REGIONS)) {
    expect(regionDiff(f12, f24, rect), `${name}: кадры 12 и 24 совпадают`).toBeGreaterThan(1);
  }

  // повторный рендер той же версии — те же кадры байт в байт
  const again = await renderVersion({
    ...req,
    versionDir: await copyFixture("choreo-gallery", join(tmp, "choreo-2")),
    run: { ...req.run, runId: "choreo-2" },
  });
  expect(again.ok).toBe(true);
  expect(again.stills.map(sha256)).toEqual(r.stills.map(sha256));
}, T);
