// Галерея паттернов ТЗ §8.4 (motion-kit 0.2): реальный рендер сцен 1920×1080 по 150
// кадров — сравнение «Было / Стало», таймлайн из 4 вех, процесс из 4 шагов, код 8 строк
// TS с выноской, акцент «главная мысль» (Highlight, частицы), количества (BarChart,
// AreaChart). Запуск: `make e2e`. Пишет только в tmp/ репозитория.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { probeGate } from "../../src/node/ffprobe.js";
import { renderVersion } from "../../src/node/render-version.js";
import { FIXTURES, copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 600_000;
const FRAMES = [0, 30, 75, 120, 149];
const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const SCENES = readdirSync(join(FIXTURES, "patterns-gallery")).sort();

/** Варианты (props.content): вторая ориентация, второй вид коннектора/разделителя, кольцо выноски. */
const VARIANTS: [string, Record<string, string>][] = [
  ["timeline", { orientation: "v" }],
  ["process", { connector: "line" }],
  ["comparison", { divider: "line" }],
  ["code", { callout: "ring" }],
];
/** sha256 кадра 149 основного рендера сцены — вариант обязан от него отличаться. */
const lastFrame = new Map<string, string>();

let tmp: string;
let cacheDir: string;
let store: string;

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  store = await makeStore(tmp);
}, T);

afterAll(async () => {
  if (tmp) await removeTmp(tmp);
});

describe("patterns-gallery", () => {
  it("пять сцен брифа и сцена количеств на месте", () => {
    expect(SCENES).toEqual(["code", "comparison", "data", "emphasis", "process", "timeline"]);
  });

  for (const name of SCENES) {
    it(`${name}: рендер ok, кадры [0, 30, 75, 120, 149], probe gate пуст, кадры 30 и 120 различаются`, async () => {
      const fixture = `patterns-gallery/${name}`;
      const settings = await fixtureSettings(fixture);
      expect(settings).toMatchObject({ width: 1920, height: 1080, duration_frames: 150 });
      const versionDir = await copyFixture(fixture, join(tmp, name));
      const r = await renderVersion({
        versionDir,
        settings,
        cacheDir,
        stills: FRAMES,
        preview: { scale: 0.5, crf: 23 },
        timeoutMs: 240_000,
        run: { root: store, runId: `patterns-${name}`, attempt: 1 },
      });
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(r.stills).toEqual(FRAMES.map((f) => join(versionDir, "frames", `${f}.png`)));
      expect(probeGate(r.probe!, settings, 0.5)).toEqual([]);
      expect(sha256(r.stills[1]!)).not.toBe(sha256(r.stills[3]!));
      lastFrame.set(name, sha256(r.stills[4]!));
      // ошибок в консоли браузера нет (шрифты, SVG-маски и фильтры отработали)
      expect(r.browserLogs.filter((l) => l.startsWith("[error]"))).toEqual([]);
    }, T);
  }

  for (const [name, content] of VARIANTS) {
    const tag = Object.entries(content).map(([k, v]) => `${k}=${v}`).join(",");
    it(`${name} (${tag}): рендер ok, probe gate пуст, итоговый кадр отличается от основного`, async () => {
      const fixture = `patterns-gallery/${name}`;
      const settings = await fixtureSettings(fixture);
      const versionDir = await copyFixture(fixture, join(tmp, `${name}-${tag.replace(/[=,]/g, "-")}`));
      const props = JSON.parse(readFileSync(join(versionDir, "props.json"), "utf8")) as { content?: object };
      writeFileSync(join(versionDir, "props.json"), JSON.stringify({ ...props, content: { ...props.content, ...content } }));
      const r = await renderVersion({
        versionDir,
        settings,
        cacheDir,
        stills: [75, 149],
        preview: { scale: 0.5, crf: 23 },
        timeoutMs: 240_000,
        run: { root: store, runId: `patterns-${name}-variant`, attempt: 1 },
      });
      expect(r.error).toBeUndefined();
      expect(r.ok).toBe(true);
      expect(probeGate(r.probe!, settings, 0.5)).toEqual([]);
      expect(r.browserLogs.filter((l) => l.startsWith("[error]"))).toEqual([]);
      expect(lastFrame.get(name)).toBeDefined();
      expect(sha256(r.stills[1]!)).not.toBe(lastFrame.get(name));
    }, T);
  }
});
