// Регистрация в БД каталогов версий без строки в `scene_versions`: версии среза
// (`doctor --import-slice`, Q2) и версии, упавшие между rename и COMMIT (шаг
// `reconcile_versions` загрузки, H9). Каждая версия сверяется `readVersion` (sha256).
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { VersionManifest } from "@ms/contracts";
import { tx } from "../db/tx.js";
import * as jobs from "../db/repos/jobs.js";
import * as knowledgeRefs from "../db/repos/knowledge-refs.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { sha256 } from "./hash.js";
import { readKnowledgeRefs, type SceneRepo } from "./repo.js";
import { adoptDraftAsVersion, readVersion, sceneRel } from "./store.js";

export interface ImportReport {
  imported: number;
  skipped: { dir: string; error: string }[];
}

async function subdirs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function readBrief(sceneDir: string): Promise<{ prompt?: string; created_at?: string }> {
  try {
    return JSON.parse(await readFile(join(sceneDir, "brief.json"), "utf8")) as { prompt?: string; created_at?: string };
  } catch {
    return {};
  }
}

export async function importSliceVersions(repo: SceneRepo, root: string): Promise<ImportReport> {
  const { db } = repo;
  const out: ImportReport = { imported: 0, skipped: [] };
  const projectsDir = join(root, "workspace/projects");
  for (const projectId of await subdirs(projectsDir)) {
    if (!projects.get(db, projectId)) {
      out.skipped.push({ dir: join(projectsDir, projectId), error: `проекта ${projectId} нет в БД` });
      continue;
    }
    for (const sceneId of await subdirs(join(projectsDir, projectId, "scenes"))) {
      const sceneDir = join(root, sceneRel(projectId, sceneId));
      const found: { dir: string; manifest: VersionManifest; manifestSha: string; refs: knowledgeRefs.KnowledgeRefInsert[] }[] = [];
      for (const versionId of await subdirs(join(sceneDir, "versions"))) {
        if (versions.get(db, versionId)) continue;
        const dir = join(sceneDir, "versions", versionId);
        try {
          const manifest = await readVersion(dir);
          const manifestSha = sha256(await readFile(join(dir, "manifest.json")));
          found.push({ dir, manifest, manifestSha, refs: await readKnowledgeRefs(dir, manifest) });
        } catch (e) {
          out.skipped.push({ dir, error: (e as Error).message });
        }
      }
      if (found.length === 0) continue;
      found.sort((a, b) => a.manifest.number - b.manifest.number);
      const brief = await readBrief(sceneDir);
      for (const v of found) {
        const m = v.manifest;
        try {
          tx(db, () => {
            const scene = scenes.get(db, sceneId);
            if (!scene) {
              scenes.create(db, { id: sceneId, project_id: projectId, title: (brief.prompt ?? sceneId).trim().slice(0, 80) || sceneId, created_at: brief.created_at ?? m.created_at });
            } else if (scene.project_id !== projectId) {
              throw new Error(`сцена ${sceneId} в БД относится к проекту ${scene.project_id}`);
            }
            versions.insert(db, {
              id: m.version_id,
              scene_id: sceneId,
              parent_version_id: m.parent_version_id,
              number: m.number,
              status: m.status,
              prompt: m.prompt,
              edit_plan: m.edit_plan,
              settings: m.settings,
              path: `${sceneRel(projectId, sceneId)}/versions/${m.version_id}`,
              manifest_sha256: v.manifestSha,
              created_by_job_id: m.job && jobs.get(db, m.job.id) ? m.job.id : null,
              created_at: m.created_at,
            });
            knowledgeRefs.insertMany(db, m.version_id, v.refs);
            const currentId = scenes.get(db, sceneId)!.current_version_id;
            const current = currentId ? versions.get(db, currentId) : undefined;
            if (m.status === "ready" && (!current || current.number < m.number)) scenes.setCurrent(db, sceneId, m.version_id);
          });
          out.imported++;
        } catch (e) {
          out.skipped.push({ dir: v.dir, error: (e as Error).message });
        }
      }
    }
  }
  return out;
}

export interface MissingReport {
  /** Версии, у которых rename из draft доведён до конца. */
  restored: string[];
  /** Версии, помеченные `broken_reason` (каталога нет, draft не годится). */
  broken: { versionId: string; reason: string }[];
}

/**
 * Обратный случай H9: строка версии в БД есть, а каталога нет (rename не дошёл до диска).
 * Безопасный вариант: если draft с `manifest.json` этой версии найден и полностью сверен
 * (sha256 manifest = БД, sha256 каждого файла) — rename доводится (`adoptDraftAsVersion`);
 * иначе строка помечается `broken_reason`, файлы не трогаются и ничего не выдумывается.
 * Должно идти до `cleanupDrafts` (draft помечен `abandoned` и иначе был бы удалён).
 */
export async function recoverMissingVersions(repo: SceneRepo, root: string): Promise<MissingReport> {
  const { db } = repo;
  const out: MissingReport = { restored: [], broken: [] };
  let drafts: Map<string, string> | undefined;
  const draftFor = async (versionId: string): Promise<string | undefined> => {
    if (!drafts) {
      drafts = new Map();
      const dir = join(root, "workspace/drafts");
      for (const name of await subdirs(dir)) {
        try {
          const m = JSON.parse(await readFile(join(dir, name, "manifest.json"), "utf8")) as { version_id?: unknown };
          if (typeof m.version_id === "string") drafts.set(m.version_id, join(dir, name));
        } catch {
          // draft без manifest — не кандидат
        }
      }
    }
    return drafts.get(versionId);
  };
  for (const row of versions.listIntact(db)) {
    const dir = join(root, row.path);
    if (existsSync(dir)) continue;
    const draft = await draftFor(row.id);
    let reason: string;
    if (!draft) reason = "каталог версии не найден, draft с её manifest.json тоже";
    else {
      try {
        await adoptDraftAsVersion(draft, dir, row.manifest_sha256, root);
        out.restored.push(row.id);
        continue;
      } catch (e) {
        reason = `каталог версии не найден, draft ${draft} не годится: ${(e as Error).message}`;
      }
    }
    versions.markBroken(db, row.id, reason);
    out.broken.push({ versionId: row.id, reason });
  }
  return out;
}

/**
 * Шаг загрузки `reconcile_versions` (после `relockVersions`, до `recovery` и запуска раннера):
 * сначала пропавшие каталоги версий, затем каталоги без строки в БД.
 */
export async function reconcileVersions(repo: SceneRepo, root: string): Promise<ImportReport & { missing: MissingReport }> {
  const missing = await recoverMissingVersions(repo, root);
  return { missing, ...(await importSliceVersions(repo, root)) };
}
