// Каталоги артефактов видеопроекта (`05` §1) относительно корня хранилища.
import { join } from "node:path";
import type { Fps } from "@ms/contracts";

/**
 * Идентификатор в пути артефакта — алфавит `newId` (`<префикс>_<ULID>`): буквы, цифры, `_`,
 * не с `_`. Без `.` и `-`: имена вроде `project.json` или `.quarantined` формой не проходят.
 */
const ART_ID = "[A-Za-z0-9][A-Za-z0-9_]*";
const ART_ID_RE = new RegExp(`^${ART_ID}$`);

function checkId(kind: string, id: string): string {
  if (!ART_ID_RE.test(id)) throw new Error(`artifacts: ${kind} не годится для имени каталога: ${JSON.stringify(id)}`);
  return id;
}

function fpsPart(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new Error(`artifacts: fps должен быть дробью целых >= 1: ${n}`);
  return n;
}

function rev(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error(`artifacts: ревизия должна быть целым >= 1: ${n}`);
  return `r${n}`;
}

function padPart(n: number): number {
  if (!Number.isInteger(n) || n < 0) throw new Error(`artifacts: поля превью — целое >= 0: ${n}`);
  return n;
}

/** Префикс каталогов проектов: публикация артефактов — только внутрь него. */
export const PROJECTS_REL = "workspace/projects";

/**
 * Ровно формы `artifactPaths`: `<p>/(source|proxy|packages|final)/<id>`, `<p>/master/<id>@<num>-<den>`,
 * `<p>/(transcript|edits|preview|style|plan|script|timeline|timeline-preview|audio)/<id>/r<N>`, `<p>/context/<id>/<id>@r<N>[-p<pad>]`,
 * `<p>/analysis/(footage|semantic)/<id>`. Остальное в каталоге проекта (сцены Phase 1,
 * `project.json`, родители ревизий) публикацией и карантином сирот не затрагивается.
 */
const DEST_REL_RE = new RegExp(
  `^${PROJECTS_REL}/${ART_ID}/(?:(?:source|proxy|packages|final)/${ART_ID}|master/${ART_ID}@[1-9][0-9]*-[1-9][0-9]*` +
    `|(?:transcript|edits|preview|style|plan|script|timeline|timeline-preview|audio)/${ART_ID}/r[1-9][0-9]*|context/${ART_ID}/${ART_ID}@r[1-9][0-9]*(?:-p(?:0|[1-9][0-9]*))?|analysis/(?:footage|semantic)/${ART_ID})$`,
);

/** destRel публикации — путь формы `artifactPaths`; иначе ошибка до любых изменений ФС. */
export function checkArtifactDestRel(destRel: string): void {
  if (!DEST_REL_RE.test(destRel)) {
    throw new Error(`artifacts: destRel не годится (ожидается путь artifactPaths в ${PROJECTS_REL}/<проект>/…): ${JSON.stringify(destRel)}`);
  }
}

export interface ArtifactPaths {
  /** Каталог проекта. */
  project: string;
  source(mediaId: string): string;
  proxy(mediaId: string): string;
  transcriptRev(id: string, n: number): string;
  edlRev(id: string, n: number): string;
  /**
   * Превью ревизии EDL (Task 28): отдельный каталог — `edits/<edl>/r<N>` уже опубликован
   * документом EDL и закрыт от записи, дописать в него превью нельзя.
   */
  previewRev(edlId: string, n: number): string;
  footage(id: string): string;
  semantic(id: string): string;
  styleRev(id: string, n: number): string;
  planRev(id: string, n: number): string;
  /** Ревизия текста сценария `script/<id>/r<N>`. */
  scriptRev(id: string, n: number): string;
  /** Папка пакета экспорта сценария `packages/<id>` (и папка клипов видеопроекта, Phase 5-lite). */
  package(id: string): string;
  /** Ревизия таймлайна видеопроекта `timeline/<id>/r<N>` (Phase 5). */
  timelineRev(id: string, n: number): string;
  /**
   * Превью ревизии таймлайна `timeline-preview/<id>/r<N>` (Task 42): `timeline/<id>/r<N>` закрыт
   * от записи документом ревизии, а `preview/<id>/` — пространство превью EDL (ADR 0010).
   */
  timelinePreviewRev(id: string, n: number): string;
  /** Экспорт финала `final/<id>`. */
  finalExport(id: string): string;
  /**
   * CFR-дериватив исходника для композиции (F1): `master/<media>@<num>-<den>` — свой каталог, не внутри
   * `proxy/<media>`: опубликованный прокси read-only (publish делает каталог a-w), вложить в него нельзя.
   */
  master(mediaId: string, fps: Fps): string;
  /** Смонтированная дорожка звука ревизии EDL `audio/<edl>/r<N>` (F2). */
  editedAudio(edlId: string, n: number): string;
  /**
   * Превью версии сцены поверх исходника `context/<scene>/<version>@r<N>[-p<pad>]`: ключ — версия,
   * ревизия плана (позиция сцены и EDL под ней) и поля до/после, кадров (ревью Task 38-39, I2).
   */
  contextPreview(sceneId: string, versionId: string, planRevision: number, padFrames?: number): string;
  /** Абсолютный путь в хранилище `root`. */
  abs(rel: string): string;
}

/** Пути `workspace/projects/<p>/{source,proxy,transcript,edits,preview,analysis/footage,analysis/semantic,style,plan,script,packages,timeline,timeline-preview,final,audio,context}/…`. */
export function artifactPaths(root: string, projectId: string): ArtifactPaths {
  const p = `${PROJECTS_REL}/${checkId("projectId", projectId)}`;
  return {
    project: p,
    source: (mediaId) => `${p}/source/${checkId("mediaId", mediaId)}`,
    proxy: (mediaId) => `${p}/proxy/${checkId("mediaId", mediaId)}`,
    transcriptRev: (id, n) => `${p}/transcript/${checkId("transcriptId", id)}/${rev(n)}`,
    edlRev: (id, n) => `${p}/edits/${checkId("edlId", id)}/${rev(n)}`,
    previewRev: (id, n) => `${p}/preview/${checkId("edlId", id)}/${rev(n)}`,
    footage: (id) => `${p}/analysis/footage/${checkId("footageId", id)}`,
    semantic: (id) => `${p}/analysis/semantic/${checkId("semanticId", id)}`,
    styleRev: (id, n) => `${p}/style/${checkId("styleId", id)}/${rev(n)}`,
    planRev: (id, n) => `${p}/plan/${checkId("planId", id)}/${rev(n)}`,
    scriptRev: (id, n) => `${p}/script/${checkId("scriptId", id)}/${rev(n)}`,
    package: (id) => `${p}/packages/${checkId("packageId", id)}`,
    timelineRev: (id, n) => `${p}/timeline/${checkId("timelineId", id)}/${rev(n)}`,
    timelinePreviewRev: (id, n) => `${p}/timeline-preview/${checkId("timelineId", id)}/${rev(n)}`,
    finalExport: (id) => `${p}/final/${checkId("exportId", id)}`,
    master: (mediaId, fps) => `${p}/master/${checkId("mediaId", mediaId)}@${fpsPart(fps.num)}-${fpsPart(fps.den)}`,
    editedAudio: (id, n) => `${p}/audio/${checkId("edlId", id)}/${rev(n)}`,
    contextPreview: (sceneId, versionId, planRevision, padFrames) =>
      `${p}/context/${checkId("sceneId", sceneId)}/${checkId("versionId", versionId)}@${rev(planRevision)}${padFrames === undefined ? "" : `-p${padPart(padFrames)}`}`,
    abs: (rel) => join(root, rel),
  };
}
