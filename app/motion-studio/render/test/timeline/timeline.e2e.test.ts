// Task 36 e2e (реальный рендер, `make e2e`): единая композиция `ProjectTimeline` целиком —
// master (CFR, masterArgs) и edited-audio.wav (buildEditedAudio) из talk-ru-cfr.mp4 с вырезкой
// 2,0–3,5 с, сцены overlay-lower-third (150–240, прозрачная, графика в lower_third) и
// fullscreen-card (300–360), renderTimelineRange 1280×720 CRF 18 → проверки [A] ffprobe, кадровая
// точность по исходнику (PSNR), прозрачность вне зоны, кадр полноэкранной сцены = её still,
// сэмплы звука, логи без чужих origin. Пишет только в tmp/ репозитория. Кадры 100, 200, 330 —
// tmp/timeline-evidence/, с MS_WRITE_EVIDENCE=1 — docs/evidence/phase-4/engine/ (ролик в git нет).
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type EditedTimeline, ZONE_RECTS, buildTimeline, clipsToSequences, frameToUs, timelineFrames } from "@ms/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildEditedAudio } from "../../../server/src/media/edited-audio.js";
import { runFfmpeg } from "../../../server/src/media/ffmpeg.js";
import { MASTER_CRF, masterArgs, masterFrames } from "../../../server/src/media/master.js";
import { probeMedia } from "../../../server/src/media/probe.js";
import { checkSceneDir } from "../../../server/src/scenes/static-check.js";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { renderVersion } from "../../src/node/render-version.js";
import { layoutRectPx } from "../../src/motion-kit/components/LayoutRect.js";
import { type TimelineRenderResult, renderTimelineRange } from "../../src/timeline/render-range.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 900_000;
const F30 = { num: 30, den: 1 };
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const MEDIA = join(REPO, "tmp/media-fixtures");
const EVIDENCE = join(REPO, process.env.MS_WRITE_EVIDENCE === "1" ? "docs/evidence/phase-4/engine" : "tmp/timeline-evidence");
const W = 1280;
const H = 720;

let tmp: string;
let root: string;
let cacheDir: string;
let tl: EditedTimeline;
let master: string;
let audio: { path: string; samples: number; sha256: string };
let result: TimelineRenderResult;
let cardStill: string;
const notes: string[] = [];
const ms = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} с`;

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { maxBuffer: 64 * 1024 * 1024 });

/** Кадр `n` файла как PNG (CFR: номер кадра = индекс декодирования). */
function frameOf(file: string, n: number, out: string): string {
  ff(["-i", file, "-vf", `select=eq(n\\,${n})`, "-vframes", "1", "-fps_mode", "passthrough", out]);
  return out;
}

/** PSNR двух картинок (среднее по каналам yuv444), опционально — по прямоугольнику `crop=w:h:x:y`. */
function psnrOf(a: string, b: string, crop?: string): number {
  const c = crop ? `crop=${crop},` : "";
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", a, "-i", b, "-lavfi", `[0:v]${c}format=yuv444p[x];[1:v]${c}format=yuv444p[y];[x][y]psnr`, "-f", "null", "-"], { encoding: "utf8" });
  const m = /average:(inf|[\d.]+)/.exec(r.stderr);
  if (r.status !== 0 || !m) throw new Error(`ffmpeg psnr (код ${r.status}): ${r.stderr.slice(-300)}`);
  return m[1] === "inf" ? Number.POSITIVE_INFINITY : Number(m[1]);
}

beforeAll(async () => {
  const cfr = join(MEDIA, "talk-ru-cfr.mp4");
  if (!existsSync(cfr)) throw new Error(`нет ${cfr}: ./scripts/with-node.sh node scripts/make-media-fixtures.mjs`);
  await ensureRenderBrowser();
  tmp = await makeTmp();
  root = await makeStore(tmp);
  cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  mkdirSync(EVIDENCE, { recursive: true });

  const probe = await probeMedia(cfr);
  tl = buildTimeline(probe.duration_us, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
  let t0 = Date.now();
  master = join(tmp, "master.mp4");
  await runFfmpeg(masterArgs(cfr, master, probe, F30, MASTER_CRF), { signal: new AbortController().signal });
  notes.push(`- master CRF ${MASTER_CRF}: ${masterFrames(probe, F30)} кадров за ${ms(t0)}`);
  t0 = Date.now();
  audio = await buildEditedAudio({ input: cfr, demuxer: "mov", tl, fadeUs: 8_000, out: join(tmp, "edited-audio.wav"), signal: new AbortController().signal });
  notes.push(`- edited-audio.wav: ${audio.samples} сэмплов за ${ms(t0)}`);
}, T);

afterAll(async () => {
  if (notes.length > 0) {
    writeFileSync(join(EVIDENCE, "README.md"), [
      "# Единая композиция таймлайна (Task 36) — e2e",
      "",
      `Прогон ${new Date().toISOString()}: talk-ru-cfr.mp4 (testsrc2 + речь, 1280×720, 30 fps, 20 с), вырезка 2,0–3,5 с;`,
      "сцены overlay-lower-third (кадры 150–240, прозрачная, графика в lower_third) и fullscreen-card (300–360);",
      "renderTimelineRange целиком, H.264 CRF 18 + AAC 192k 48 кГц. Ролик в git не кладётся.",
      "",
      ...notes,
      "",
      "Кадры: `frame-100.png` (вне сцен = кадр 145 исходника), `frame-200.png` (оверлей в lower_third поверх исходника),",
      "`frame-330.png` (полноэкранная сцена), уменьшены до 640 px.",
      "",
    ].join("\n"));
  }
  // MS_KEEP_TMP=1 — рабочий каталог (master, звук, ролик, кадры) остаётся для разбора
  if (tmp && process.env.MS_KEEP_TMP !== "1") await removeTmp(tmp);
  else if (tmp) console.log(`рабочий каталог e2e: ${tmp}`);
});

it("renderTimelineRange целиком: ffprobe, кадры по исходнику, прозрачность вне зоны, полноэкранная сцена, звук, origin", async () => {
  const card = await copyFixture("timeline/fullscreen-card", join(tmp, "card"));
  const lower = await copyFixture("timeline/overlay-lower-third", join(tmp, "lower"));
  // still полноэкранной сцены (кадр 30 = кадр 330 таймлайна) — тем же движком, рендером версии
  const s = await renderVersion({ versionDir: card, settings: await fixtureSettings("timeline/fullscreen-card"), cacheDir, stills: [30], preview: null, timeoutMs: T - 60_000, run: { root, runId: "still", attempt: 1 } });
  expect(s.ok ? undefined : s.error).toBeUndefined();
  cardStill = s.stills[0]!;
  const props = (dir: string) => JSON.parse(readFileSync(join(dir, "props.json"), "utf8")) as Record<string, unknown>;
  const frames = timelineFrames(tl);
  expect(frames).toBe(555);
  const out = join(tmp, "out");
  await mkdir(out);
  const t0 = Date.now();
  result = await renderTimelineRange({
    props: {
      width: W, height: H, fps: F30, duration_frames: frames,
      video: { path: master, sequences: clipsToSequences(tl) },
      audio: { path: audio.path },
      scenes: [
        { clip_id: "clip_lower", key: "S1", props: props(lower), start_frame: 150, duration_frames: 90, transparent: true, z: 1 },
        { clip_id: "clip_card", key: "S0", props: props(card), start_frame: 300, duration_frames: 60, transparent: false, z: 0 },
      ],
    },
    versionDirs: { S0: card, S1: lower },
    cacheDir,
    check: checkSceneDir,
    stills: [100, 200, 330],
    stillsDir: join(out, "frames"),
    output: { path: join(out, "timeline.mp4"), codec: "h264", crf: 18, scale: 1, audioBitrateKbps: 192, x264Preset: "medium" },
    timeoutMs: T - 120_000,
    run: { root, runId: "timeline", attempt: 1 },
  });
  notes.push(`- renderTimelineRange (бандл + 3 кадра + 555 кадров MP4): ${ms(t0)}`);
  expect(result.error).toBeUndefined();
  expect(result.ok).toBe(true);
  const file = result.outPath!;
  const p = result.probe!;
  notes.push(`- ffprobe: ${p.codec}+${p.audioCodec} ${p.width}×${p.height} ${p.fps.num}/${p.fps.den}, видео ${p.durationMs} мс, звук ${p.audioDurationMs} мс ${p.audioSampleRate} Гц ×${p.audioChannels}`);
  // [A] ffprobe
  expect([p.codec, p.audioCodec, p.audioSampleRate, p.width, p.height]).toEqual(["h264", "aac", 48_000, W, H]);
  expect(Math.abs(p.durationMs * 1000 - frameToUs(frames, F30))).toBeLessThanOrEqual(33_334);
  // [A] сэмплы звука монтажа
  expect(audio.samples).toBe(Math.round((tl.duration_us * 48_000) / 1e6));
  expect(audio.samples).toBe(888_000);

  const src = join(MEDIA, "talk-ru-cfr.mp4");
  const f100 = frameOf(file, 100, join(tmp, "t100.png"));
  // [A] кадр 100 (вне сцен) = кадр 145 исходника (вырезано 45 кадров), лучше соседних
  const near = [143, 144, 145, 146, 147].map((n) => ({ n, db: psnrOf(f100, frameOf(src, n, join(tmp, `s${n}.png`))) }));
  notes.push(`- кадр 100 против исходника: ${near.map((x) => `${x.n}: ${x.db.toFixed(1)} дБ`).join(", ")}`);
  const best = near.reduce((a, b) => (b.db > a.db ? b : a));
  expect(best.n).toBe(145);
  expect(best.db).toBeGreaterThanOrEqual(30);

  // [A] кадр 200: вне lower_third — исходник (кадр 245), внутри — графика сцены
  const f200 = frameOf(file, 200, join(tmp, "t200.png"));
  const s245 = frameOf(src, 245, join(tmp, "s245.png"));
  const r = layoutRectPx(ZONE_RECTS.lower_third, W, H);
  const outside = psnrOf(f200, s245, `${W}:${r.top}:0:0`);
  const inside = psnrOf(f200, s245, `${r.width}:${r.height}:${r.left}:${r.top}`);
  notes.push(`- кадр 200 против кадра 245 исходника: вне lower_third ${outside.toFixed(1)} дБ, внутри ${inside.toFixed(1)} дБ`);
  expect(outside).toBeGreaterThanOrEqual(35);
  expect(inside).toBeLessThan(25);

  // [A] кадр 330 = still сцены fullscreen-card (её кадр 30)
  const f330 = frameOf(file, 330, join(tmp, "t330.png"));
  const card330 = psnrOf(f330, cardStill);
  notes.push(`- кадр 330 против still fullscreen-card (кадр 30): ${card330.toFixed(1)} дБ`);
  expect(card330).toBeGreaterThanOrEqual(35);

  // [A] логи браузера: только свои origin
  const urls = result.browserLogs.flatMap((l) => l.match(/https?:\/\/[^\s"')]+/g) ?? []);
  const foreign = urls.filter((u) => !result.allowedOrigins.includes(new URL(u).origin));
  notes.push(`- allowedOrigins ${JSON.stringify(result.allowedOrigins)}; URL в логах: ${urls.length}, чужих: ${foreign.length}`);
  expect(result.allowedOrigins.some((o) => o.startsWith("http://127.0.0.1:"))).toBe(true);
  expect(foreign).toEqual([]);

  for (const [n, f] of [[100, f100], [200, f200], [330, f330]] as const) ff(["-i", f, "-vf", "scale=640:-2", join(EVIDENCE, `frame-${n}.png`)]);
  // стоп-кадры renderTimelineRange (PNG без кодека) — та же композиция, что и файл
  expect(result.stills.map((x) => x.split("/").at(-1))).toEqual(["100.png", "200.png", "330.png"]);
  expect(psnrOf(result.stills[2]!, cardStill)).toBeGreaterThanOrEqual(40);
}, T);
