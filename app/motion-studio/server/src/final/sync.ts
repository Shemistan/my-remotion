// Синхронность речи финала (Task 44): опорные слова (ключевые слова сцен, затем равномерно по
// оставленным) и замер смещения звука финала относительно исходника по ним — тем же `syncCheck`,
// что у превью чернового монтажа (Task 28): звук финала — смонтированный, время — edited.
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { type EditedTimeline, type TranscriptWord, type VideoTimelineDoc, mapWords, sourceToEdited } from "@ms/contracts";
import { type SyncSample, syncCheck, wavPcm } from "../edit/sync-probe.js";
import { type MediaCtx, ffmpegStderr, fileInput } from "./frames.js";

export type SyncWord = Pick<TranscriptWord, "id" | "start_us" | "end_us">;

export interface SyncAnchor {
  word_id: string;
  edited_us: number;
  source_us: number;
}

/**
 * До `n` опорных слов: сначала ключевые слова сцен (якоря клипов, по порядку), затем равномерно
 * по остальным оставленным словам (начало слова не вырезано); по возрастанию edited-времени.
 */
export function syncAnchors(doc: Pick<VideoTimelineDoc, "scenes">, words: SyncWord[], tl: EditedTimeline, n = 5): SyncAnchor[] {
  const map = mapWords(tl, words);
  const kept = words.filter((w) => w.end_us > w.start_us && w.start_us < tl.source_duration_us && map[w.id]?.state !== "removed" && !sourceToEdited(tl, w.start_us).inCut);
  const keptIds = new Set(kept.map((w) => w.id));
  const chosen: string[] = [];
  for (const c of doc.scenes) {
    for (const a of c.anchors) {
      if (chosen.length < n && keptIds.has(a.word_id) && !chosen.includes(a.word_id)) chosen.push(a.word_id);
    }
  }
  const rest = kept.filter((w) => !chosen.includes(w.id));
  const need = Math.min(n - chosen.length, rest.length);
  for (let k = 0; k < need; k++) chosen.push(rest[Math.floor(((k + 0.5) * rest.length) / need)]!.id);
  const byId = new Map(kept.map((w) => [w.id, w]));
  return chosen
    .map((id) => {
      const w = byId.get(id)!;
      return { word_id: id, source_us: w.start_us, edited_us: sourceToEdited(tl, w.start_us).us };
    })
    .sort((a, b) => a.edited_us - b.edited_us);
}

/**
 * Смещение звука финала по опорным словам: звук финала → WAV 16 кГц моно в `workDir`, сверка с
 * `source16k` (звук исходника 16 кГц моно) окнами вокруг слов (`syncCheck`, в т. ч. широкий поиск).
 * WAV удаляется после замера.
 */
export async function measureSync(i: { finalPath: string; source16k: string; tl: EditedTimeline; words: SyncWord[]; anchors: SyncAnchor[]; workDir: string } & MediaCtx): Promise<SyncSample[]> {
  if (i.anchors.length === 0) return [];
  const wav = join(i.workDir, "final-16k.wav");
  await ffmpegStderr(["-v", "error", ...fileInput(i.finalPath), "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-y", `file:${wav}`], i);
  const ids = new Set(i.anchors.map((a) => a.word_id));
  const words = i.words.filter((w) => ids.has(w.id));
  try {
    const src = await wavPcm(i.source16k);
    try {
      const fin = await wavPcm(wav);
      try {
        return await syncCheck(src, fin, i.tl, words, words.length);
      } finally {
        await fin.close();
      }
    } finally {
      await src.close();
    }
  } finally {
    await rm(wav, { force: true });
  }
}
