// Данные Video Workspace для юнит-тестов UI (Task 29): транскрипт из 5 слов в двух сегментах,
// EDL с тремя вырезками, таймлайн с вырезкой 1,0–2,5 с (edited 2,5 с = source 4,0 с).
import {
  type EditDecision, type EdlDto, type ProjectApprovalsDto, type TranscriptDto, type TranscriptWord,
  acceptedCuts, buildTimeline, mapWords,
} from "@ms/contracts";

const SHA = "a".repeat(64);
const F30 = { num: 30, den: 1 };

export const w = (id: string, text: string, s: number, e: number, timing: TranscriptWord["timing"] = "asr"): TranscriptWord =>
  ({ id, text, start_us: s, end_us: e, timing, confidence: null });

export const WORDS: TranscriptWord[] = [
  w("w_000001", "Привет", 0, 400_000),
  w("w_000002", "мир.", 500_000, 900_000),
  w("w_000003", "эээ", 1_200_000, 2_300_000),
  w("w_000004", "как", 3_000_000, 3_300_000),
  w("w_000005", "дела", 3_400_000, 3_900_000, "interpolated"),
];

export function transcriptDto(over: Partial<TranscriptDto["doc"]> = {}): TranscriptDto {
  return {
    id: "trn_1",
    current_revision: 1,
    doc: {
      schema_version: 1, transcript_id: "trn_1", revision: 1, media_sha256: SHA, language: "ru", author: "asr",
      words: WORDS,
      segments: [
        { id: "seg_0001", word_ids: ["w_000001", "w_000002"], start_us: 0, end_us: 900_000 },
        { id: "seg_0002", word_ids: ["w_000003", "w_000004", "w_000005"], start_us: 1_200_000, end_us: 3_900_000 },
      ],
      removed_word_ids: [],
      ...over,
    },
  };
}

export const dec = (id: string, over: Partial<EditDecision> = {}): EditDecision => ({
  id, reason: "pause", origin: "detector", status: "proposed", source_start_us: 1_000_000, source_end_us: 2_500_000,
  confidence: 0.9, explanation: "пауза 1,5 с", ...over,
});

export const DECISIONS: EditDecision[] = [
  dec("pau_r1_1", { confidence: 0.95 }),
  dec("fil_r1_1", { reason: "filler", start_word_id: "w_000003", end_word_id: "w_000003", source_start_us: 1_200_000, source_end_us: 2_300_000, confidence: 0.6, explanation: "паразит" }),
  dec("pau_r1_2", { source_start_us: 9_000_000, source_end_us: 10_000_000, confidence: 0.8, status: "proposed" }),
];

export function edlDto(decisions: EditDecision[] = DECISIONS, revision = 1): EdlDto {
  const doc = {
    schema_version: 1 as const, edl_id: "edl_1", revision, media_id: "med_1", media_sha256: SHA, transcript_id: "trn_1",
    timeline_fps: F30, decisions,
  };
  const timeline = buildTimeline(10_000_000, acceptedCuts(doc), F30);
  return { id: "edl_1", current_revision: revision, doc, timeline, word_map: mapWords(timeline, WORDS), preview_ready: false };
}

export const approvals = (A: ProjectApprovalsDto["A"] = { state: "missing" }): ProjectApprovalsDto => ({ A, B: { state: "missing" } });
