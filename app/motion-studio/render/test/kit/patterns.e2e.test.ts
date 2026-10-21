// Галерея паттернов ТЗ §8.4 (motion-kit 0.2): реальный рендер сцен 1920×1080 по 150
// кадров — сравнение «Было / Стало», таймлайн из 4 вех, процесс из 4 шагов, код 8 строк
// TS с выноской, акцент «главная мысль» (Highlight, частицы), количества (BarChart,
// AreaChart). Запуск: `make e2e`. Пишет только в tmp/ репозитория.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { probeGate } from "../../src/node/ffprobe.js";
import { renderVersion } from "../../src/node/render-version.js";
import { codeLineRect } from "../../src/motion-kit/components/CodeBlock.js";
import { CODE_POS, CODE_W, FONT } from "../fixtures/patterns-gallery/code/src/layout.js";
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
  ["code", { sample: "py-doc", callout: "ring" }],
];

/** RGB пикселя PNG 1920 × 1080 (rawvideo через ffmpeg). */
function pixel(png: string): (x: number, y: number) => [number, number, number] {
  const raw = execFileSync("ffmpeg", ["-v", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 * 1024 * 1024 });
  return (x, y) => {
    const i = (Math.round(y) * 1920 + Math.round(x)) * 3;
    return [raw[i]!, raw[i + 1]!, raw[i + 2]!];
  };
}
/** Акцент tech-neon (#00e5ff) и его полупрозрачные смеси на тёмном: циан, без красного. */
const isCyan = ([r, g, b]: [number, number, number]) => g > 140 && b > 140 && r < 120;
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

  // Многострочные токены (docstring, JSDoc): строки, подсветка и каретка не съезжают.
  // Блок кода стоит в safe area (115, 86) со сдвигом CODE_POS; tech-neon, акцент — циан.
  const CODE_SAMPLES = [
    { sample: "py-doc", lines: 10, hot: [6, 7], cold: 2, lastCol: 38 },
    { sample: "ts-jsdoc", lines: 11, hot: [6, 7], cold: 2, lastCol: 1 },
  ];
  for (const c of CODE_SAMPLES) {
    it(`code (${c.sample}): полоса подсветки на строках ${c.hot.join(", ")}, каретка в конце строки ${c.lines}`, async () => {
      const fixture = "patterns-gallery/code";
      const settings = await fixtureSettings(fixture);
      const versionDir = await copyFixture(fixture, join(tmp, `code-${c.sample}`));
      const props = JSON.parse(readFileSync(join(versionDir, "props.json"), "utf8")) as { content?: object };
      writeFileSync(join(versionDir, "props.json"), JSON.stringify({ ...props, content: { ...props.content, sample: c.sample } }));
      const r = await renderVersion({ versionDir, settings, cacheDir, stills: [90, 149], preview: { scale: 0.5, crf: 23 }, timeoutMs: 240_000, run: { root: store, runId: `patterns-code-${c.sample}`, attempt: 1 } });
      expect(r.ok).toBe(true);
      expect(r.browserLogs.filter((l) => l.startsWith("[error]"))).toEqual([]);
      const left = 115 + CODE_POS.x;
      const top = 86 + CODE_POS.y;
      const mid = (line: number) => top + codeLineRect(line, { width: CODE_W, fontSize: FONT }).y + codeLineRect(line, { fontSize: FONT }).h / 2;
      // кадр 149: левая кромка полосы подсветки (inset 3 px акцентом) — только на hot-строках
      const end = pixel(r.stills[1]!);
      for (const line of c.hot) expect(isCyan(end(left + 1, mid(line))), `строка ${line}: нет полосы подсветки`).toBe(true);
      expect(isCyan(end(left + 1, mid(c.cold))), `строка ${c.cold}: лишняя подсветка`).toBe(false);
      expect(isCyan(end(left + 1, mid(c.hot.at(-1)! + 1))), `строка ${c.hot.at(-1)! + 1}: подсветка съехала`).toBe(false);
      // кадр 90: набор закончен, каретка горит после последнего знака последней строки
      const typed = pixel(r.stills[0]!);
      const caret = codeLineRect(c.lines, { fontSize: FONT, cols: [c.lastCol, c.lastCol + 1] });
      expect(isCyan(typed(left + caret.x + 9, mid(c.lines))), "каретки нет в конце последней строки").toBe(true);
      expect(isCyan(typed(left + caret.x + 9, mid(c.lines - 1))), "каретка строкой выше").toBe(false);
    }, T);
  }
});
