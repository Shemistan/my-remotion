// Засев видеопроекта для тестов Control API (Task 29): проект `p1`, исходник `med_1` с файлами
// производных (прокси, waveform, миниатюры), транскрипт `trn_1` r1 и EDL `edl_1` r1 — через
// настоящий ArtifactStore (как Task 27). Обработчиков задач нет: задачи остаются в очереди.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EditDecision, TranscriptWord } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import * as media from "../../src/db/repos/media.js";
import { dec, seedVideo, w } from "../edit/helpers.js";
import type { Api } from "./helpers.js";

export const WORDS: TranscriptWord[] = [
  w("w_000001", "Привет", 0, 400_000),
  w("w_000002", "мир", 500_000, 900_000),
  w("w_000003", "эээ", 1_000_000, 1_400_000),
  w("w_000004", "как", 3_000_000, 3_300_000),
  w("w_000005", "дела.", 3_400_000, 3_900_000),
];

export const DECISIONS: EditDecision[] = [
  dec("pau_r1_1", { source_start_us: 1_500_000, source_end_us: 2_900_000, confidence: 0.9 }),
  dec("fil_r1_1", { reason: "filler", start_word_id: "w_000003", end_word_id: "w_000003", source_start_us: 1_000_000, source_end_us: 1_400_000, confidence: 0.6, explanation: "паразит «эээ»" }),
];

export const PROXY_BYTES = 5000;

export function storeOf(api: Api): ArtifactStore {
  return new ArtifactStore({ root: api.core.root, db: api.core.db, guard: api.core.storageCheck });
}

/** Видеопроект `p1` с исходником, производными, транскриптом и EDL. */
export async function seedVideoApi(api: Api, init: { decisions?: EditDecision[]; words?: TranscriptWord[] } = {}) {
  const { core } = api;
  const seeded = await seedVideo(core.db, storeOf(api), core.root, { words: init.words ?? WORDS, decisions: init.decisions ?? DECISIONS });
  const px = artifactPaths(core.root, "p1").proxy("med_1");
  const dir = join(core.root, px);
  await mkdir(join(dir, "thumbs"), { recursive: true });
  await writeFile(join(dir, "proxy.mp4"), Buffer.alloc(PROXY_BYTES, 7));
  await writeFile(join(dir, "waveform.bin"), Buffer.from([0, 1, -1 & 0xff, 2]));
  await writeFile(join(dir, "thumbs/000001.jpg"), "jpg1");
  await writeFile(join(dir, "thumbs/000002.jpg"), "jpg2");
  const sha = "b".repeat(64);
  media.setDerivative(core.db, "med_1", { kind: "proxy", rel_path: `${px}/proxy.mp4`, sha256: sha, params: { width: 1280, height: 720, fps: { num: 30, den: 1 }, duration_us: 10_000_000 } });
  media.setDerivative(core.db, "med_1", { kind: "waveform", rel_path: `${px}/waveform.bin`, sha256: sha, params: { bucket_ms: 10, sample_rate: 16000, length: 2, file: "waveform.bin", index: "waveform.json" } });
  media.setDerivative(core.db, "med_1", { kind: "thumbs", rel_path: `${px}/thumbs.json`, sha256: sha, params: { every_us: 5_000_000, count: 2, height: 180, dir: "thumbs" } });
  media.setDerivative(core.db, "med_1", { kind: "audio16k", rel_path: `${px}/audio16k.wav`, sha256: sha, params: { sample_rate: 16000 } });
  return seeded;
}

/** Фиктивный опубликованный каталог превью ревизии EDL (как `roughcut.preview`). */
export async function seedPreview(api: Api, revision: number, bytes = 3000): Promise<void> {
  const rel = artifactPaths(api.core.root, "p1").previewRev("edl_1", revision);
  const draft = join(api.core.root, "workspace/drafts", `job_prev${revision}-a1`);
  await mkdir(draft, { recursive: true });
  await writeFile(join(draft, "preview.mp4"), Buffer.alloc(bytes, 3));
  await storeOf(api).publish(draft, rel, () => undefined);
}

export const k = (key: string) => ({ "idempotency-key": key });
