// Каталоги артефактов видеопроекта (`05` §1) относительно корня хранилища.
import { join } from "node:path";
import { SAFE_ID } from "@ms/core";

function checkId(kind: string, id: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`artifacts: ${kind} не годится для имени каталога: ${JSON.stringify(id)}`);
  return id;
}

function rev(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`artifacts: ревизия должна быть целым >= 1: ${n}`);
  return `r${n}`;
}

/** Префикс каталогов проектов: публикация артефактов — только внутрь него. */
export const PROJECTS_REL = "workspace/projects";

export interface ArtifactPaths {
  /** Каталог проекта. */
  project: string;
  source(mediaId: string): string;
  proxy(mediaId: string): string;
  transcriptRev(id: string, n: number): string;
  edlRev(id: string, n: number): string;
  footage(id: string): string;
  semantic(id: string): string;
  styleRev(id: string, n: number): string;
  planRev(id: string, n: number): string;
  /** Абсолютный путь в хранилище `root`. */
  abs(rel: string): string;
}

/** Пути `workspace/projects/<p>/{source,proxy,transcript,edits,analysis/footage,analysis/semantic,style,plan}/…`. */
export function artifactPaths(root: string, projectId: string): ArtifactPaths {
  const p = `${PROJECTS_REL}/${checkId("projectId", projectId)}`;
  return {
    project: p,
    source: (mediaId) => `${p}/source/${checkId("mediaId", mediaId)}`,
    proxy: (mediaId) => `${p}/proxy/${checkId("mediaId", mediaId)}`,
    transcriptRev: (id, n) => `${p}/transcript/${checkId("transcriptId", id)}/${rev(n)}`,
    edlRev: (id, n) => `${p}/edits/${checkId("edlId", id)}/${rev(n)}`,
    footage: (id) => `${p}/analysis/footage/${checkId("footageId", id)}`,
    semantic: (id) => `${p}/analysis/semantic/${checkId("semanticId", id)}`,
    styleRev: (id, n) => `${p}/style/${checkId("styleId", id)}/${rev(n)}`,
    planRev: (id, n) => `${p}/plan/${checkId("planId", id)}/${rev(n)}`,
    abs: (rel) => join(root, rel),
  };
}
