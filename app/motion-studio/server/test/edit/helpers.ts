// Фабрики документов для тестов правки транскрипта и EDL (Task 27).
import { acceptedCuts, buildTimeline, type EditDecision, type EdlRevisionDoc, type Fps, type TranscriptRevisionDoc, type TranscriptWord } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import type { ArtifactStore } from "../../src/artifacts/store.js";
import type { Db } from "../../src/db/open.js";
import * as edls from "../../src/db/repos/edls.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { buildSegments } from "../../src/media/segments.js";
import { SHA, asset } from "../db/video-fixtures.js";

export const F30: Fps = { num: 30, den: 1 };

export function w(id: string, text: string, start_us: number, end_us: number, timing: TranscriptWord["timing"] = "asr"): TranscriptWord {
  return { id, text, start_us, end_us, timing, confidence: null };
}

/** Ревизия r1 транскрипта `trn_1` (ASR). */
export function trDoc(words: TranscriptWord[], over: Partial<TranscriptRevisionDoc> = {}): TranscriptRevisionDoc {
  return {
    schema_version: 1,
    transcript_id: "trn_1",
    revision: 1,
    media_sha256: SHA,
    language: "ru",
    author: "asr",
    words,
    segments: buildSegments(words),
    removed_word_ids: [],
    ...over,
  };
}

export function dec(id: string, over: Partial<EditDecision> = {}): EditDecision {
  return {
    id,
    reason: "pause",
    origin: "detector",
    status: "proposed",
    source_start_us: 0,
    source_end_us: 1_000_000,
    confidence: 0.9,
    explanation: "пауза",
    ...over,
  };
}

/** Ревизия r1 EDL `edl_1`. */
export function edlDoc(decisions: EditDecision[], over: Partial<EdlRevisionDoc> = {}): EdlRevisionDoc {
  return {
    schema_version: 1,
    edl_id: "edl_1",
    revision: 1,
    media_id: "med_1",
    media_sha256: SHA,
    transcript_id: "trn_1",
    timeline_fps: F30,
    decisions,
    ...over,
  };
}

/** Транскрипт из `n` слов по 300 мс с паузой 100 мс (`w_000001…`). */
export function longWords(n: number): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  for (let i = 0; i < n; i++) {
    const id = `w_${String(i + 1).padStart(6, "0")}`;
    out.push(w(id, i % 17 === 16 ? `слово${i % 50}.` : `слово${i % 50}`, i * 400_000, i * 400_000 + 300_000));
  }
  return out;
}

/** Проект `p1` с исходником `med_1` (10 с, 30 fps), транскриптом `trn_1` r1 и EDL `edl_1` r1. */
export async function seedVideo(
  db: Db, store: ArtifactStore, root: string, init: { words: TranscriptWord[]; decisions: EditDecision[]; durationUs?: number },
): Promise<{ transcript: TranscriptRevisionDoc; edl: EdlRevisionDoc }> {
  const durationUs = init.durationUs ?? 10_000_000;
  projects.create(db, { id: "p1", kind: "video", title: "Видео" });
  const a = asset();
  media.insert(db, { ...a, probe: { ...a.probe, duration_us: durationUs } });
  const transcript = trDoc(init.words);
  const tRel = artifactPaths(root, "p1").transcriptRev("trn_1", 1);
  await store.writeRevision(tRel, "transcript.json", transcript, (d, files) => {
    transcripts.create(d, { id: "trn_1", project_id: "p1", media_id: "med_1", language: "ru" });
    transcripts.insertRevision(d, { doc: transcript, rel_path: `${tRel}/transcript.json`, sha256: files[0]!.sha256 });
  });
  const edl = edlDoc(init.decisions);
  const eRel = artifactPaths(root, "p1").edlRev("edl_1", 1);
  await store.writeRevision(eRel, "edl.json", edl, (d, files) => {
    edls.create(d, { id: "edl_1", project_id: "p1", media_id: "med_1", transcript_id: "trn_1" });
    edls.insertRevision(d, { doc: edl, rel_path: `${eRel}/edl.json`, sha256: files[0]!.sha256, timeline: buildTimeline(durationUs, acceptedCuts(edl), F30) });
  });
  return { transcript, edl };
}
