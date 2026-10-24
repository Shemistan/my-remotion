// Сводка видеопроекта для Video Workspace (Task 29): проект, исходник, текущие транскрипт и
// EDL (один на проект, ревью Task 27 M6), approvals и последняя задача каждого типа — одним GET
// без побочных эффектов.
import { type Job, VideoProjectDtoSchema } from "@ms/contracts";
import * as edls from "../../db/repos/edls.js";
import * as jobs from "../../db/repos/jobs.js";
import * as media from "../../db/repos/media.js";
import * as projects from "../../db/repos/projects.js";
import * as transcripts from "../../db/repos/transcripts.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { projectApprovals } from "./approvals.js";
import { previewReady } from "./edls.js";
import { mediaDto } from "./media.js";

export function videoProjectRoutes(app: ZApp, { core }: ApiContext): void {
  app.get("/api/projects/:id/video", { schema: { params: IdParams, response: { 200: VideoProjectDtoSchema } } }, async (req) => {
    const db = core.db;
    const project = projects.get(db, req.params.id);
    if (!project) throw notFound(`проект ${req.params.id}`);
    if (project.kind !== "video") throw new ApiError(409, "not_video_project", "это не видеопроект");
    const asset = media.byProject(db, project.id);
    const t = transcripts.byProject(db, project.id);
    const e = edls.byProject(db, project.id);
    const latest = new Map<string, Job>();
    for (const j of jobs.list(db, { projectId: project.id })) latest.set(j.type, j);
    return {
      project,
      media: asset ? mediaDto(db, asset.id) ?? null : null,
      transcript: t && t.current_revision !== null ? { id: t.id, current_revision: t.current_revision } : null,
      edl: e && e.current_revision !== null
        ? { id: e.id, current_revision: e.current_revision, preview_ready: previewReady(db, core.root, project.id, e.id, e.current_revision) }
        : null,
      approvals: projectApprovals(db, project.id),
      jobs: [...latest.values()].map((j) => publicJob(j, core.root)),
    };
  });
}
