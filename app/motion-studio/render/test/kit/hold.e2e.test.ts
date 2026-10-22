// Галерея финалов motion-kit 0.5.0 (hold engine): реальный рендер 1920×1080, 180 кадров,
// hold 128–180. Каждый носитель итога (граф, график, гонка, таймлайн, число) в своих
// режимах удержания и контроль без hold. Проверка: между N−20 и N−1 самый живой тайл
// меняется заметно сильнее шума фона и застывшего контроля, рендер без ошибок.
// Кадры кладутся в tmp/hold-gallery/<вариант>/ (листы галереи, фикстуры QA).
// Запуск: `make e2e`. Пишет только в tmp/ репозитория.
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { probeGate } from "../../src/node/ffprobe.js";
import { type RenderRequest, renderVersion } from "../../src/node/render-version.js";
import { FIXTURES, REPO_TMP, copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 900_000;
const STILLS = [0, 100, 128, 140, 150, 160, 170, 179];
const OUT = join(REPO_TMP, "hold-gallery");

/** Варианты: носитель × режим; `none` — финал без hold (контроль). */
const VARIANTS: [string, string][] = [
  ["graph", "none"], ["graph", "steady-flow"], ["graph", "repeat-result"], ["graph", "now-pulse"], ["graph", "data-shimmer"],
  ["chart", "none"], ["chart", "data-shimmer"], ["chart", "now-pulse"], ["chart", "repeat-result"],
  ["race", "none"], ["race", "repeat-result"], ["race", "steady-flow"], ["race", "now-pulse"],
  ["timeline", "none"], ["timeline", "now-pulse"], ["timeline", "data-shimmer"],
  ["number", "none"], ["number", "settle-push"], ["number", "now-pulse"],
];

const base = JSON.parse(readFileSync(join(FIXTURES, "hold-gallery", "props.json"), "utf8")) as { content: Record<string, unknown> };
const gray = (png: string) => execFileSync("ffmpeg", ["-v", "error", "-i", png, "-vf", "scale=480:270:flags=area,format=gray", "-f", "rawvideo", "-"], { maxBuffer: 1 << 24 });
/**
 * Самый живой тайл 16×16 (480×270): средняя |ΔY| двух кадров в тайле, максимум по кадру
 * (0..255). Фон (зерно, дрейф пятен) даёт ровный малый фон, движение объекта — пик.
 */
const diff = (a: Buffer, b: Buffer) => {
  const W = 480;
  const Hh = 270;
  let best = 0;
  for (let ty = 0; ty + 16 <= Hh; ty += 8) {
    for (let tx = 0; tx + 16 <= W; tx += 8) {
      let s = 0;
      for (let y = ty; y < ty + 16; y++) for (let x = tx; x < tx + 16; x++) s += Math.abs(a[y * W + x]! - b[y * W + x]!);
      best = Math.max(best, s / 256);
    }
  }
  return best;
};

let tmp: string;
let req: RenderRequest;
const result = new Map<string, number>();

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  await mkdir(OUT, { recursive: true });
  req = {
    versionDir: "",
    settings: await fixtureSettings("hold-gallery"),
    cacheDir,
    stills: STILLS,
    preview: { scale: 0.5, crf: 23 },
    timeoutMs: 300_000,
    run: { root: await makeStore(tmp), runId: "hold", attempt: 1 },
  };
}, T);

afterAll(async () => {
  console.log("Δ N−20…N−1 (480×270, 0..255):", JSON.stringify(Object.fromEntries(result)));
  if (tmp) await removeTmp(tmp);
});

// HOLD_ONLY=graph,race — часть носителей (отладка)
const ONLY = process.env.HOLD_ONLY?.split(",");
it.each(VARIANTS.filter(([c]) => !ONLY || ONLY.includes(c)))("%s × %s: рендер ok, финал живой", async (carrier, mode) => {
  const name = `${carrier}-${mode}`;
  const dir = await copyFixture("hold-gallery", join(tmp, name));
  // контроль — без камеры: в финале движется только фон
  writeFileSync(join(dir, "props.json"), JSON.stringify({ ...base, content: { carrier, mode, ...(mode === "none" ? { camera: false } : {}) } }));
  const r = await renderVersion({ ...req, versionDir: dir, run: { ...req.run, runId: name } });
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(probeGate(r.probe!, req.settings, 0.5)).toEqual([]);
  expect(r.browserLogs.filter((l) => l.startsWith("[error]")).slice(0, 3).join("\n")).toBe("");
  await mkdir(join(OUT, name), { recursive: true });
  STILLS.forEach((f, i) => copyFileSync(r.stills[i]!, join(OUT, name, `${f}.png`)));
  copyFileSync(r.previewPath!, join(OUT, `${name}.mp4`));
  const d = diff(gray(r.stills[STILLS.indexOf(160)]!), gray(r.stills[STILLS.indexOf(179)]!));
  result.set(name, Number(d.toFixed(3)));
  if (mode !== "none") {
    const ctl = result.get(`${carrier}-none`);
    // движение заметно выше шума фона (≈ 1–2); где контроль застыл (граф, график, гонка) —
    // в разы живее его. Таймлайн и число и без hold дышат акцентом (kit 0.4) — там только порог
    expect(d, `${name}: финал не движется`).toBeGreaterThan(3);
    if (ctl !== undefined && ctl < 3) expect(d, `${name}: финал не живее контроля (${ctl})`).toBeGreaterThan(ctl * 2.5);
  }
}, T);
