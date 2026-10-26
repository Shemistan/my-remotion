// Видеопроект для таймлайна в Playwright UI (Task 45), без LLM: свой проект по образцу Task 40
// (`seedVideoScenes`: импорт ffmpeg, план из трёх сцен с ключевыми словами, B, у первых двух — версии
// реальным рендером), плюс Approval A чернового монтажа и Approval C обеих готовых версий. Третья
// сцена без версии — на таймлайне «не вошла» (no_version). Таймлайн собирает сам UI.
import { approvalState } from "../../server/src/approvals/engine.js";
import { currentSubject } from "../../server/src/approvals/subjects.js";
import type { Core } from "../../server/src/boot.js";
import * as scenes from "../../server/src/db/repos/scenes.js";
import { approveRoughCut } from "../../server/src/edit/approval-a.js";
import { approveScene } from "../../server/src/video-scenes/approval-c.js";
import { type SeededVideoScenes, seedVideoScenes } from "./seed-video-scenes.js";

export const TIMELINE_TITLE = "Видео: таймлайн и финал";

export async function seedVideoTimeline(core: Core, mine: Set<string>, workDir: string): Promise<SeededVideoScenes> {
  const s = await seedVideoScenes(core, mine, workDir, { title: TIMELINE_TITLE, keyTerms: true });
  const { db } = core;
  approveRoughCut(db, s.projectId);
  for (const sceneId of s.sceneIds) {
    const versionId = scenes.get(db, sceneId)?.current_version_id;
    if (!versionId) throw new Error(`seed: у сцены ${sceneId} нет версии`);
    approveScene(db, { sceneId, versionId });
  }
  for (const kind of ["A", "B"] as const) {
    if (approvalState(db, s.projectId, kind, currentSubject(db, s.projectId, kind)).state !== "valid") throw new Error(`seed: ${kind} таймлайна не валидно`);
  }
  return s;
}
