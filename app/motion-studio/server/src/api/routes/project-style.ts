// StyleBible проекта (Task 33, V6): текущая ревизия с историей, контрастом пар цветов, проблемами
// и шрифтами motion-kit; правка пользователя — новая ревизия (`saveProjectStyle`: B →
// `stale(style_changed)`, при готовом плане — `plan.recheck`). Стиль с blocking-проблемой не
// сохраняется: 400 `style_contrast` с парами цветов или `style_invalid`.
import { type ProjectStyleDto, ProjectStyleBodySchema, ProjectStyleDtoSchema } from "@ms/contracts";
import { KIT_FONTS } from "@ms/render";
import { currentProjectStyle, projectStyleFrom, saveProjectStyle, styleContrast } from "../../analysis/project-style.js";
import { ArtifactStore } from "../../artifacts/store.js";
import type { Db } from "../../db/open.js";
import * as projects from "../../db/repos/projects.js";
import * as styles from "../../db/repos/styles.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { ApiError, notFound } from "../errors.js";

export function projectStyleDto(db: Db, root: string, projectId: string): ProjectStyleDto {
  const current = currentProjectStyle(db, root, projectId);
  const row = styles.byProject(db, projectId);
  if (!current || !row) throw notFound(`стиль проекта ${projectId}`);
  return {
    current,
    history: styles.revisions(db, row.id).map((r) => ({
      revision: r.revision, parent_revision: r.revision > 1 ? r.revision - 1 : null, author: r.author, created_at: r.created_at,
    })),
    contrast: styleContrast(current.resolved),
    issues: projectStyleFrom(current.base).issues,
    fonts: [...KIT_FONTS],
  };
}

export function projectStyleRoutes(app: ZApp, { core }: ApiContext): void {
  app.get("/api/projects/:id/style", { schema: { params: IdParams, response: { 200: ProjectStyleDtoSchema } } }, async (req) => {
    if (!projects.get(core.db, req.params.id)) throw notFound(`проект ${req.params.id}`);
    return projectStyleDto(core.db, core.root, req.params.id);
  });

  app.put("/api/projects/:id/style", {
    schema: { params: IdParams, body: ProjectStyleBodySchema, response: { 201: ProjectStyleDtoSchema } },
  }, async (req, reply) => {
    const projectId = req.params.id;
    if (!projects.get(core.db, projectId)) throw notFound(`проект ${projectId}`);
    const { resolved, issues } = projectStyleFrom(req.body.base);
    const blocking = issues.filter((x) => x.severity === "blocking");
    const invalid = blocking.find((x) => x.code === "style_invalid");
    if (invalid) throw new ApiError(400, "style_invalid", invalid.message);
    if (blocking.length > 0) {
      throw new ApiError(400, "style_contrast", blocking.map((x) => x.message).join("; "), { pairs: styleContrast(resolved).filter((p) => p.ratio < p.min) });
    }
    const store = new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
    await saveProjectStyle({ db: core.db, store, root: core.root }, projectId, req.body.base, "user",
      req.body.base_revision === undefined ? {} : { base_revision: req.body.base_revision });
    return reply.status(201).send(projectStyleDto(core.db, core.root, projectId));
  });
}
