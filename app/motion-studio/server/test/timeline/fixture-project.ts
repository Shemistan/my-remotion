// Проект-фикстура таймлайна для e2e с реальным рендером (Task 42; её же берёт финал Task 43):
// исходник `tmp/media-fixtures/talk-ru-cfr.mp4` (1280×720, 30 fps, ≈ 20 с, речь) — копия в
// хранилище и настоящий прокси (`proxyArgs`); слова-сетка (слово i — 0,2 + (i − 1) · 0,5 с, 0,4 с);
// EDL r1 с принятой вырезкой 2,0–3,5 с; анализ, стиль, план r1 из двух сцен — overlay в
// lower_third (слова 13–18) и fullscreen (слова 26–29), кадры как у `placeScene`; версии сцен —
// фикстуры рендера `timeline/overlay-lower-third` и `timeline/fullscreen-card` с длиной по плану;
// A, B и C утверждены. Пишет только в хранилище `root` (tmp/ репозитория).
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type EdlRevisionDoc, type ScenePlanItem, type Settings, type TranscriptRevisionDoc, ZONE_RECTS, acceptedCuts, buildTimeline, rangeFromWords,
} from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import type { ArtifactStore } from "../../src/artifacts/store.js";
import type { Db } from "../../src/db/open.js";
import * as edls from "../../src/db/repos/edls.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { videoScenes } from "../../src/db/repos/video.js";
import * as versions from "../../src/db/repos/versions.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { runFfmpeg } from "../../src/media/ffmpeg.js";
import { probeMedia } from "../../src/media/probe.js";
import { proxyArgs } from "../../src/media/proxy.js";
import { buildSegments } from "../../src/media/segments.js";
import { sha256File } from "../../src/scenes/hash.js";
import { videoItemFingerprint } from "../../src/video-scenes/fingerprint.js";
import { STYLE_BASE, publishPlan, seedFootage } from "../analysis/plan-db-helpers.js";
import { P, planDoc, sc } from "../analysis/plan-helpers.js";
import { id } from "../analysis/semantic-helpers.js";
import { F30, w } from "../edit/helpers.js";
import { approveC } from "./helpers.js";

const MS = fileURLToPath(new URL("../../../", import.meta.url));
const MEDIA = fileURLToPath(new URL("../../../../../tmp/media-fixtures/", import.meta.url));
const RENDER_FIXTURES = join(MS, "render/test/fixtures/timeline");

export const FIXTURE_CUT = { start_us: 2_000_000, end_us: 3_500_000 };
const wordAt = (i: number): number => 200_000 + (i - 1) * 500_000;

export interface FixtureProject {
  items: ScenePlanItem[];
  /** id версий сцен (по id сцены плана). */
  versionIds: Record<string, string>;
  sourcePath: string;
  sourceSha256: string;
}

/** Пересоздаёт недостающие медиа-фикстуры (идемпотентно). */
export function ensureMediaFixtures(): void {
  execFileSync(process.execPath, [join(MS, "scripts/make-media-fixtures.mjs")], { stdio: ["ignore", "ignore", "inherit"] });
}

/** Версия сцены из фикстуры рендера: props/settings с длиной `frames` (beats обрезаны по ней). */
function fixtureVersion(db: Db, root: string, sceneId: string, fixture: string, frames: number): string {
  const vid = `ver_${sceneId}_1`;
  const rel = `workspace/projects/p1/scenes/${sceneId}/versions/${vid}`;
  const dir = join(root, rel);
  mkdirSync(dirname(dir), { recursive: true });
  cpSync(join(RENDER_FIXTURES, fixture), dir, { recursive: true });
  const props = JSON.parse(readFileSync(join(dir, "props.json"), "utf8")) as { timing: { duration_frames: number; beats: { start_frame: number; end_frame: number }[] } };
  props.timing.duration_frames = frames;
  for (const b of props.timing.beats) b.end_frame = frames;
  writeFileSync(join(dir, "props.json"), JSON.stringify(props, null, 2) + "\n");
  const settings = { ...(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")) as Settings), duration_frames: frames };
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
  scenes.create(db, { id: sceneId, project_id: "p1", title: fixture });
  versions.insert(db, {
    id: vid, scene_id: sceneId, parent_version_id: null, number: 1, status: "ready", prompt: fixture, edit_plan: null, settings,
    path: rel, manifest_sha256: canonicalHash({ fixture, frames }), created_by_job_id: null, created_at: new Date().toISOString(),
  });
  scenes.setCurrent(db, sceneId, vid);
  return vid;
}

export async function seedFixtureProject(db: Db, store: ArtifactStore, root: string): Promise<FixtureProject> {
  ensureMediaFixtures();
  const src = join(MEDIA, "talk-ru-cfr.mp4");
  const probe = await probeMedia(src);
  const paths = artifactPaths(root, "p1");
  projects.create(db, { id: "p1", kind: "video", title: "Таймлайн-фикстура" });
  const origRel = `${paths.source("med_1")}/original.mp4`;
  mkdirSync(dirname(join(root, origRel)), { recursive: true });
  copyFileSync(src, join(root, origRel));
  const sha = await sha256File(join(root, origRel));
  media.insert(db, {
    id: "med_1", project_id: "p1", original_name: "talk-ru-cfr.mp4", rel_path: origRel, sha256: sha, size_bytes: statSync(src).size, probe,
    status: "ready", import: { method: "path", source_path: src, cloned: false }, created_at: new Date().toISOString(),
  });
  const proxyRel = `${paths.proxy("med_1")}/proxy.mp4`;
  mkdirSync(dirname(join(root, proxyRel)), { recursive: true });
  await runFfmpeg(proxyArgs(join(root, origRel), join(root, proxyRel), probe, 720), { signal: new AbortController().signal });
  media.setDerivative(db, "med_1", { kind: "proxy", rel_path: proxyRel, sha256: await sha256File(join(root, proxyRel)), params: { short_side: 720 } });

  const n = Math.floor((probe.duration_us - 600_000) / 500_000);
  const words = Array.from({ length: n }, (_, k) => w(id(k + 1), `слово${k + 1}`, wordAt(k + 1), wordAt(k + 1) + 400_000));
  const tr: TranscriptRevisionDoc = { schema_version: 1, transcript_id: "trn_1", revision: 1, media_sha256: sha, language: "ru", author: "asr", words, segments: buildSegments(words), removed_word_ids: [] };
  const tRel = paths.transcriptRev("trn_1", 1);
  await store.writeRevision(tRel, "transcript.json", tr, (d, files) => {
    transcripts.create(d, { id: "trn_1", project_id: "p1", media_id: "med_1", language: "ru" });
    transcripts.insertRevision(d, { doc: tr, rel_path: `${tRel}/transcript.json`, sha256: files[0]!.sha256 });
  });
  const edl: EdlRevisionDoc = {
    schema_version: 1, edl_id: "edl_1", revision: 1, media_id: "med_1", media_sha256: sha, transcript_id: "trn_1", timeline_fps: F30,
    decisions: [{ id: "d1", reason: "pause", origin: "detector", status: "accepted", source_start_us: FIXTURE_CUT.start_us, source_end_us: FIXTURE_CUT.end_us, confidence: 0.9, explanation: "пауза" }],
  };
  const tl = buildTimeline(probe.duration_us, acceptedCuts(edl), F30);
  const eRel = paths.edlRev("edl_1", 1);
  await store.writeRevision(eRel, "edl.json", edl, (d, files) => {
    edls.create(d, { id: "edl_1", project_id: "p1", media_id: "med_1", transcript_id: "trn_1" });
    edls.insertRevision(d, { doc: edl, rel_path: `${eRel}/edl.json`, sha256: files[0]!.sha256, timeline: tl });
  });
  await seedFootage(db, store, root);
  const style = await saveProjectStyle({ db, store, root }, "p1", STYLE_BASE, "agent", { rationale: "фикстура" });

  const mk = (k: number, s: number, e: number, key: number, mode: "overlay" | "fullscreen"): ScenePlanItem => {
    const r = rangeFromWords(tl, words, id(s), id(e), { preUs: P.padPreUs, postUs: P.padPostUs });
    const at = (i: number) => wordAt(i) - (FIXTURE_CUT.end_us - FIXTURE_CUT.start_us);
    return sc(r.edited.start_us, r.edited.end_us, {
      id: `sp_00${k}`, status: "accepted", start_word_id: id(s), end_word_id: id(e), edited: r.edited, source: r.source, frames: r.frames,
      composition_mode: mode, zone: mode === "fullscreen" ? "full" : "lower_third", rect: mode === "fullscreen" ? ZONE_RECTS.full : ZONE_RECTS.lower_third,
      key_terms: [{ text: `слово${key}`, word_id: id(key), edited_at_us: at(key) }],
      evidence: [{ quote: words.slice(s - 1, e).map((x) => x.text).join(" "), start_word_id: id(s), end_word_id: id(e), edited: { start_us: at(s), end_us: at(e) + 400_000 } }],
      style_id: style.style_id,
    });
  };
  const items = [mk(1, 13, 18, 15, "overlay"), mk(2, 26, 29, 27, "fullscreen")];
  await publishPlan(db, store, root, planDoc(items, {
    inputs: {
      edl: { id: "edl_1", revision: 1, hash: edls.revision(db, "edl_1", 1)!.hash }, transcript: { id: "trn_1", revision: 1 }, semantic_id: "sem_1", footage_id: "ftg_1",
      style: { id: style.style_id, revision: style.revision, hash: canonicalHash(style) },
    },
  }));
  approveRoughCut(db, "p1");
  approveVisualPlan(db, "p1", root);
  const versionIds: Record<string, string> = {};
  for (const [it, fixture] of [[items[0]!, "overlay-lower-third"], [items[1]!, "fullscreen-card"]] as const) {
    const sceneId = `scn_${it.id.slice(3)}`;
    const vid = fixtureVersion(db, root, sceneId, fixture, it.frames.end - it.frames.start);
    videoScenes.insert(db, { project_id: "p1", plan_id: "pln_1", item_id: it.id, scene_id: sceneId, batch_id: null, job_id: null, item_fingerprint: videoItemFingerprint(it, { id: style.style_id, revision: style.revision }) });
    approveC(db, vid);
    versionIds[it.id] = vid;
  }
  return { items, versionIds, sourcePath: src, sourceSha256: sha };
}
