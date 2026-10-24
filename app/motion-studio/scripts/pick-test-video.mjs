#!/usr/bin/env node
// Выбор реального talking-head ролика для e2e анализа видеоряда и приёмки (Task 34 Step 1,
// Task 30 Step 2). Кандидаты по порядку — шортсы MyProtocol пользователя (согласие V4 —
// rulings 2026-10-24). Критерии: длительность 45–150 с, есть аудио, доля речи по
// `silencedetect=noise=-35dB:d=0.4` ≥ 50 %. Печатает выбранный путь, длительность, ориентацию,
// ffprobe и sha256 (JSON). Ни один не подошёл — код 1 и отчёт по всем: ролик называет человек.
// Ролики только читаются (ffprobe, ffmpeg -f null, sha256).
//   node scripts/pick-test-video.mjs [--all] [путь…]
//   --all — оценить всех кандидатов (без него — до первого подходящего)
/* global process, console */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const DIR = "/Volumes/External SSD/Youtube/FinalVideo/MyProtocol";
export const CANDIDATES = Array.from({ length: 11 }, (_, i) => `${DIR}/MyProtocol-shorts_${i + 1}.mov`);
export const CRITERIA = { minS: 45, maxS: 150, minSpeech: 0.5, noiseDb: -35, minSilenceS: 0.4 };

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

/** Оценка кандидата по ffprobe (`-show_format -show_streams` JSON) и stderr silencedetect. */
export function evaluate(probe, silenceStderr) {
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
  };
}

/** Первый подходящий по порядку кандидат или undefined. */
export function pick(evaluated) {
  return evaluated.find((e) => e.ok);
}

function probe(path) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", `file:${path}`], { maxBuffer: 64 << 20 }).toString());
}

function silencedetect(path) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-protocol_whitelist", "file", "-i", `file:${path}`, "-vn", "-af", `silencedetect=noise=${CRITERIA.noiseDb}dB:d=${CRITERIA.minSilenceS}`, "-f", "null", "-"], { maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`ffmpeg silencedetect ${path}: код ${r.status}`);
  return r.stderr.toString();
}

function sha256(path) {
  return new Promise((ok, fail) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (d) => h.update(d)).on("end", () => ok(h.digest("hex"))).on("error", fail);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const paths = args.filter((a) => a !== "--all");
  const list = paths.length ? paths : CANDIDATES;
  const report = [];
  for (const path of list) {
    if (!existsSync(path)) {
      report.push({ path, ok: false, reasons: ["нет файла"] });
      continue;
    }
    const p = probe(path);
    const hasAudio = p.streams?.some((s) => s.codec_type === "audio");
    const e = { path, ...evaluate(p, hasAudio ? silencedetect(path) : undefined) };
    report.push(e);
    console.error(`${e.ok ? "+" : "-"} ${path}: ${e.duration_s?.toFixed(1)} с, ${e.width}×${e.height} ${e.orientation}, речь ${(e.speech_ratio * 100).toFixed(0)} %${e.ok ? "" : ` — ${e.reasons.join("; ")}`}`);
    if (e.ok && !all) break;
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
