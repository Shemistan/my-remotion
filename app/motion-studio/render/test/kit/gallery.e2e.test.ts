// Галерея motion-kit: реальный рендер всех компонентов в одной сцене 1920×1080.
// Запуск: `make e2e`. Пишет только в tmp/ репозитория.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { probeGate } from "../../src/node/ffprobe.js";
import { type RenderRequest, renderVersion } from "../../src/node/render-version.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 600_000;
const FRAMES = [0, 30, 75, 120, 149];
const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

let tmp: string;
let req: RenderRequest;

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  req = {
    versionDir: await copyFixture("kit-gallery", join(tmp, "gallery")),
    settings: await fixtureSettings("kit-gallery"),
    cacheDir,
    stills: FRAMES,
    preview: { scale: 0.5, crf: 23 },
    timeoutMs: 240_000,
    run: { root: await makeStore(tmp), runId: "kit", attempt: 1 },
  };
}, T);

afterAll(async () => {
  if (tmp) await removeTmp(tmp);
});

it("kit-gallery: рендер ok, кадры [0, 30, 75, 120, 149], probe gate пуст, анимация идёт", async () => {
  const r = await renderVersion(req);
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(r.stills).toEqual(FRAMES.map((f) => join(req.versionDir, "frames", `${f}.png`)));
  expect(probeGate(r.probe!, req.settings, 0.5)).toEqual([]);
  expect(sha256(r.stills[1]!)).not.toBe(sha256(r.stills[3]!)); // кадры 30 и 120
  // ошибок в консоли браузера нет (шрифты загрузились, ассеты нашлись)
  expect(r.browserLogs.filter((l) => l.startsWith("[error]"))).toEqual([]);
}, T);

it("kit-gallery в light-clean и tech-neon: рендер ok, кадр 120 отличается от dark-premium", async () => {
  const base = join(req.versionDir, "frames", "120.png");
  const hashes = new Set([sha256(base)]);
  for (const preset of ["light-clean", "tech-neon"]) {
    const dir = await copyFixture("kit-gallery", join(tmp, preset));
    writeFileSync(join(dir, "props.json"), JSON.stringify({ preset }));
    const r = await renderVersion({ ...req, versionDir: dir, stills: [120], run: { ...req.run, runId: `kit-${preset}` } });
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    hashes.add(sha256(r.stills[0]!));
  }
  expect(hashes.size).toBe(3);
}, T);
