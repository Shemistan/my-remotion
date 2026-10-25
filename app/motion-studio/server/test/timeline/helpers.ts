// Видеопроект для тестов таймлайна (Task 42): p1, исходник 30 с без вырезок, слово i — с
// 0,2 + (i − 1) · 0,5 с длиной 0,4 с (кадр начала 6 + 15 · (i − 1) при 30 fps). Сцены плана
// размещены как `placeScene` (поля 0,2 / 0,3 с): sp_001 — слова 21–25, кадры 300–387, ключевое
// слово w_000024 на кадре 351; sp_002 — слова 41–48, кадры 600–732, ключевое w_000044 на 651.
// A и B утверждены; видеосцены с готовой версией v1 и Approval C — `seedScene`.
import { type ScenePlanItem, type Settings, type TranscriptWord, ZONE_RECTS, buildTimeline, defaultSettings, rangeFromWords } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import type { Db } from "../../src/db/open.js";
import * as edls from "../../src/db/repos/edls.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { videoScenes } from "../../src/db/repos/video.js";
import * as versions from "../../src/db/repos/versions.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { approveScene } from "../../src/video-scenes/approval-c.js";
import { videoItemFingerprint } from "../../src/video-scenes/fingerprint.js";
import { STYLE_BASE, publishPlan, seedFootage } from "../analysis/plan-db-helpers.js";
import { P, planDoc, sc } from "../analysis/plan-helpers.js";
import { id } from "../analysis/semantic-helpers.js";
import { F30, seedVideo, w } from "../edit/helpers.js";
import { type JobsEnv, setupDb } from "../jobs/helpers.js";

export { id };

export const SOURCE_US = 30_000_000;
export const wordStart = (i: number): number => 200_000 + (i - 1) * 500_000;
export const words: TranscriptWord[] = Array.from({ length: 60 }, (_, k) => w(id(k + 1), `слово${k + 1}`, wordStart(k + 1), wordStart(k + 1) + 400_000));

const tl0 = buildTimeline(SOURCE_US, [], F30);

/** Сцена плана на словах `s..e` с ключевым словом `key` — диапазон и кадры как у `placeScene`. */
export function item(n: number, s: number, e: number, key: number, over: Partial<ScenePlanItem> = {}): ScenePlanItem {
  const r = rangeFromWords(tl0, words, id(s), id(e), { preUs: P.padPreUs, postUs: P.padPostUs });
  return sc(r.edited.start_us, r.edited.end_us, {
    id: `sp_${String(n).padStart(3, "0")}`, status: "accepted", start_word_id: id(s), end_word_id: id(e), edited: r.edited, source: r.source, frames: r.frames,
    composition_mode: "overlay", zone: "lower_third", rect: ZONE_RECTS.lower_third,
    key_terms: [{ text: `слово${key}`, word_id: id(key), edited_at_us: wordStart(key) }],
    evidence: [{ quote: words.slice(s - 1, e).map((x) => x.text).join(" "), start_word_id: id(s), end_word_id: id(e), edited: { start_us: wordStart(s), end_us: wordStart(e) + 400_000 } }],
    ...over,
  });
}

/** sp_001 [300, 387) и sp_002 [600, 732). */
export const ITEMS: ScenePlanItem[] = [item(1, 21, 25, 24), item(2, 41, 48, 44)];

export interface TimelineEnv extends JobsEnv {
  store: ArtifactStore;
  styleRef: { id: string; revision: number };
}

/** p1 с EDL r1 без вырезок, анализом, стилем r1, планом r1 из `items`; A и B утверждены. */
export async function seedTimelineProject(prefix: string, items: ScenePlanItem[] = ITEMS): Promise<TimelineEnv> {
  const env = await setupDb(prefix);
  const store = new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard });
  await seedVideo(env.db, store, env.s.root, { words, decisions: [], durationUs: SOURCE_US });
  await seedFootage(env.db, store, env.s.root);
  const style = await saveProjectStyle({ db: env.db, store, root: env.s.root }, "p1", STYLE_BASE, "agent", { rationale: "тест" });
  const doc = planDoc(items.map((x) => ({ ...x, style_id: style.style_id })), {
    inputs: {
      edl: { id: "edl_1", revision: 1, hash: edls.revision(env.db, "edl_1", 1)!.hash }, transcript: { id: "trn_1", revision: 1 }, semantic_id: "sem_1", footage_id: "ftg_1",
      style: { id: style.style_id, revision: style.revision, hash: canonicalHash(style) },
    },
  });
  await publishPlan(env.db, store, env.s.root, doc);
  approveRoughCut(env.db, "p1");
  approveVisualPlan(env.db, "p1", env.s.root);
  return { ...env, store, styleRef: { id: style.style_id, revision: style.revision } };
}

let vn = 0;
/** Готовая версия сцены длиной `frames` (номер — следующий), текущая. */
export function addVersion(db: Db, sceneId: string, frames: number, over: Partial<versions.VersionRow> = {}): versions.VersionRow {
  const number = versions.nextNumber(db, sceneId);
  const settings: Settings = { ...defaultSettings(), duration_frames: frames };
  const v = {
    id: `ver_${sceneId}_${number}_${++vn}`, scene_id: sceneId, parent_version_id: null, number, status: "ready" as const, prompt: "", edit_plan: null, settings,
    path: `workspace/projects/p1/scenes/${sceneId}/v${number}`, manifest_sha256: String(number % 10).repeat(64), created_by_job_id: null, created_at: new Date().toISOString(), ...over,
  };
  versions.insert(db, v);
  if (v.status === "ready") scenes.setCurrent(db, sceneId, v.id);
  return versions.get(db, v.id)!;
}

/** Approval C версии — как `POST …/approve` (38-39): решение и `scenes.approved_version_id`. */
export function approveC(db: Db, versionId: string): void {
  approveScene(db, { sceneId: versions.get(db, versionId)!.scene_id, versionId });
}

/** Видеосцена сцены плана `item` (`scn_<item>`), отпечаток — текущий; версия v1 длиной плана, C — если `withC`. */
export function seedScene(env: TimelineEnv, it: ScenePlanItem, o: { withC?: boolean; frames?: number } = {}): { sceneId: string; version: versions.VersionRow } {
  const sceneId = `scn_${it.id.replace("sp_", "")}`;
  scenes.create(env.db, { id: sceneId, project_id: "p1", title: it.id });
  videoScenes.insert(env.db, { project_id: "p1", plan_id: "pln_1", item_id: it.id, scene_id: sceneId, batch_id: null, job_id: null, item_fingerprint: videoItemFingerprint({ ...it, style_id: env.styleRef.id }, env.styleRef) });
  const version = addVersion(env.db, sceneId, o.frames ?? it.frames.end - it.frames.start);
  if (o.withC ?? true) approveC(env.db, version.id);
  return { sceneId, version };
}
