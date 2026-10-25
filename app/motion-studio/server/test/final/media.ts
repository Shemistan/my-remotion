// Общее для e2e проверки финала (Task 44): фикстуры `scripts/make-media-fixtures.mjs`
// (`server/test/fixtures/final/README.md`) и «финал» final-like как вход `verifyFinal`.
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type FinalExportRequest, type VideoTimelineDoc, VideoTimelineDocSchema, buildTimeline, clipsToSequences, placementFor, usToFrame,
} from "@ms/contracts";
import { extractFrame } from "../../src/final/frames.js";
import type { VerifyFinalInput } from "../../src/final/verify.js";
import { REPO_TMP } from "../db/helpers.js";

export const F30 = { num: 30, den: 1 };
const MS = fileURLToPath(new URL("../../../", import.meta.url));
const FIX = fileURLToPath(new URL("../../../../../tmp/media-fixtures/", import.meta.url));
export const fx = (name: string): string => join(FIX, name);

/** Пересоздаёт недостающие фикстуры (идемпотентно) и возвращает временный каталог в `tmp/`. */
export async function prepare(prefix: string): Promise<string> {
  execFileSync(process.execPath, [join(MS, "scripts/make-media-fixtures.mjs")], { stdio: ["ignore", "ignore", "inherit"] });
  return mkdtemp(join(REPO_TMP, prefix));
}

/** «Слова» шумовых вспышек исходника: звук в `[0,7·k, 0,7·k + 0,35)` с. */
export const WORDS = Array.from({ length: 14 }, (_, k) => ({ id: `w_${String(k).padStart(6, "0")}`, start_us: k * 700_000, end_us: k * 700_000 + 350_000 }));

/** Монтаж final-like: вырезан исходник [3 с, 4 с). */
export const TL = buildTimeline(10_000_000, [{ start_us: 3_000_000, end_us: 4_000_000 }], F30);

const SHA = "a".repeat(64);
const ref = { id: "x", revision: 1, hash: SHA };

/** Ревизия таймлайна final-like: сцена-прямоугольник на кадрах 150–239, якорь — слово w_000009 (edited 5,3 с). */
export const DOC: VideoTimelineDoc = VideoTimelineDocSchema.parse({
  schema_version: 1, timeline_id: "tl1", revision: 1, fps: F30, duration_frames: 270,
  inputs: { media_sha256: SHA, edl: ref, plan: ref, style: ref },
  video: clipsToSequences(TL),
  scenes: [{
    clip_id: "clip_s1", scene_id: "sc1", item_id: "s1", version_id: "v1", version_number: 1, include: "approved",
    start_frame: 150, duration_frames: 90, placement: placementFor("overlay", "right_third"), z: 1,
    anchors: [{ word_id: "w_000009", text: "девять", frame: usToFrame(5_300_000, F30) }],
  }],
  excluded: [], issues: [],
});

export const REQUEST: FinalExportRequest = { resolution: "source", quality: "standard", audio_bitrate_kbps: 192 };

/** Вход `verifyFinal` для final-like; still-кадры сцены — из эталона без потерь. */
export function okInput(workDir: string): VerifyFinalInput {
  return {
    finalPath: fx("final-like.mp4"), doc: DOC, request: REQUEST, master: fx("counter-30.mp4"),
    editedAudio: fx("final-like-edited.wav"), source16k: fx("counter-30-16k.wav"), words: WORDS, tl: TL, workDir,
    stillsFor: (frames) => Promise.all(frames.map((f) => extractFrame(fx("final-like-ref.mkv"), f, F30, join(workDir, `still-${f}.png`)))),
  };
}
