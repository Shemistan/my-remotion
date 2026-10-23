// Реальный экспорт (Task 19, P1-14): Remotion renderMedia → MP4 H.264/AAC и ProRes 4444 с
// альфой, ffprobe и ffmpeg. Запуск: `make e2e`. Пишет только в tmp/ репозитория.
// Evidence — tmp/export-evidence/; в docs/evidence/phase-1/export/ — с MS_WRITE_EVIDENCE=1
// (README с временем экспорта, ffprobe, кадры сверки; сами ролики туда не кладутся).
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { type AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExportRequest, ProbeResult, Settings } from "@ms/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { alphaAtCorner } from "../src/node/alpha.js";
import { ensureRenderBrowser } from "../src/node/browser.js";
import { type ExportResult, type ExportVersionRequest, exportVersion } from "../src/node/export-version.js";
import type { TempoCheck } from "../src/node/tempo.js";
import { ffprobe, findOnPath } from "../src/node/ffprobe.js";
import { renderVersion } from "../src/node/render-version.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "./helpers.js";

const T = 600_000;
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const EVIDENCE = join(REPO, process.env.MS_WRITE_EVIDENCE === "1" ? "docs/evidence/phase-1/export" : "tmp/export-evidence");
/** Каталог с роликами прогона (для ручного просмотра), не удаляется в конце. */
const OUT = join(REPO, "tmp/export-evidence/files");

let tmp: string;
let root: string;
let cacheDir: string;
let ffmpeg: string;
const rows: { name: string; request: ExportRequest; ms: number; probe?: ProbeResult; sizeMb?: number; note?: string }[] = [];

beforeAll(async () => {
  await ensureRenderBrowser();
  ffmpeg = (await findOnPath("ffmpeg"))!;
  expect(ffmpeg, "ffmpeg не найден в PATH").toBeTruthy();
  tmp = await makeTmp();
  root = await makeStore(tmp);
  cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  mkdirSync(OUT, { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });
}, T);

afterAll(async () => {
  const lines = [
    "# Экспорт сцены (Task 19, P1-14) — e2e",
    "",
    `Прогон ${new Date().toISOString()}, Remotion renderMedia, Chrome Headless Shell, ffprobe/ffmpeg системные.`,
    "Время — стена экспорта целиком (бандл из кэша, если уже собран, рендер кадров, кодирование, ffprobe).",
    "",
    "| Экспорт | Запрос | Время, с | Файл | ffprobe | Заметка |",
    "|---|---|---|---|---|---|",
    ...rows.map((r) => {
      const p = r.probe;
      const probe = p ? `${p.codec}${p.audioCodec ? `+${p.audioCodec}` : ""} ${p.pixFmt ?? ""} ${p.width}×${p.height} ${p.fps.num}/${p.fps.den} ${p.durationMs} мс` : "—";
      return `| ${r.name} | ${JSON.stringify(r.request)} | ${(r.ms / 1000).toFixed(1)} | ${r.sizeMb !== undefined ? `${r.sizeMb.toFixed(1)} МБ` : "—"} | ${probe} | ${r.note ?? ""} |`;
    }),
    "",
  ];
  writeFileSync(join(EVIDENCE, "README.md"), lines.join("\n"));
  console.log(lines.join("\n"));
  if (tmp) await removeTmp(tmp);
});

let n = 0;
async function run(name: string, fixture: string, request: ExportRequest, o: { settings?: Settings; props?: (p: Record<string, unknown>) => Record<string, unknown>; note?: string; stills?: number[] } = {}) {
  const versionDir = await copyFixture(fixture, join(tmp, `${name}-v`));
  if (o.props) writeFileSync(join(versionDir, "props.json"), JSON.stringify(o.props(JSON.parse(readFileSync(join(versionDir, "props.json"), "utf8")) as Record<string, unknown>)));
  if (o.stills) {
    // стоп-кадры версии в её fps — как у опубликованной версии (по ним сверяется темп)
    const s = await renderVersion({
      versionDir, settings: o.settings ?? (await fixtureSettings(fixture)), cacheDir, stills: o.stills, preview: null, timeoutMs: T - 60_000,
      run: { root, runId: `st${++n}`, attempt: 1 },
    });
    expect(s.ok ? undefined : s.error).toBeUndefined();
  }
  const outDir = join(tmp, `${name}-out`);
  await mkdir(outDir);
  const outPath = join(outDir, request.format === "prores4444" ? "scene.mov" : "scene.mp4");
  const req: ExportVersionRequest = {
    versionDir, settings: o.settings ?? (await fixtureSettings(fixture)), request, cacheDir, outPath, timeoutMs: T - 60_000,
    run: { root, runId: `exp${++n}`, attempt: 1 },
  };
  const t0 = performance.now();
  const r = await exportVersion(req);
  const ms = Math.round(performance.now() - t0);
  let sizeMb: number | undefined;
  if (r.ok) {
    const keep = join(OUT, `${name}.${request.format === "prores4444" ? "mov" : "mp4"}`);
    copyFileSync(outPath, keep);
    sizeMb = readFileSync(outPath).length / 1024 / 1024;
    writeFileSync(join(EVIDENCE, `${name}.ffprobe.json`), JSON.stringify(r.probe, null, 2) + "\n");
  }
  rows.push({ name, request, ms, ...(r.ok ? { probe: r.probe } : {}), ...(sizeMb !== undefined ? { sizeMb } : {}), ...(o.note ? { note: o.note } : {}) });
  return { r, outPath, req };
}

function expectOk(r: ExportResult): asserts r is Extract<ExportResult, { ok: true }> {
  expect(r.ok ? undefined : r.error).toBeUndefined();
  if (!r.ok) throw new Error("экспорт не удался");
  expect(r.gate).toEqual([]);
}

/** RGBA прямоугольника кадра `frame` видео (ffmpeg → rawvideo). */
function region(path: string, frame: number, rect: { x: number; y: number; w: number; h: number }): Buffer {
  return execFileSync(ffmpeg, [
    "-v", "error", "-nostdin", "-i", path, "-vf", `select=eq(n\\,${frame}),crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`,
    "-fps_mode", "passthrough", "-frames:v", "1", "-pix_fmt", "rgba", "-f", "rawvideo", "-",
  ], { maxBuffer: 64 * 1024 * 1024 });
}

/** Средняя абсолютная разница RGB, 0..1 (как frameDelta QA). */
function delta(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
  return sum / ((a.length / 4) * 3 * 255);
}

/** Кадр в PNG для evidence. */
function png(path: string, frame: number, out: string): void {
  execFileSync(ffmpeg, ["-v", "error", "-nostdin", "-y", "-i", path, "-vf", `select=eq(n\\,${frame})`, "-fps_mode", "passthrough", "-frames:v", "1", out]);
}

const MP4: ExportRequest = { format: "mp4", crf: 18, scale: 1 };
let kit30: ProbeResult;

it("kit-gallery → mp4: gate пуст, ffprobe h264 + aac, 1920×1080, 30/1", async () => {
  const { r, outPath } = await run("kit-gallery-30", "kit-gallery", MP4);
  expectOk(r);
  expect(r.probe).toMatchObject({ codec: "h264", audioCodec: "aac", width: 1920, height: 1080, fps: { num: 30, den: 1 } });
  expect(Math.abs(r.probe.durationMs - 5000)).toBeLessThanOrEqual(1000 / 30 + 0.001);
  // ffprobe вне реестра даёт то же
  expect(await ffprobe(outPath)).toEqual(r.probe);
  kit30 = r.probe;
}, T);

it("09 §1 п.5: повторный экспорт той же версии → та же длительность и размеры", async () => {
  const { r } = await run("kit-gallery-30-repeat", "kit-gallery", MP4, { note: "повтор: бандл из кэша" });
  expectOk(r);
  expect({ d: r.probe.durationMs, w: r.probe.width, h: r.probe.height }).toEqual({ d: kit30.durationMs, w: kit30.width, h: kit30.height });
}, T);

it("F2: kit-gallery (props вне ScenePropsBase) → mp4 60 fps: отказ fps_change_unsupported до рендера", async () => {
  const { r } = await run("kit-gallery-60", "kit-gallery", { ...MP4, fps: 60 }, { note: "props вне ScenePropsBase — отказ до рендера" });
  expect(r).toMatchObject({ ok: false, error: { stage: "unsupported" } });
  if (!r.ok) expect(r.error.message).toMatch(/^fps_change_unsupported: props версии вне договора ScenePropsBase/);
}, T);

/** Тайминги kit-gallery зашиты в код: props по договору ничего не масштабируют. */
const kitBase = () => ({
  timing: { duration_frames: 150, beats: [] },
  style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false },
  content: {},
});

it("F2: kit-gallery с props по договору → mp4 60 fps: файл верный по gate, но сверка темпа → расхождение (кадры в коде)", async () => {
  const stills = [15, 40, 70, 100, 130];
  const { r } = await run("kit-gallery-60-tempo", "kit-gallery", { ...MP4, fps: 60 }, { props: kitBase, stills, note: "кадры зашиты в код — fps_tempo_mismatch" });
  expectOk(r);
  expect(r.probe.fps).toEqual({ num: 60, den: 1 });
  expect(Math.abs(r.probe.durationMs - 5000)).toBeLessThanOrEqual(1000 / 60 + 0.001);
  expect(r.tempo).not.toBeNull();
  const samples = tempoText(r.tempo!);
  console.log(`kit-gallery 60 fps, сверка темпа: ${samples}`);
  rows.push({ name: "kit-gallery-60-tempo: сверка", request: { ...MP4, fps: 60 }, ms: 0, note: `кадр→кадр экспорта: худшая клетка / клеток > 0,03: ${samples}; расхождение: ${r.tempo!.mismatched.join(", ")}` });
  writeFileSync(join(EVIDENCE, "kit-gallery-60-tempo.json"), JSON.stringify(r.tempo, null, 2) + "\n");
  expect(r.tempo!.mismatched.length).toBeGreaterThan(0);
}, T);

/** Сэмплы сверки: «кадр→кадр экспорта: худшая/клеток», * — стоп-кадр дорендерен. */
const tempoText = (t: TempoCheck) => t.samples.map((s) => `${s.frame}${s.rendered ? "*" : ""}→${s.exportFrame}: ${s.maxTile}/${s.hotTiles}`).join(", ");

it("R1: kit-gallery с props по договору → mp4 24 fps: только точные моменты (n кратно 5), расхождение — кадры в коде", async () => {
  const { r } = await run("kit-gallery-24-tempo", "kit-gallery", { ...MP4, fps: 24 }, { props: kitBase, stills: [15, 40, 70, 100, 130], note: "кадры зашиты в код — fps_tempo_mismatch" });
  expectOk(r);
  for (const s of r.tempo!.samples) expect(s.frame % 5).toBe(0);
  rows.push({ name: "kit-gallery-24-tempo: сверка", request: { ...MP4, fps: 24 }, ms: 0, note: `${tempoText(r.tempo!)}; расхождение: ${r.tempo!.mismatched.join(", ")}` });
  expect(r.tempo!.mismatched.length).toBeGreaterThan(0);
}, T);

for (const fps of [24, 25, 50] as const) {
  it(`R1: сцена с props.timing → mp4 ${fps} fps: стоп-кадры 13/43/70 не кратны — дорендер ближайших кратных, темп совпал`, async () => {
    const opaque = { ...(await fixtureSettings("transparent-scene")), transparent_export: false };
    const props = (p: Record<string, unknown>) => ({ ...p, style: { ...(p.style as object), transparent: false } });
    const { r } = await run(`timed-${fps}`, "transparent-scene", { ...MP4, fps }, { settings: opaque, props, stills: [13, 43, 70] });
    expectOk(r);
    const step = { 24: 5, 25: 6, 50: 3 }[fps];
    for (const s of r.tempo!.samples) {
      expect(s.frame % step).toBe(0);
      expect(s.exportFrame).toBe((s.frame * fps) / 30);
    }
    expect(r.tempo!.samples.some((s) => s.rendered)).toBe(true);
    rows.push({ name: `timed-${fps}: сверка`, request: { ...MP4, fps }, ms: 0, note: tempoText(r.tempo!) });
    expect(r.tempo!.mismatched).toEqual([]);
  }, T);
}

it("F1: 7 с (210 кадров при 30 fps) → mp4 60 fps: gate по видеопотоку проходит, звук AAC длиннее на хвост кадра", async () => {
  const s7 = { ...(await fixtureSettings("transparent-scene")), transparent_export: false, duration_frames: 210 };
  const props = (p: Record<string, unknown>) => ({
    ...p,
    timing: { duration_frames: 210, beats: [{ id: "cards", start_frame: 15, end_frame: 60 }, { id: "title", start_frame: 0, end_frame: 210 }] },
    style: { ...(p.style as object), transparent: false },
  });
  const { r } = await run("seven-60", "transparent-scene", { ...MP4, fps: 60 }, { settings: s7, props, stills: [30, 105, 180], note: "F1: до исправления gate давал duration 7019 мс против 7000 ± 16,667" });
  expectOk(r);
  expect(r.probe.durationMs).toBe(7000);
  expect(r.probe.audioDurationMs).toBeGreaterThan(7000);
  expect(r.tempo?.mismatched).toEqual([]);
}, T);

it("M11: сцена с props.timing — кадр 60 из 60 fps совпадает с кадром 30 из 30 fps в области элемента", async () => {
  const opaque = { ...(await fixtureSettings("transparent-scene")), transparent_export: false };
  const props = (p: Record<string, unknown>) => ({ ...p, style: { ...(p.style as object), transparent: false } });
  const a = await run("timed-30", "transparent-scene", MP4, { settings: opaque, props });
  expectOk(a.r);
  expect(a.r.tempo).toBeNull();
  const b = await run("timed-60", "transparent-scene", { ...MP4, fps: 60 }, { settings: opaque, props, stills: [15, 30, 45, 60, 75] });
  expectOk(b.r);
  // сверка темпа по стоп-кадрам версии: темп из props — расхождений нет
  expect(b.r.tempo?.mismatched).toEqual([]);
  rows.push({ name: "timed-60: сверка", request: { ...MP4, fps: 60 }, ms: 0, note: tempoText(b.r.tempo!) });
  expect(b.r.probe.fps).toEqual({ num: 60, den: 1 });
  expect(Math.abs(b.r.probe.durationMs - a.r.probe.durationMs)).toBeLessThanOrEqual(1000 / 60 + 0.001);
  // ряд карточек (вход 15..60 кадров при 30 fps): кадр 30 — середина входа первой карточки
  const cards = { x: 200, y: 300, w: 880, h: 340 };
  const at30 = region(a.outPath, 30, cards);
  const d = delta(at30, region(b.outPath, 60, cards));
  // контроль: тот же номер кадра на 60 fps — это 0,5 с, вход в другой фазе
  const wrong = delta(at30, region(b.outPath, 30, cards));
  console.log(`frameDelta 30@30 vs 60@60 = ${d.toFixed(5)}, vs 30@60 = ${wrong.toFixed(5)}`);
  rows.push({ name: "сверка M11", request: { ...MP4, fps: 60 }, ms: 0, note: `frameDelta кадр 30@30 fps vs 60@60 fps = ${d.toFixed(5)} (< 0.01); тот же номер кадра 30@60 fps = ${wrong.toFixed(5)}` });
  expect(d).toBeLessThan(0.01);
  expect(wrong).toBeGreaterThan(d * 3);
  png(a.outPath, 30, join(EVIDENCE, "timed-30-f30.png"));
  png(b.outPath, 60, join(EVIDENCE, "timed-60-f60.png"));
  png(b.outPath, 30, join(EVIDENCE, "timed-60-f30.png"));
}, T);

it("transparent-scene → prores4444: альфа-формат (yuva444p10le / yuva444p12le по ffprobe), альфа угла кадра 30 = 0, карточки непрозрачны", async () => {
  const { r, outPath } = await run("transparent-prores", "transparent-scene", { format: "prores4444", crf: 18, scale: 1 });
  expectOk(r);
  expect(r.probe.pixFmt).toMatch(/^yuva444p1[02]le$/);
  expect(r.probe).toMatchObject({ codec: "prores", profile: "4444", width: 1280, height: 720, fps: { num: 30, den: 1 } });
  expect(await alphaAtCorner(outPath, 30)).toBe(0);
  // центр средней карточки на кадре 75 (вход завершён) — непрозрачен
  expect(await alphaAtCorner(outPath, 75, { x: 640, y: 470 })).toBe(255);
  png(outPath, 75, join(EVIDENCE, "transparent-prores-f75.png"));
}, T);

/** Локальный сервис (как Control API): число запросов к нему за время `fn`. */
async function withService<T>(fn: (port: number) => Promise<T>): Promise<{ v: T; hits: number }> {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.end("ok");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  try {
    const v = await fn((server.address() as AddressInfo).port);
    return { v, hits };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

it("ruling 17: в режиме export Chrome не достаёт loopback, а Node-сторона /proxy и звук — под asset-guard", async () => {
  const loop = await withService((port) => run("loopback-export", "loopback-scene", MP4, { props: () => ({ port }) }));
  expect(loop.hits).toBe(0);
  expectOk(loop.v.r); // ассет бандла загрузился

  const fetchP = await withService((port) => run("proxy-fetch-export", "proxy-scene", MP4, { props: () => ({ port, mode: "fetch" }) }));
  expect(fetchP.hits).toBe(0);
  expectOk(fetchP.v.r);

  // звук с URL Node скачивает при сборке дорожки AAC — экспорт падает, сервис не тронут
  const audio = await withService((port) => run("proxy-audio-export", "proxy-scene", MP4, { props: () => ({ port, mode: "audio" }) }));
  expect(audio.hits).toBe(0);
  expect(audio.v.r).toMatchObject({ ok: false, error: { stage: "media" } });
  if (!audio.v.r.ok) expect(audio.v.r.error.message).toMatch(/ассет заблокирован/);
  // в run/processes не осталось записей
  expect(readdirSync(join(root, "run/processes"))).toEqual([]);
}, T);
