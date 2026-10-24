#!/usr/bin/env node
// Выбор реального talking-head ролика для e2e анализа видеоряда и приёмки (Task 34 Step 1,
// Task 30 Step 2). Кандидаты по порядку — шортсы MyProtocol пользователя (согласие V4 —
// rulings 2026-10-24). Критерии: длительность 45–150 с, есть аудио, доля речи по
// `silencedetect=noise=-35dB:d=0.4` ≥ 50 %, лицо (Apple Vision, площадь ≥ 1 % кадра) на ≥ 90 %
// кадров, взятых раз в секунду, и нет 2 с подряд без лица (шортсы смонтированы с полноэкранными
// вставками — их отсекают эти критерии; 90 % один пропускает шортс с вставками). Шортсы не подошли — длинный `MyProtocol.mov`: скан Vision с шагом 1 с и
// `scdet` ищут чистый talking-head отрезок 45–90 с внутри одного шота, отрезок вырезается КОПИЕЙ
// (перекодирование в `tmp/talking-head/`) и проверяется теми же критериями; sha256 оригинала до
// и после сверяется (оригиналы только читаются). Печатает выбранный путь, длительность,
// ориентацию, ffprobe и sha256 (JSON). Ничего не подошло — код 1 и отчёт: ролик называет человек.
//   node scripts/pick-test-video.mjs [--all] [--no-long] [--scan ОТ-ДО] [--out-dir КАТАЛОГ] [путь…]
//   --all — оценить всех кандидатов (без него — до первого подходящего)
//   --no-long — без поиска отрезка в длинном ролике
//   --scan 250-420 — искать отрезок только в этом диапазоне секунд длинного ролика (быстрее)
// Нужен собранный `tools/vision-detect/bin/vision-detect` (`npm run build:vision`).
/* global process, console, URL */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = "/Volumes/External SSD/Youtube/FinalVideo/MyProtocol";
export const CANDIDATES = Array.from({ length: 11 }, (_, i) => `${DIR}/MyProtocol-shorts_${i + 1}.mov`);
export const LONG_CANDIDATE = `${DIR}/MyProtocol.mov`;
export const CRITERIA = { minS: 45, maxS: 150, minSpeech: 0.5, noiseDb: -35, minSilenceS: 0.4, minFace: 0.9, minFaceArea: 0.01, maxFaceGapS: 1 };
/** Отрезок длинного ролика: 45–90 с, отступ от склейки, допустимый пропуск лица подряд (кадров). */
export const SEGMENT = { minS: 45, maxS: 90, marginS: 0.5, maxMissS: 1 };

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const VISION_BIN = fileURLToPath(new URL("../tools/vision-detect/bin/vision-detect", import.meta.url));

/** Суммарная тишина из stderr `silencedetect` (незакрытая тишина — до конца ролика). */
export function silenceSeconds(stderr, durationS) {
  let total = 0;
  let open;
  for (const line of stderr.split("\n")) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && open !== undefined) {
      total += Math.max(0, Math.min(Number(e[1]), durationS) - open);
      open = undefined;
    }
  }
  if (open !== undefined) total += Math.max(0, durationS - open);
  return total;
}

/** Ориентация по размеру кадра с учётом поворота (rotation ±90 — меняет местами). */
export function orientation(width, height, rotation = 0) {
  const swap = Math.abs(Math.round(rotation)) % 180 === 90;
  const [w, h] = swap ? [height, width] : [width, height];
  return w > h ? "landscape" : w < h ? "portrait" : "square";
}

/** Есть ли на кадре `vision-detect` лицо площадью ≥ `minArea` кадра (кадр с `error` — нет). */
export function hasFace(frame, minArea = CRITERIA.minFaceArea) {
  return frame.error === undefined && (frame.faces ?? []).some((f) => f.w * f.h >= minArea);
}

/** Доля кадров `vision-detect` с лицом (см. `hasFace`); кадров нет — 0. */
export function faceShare(frames, minArea = CRITERIA.minFaceArea) {
  return frames.length === 0 ? 0 : frames.filter((f) => hasFace(f, minArea)).length / frames.length;
}

/** Самая длинная серия кадров подряд без лица (при кадре раз в секунду — секунды). */
export function longestFaceGap(frames, minArea = CRITERIA.minFaceArea) {
  let best = 0;
  let cur = 0;
  for (const f of frames) {
    cur = hasFace(f, minArea) ? 0 : cur + 1;
    best = Math.max(best, cur);
  }
  return best;
}

/**
 * Оценка кандидата по ffprobe (`-show_format -show_streams` JSON), stderr silencedetect, доле
 * кадров с лицом (`undefined` — не мерилась: критерий не проверен, кандидат не проходит) и самой
 * длинной серии кадров без лица (раз в секунду; > `maxFaceGapS` — полноэкранная вставка: шортс
 * с вставками B-roll набирает 90 % лица, но анализ видеоряда даёт шоты без лица).
 */
export function evaluate(probe, silenceStderr, faceRatio, faceGapS = 0) {
  const durationS = Number(probe.format?.duration);
  const video = probe.streams?.find((s) => s.codec_type === "video");
  const hasAudio = Boolean(probe.streams?.some((s) => s.codec_type === "audio"));
  const rotation = Number(video?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0);
  const reasons = [];
  if (!Number.isFinite(durationS)) reasons.push("нет длительности");
  else if (durationS < CRITERIA.minS || durationS > CRITERIA.maxS) reasons.push(`длительность ${durationS.toFixed(1)} с вне ${CRITERIA.minS}–${CRITERIA.maxS} с`);
  if (!video) reasons.push("нет видео");
  if (!hasAudio) reasons.push("нет аудио");
  let speech = 0;
  if (hasAudio && Number.isFinite(durationS) && durationS > 0 && silenceStderr !== undefined) {
    speech = 1 - silenceSeconds(silenceStderr, durationS) / durationS;
    if (speech < CRITERIA.minSpeech) reasons.push(`речь ${(speech * 100).toFixed(0)} % < ${CRITERIA.minSpeech * 100} %`);
  }
  if (faceRatio === undefined) reasons.push("лицо не проверено");
  else if (faceRatio < CRITERIA.minFace) reasons.push(`лицо на ${(faceRatio * 100).toFixed(0)} % кадров < ${CRITERIA.minFace * 100} %`);
  if (faceRatio !== undefined && faceGapS > CRITERIA.maxFaceGapS) reasons.push(`без лица ${faceGapS} с подряд > ${CRITERIA.maxFaceGapS} с (вставка)`);
  return {
    ok: reasons.length === 0,
    reasons,
    duration_s: durationS,
    width: video?.width,
    height: video?.height,
    rotation,
    orientation: video ? orientation(video.width, video.height, rotation) : undefined,
    has_audio: hasAudio,
    speech_ratio: Math.round(speech * 1000) / 1000,
    face_ratio: faceRatio === undefined ? undefined : Math.round(faceRatio * 1000) / 1000,
    face_gap_s: faceRatio === undefined ? undefined : faceGapS,
  };
}

/** Первый подходящий по порядку кандидат или undefined. */
export function pick(evaluated) {
  return evaluated.find((e) => e.ok);
}

/**
 * Чистый talking-head отрезок по скану: `samples` — `{ t, face }` раз в секунду (момент кадра,
 * с), `cutsS` — склейки (с), `durationS` — длина ролика. Отрезок лежит внутри одного шота с
 * отступом `marginS` от склеек, лицо на всех кадрах, кроме одиночных пропусков (не длиннее
 * `maxMissS` кадров подряд, не на краях); первый по времени длиной ≥ `minS`, обрезанный до `maxS`.
 * Нет такого — undefined.
 */
export function findTalkingHead(samples, cutsS, durationS, o = SEGMENT) {
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const bounds = [0, ...[...cutsS].filter((c) => c > 0 && c < durationS).sort((a, b) => a - b), durationS];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const lo = bounds[k] + (k > 0 ? o.marginS : 0);
    const hi = bounds[k + 1] - (k + 2 < bounds.length ? o.marginS : 0);
    const inShot = sorted.filter((s) => s.t >= lo && s.t <= hi);
    let i = 0;
    while (i < inShot.length) {
      if (!inShot[i].face) {
        i++;
        continue;
      }
      let j = i;
      let last = i;
      let miss = 0;
      while (j + 1 < inShot.length) {
        const next = inShot[j + 1];
        if (next.face) {
          miss = 0;
          last = j + 1;
        } else if (++miss > o.maxMissS) break;
        j++;
      }
      const start = Math.max(lo, inShot[i].t - 0.5);
      const end = Math.min(hi, inShot[last].t + 0.5);
      if (end - start >= o.minS) {
        const r = (v) => Math.round(v * 1000) / 1000;
        return { start_s: r(start), end_s: r(Math.min(end, start + o.maxS)) };
      }
      i = last + 1;
    }
  }
  return undefined;
}

/** Моменты склеек из stderr `scdet` + `metadata=print` (с). */
export function parseCuts(stderr) {
  return [...stderr.matchAll(/lavfi\.scd\.time=(-?[0-9.]+)/g)].map((m) => Number(m[1])).filter((x) => Number.isFinite(x));
}

function probe(path) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", `file:${path}`], { maxBuffer: 64 << 20 }).toString());
}

function silencedetect(path) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-protocol_whitelist", "file", "-i", `file:${path}`, "-vn", "-af", `silencedetect=noise=${CRITERIA.noiseDb}dB:d=${CRITERIA.minSilenceS}`, "-f", "null", "-"], { maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg silencedetect ${path}: код ${r.status}`);
  return r.stderr.toString();
}

const range = (from, to) => [...(from !== undefined ? ["-ss", String(from)] : []), ...(to !== undefined ? ["-t", String(to - (from ?? 0))] : [])];

/** Кадры раз в секунду (640 px) → `vision-detect` → `{ t, frame }` (t — секунды от начала файла). */
function visionScan(path, from, to) {
  if (!existsSync(VISION_BIN)) throw new Error(`нет ${VISION_BIN}: npm run build:vision`);
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  const dir = mkdtempSync(join(REPO, "tmp", "pick-frames-"));
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", ...range(from, to), "-protocol_whitelist", "file", "-i", `file:${path}`,
      "-an", "-vf", "fps=1,scale=640:-2", "-n", `file:${join(dir, "%06d.png")}`], { maxBuffer: 64 << 20 });
    const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    const out = [];
    for (let k = 0; k < files.length; k += 40) {
      const chunk = files.slice(k, k + 40).map((f) => join(dir, f));
      out.push(...JSON.parse(execFileSync(VISION_BIN, chunk, { maxBuffer: 64 << 20 }).toString()));
    }
    // кадр k фильтра fps=1 — момент k с от начала диапазона
    return out.map((frame, k) => ({ t: (from ?? 0) + k, frame }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function scdetCuts(path, from, to) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-nostdin", ...range(from, to), "-protocol_whitelist", "file", "-i", `file:${path}`, "-an",
    "-vf", "scale=320:-2,scdet=threshold=10:sc_pass=1,metadata=mode=print:key=lavfi.scd.time", "-f", "null", "-"], { maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg scdet ${path}: код ${r.status}`);
  return parseCuts(r.stderr.toString()).map((c) => c + (from ?? 0));
}

function sha256(path) {
  return new Promise((ok, fail) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", fail);
  });
}

function assess(path) {
  const p = probe(path);
  const hasAudio = p.streams?.some((s) => s.codec_type === "audio");
  const silence = hasAudio ? silencedetect(path) : undefined;
  // Vision — только если остальное прошло (дорого)
  const frames = evaluate(p, silence, 1).ok ? visionScan(path).map((x) => x.frame) : undefined;
  return { path, ...evaluate(p, silence, frames && faceShare(frames), frames && longestFaceGap(frames)) };
}

/** Отрезок длинного ролика → копия в `outDir` (оригинал только читается; sha256 до/после). */
async function fromLong(path, outDir, scan) {
  const before = await sha256(path);
  const durationS = Number(probe(path).format?.duration);
  const [from, to] = scan ?? [0, durationS];
  console.error(`скан ${path}: ${from}–${to} с (Vision раз в секунду, scdet)…`);
  const samples = visionScan(path, from, to).map(({ t, frame }) => ({ t, face: hasFace(frame) }));
  const cuts = scdetCuts(path, from, to);
  const seg = findTalkingHead(samples, [from, ...cuts, to].filter((c) => c > 0 && c < durationS), durationS);
  if (!seg) return { source: path, ok: false, reasons: ["нет чистого talking-head отрезка 45–90 с"], cuts };
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `MyProtocol-${seg.start_s}-${seg.end_s}.mov`);
  if (!existsSync(out)) {
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-nostdin", "-ss", String(seg.start_s), "-t", String(Math.round((seg.end_s - seg.start_s) * 1000) / 1000),
      "-protocol_whitelist", "file", "-i", `file:${path}`, "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-n", `file:${out}`]);
  }
  const after = await sha256(path);
  if (after !== before) throw new Error(`оригинал ${path} изменился: sha256 ${before} → ${after}`);
  return { ...assess(out), source: path, segment: seg, cuts, source_sha256: before, source_unchanged: true };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f);
  const value = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
  const scanArg = value("--scan");
  const scan = scanArg ? scanArg.split("-").map(Number) : undefined;
  const outDir = value("--out-dir") ?? join(REPO, "tmp", "talking-head");
  const skip = new Set([scanArg, value("--out-dir")].filter(Boolean));
  const paths = args.filter((a) => !a.startsWith("--") && !skip.has(a));
  const list = paths.length ? paths : CANDIDATES;
  const report = [];
  for (const path of list) {
    if (!existsSync(path)) {
      report.push({ path, ok: false, reasons: ["нет файла"] });
      continue;
    }
    const e = assess(path);
    report.push(e);
    console.error(`${e.ok ? "+" : "-"} ${path}: ${e.duration_s?.toFixed(1)} с, ${e.width}×${e.height} ${e.orientation}, речь ${(e.speech_ratio * 100).toFixed(0)} %, лицо ${e.face_ratio === undefined ? "—" : `${(e.face_ratio * 100).toFixed(0)} %, без лица подряд до ${e.face_gap_s} с`}${e.ok ? "" : ` — ${e.reasons.join("; ")}`}`);
    if (e.ok && !flag("--all")) break;
  }
  if (!pick(report) && !flag("--no-long") && !paths.length && existsSync(LONG_CANDIDATE)) {
    const e = await fromLong(LONG_CANDIDATE, outDir, scan);
    report.push(e);
    console.error(`${e.ok ? "+" : "-"} ${e.path ?? LONG_CANDIDATE}${e.segment ? ` (отрезок ${e.segment.start_s}–${e.segment.end_s} с)` : ""}${e.ok ? "" : ` — ${e.reasons.join("; ")}`}`);
  }
  const chosen = pick(report);
  if (!chosen) {
    console.log(JSON.stringify({ chosen: null, report }, null, 2));
    console.error("Ни один кандидат не подошёл: ролик называет человек.");
    process.exit(1);
  }
  const p = probe(chosen.path);
  console.log(JSON.stringify({ chosen: { ...chosen, sha256: await sha256(chosen.path) }, ffprobe: { format: p.format, streams: p.streams }, report }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
