// Галерея хореографии motion-kit 0.2: реальный рендер 1920×1080, 180 кадров — шесть
// разных входов, наезд камеры, параллакс, глубина стиля. Запуск: `make e2e`. Пишет
// только в tmp/ репозитория.
//
// Разные входы проверяются по пикселям на варианте без камеры (`content.camera = false`:
// без наезда, зерна и дрейфа фона), иначе разность кадров давала бы сама камера.
// Признак: кадр середины входа M против кадров до (B) и после (F). У fade M − B =
// a·(F − B) — смешение с одним коэффициентом на всю область; у mask, blur, pop, rise,
// type, draw — нет. Негативный контроль: вариант, где все элементы входят одним fade,
// проверку проходить не должен.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { probeGate } from "../../src/node/ffprobe.js";
import { type RenderRequest, renderVersion } from "../../src/node/render-version.js";
import { CARD0, REGIONS } from "../fixtures/choreo-gallery/src/layout.js";
import { FIXTURES, copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 600_000;
const FRAMES = [0, 12, 24, 45, 90, 179];
const W = 1920;
const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

type Name = keyof typeof REGIONS;
type Box = { x: number; y: number; w: number; h: number };

/** RGB-пиксели PNG (rawvideo rgb24 через ffmpeg). */
const raw = (png: string) => execFileSync("ffmpeg", ["-v", "error", "-i", png, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 * 1024 * 1024 });

function* pixels(r: Box) {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) for (let c = 0; c < 3; c++) yield (y * W + x) * 3 + c;
}

/** Средняя по каналам разность двух кадров в прямоугольнике, 0..255. */
function regionDiff(a: Buffer, b: Buffer, r: Box): number {
  let sum = 0;
  for (const i of pixels(r)) sum += Math.abs(a[i]! - b[i]!);
  return sum / (r.w * r.h * 3);
}

/**
 * Насколько середина входа не похожа на fade: остаток M − B после лучшего приближения
 * a·(F − B), доля от |M − B|. ~0 — чистое смешение (fade), ближе к 1 — форма меняется.
 */
function fadeResidual(b: Buffer, m: Buffer, f: Buffer, r: Box): { change: number; residual: number } {
  let dm = 0;
  let df = 0;
  let dmf = 0;
  for (const i of pixels(r)) {
    const u = m[i]! - b[i]!;
    const v = f[i]! - b[i]!;
    dm += u * u;
    df += v * v;
    dmf += u * v;
  }
  const n = r.w * r.h * 3;
  const a = df > 0 ? dmf / df : 0;
  const rest = Math.max(0, dm - a * dmf); // |u − a·v|² = |u|² − a·(u·v) при оптимальном a
  return { change: Math.sqrt(dm / n), residual: dm > 0 ? Math.sqrt(rest / dm) : 0 };
}

/** Кадр середины входа: сдвиг от старта бита под вид входа (mask длиннее, pop быстрее). */
const MID: Record<Name, number> = { kicker: 12, headline: 14, subtitle: 5, badge: 3, chart: 30, cards: 6 };
const FINAL = 150;
const FADE_LIKE = 0.25;

interface Props {
  timing: { beats: { id: string; start_frame: number }[] };
  content: Record<string, unknown>;
}
const baseProps = JSON.parse(readFileSync(join(FIXTURES, "choreo-gallery", "props.json"), "utf8")) as Props;
const start = (n: Name) => baseProps.timing.beats.find((b) => b.id === n)!.start_frame;
const names = Object.keys(REGIONS) as Name[];

/** Область профиля: у каскада карточек — первая карточка (остальные ещё не стартовали). */
const PROFILE_REGION: Record<Name, Box> = { ...REGIONS, cards: CARD0 };

/** Профили входов: для каждого элемента — величина изменения и остаток против fade. */
function profiles(frames: Map<number, Buffer>) {
  const f = frames.get(FINAL)!;
  return Object.fromEntries(names.map((n) => [n, fadeResidual(frames.get(start(n) - 1)!, frames.get(start(n) + MID[n])!, f, PROFILE_REGION[n])])) as Record<Name, { change: number; residual: number }>;
}

/** Проверка «входы разные»: каждый элемент заметно меняется, и похожих на fade не больше одного. */
function distinctEntrances(p: Record<Name, { change: number; residual: number }>): boolean {
  const measurable = names.every((n) => p[n].change > 0.5);
  const fades = names.filter((n) => p[n].residual < FADE_LIKE);
  return measurable && fades.length <= 1;
}

const PROFILE_FRAMES = [...new Set([FINAL, ...names.flatMap((n) => [start(n) - 1, start(n) + MID[n]])])].sort((a, b) => a - b);

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

/** Вариант фикстуры с другим content в props.json; кадры — по номеру. */
async function renderVariant(name: string, content: Record<string, unknown>, stills: number[]): Promise<Map<number, Buffer>> {
  const dir = await copyFixture("choreo-gallery", join(tmp, name));
  writeFileSync(join(dir, "props.json"), JSON.stringify({ ...baseProps, content: { ...baseProps.content, ...content } }));
  const r = await renderVersion({ ...req, versionDir: dir, stills, run: { ...req.run, runId: name } });
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  return new Map(stills.map((f, i) => [f, raw(r.stills[i]!)]));
}

it("choreo-gallery: рендер ok, probe gate пуст, рендер детерминирован", async () => {
  const r = await renderVersion(req);
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(r.stills).toEqual(FRAMES.map((f) => join(req.versionDir, "frames", `${f}.png`)));
  expect(probeGate(r.probe!, req.settings, 0.5)).toEqual([]);
  expect(r.browserLogs.filter((l) => l.startsWith("[error]"))).toEqual([]);

  // повторный рендер той же версии — те же кадры байт в байт
  const again = await renderVersion({
    ...req,
    versionDir: await copyFixture("choreo-gallery", join(tmp, "choreo-2")),
    run: { ...req.run, runId: "choreo-2" },
  });
  expect(again.ok).toBe(true);
  expect(again.stills.map(sha256)).toEqual(r.stills.map(sha256));
}, T);

it("без камеры: каждый элемент меняется между кадрами 12 и 24, входы разные по пикселям", async () => {
  const frames = await renderVariant("still-camera", { camera: false }, [...new Set([12, 24, ...PROFILE_FRAMES])].sort((a, b) => a - b));
  for (const n of names) {
    // фон неподвижен и без зерна: любая разность — движение самого элемента
    expect(regionDiff(frames.get(12)!, frames.get(24)!, REGIONS[n]), `${n}: кадры 12 и 24 совпадают`).toBeGreaterThan(0.1);
  }
  const p = profiles(frames);
  console.log("профили входов:", JSON.stringify(p));
  for (const n of names) expect(p[n].residual, `${n}: вход похож на fade`).toBeGreaterThanOrEqual(FADE_LIKE);
  expect(distinctEntrances(p)).toBe(true);
}, T);

it("негативный контроль: все элементы одним fade — проверка разных входов не проходит", async () => {
  const frames = await renderVariant("uniform-fade", { camera: false, uniform: "fade" }, PROFILE_FRAMES);
  const p = profiles(frames);
  console.log("профили одинакового fade:", JSON.stringify(p));
  for (const n of names) expect(p[n].residual, `${n}: fade не распознан`).toBeLessThan(FADE_LIKE);
  expect(distinctEntrances(p)).toBe(false);
}, T);
