// Видеопроект со сценами плана для Playwright UI (Task 40), без LLM и ASR: исходник —
// медиафикстура `talk-ru-cfr.mp4`, импорт настоящей задачей `media.import` (ffmpeg: прокси, звук,
// волна, миниатюры); транскрипт — слова по 0,4 с (как вернул бы ASR), EDL r1 без вырезок, анализ
// видеоряда без лица, стиль проекта, план r1 из трёх принятых сцен (overlay слева, fullscreen,
// overlay снизу — `buildPlanItems`, как из ответа Visual Planner) и Approval B. У первых двух сцен —
// готовые версии реальным рендером фикстуры kit `transparent-scene` на плановую длительность, вход
// их генерации — как у задачи пакета (`video` и отпечаток сцены плана): превью в контексте и C
// работают как с настоящими версиями. Третья — без версии: её генерирует UI (claudeBin —
// заглушка, задача падает → «Повторить»).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {} from "@fastify/static";
import {
  type EdlRevisionDoc, type FootageAnalysis, type Job, MotionSpecSchema, type ScenePlanItem, type TranscriptRevisionDoc, type TranscriptWord,
  type VisualPlanRevisionDoc, type VisualPlannerOutput, acceptedCuts, buildTimeline, defaultSettings,
} from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { buildPlanItems } from "../../server/src/analysis/plan-build.js";
import { currentProjectStyle, saveProjectStyle } from "../../server/src/analysis/project-style.js";
import { freeZones } from "../../server/src/analysis/zones.js";
import { approve } from "../../server/src/approvals/engine.js";
import { currentSubject } from "../../server/src/approvals/subjects.js";
import { artifactPaths } from "../../server/src/artifacts/paths.js";
import { ArtifactStore } from "../../server/src/artifacts/store.js";
import type { Core } from "../../server/src/boot.js";
import * as edls from "../../server/src/db/repos/edls.js";
import * as footageRepo from "../../server/src/db/repos/footage.js";
import * as jobs from "../../server/src/db/repos/jobs.js";
import * as media from "../../server/src/db/repos/media.js";
import * as plans from "../../server/src/db/repos/plans.js";
import * as projects from "../../server/src/db/repos/projects.js";
import * as scenes from "../../server/src/db/repos/scenes.js";
import * as transcripts from "../../server/src/db/repos/transcripts.js";
import { videoScenes } from "../../server/src/db/repos/video.js";
import { enqueue } from "../../server/src/jobs/queue.js";
import { buildSegments } from "../../server/src/media/segments.js";
import { newId } from "../../server/src/scenes/ids.js";
import { videoSceneTitle } from "../../server/src/video-scenes/batch.js";
import { videoSceneSettings } from "../../server/src/video-scenes/brief.js";
import { videoSceneContext } from "../../server/src/video-scenes/context.js";
import { videoItemFingerprint } from "../../server/src/video-scenes/fingerprint.js";
import { seedScene } from "./seed.js";

const SCENE_SRC = fileURLToPath(new URL("../../render/test/fixtures/transparent-scene/src/", import.meta.url));
const MEDIA = fileURLToPath(new URL("../../../../tmp/media-fixtures/talk-ru-cfr.mp4", import.meta.url));

export const VIDEO_TITLE = "Видео: сцены по плану";
const TEXT = ("Сегодня разберём главный вопрос квартала. Выручка выросла на сорок процентов за год. Это итог работы всей команды. " +
  "Дальше покажу, откуда пришёл рост и что мы сделаем в следующем сезоне.").split(" ");
const WORD_US = 400_000;
const FIRST_US = 1_000_000;
const STYLE = { preset: "dark-premium" as const, intensity: "balanced" as const, depth: 1 };

export interface SeededVideoScenes {
  projectId: string;
  /** Принятые сцены плана по порядку. */
  itemIds: string[];
  /** Сцены Playground первых двух сцен плана (с готовой версией v1). */
  sceneIds: string[];
}

async function waitJob(core: Core, id: string, mine: Set<string>): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 300));
  }
}

const wid = (i: number) => `w_${String(i).padStart(6, "0")}`;

type Opp = VisualPlannerOutput["opportunities"][number];
/** Сцена плана словами `s..e` (номера с 1), как в ответе Visual Planner. */
function opp(id: string, s: number, e: number, words: TranscriptWord[], o: Pick<Opp, "composition_mode" | "zone" | "visual_type" | "purpose">, key?: number): Opp {
  const quote = words.slice(s - 1, e).map((w) => w.text).join(" ");
  const key_terms = key === undefined ? [] : [{ text: words[key - 1]!.text, word_id: wid(key) }];
  return {
    id, anchor_ids: [`a_${id}`], start_word_id: wid(s), end_word_id: wid(e), decision: "plan", key_terms, metaphor: "", complexity: 2, usefulness: 4,
    effort: 2, visual_load: 2, evidence: [{ quote, start_word_id: wid(s), end_word_id: wid(e) }], ...o,
  };
}

/** Каталог фикстуры для `seedScene`: исходник transparent-scene, settings — как у генерации видеосцены. */
function fixtureDir(base: string, item: ScenePlanItem, settings: ReturnType<typeof defaultSettings>, title: string): string {
  const total = settings.duration_frames;
  const dir = join(base, item.id);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/Scene.tsx"), readFileSync(join(SCENE_SRC, "Scene.tsx"), "utf8"));
  const lead = Math.min(15, Math.floor(total / 4));
  const cardsEnd = lead + Math.min(45, Math.floor(total / 2));
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2));
  writeFileSync(join(dir, "props.json"), JSON.stringify({
    timing: { duration_frames: total, beats: [{ id: "cards", start_frame: lead, end_frame: cardsEnd }, { id: "title", start_frame: 0, end_frame: total }] },
    style: { preset: STYLE.preset, intensity: STYLE.intensity, depth: STYLE.depth, transparent: false },
    content: { title, stagger: 6 },
  }, null, 2));
  const spec = MotionSpecSchema.parse({
    title, purpose: "фикстура UI-e2e: видеосцена", duration_frames: total, fps: settings.fps, style_preset: "dark-premium",
    elements: [
      { id: "title", kind: "text", role: "заголовок", entrance: "rise", content: { text: title }, layout: { x: 0.1, y: 0.2, w: 0.8, h: 0.2 } },
      { id: "cards", kind: "shape", role: "карточки", entrance: "rise", content: {}, layout: { x: 0.1, y: 0.5, w: 0.8, h: 0.3 } },
    ],
    beats: [
      { id: "cards", start_frame: lead, end_frame: cardsEnd, action: "enter", description: "карточки", element_ids: ["cards"] },
      { id: "hold", start_frame: cardsEnd, end_frame: total, action: "hold", description: "удержание", element_ids: ["title", "cards"] },
    ],
  });
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec, null, 2));
  return dir;
}

/** Task 45: свой проект для таймлайна — название и ключевые слова сцен (якоря таймлайна). */
export interface SeedVideoScenesOptions {
  title?: string;
  keyTerms?: boolean;
}

export async function seedVideoScenes(core: Core, mine: Set<string>, workDir: string, o: SeedVideoScenesOptions = {}): Promise<SeededVideoScenes> {
  const { db, root } = core;
  const projectId = newId("prj");
  projects.create(db, { id: projectId, kind: "video", title: o.title ?? VIDEO_TITLE, settings: defaultSettings() });
  const store = new ArtifactStore({ root, db, guard: core.storageCheck });
  const paths = artifactPaths(root, projectId);

  // исходник: настоящий импорт (ffmpeg) — прокси и звук нужны превью в контексте
  const imp = await waitJob(core, enqueue(db, {
    type: "media.import", projectId, input: { projectId, method: "path", path: MEDIA }, idempotencyKey: `e2e-ui-video-import-${projectId}`,
  }).job.id, mine);
  if (imp.status !== "completed") throw new Error(`seed: импорт видео не удался: ${JSON.stringify(imp.error)}`);
  const asset = media.byProject(db, projectId)!;
  const fps = asset.probe.timeline_fps;
  const durationUs = asset.probe.duration_us;

  // транскрипт r1 (слова по 0,4 с с 1 с) и EDL r1 без вырезок
  const words: TranscriptWord[] = TEXT.map((text, i) => ({
    id: wid(i + 1), text, start_us: FIRST_US + i * WORD_US, end_us: FIRST_US + (i + 1) * WORD_US - 50_000, timing: "asr", confidence: null,
  }));
  if (words.at(-1)!.end_us > durationUs) throw new Error(`seed: слова (${words.at(-1)!.end_us} µs) длиннее исходника (${durationUs} µs)`);
  const trnId = newId("trn");
  const transcript: TranscriptRevisionDoc = {
    schema_version: 1, transcript_id: trnId, revision: 1, media_sha256: asset.sha256, language: "ru", author: "asr", words, segments: buildSegments(words), removed_word_ids: [],
  };
  const tRel = paths.transcriptRev(trnId, 1);
  await store.writeRevision(tRel, "transcript.json", transcript, (d, files) => {
    transcripts.create(d, { id: trnId, project_id: projectId, media_id: asset.id, language: "ru" });
    transcripts.insertRevision(d, { doc: transcript, rel_path: `${tRel}/transcript.json`, sha256: files[0]!.sha256 });
  });
  const edlId = newId("edl");
  const edl: EdlRevisionDoc = { schema_version: 1, edl_id: edlId, revision: 1, media_id: asset.id, media_sha256: asset.sha256, transcript_id: trnId, timeline_fps: fps, decisions: [] };
  const tl = buildTimeline(durationUs, acceptedCuts(edl), fps);
  const eRel = paths.edlRev(edlId, 1);
  await store.writeRevision(eRel, "edl.json", edl, (d, files) => {
    edls.create(d, { id: edlId, project_id: projectId, media_id: asset.id, transcript_id: trnId });
    edls.insertRevision(d, { doc: edl, rel_path: `${eRel}/edl.json`, sha256: files[0]!.sha256, timeline: tl });
  });

  // анализ видеоряда: один шот без лица (весь кадр свободен)
  const ftgId = newId("ftg");
  const footage: FootageAnalysis = {
    schema_version: 1, id: ftgId, media_sha256: asset.sha256, mode: "vision",
    shots: [{
      id: "shot_001", source_start_us: 0, source_end_us: durationUs, keyframes: [], face: { detected_ratio: 0, source: "vision" }, hands: { detected_ratio: 0 },
      occupied: [], free_zones: freeZones([]), windows: [], author_position: "absent", motion: "static", objects: [], notes: "", uncertainty: [],
    }],
  };
  const fRel = paths.footage(ftgId);
  await store.writeRevision(fRel, "footage.json", footage, (d, files) => {
    footageRepo.insert(d, { id: ftgId, project_id: projectId, media_id: asset.id, mode: footage.mode, rel_path: `${fRel}/footage.json`, sha256: files[0]!.sha256 });
  });

  // стиль проекта и план r1: три принятые сцены
  const style = await saveProjectStyle({ db, store, root }, projectId, STYLE, "agent", { rationale: "фикстура UI-e2e" });
  const out: VisualPlannerOutput = {
    style: { ...STYLE, rationale: "фикстура UI-e2e" },
    opportunities: [
      opp("o1", 7, 13, words, { composition_mode: "overlay", zone: "left_third", visual_type: "growth-decline", purpose: "показать рост выручки" }, o.keyTerms ? 9 : undefined),
      opp("o2", 14, 19, words, { composition_mode: "fullscreen", zone: "full", visual_type: "key-point-emphasis", purpose: "итог команды" }, o.keyTerms ? 16 : undefined),
      opp("o3", 20, 27, words, { composition_mode: "overlay", zone: "lower_third", visual_type: "key-point-emphasis", purpose: "что дальше" }),
    ],
  };
  const built = buildPlanItems(out, { words, tl, footage, styleId: style.style_id, cfg: core.config.planning });
  if (built.items.length !== 3) throw new Error(`seed: план — ${built.items.length} сцен из 3: ${JSON.stringify(built.rejected)}`);
  const planId = newId("pln");
  const doc: VisualPlanRevisionDoc = {
    schema_version: 1, plan_id: planId, revision: 1,
    inputs: {
      edl: { id: edlId, revision: 1, hash: edls.revision(db, edlId, 1)!.hash }, transcript: { id: trnId, revision: 1 }, semantic_id: "sem_e2e", footage_id: ftgId,
      style: { id: style.style_id, revision: style.revision, hash: canonicalHash(style) },
    },
    items: built.items.map((x) => ({ ...x, status: "accepted" as const })), skipped: [], issues: [],
  };
  const pRel = paths.planRev(planId, 1);
  await store.writeRevision(pRel, "plan.json", doc, (d, files) => {
    plans.create(d, { id: planId, project_id: projectId });
    plans.insertRevision(d, { doc, rel_path: `${pRel}/plan.json`, sha256: files[0]!.sha256, opportunities: [] });
  });
  // Approval B на r1 (человек утверждает во вкладке «План»; пакет требует B)
  const b = currentSubject(db, projectId, "B")!;
  approve(db, { projectId, kind: "B", subjectRef: b.ref, subjectHash: b.hash });

  // версии первых двух сцен — реальный рендер; вход генерации — как у задачи пакета
  const cur = currentProjectStyle(db, root, projectId)!;
  const styleRef = { id: cur.style_id, revision: cur.revision };
  const display = { width: asset.probe.video.display_width, height: asset.probe.video.display_height };
  const sceneIds: string[] = [];
  for (const [i, item] of doc.items.slice(0, 2).entries()) {
    const settings = videoSceneSettings(defaultSettings(), display, fps, item, cur.base);
    const title = ["Выручка +40%", "Итог команды"][i]!;
    const seeded = await seedScene(core, [{ dir: fixtureDir(workDir, item, settings, title), prompt: item.purpose }], { projectId });
    const jobId = `job_seed_${seeded.sceneId}_1`;
    const fingerprint = videoItemFingerprint(item, styleRef);
    const video = videoSceneContext(db, root, { projectId, doc, item });
    jobs.update(db, jobId, { input: { sceneId: seeded.sceneId, prompt: item.purpose, settings, video, video_fingerprint: fingerprint, answers: "skip" } });
    scenes.setTitle(db, seeded.sceneId, videoSceneTitle(i + 1, item));
    videoScenes.insert(db, { project_id: projectId, plan_id: planId, item_id: item.id, scene_id: seeded.sceneId, batch_id: null, job_id: jobId, item_fingerprint: fingerprint });
    sceneIds.push(seeded.sceneId);
  }
  return { projectId, itemIds: doc.items.map((x) => x.id), sceneIds };
}
