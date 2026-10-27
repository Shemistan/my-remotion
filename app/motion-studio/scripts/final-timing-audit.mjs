#!/usr/bin/env node
// Аудит времени финала (Task 46, Test 4 `09` §7): для 10 слов, равномерно по оставленным (`mapWords` →
// `kept`) в ревизии EDL, по которой собран экспорт (`final-manifest.json` → `inputs.edl`), —
// `source_us`, `edited_us` (`sourceToEdited`), обратное отображение (`editedToSource`) и смещение звука
// `audioOffsetUs` в ФИНАЛЕ: окно 1 с исходного `audio16k` (от 300 мс до начала слова) ищется взаимной
// корреляцией в звуке final.mp4 (± 250 мс вокруг `edited_us`, шаг — отсчёт 16 кГц = 62,5 µs); порог —
// 1 кадр выходного fps. Слова — только с окном внутри одного оставленного куска (окно через стык
// сравнивало бы разный звук). Хранилище — `MS_DATA_DIR` (studio.db — readonly). Функции времени — из
// `@ms/contracts` (те же, что у сервера и UI): запуск через tsx.
//   MS_DATA_DIR=… node --import tsx scripts/final-timing-audit.mjs <exportId> [каталог вывода]
// Пишет `final-timing-audit.md` и `final-timing-audit.json`; итог — строка JSON в stdout; код 1 — провал.
/* global process, console, URL */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { acceptedCuts, buildTimeline, editedToSource, mapWords, sourceToEdited } from "@ms/contracts";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const Database = require("better-sqlite3");

const [exportId, outArg] = process.argv.slice(2);
const root = process.env.MS_DATA_DIR;
if (!exportId || !root) {
  console.error("usage: MS_DATA_DIR=… node --import tsx scripts/final-timing-audit.mjs <exportId> [out-dir]");
  process.exit(64);
}
const outDir = outArg ?? join(new URL("../../../docs/evidence/phase-5/test4", import.meta.url).pathname);
const SR = 16_000;
const WINDOW_US = 1_000_000;
const PRE_US = 300_000;
const SEARCH_US = 250_000;
const N = 10;

const d = new Database(join(root, "studio.db"), { readonly: true, fileMustExist: true });
const fe = d.prepare("SELECT * FROM final_exports WHERE id = ?").get(exportId);
if (!fe) throw new Error(`нет экспорта ${exportId}`);
const finalDir = fe.rel_path.endsWith(".mp4") ? join(root, fe.rel_path, "..") : join(root, fe.rel_path);
const finalMp4 = join(finalDir, "final.mp4");
const manifest = JSON.parse(readFileSync(join(finalDir, "final-manifest.json"), "utf8"));
const outFps = manifest.output.fps;
const frameUs = Math.ceil((1e6 * outFps.den) / outFps.num);
const asset = d.prepare("SELECT * FROM media_assets WHERE project_id = ?").get(fe.project_id);
const fps = { num: asset.timeline_fps_num, den: asset.timeline_fps_den };
const edlRef = manifest.inputs.edl;
const rev = d.prepare("SELECT * FROM edl_revisions WHERE edl_id = ? AND revision = ?").get(edlRef.id, edlRef.revision);
const doc = JSON.parse(readFileSync(join(root, rev.rel_path), "utf8"));
const tlRow = d.prepare("SELECT * FROM timelines WHERE edl_id = ? AND revision = ?").get(edlRef.id, rev.revision);
const clips = d.prepare("SELECT idx, source_start_us, source_end_us, edited_start_us FROM timeline_clips WHERE edl_id = ? AND revision = ? ORDER BY idx").all(edlRef.id, rev.revision);
const tl = { fps: { num: tlRow.fps_num, den: tlRow.fps_den }, source_duration_us: tlRow.source_duration_us, duration_us: tlRow.duration_us, clips };
const rebuilt = buildTimeline(asset.duration_us, acceptedCuts(doc), fps);
const t = d.prepare("SELECT * FROM transcripts WHERE id = ?").get(doc.transcript_id);
const words = d.prepare("SELECT word_id AS id, text, start_us, end_us FROM transcript_words WHERE transcript_id = ? AND revision = ? ORDER BY idx").all(t.id, t.current_revision);
const audio = d.prepare("SELECT rel_path FROM media_derivatives WHERE media_id = ? AND kind = 'audio16k'").pluck().get(asset.id);
d.close();

/** Моно 16 кГц s16 → Float64Array, окно `[fromUs, fromUs + durUs)`. */
function pcm(path, fromUs, durUs) {
  const buf = execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(Math.max(0, fromUs) / 1e6), "-t", String(durUs / 1e6), "-protocol_whitelist", "file",
    "-i", `file:${path}`, "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "-"], { maxBuffer: 64 << 20 });
  const out = new Float64Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

/** Лаг (отсчёты) с максимальной нормированной корреляцией шаблона `a` в `b`. */
function bestLag(a, b) {
  let ea = 0;
  for (const x of a) ea += x * x;
  let best = { lag: 0, r: -Infinity };
  for (let lag = 0; lag + a.length <= b.length; lag++) {
    let dot = 0;
    let eb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[lag + i];
      eb += b[lag + i] * b[lag + i];
    }
    const r = dot / Math.sqrt(ea * eb || 1);
    if (r > best.r) best = { lag, r };
  }
  return best;
}

const map = mapWords(tl, words);
const inOneClip = (w) => tl.clips.some((c) => w.start_us - PRE_US >= c.source_start_us && w.start_us - PRE_US + WINDOW_US <= c.source_end_us);
const kept = words.filter((w) => map[w.id]?.state === "kept" && w.end_us - w.start_us >= 80_000 && inOneClip(w));
const pick = Array.from({ length: Math.min(N, kept.length) }, (_, k) => kept[Math.floor(((k + 0.5) * kept.length) / N)]);
const rows = pick.map((w) => {
  const e = sourceToEdited(tl, w.start_us);
  const back = e.inCut ? null : editedToSource(tl, e.us);
  const src = pcm(join(root, audio), w.start_us - PRE_US, WINDOW_US);
  const from = e.us - PRE_US - SEARCH_US;
  const fin = pcm(finalMp4, from, WINDOW_US + 2 * SEARCH_US);
  const lead = from < 0 ? Math.round((-from * SR) / 1e6) : 0;
  const { lag, r } = bestLag(src, fin);
  const offsetUs = Math.round(((lag + lead) * 1e6) / SR) - SEARCH_US;
  return {
    word_id: w.id, text: w.text, source_us: w.start_us, edited_us: e.us, in_cut: e.inCut, back_us: back,
    lossless: back === w.start_us, audio_offset_us: offsetUs, corr: Math.round(r * 1000) / 1000,
  };
});
const timelineSame = JSON.stringify(rebuilt) === JSON.stringify(tl);
const ok = rows.length === N && rows.every((x) => x.lossless && Math.abs(x.audio_offset_us) <= frameUs) && timelineSame;
const res = {
  export_id: exportId, project_id: fe.project_id, edl_id: edlRef.id, revision: rev.revision, output: manifest.output, frame_us: frameUs, final_sha256: fe.sha256,
  duration_us: tl.duration_us, timeline_rebuilt_equal: timelineSame, ok, rows,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "final-timing-audit.json"), JSON.stringify(res, null, 2) + "\n");
const md = [
  `# Аудит времени финала`,
  "",
  `Экспорт \`${exportId}\` (${manifest.output.width}×${manifest.output.height}, ${outFps.num}/${outFps.den} к/с, кадр ${frameUs} µs), EDL \`${edlRef.id}\` r${rev.revision}, длительность после монтажа ${(tl.duration_us / 1e6).toFixed(3)} с.`,
  `Таймлайн из БД = buildTimeline(acceptedCuts(EDL)): ${timelineSame ? "да" : "НЕТ"}. Порог смещения звука — 1 кадр (${frameUs} µs). Итог: **${ok ? "pass" : "fail"}**.`,
  "",
  "| слово | текст | source_us | edited_us | editedToSource | без потерь | audioOffsetUs | корреляция |",
  "|---|---|---:|---:|---:|---|---:|---:|",
  ...rows.map((x) => `| ${x.word_id} | ${x.text.replace(/\|/g, "\\|")} | ${x.source_us} | ${x.edited_us} | ${x.back_us} | ${x.lossless ? "да" : "НЕТ"} | ${x.audio_offset_us} | ${x.corr} |`),
  "",
  "Метод: окно 1 с исходного `audio16k` (от 300 мс до начала слова) ищется взаимной корреляцией в звуке final.mp4 (± 250 мс вокруг `edited_us`), шаг 62,5 µs. Слова — равномерно по оставленным, у которых окно целиком внутри одного куска таймлайна.",
  "",
].join("\n");
writeFileSync(join(outDir, "final-timing-audit.md"), md);
console.log(JSON.stringify({ ok, rows: rows.length, max_abs_offset_us: Math.max(...rows.map((x) => Math.abs(x.audio_offset_us))), timeline_rebuilt_equal: timelineSame }));
process.exit(ok ? 0 : 1);
