// Task 34 Steps 2–3: новый видеопроект «Приёмка видео» → импорт копии-отрезка сырого ролика по
// пути через UI → [A] sha256 исходника до/после, копия 0444 (каталог a-w), APFS-клон; прокси CFR
// на timeline_fps, длительность ± 1 кадр, не перевёрнут (поворот −180 в матрице); waveform и
// миниатюры → «Распознать речь» (ru) → [A] контракт воркера, слова монотонны, в длительности,
// confidence null; [H→агент] 3 случайных сегмента (тексты и фрагменты для человека) → правка:
// 2 слова и вставка → r2 → [A] остальные id и время не изменились, r1 не изменена, вставка interpolated.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Job, MediaDto, TranscriptDto, TranscriptWord } from "@ms/contracts";
import { ASR_WORKER_SHA256 } from "../../../server/src/config.js";
import {
  ACC_ROOT, APP, Checks, db, ffprobe, getJson, importViaUi, newVideoProject, runFile, saveState, sha256File, shot, state, timing, waitJob, writeEvidence,
} from "./helpers.js";

const VISION = join(APP, "tools/vision-detect/bin/vision-detect");
const fpsNum = (r: string) => {
  const [a, b] = r.split("/").map(Number);
  return a! / (b || 1);
};

/** Кадр в PNG (gray 64×36) для сравнения ориентации; `vf` — доп. фильтр. */
function tiny(path: string, atS: number, vf = ""): Buffer {
  return execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(atS), "-protocol_whitelist", "file", "-i", `file:${path}`, "-frames:v", "1",
    "-vf", `${vf ? `${vf},` : ""}scale=64:36,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 20 });
}
const mad = (a: Buffer, b: Buffer) => a.reduce((s, x, i) => s + Math.abs(x - b[i]!), 0) / a.length;

/** Хеши всех файлов каталога ревизии (r1 «до» и «после» правки). */
function dirHashes(rel: string): Promise<Record<string, string>> {
  const dir = join(ACC_ROOT, rel);
  return Promise.all(readdirSync(dir).map(async (f) => [f, await sha256File(join(dir, f))] as const)).then(Object.fromEntries);
}

export default function importAsr(): void {
  test("Step 2–3: импорт сырого отрезка, ASR, правка транскрипта", async ({ page }) => {
    const c = new Checks("import");
    const st = state();
    const t0 = Date.now();
    const projectId = await newVideoProject(page, `Приёмка видео ${new Date().toISOString().slice(0, 16)}`);
    saveState({ projectId });
    await shot(page, "import", "01-new-video-project");

    // импорт по пути через UI
    const srcBefore = await sha256File(st.video.path);
    const importJob = await importViaUi(page, st.video.path);
    const imp = await waitJob(page.request, importJob.id, 90 * 60_000);
    c.check("2.1", "импорт завершён", imp.status === "completed", { status: imp.status, error: imp.error });
    timing("import", { wall_ms: Date.now() - t0, note: `${imp.created_at} → ${imp.finished_at}` });
    await expect(page.getByTestId("media-info")).toContainText("кадр/с", { timeout: 60_000 });
    await expect(page.locator(".proxy-player video")).toHaveJSProperty("readyState", 4, { timeout: 60_000 });
    await shot(page, "import", "02-media-imported");

    const video = await getJson<{ media: MediaDto }>(page.request, `/api/projects/${projectId}/video`);
    const m = video.media;
    saveState({ mediaId: m.asset.id });
    writeEvidence("import", "media.json", m);
    const srcAfter = await sha256File(st.video.path);
    const copy = join(ACC_ROOT, m.asset.rel_path);
    const copySha = await sha256File(copy);
    c.check("2.2", "sha256 исходника до = после = копии = asset.sha256", srcBefore === srcAfter && srcAfter === copySha && copySha === m.asset.sha256,
      { srcBefore, srcAfter, copySha, asset: m.asset.sha256 });
    const mode = statSync(copy).mode & 0o777;
    const dirMode = statSync(join(copy, "..")).mode & 0o777;
    c.check("2.3", "копия 0444, каталог без записи (a-w)", mode === 0o444 && (dirMode & 0o222) === 0, { mode: mode.toString(8), dir: dirMode.toString(8) });
    c.check("2.4", "тот же том → APFS-клон (cloned: true)", m.asset.import.cloned === true, m.asset.import);
    const p = m.asset.probe;
    c.check("2.5", "поворот 180 распознан", p.video.rotation === 180, { rotation: p.video.rotation, display: [p.video.display_width, p.video.display_height] });
    // iPhone «VFR ~29,997»: средняя частота ниже номинальной из-за редких пропусков кадров; детектор
    // (std Δ / mean Δ > 2 %) решает, VFR ли это, — справочно; прокси в любом случае CFR (2.7)
    c.note("2.5b", "VFR по детектору (справочно)", { vfr: p.vfr, r: p.video.r_frame_rate, avg: p.video.avg_frame_rate, timeline_fps: p.timeline_fps }, "info");

    // прокси: CFR на timeline_fps, длительность ± 1 кадр, ориентация
    const deriv = db((d) => d.prepare("SELECT kind, rel_path, params_json FROM media_derivatives WHERE media_id = ?").all(m.asset.id)) as { kind: string; rel_path: string; params_json: string }[];
    writeEvidence("import", "derivatives.json", deriv.map((x) => ({ ...x, params: JSON.parse(x.params_json), params_json: undefined })));
    const kinds = new Set(deriv.map((x) => x.kind));
    c.check("2.6", "производные: proxy, waveform, thumbs, audio16k", ["proxy", "waveform", "thumbs", "audio16k"].every((k) => kinds.has(k)), [...kinds]);
    const proxy = join(ACC_ROOT, deriv.find((x) => x.kind === "proxy")!.rel_path);
    const pp = ffprobe(proxy, ["-count_packets"]);
    writeEvidence("import", "proxy.ffprobe.json", pp);
    writeEvidence("import", "source.ffprobe.json", ffprobe(st.video.path));
    const pv = pp.streams.find((s) => s.codec_type === "video")!;
    const tl = p.timeline_fps.num / p.timeline_fps.den;
    const frameS = 1 / tl;
    const proxyDur = Number(pv.duration ?? pp.format.duration);
    c.check("2.7", "прокси CFR: r_frame_rate = avg_frame_rate = timeline_fps", Math.abs(fpsNum(pv.r_frame_rate!) - tl) < 1e-6 && Math.abs(fpsNum(pv.avg_frame_rate!) - tl) < 1e-3,
      { r: pv.r_frame_rate, avg: pv.avg_frame_rate, timeline_fps: p.timeline_fps });
    c.check("2.8", "длительность прокси = исходника ± 1 кадр", Math.abs(proxyDur - p.duration_us / 1e6) <= frameS + 1e-6, { proxy_s: proxyDur, source_s: p.duration_us / 1e6, frame_s: frameS });
    c.check("2.9", "прокси горизонтальный (поворот применён к размеру)", pv.width! > pv.height!, { w: pv.width, h: pv.height });
    // ориентация: кадр прокси совпадает с кадром исходника (ffmpeg применяет матрицу), а не с перевёрнутым
    const at = Math.min(60, p.duration_us / 2e6);
    const ref = tiny(st.video.path, at);
    const direct = mad(tiny(proxy, at), ref);
    const flipped = mad(tiny(proxy, at, "hflip,vflip"), ref);
    c.check("2.10", "кадр прокси не перевёрнут (ближе к исходнику, чем к повороту на 180°)", direct * 3 < flipped, { mad_direct: direct, mad_flipped: flipped });
    const framePng = runFile("proxy-frame.png");
    execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-ss", String(at), "-protocol_whitelist", "file", "-i", `file:${proxy}`, "-frames:v", "1", "-vf", "scale=480:-2", `file:${framePng}`]);
    const thumbJpg = runFile("thumb-5.jpg");
    const thumbPng = runFile("thumb-5.png");
    const th = await page.request.get(`/api/media/${m.asset.id}/thumbs/5.jpg`);
    c.check("2.11", "миниатюра отдаётся", th.ok(), th.status());
    writeFileSync(thumbJpg, await th.body());
    execFileSync("sips", ["-s", "format", "png", thumbJpg, "--out", thumbPng], { stdio: "ignore" });
    const vis = JSON.parse(execFileSync(VISION, [framePng, thumbPng], { encoding: "utf8" })) as { faces?: { x: number; y: number; w: number; h: number }[] }[];
    c.check("2.12", "Vision: лицо на кадре прокси и на миниатюре", vis.every((f) => (f.faces ?? []).length > 0), vis.map((f) => f.faces));
    execFileSync("cp", [framePng, join(APP, "../../docs/evidence/phase-2/import/proxy-frame-480.png")]);
    execFileSync("sips", ["-Z", "480", thumbJpg, "--out", join(APP, "../../docs/evidence/phase-2/import/thumb-5-480.jpg")], { stdio: "ignore" });
    await expect(page.getByTestId("waveform")).toBeVisible();
    await expect(page.locator(".thumb img").first()).toBeVisible();

    // ASR через UI
    const t1 = Date.now();
    await expect(page.getByRole("button", { name: "Распознать речь", exact: true })).toBeEnabled({ timeout: 60_000 });
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/transcribe$/.test(r.url())),
      page.getByRole("button", { name: "Распознать речь", exact: true }).click(),
    ]);
    const asrJob = ((await resp.json()) as { job: Job }).job;
    const asr = await waitJob(page.request, asrJob.id, 90 * 60_000);
    c.check("2.13", "ASR завершён", asr.status === "completed", { status: asr.status, error: asr.error });
    timing("asr", { wall_ms: Date.now() - t1, note: `${asr.created_at} → ${asr.finished_at}` });
    const v2 = await getJson<{ transcript: { id: string } }>(page.request, `/api/projects/${projectId}/video`);
    const transcriptId = v2.transcript.id;
    saveState({ transcriptId });
    const r1 = await getJson<TranscriptDto>(page.request, `/api/transcripts/${transcriptId}?revision=1`);
    writeEvidence("asr", "transcript-r1.json", r1.doc);
    const words = r1.doc.words;
    c.check("2.14", "asr.worker_sha256 = закреплённому", r1.doc.asr?.worker_sha256 === ASR_WORKER_SHA256, { got: r1.doc.asr, expected: ASR_WORKER_SHA256 });
    const mono = words.every((w, i) => w.start_us <= w.end_us && (i === 0 || w.start_us >= words[i - 1]!.start_us));
    c.check("2.15", "слова монотонны (start ≤ end, start не убывает)", mono && words.length > 100, { words: words.length });
    const durUs = p.duration_us;
    const lastEnd = Math.max(...words.map((w) => w.end_us));
    c.check("2.16", "слова в пределах длительности ± 0,1 с", lastEnd <= durUs + 100_000 && words[0]!.start_us >= 0, { last_end_s: lastEnd / 1e6, duration_s: durUs / 1e6 });
    c.check("2.17", "confidence слов = null", words.every((w) => w.confidence === null));
    const asrRuns = db((d) => d.prepare("SELECT cmd, pid, pgid, exit_code FROM job_processes WHERE job_id = ?").all(asr.id));
    writeEvidence("asr", "asr-job.json", { job: asr, processes: asrRuns });

    // [H→агент] 3 случайных сегмента: тексты и времена (фрагменты для человека — в отчёте)
    const segs = r1.doc.segments;
    const pickIdx = [0.2, 0.5, 0.8].map((q) => Math.floor(q * segs.length));
    const byId = new Map(words.map((w) => [w.id, w]));
    const sample = pickIdx.map((i) => {
      const s = segs[i]!;
      return { segment: s.id, start_s: s.start_us / 1e6, end_s: s.end_us / 1e6, text: s.word_ids.map((id) => byId.get(id)?.text).join(" ") };
    });
    writeEvidence("asr", "segments-sample.json", sample);
    c.note("2.H", "3 сегмента ASR: текст соответствует речи — требует подтверждения человеком (фрагменты в MotionStudio-примеры)", sample);
    await page.getByRole("tab", { name: "Транскрипт" }).click();
    await expect(page.locator(".word").nth(10)).toBeVisible({ timeout: 30_000 });
    await shot(page, "asr", "03-transcript-r1");
  });
}

/** Step 3 — отдельным тестом: продолжается с MS_ACC_ONLY=transcript-edit на проекте из state.json. */
export function transcriptEdit(): void {
  test("Step 3: правка транскрипта — 2 слова и вставка → r2", async ({ page }) => {
    const c = new Checks("transcript-edit");
    const { projectId, transcriptId } = state();
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("tab", { name: "Транскрипт" }).click();
    await expect(page.locator(".word").nth(10)).toBeVisible({ timeout: 30_000 });
    const r1 = await getJson<TranscriptDto>(page.request, `/api/transcripts/${transcriptId}?revision=1`);
    const words = r1.doc.words;
    const segs = r1.doc.segments;
    const byId = new Map(words.map((w) => [w.id, w]));
    // правка — 2 слова и вставка в одном сегменте (≥ 6 слов, без отдельных знаков)
    const r1File = db((d) => d.prepare("SELECT rel_path FROM transcript_revisions WHERE transcript_id = ? AND revision = 1").pluck().get(transcriptId)) as string;
    const r1Rel = r1File.endsWith(".json") ? r1File.slice(0, r1File.lastIndexOf("/")) : r1File;
    const r1Before = await dirHashes(r1Rel);
    const segIdx = segs.findIndex((s, i) => i > segs.length / 3 && s.word_ids.length >= 6 && s.word_ids.every((id) => /\p{L}/u.test(byId.get(id)!.text)));
    const seg = segs[segIdx]!;
    const segWords = seg.word_ids.map((id) => byId.get(id)!);
    const fixed = [1, 4].map((k) => segWords[k]!);
    const newText = segWords.map((w, k) => {
      const bare = w.text.trim();
      if (k === 1 || k === 4) return bare.replace(/\p{L}+/u, (x) => `${x}ов`);
      if (k === 2) return `${bare} ВСТАВКА`;
      return bare;
    }).join(" ");
    await page.locator(`[data-segment-id="${seg.id}"]`).getByRole("button", { name: "Править" }).click();
    const ta = page.getByRole("textbox", { name: "Текст сегмента" });
    const original = await ta.inputValue();
    await ta.fill(newText);
    const [save] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && /\/api\/transcripts\/[^/]+\/revisions$/.test(r.url())),
      page.getByRole("button", { name: "Сохранить" }).click(),
    ]);
    c.check("3.1", "правка сохранена → r2", save.status() === 201, save.status());
    await expect(page.locator(".panel h2 .badge")).toHaveText("ревизия r2");
    await shot(page, "transcript-edit", "04-transcript-r2");
    const r2 = await getJson<TranscriptDto>(page.request, `/api/transcripts/${transcriptId!}`);
    writeEvidence("transcript-edit", "transcript-r2.json", r2.doc);
    writeEvidence("transcript-edit", "edit.json", { segment: seg.id, original, new_text: newText, fixed: fixed.map((w) => w.id), ops: r2.doc.ops });
    const r2ById = new Map(r2.doc.words.map((w) => [w.id, w]));
    const untouched = words.filter((w) => !fixed.some((f) => f.id === w.id));
    const changed = untouched.filter((w) => {
      const x = r2ById.get(w.id);
      return !x || x.start_us !== w.start_us || x.end_us !== w.end_us;
    });
    c.check("3.2", "у остальных слов id и таймкоды не изменились", changed.length === 0, { changed: changed.slice(0, 10).map((w) => ({ w, now: r2ById.get(w.id) ?? null })) });
    const textChanged = untouched.filter((w) => r2ById.get(w.id) && r2ById.get(w.id)!.text !== w.text);
    c.check("3.2b", "текст остальных слов не изменился (пунктуация не слита)", textChanged.length === 0,
      textChanged.slice(0, 10).map((w) => ({ id: w.id, r1: w.text, r2: r2ById.get(w.id)!.text })));
    const inserted = r2.doc.words.filter((w: TranscriptWord) => !words.some((x) => x.id === w.id));
    c.check("3.3", "вставленное слово — interpolated, id <пред>.<k>", inserted.some((w) => /ВСТАВКА/.test(w.text) && w.timing === "interpolated" && /\.\d+$/.test(w.id)),
      inserted);
    const fixedNow = fixed.map((f) => ({ r1: f, r2: r2ById.get(f.id) ?? null, replaced_by: r2.doc.words.filter((w) => w.text.includes(`${f.text.trim().match(/\p{L}+/u)?.[0]}ов`)) }));
    c.note("3.N", "исправленные слова: сохранили id или заменены новыми (справочно)", fixedNow, "info");
    const r1After = await dirHashes(r1Rel);
    c.check("3.4", "r1 не изменена (sha256 файлов каталога ревизии)", JSON.stringify(r1Before) === JSON.stringify(r1After), { before: r1Before, after: r1After });
    const r1Again = await getJson<TranscriptDto>(page.request, `/api/transcripts/${transcriptId}?revision=1`);
    c.check("3.5", "r1 открывается и равна исходной", JSON.stringify(r1Again.doc) === JSON.stringify(r1.doc));
    const r1Item = page.locator('.revision-list li[data-revision="1"]');
    await r1Item.getByRole("button", { name: "Открыть" }).click();
    await expect(page.getByText("Открыта ревизия r1 — только чтение.")).toBeVisible();
    await r1Item.getByRole("button", { name: "Сравнить с текущей" }).click();
    await expect(page.getByTestId("word-diff")).toContainText("ВСТАВКА");
    await shot(page, "transcript-edit", "05-r1-vs-r2");
    await page.getByRole("button", { name: "К текущей" }).click();
    writeEvidence("transcript-edit", "words-diff.json", { inserted, changed_text: textChanged.map((w) => ({ id: w.id, r1: w.text, r2: r2ById.get(w.id)?.text })), removed: r2.doc.removed_word_ids });
    expect(readFileSync(join(ACC_ROOT, r1Rel, "transcript.json"), "utf8").length).toBeGreaterThan(0);
  });
}
