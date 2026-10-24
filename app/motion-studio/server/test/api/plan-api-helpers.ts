// Засев Phase 3 для тестов Control API (Task 33): опубликованные анализ видеоряда с кадром и
// смысловая разметка — через настоящий ArtifactStore (как задачи `footage.analyze` и `semantic.analyze`).
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FootageAnalysis, SemanticTimeline } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as footageRepo from "../../src/db/repos/footage.js";
import * as semanticRepo from "../../src/db/repos/semantic.js";
import { FACE, footage } from "../analysis/plan-helpers.js";
import { id } from "../analysis/semantic-helpers.js";
import type { Api } from "./helpers.js";
import { storeOf } from "./video-helpers.js";

/** PNG-заглушка (сигнатура и немного байт): сервер отдаёт файл как есть. */
export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

let drafts = 0;
async function publishDir(api: Api, destRel: string, files: Record<string, Buffer | string>, register: Parameters<ReturnType<typeof storeOf>["publish"]>[2]): Promise<void> {
  const draft = join(api.core.root, "workspace/drafts", `job_seed${++drafts}-a1`);
  for (const [rel, body] of Object.entries(files)) {
    await mkdir(join(draft, rel, ".."), { recursive: true });
    await writeFile(join(draft, rel), body);
  }
  await storeOf(api).publish(draft, destRel, register);
}

/** Анализ видеоряда `ftgId` с ключевым кадром 0,5 с (`frames/000000500000.png`). */
export async function seedFootageWithFrame(api: Api, ftgId = "ftg_k1", mode: FootageAnalysis["mode"] = "vision"): Promise<FootageAnalysis> {
  const base = footage(FACE);
  const doc: FootageAnalysis = {
    ...base, id: ftgId, mode,
    shots: base.shots.map((s) => ({ ...s, keyframes: [{ us: 500_000, path: "frames/000000500000.png" }] })),
  };
  const rel = artifactPaths(api.core.root, "p1").footage(ftgId);
  await publishDir(api, rel, { "footage.json": JSON.stringify(doc), "frames/000000500000.png": PNG }, (db, files) => {
    footageRepo.insert(db, { id: ftgId, project_id: "p1", media_id: "med_1", mode, rel_path: `${rel}/footage.json`, sha256: files.find((f) => f.path === "footage.json")!.sha256 });
  });
  return doc;
}

/**
 * Смысловая разметка по EDL `edl_1` r`edlRevision` и транскрипту `trn_1` r1: глава, тезис-предположение, число, спорное место;
 * `skipped` — пустая разметка без агента (`agent: "skipped"`).
 */
export async function seedSemantic(api: Api, semId = "sem_k1", edlRevision = 1, skipped = false): Promise<SemanticTimeline> {
  const full: SemanticTimeline = {
    schema_version: 1, id: semId, transcript_ref: { id: "trn_1", revision: 1 }, edl_ref: { id: "edl_1", revision: edlRevision },
    chapters: [{ id: "c1", title: "Итоги года", summary: "рост выручки", start_word_id: id(4), end_word_id: id(20) }],
    anchors: [{
      id: "a1", kind: "thesis", start_word_id: id(5), end_word_id: id(10), quote: "выручка выросла на 40% за год.", claim_type: "assumption",
      importance: 3, emphasis_word_ids: [id(8)],
    }],
    entities: [],
    numbers: [{ value: 40, unit: "%", start_word_id: id(8), end_word_id: id(8), quote: "40%", claim_type: "fact" }],
    causal: [],
    disputed: [{ start_word_id: id(11), end_word_id: id(13), why: "оценка без данных" }],
  };
  const doc: SemanticTimeline = skipped ? { ...full, chapters: [], anchors: [], numbers: [], disputed: [], agent: "skipped" } : full;
  const rel = artifactPaths(api.core.root, "p1").semantic(semId);
  await publishDir(api, rel, { "semantic.json": JSON.stringify(doc) }, (db, files) => {
    semanticRepo.insert(db, {
      id: semId, project_id: "p1", transcript_id: "trn_1", transcript_revision: 1, edl_id: "edl_1", edl_revision: edlRevision,
      rel_path: `${rel}/semantic.json`, sha256: files[0]!.sha256,
      chapters: doc.chapters.map((c) => ({ chapter_id: c.id, title: c.title, start_word_id: c.start_word_id, end_word_id: c.end_word_id })),
    });
  });
  return doc;
}
