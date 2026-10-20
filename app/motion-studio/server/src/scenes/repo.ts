// SceneRepo (P1-11): сцены и версии поверх studio.db и иммутабельных каталогов версий.
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  KnowledgeRefSchema, SettingsSchema, VersionManifestSchema, type Settings, type VersionDiff, type VersionManifest,
} from "@ms/contracts";
import type { StorageStatus } from "@ms/core";
import { z } from "zod";
import type { Db } from "../db/open.js";
import { tx } from "../db/tx.js";
import * as jobs from "../db/repos/jobs.js";
import * as knowledgeRefs from "../db/repos/knowledge-refs.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { jsonDiff, srcFilesDiff } from "./diff.js";
import { sha256, sha256File } from "./hash.js";
import { newId } from "./ids.js";
import {
  QUARANTINE, commitVersionFiles, createDraft, manifestText, prepareVersion, quarantineDraft, readVersion, sceneRel,
  sealVersion, setWritable, undoCommitVersionFiles, writeBriefSync, type Draft, type PublishMeta,
} from "./store.js";

export interface PublishedVersion {
  versionId: string;
  dir: string;
  manifest: VersionManifest;
  warnings: string[];
}
export interface Fence {
  jobId: string;
  attempt: number;
}
export interface RestoreOptions {
  /** Перерендер в draft при несовпадении `render_lock_sha256` (решает вызывающий, M17). */
  rerender?: (outDir: string) => Promise<{ render_env: VersionManifest["render_env"] }>;
}

/** Причины карантина, после которых draft можно удалить (H6): попытка точно не опубликует результат. */
const DISPOSABLE = /^(cancelled|abandoned|interrupted)\b/;
const TITLE_MAX = 80;

class FencedOutError extends Error {
  constructor(fence: Fence, current: number | undefined) {
    super(`fenced_out: попытка ${fence.attempt} задачи ${fence.jobId} устарела (текущая: ${current ?? "задачи нет"})`);
    this.name = "FencedOutError";
  }
}

const RefsFile = z.array(KnowledgeRefSchema);

/** Полные ссылки KB из `knowledge-refs.json` версии; нет файла или он не по схеме — краткие из manifest. */
export async function readKnowledgeRefs(dir: string, manifest: Pick<VersionManifest, "knowledge_refs">): Promise<knowledgeRefs.KnowledgeRefInsert[]> {
  try {
    const parsed = RefsFile.safeParse(JSON.parse(await readFile(join(dir, "knowledge-refs.json"), "utf8")));
    if (parsed.success) return parsed.data;
  } catch {
    // нет файла — берём manifest
  }
  return manifest.knowledge_refs;
}

export class SceneRepo {
  readonly root: string;
  readonly db: Db;
  private readonly guard: () => Promise<StorageStatus>;

  constructor(deps: { root: string; db: Db; guard: () => Promise<StorageStatus> }) {
    this.root = deps.root;
    this.db = deps.db;
    this.guard = deps.guard;
  }

  /** Новая сцена: `brief.json` в каталоге сцены и строка в БД. Синхронно — годится внутри `tx`. */
  createScene(projectId: string, input: { prompt: string; settings: Settings }): scenes.SceneRow {
    if (!projects.get(this.db, projectId)) throw new Error(`scenes: проекта нет: ${projectId}`);
    const settings = SettingsSchema.parse(input.settings);
    const id = newId("scn");
    const created_at = new Date().toISOString();
    writeBriefSync(this.root, id, { prompt: input.prompt, settings, created_at }, projectId);
    const title = input.prompt.trim().replace(/\s+/g, " ").slice(0, TITLE_MAX);
    return scenes.create(this.db, { id, project_id: projectId, title, created_at });
  }

  private fenceOk(fence: Fence): number | undefined {
    const job = jobs.get(this.db, fence.jobId);
    return job?.attempt === fence.attempt ? undefined : (job?.attempt ?? -1);
  }

  /**
   * Публикация версии с fencing (ADR 0007, H9). До транзакции, асинхронно: `prepareVersion`
   * (guard, sha256, fsync). Затем одна транзакция `BEGIN IMMEDIATE`, только синхронное:
   * `jobs.attempt = fence.attempt` (иначе `fenced_out` и карантин draft) → номер →
   * `commitVersionFiles` → строки версии и ссылок KB → `ready` становится current.
   * Сбой записи после rename возвращает файлы в draft. После COMMIT — `sealVersion`.
   */
  async publish(draft: Draft, meta: PublishMeta, fence: Fence): Promise<PublishedVersion> {
    if (draft.runId !== fence.jobId || draft.attempt !== fence.attempt) {
      throw new Error(`scenes: draft ${draft.dir} не принадлежит попытке ${fence.attempt} задачи ${fence.jobId}`);
    }
    const scene = scenes.get(this.db, draft.sceneId);
    if (!scene) throw new Error(`scenes: сцены нет в БД: ${draft.sceneId}`);
    if (scene.project_id !== draft.projectId) throw new Error(`scenes: сцена ${scene.id} в проекте ${scene.project_id}, draft — в ${draft.projectId}`);

    const stale = this.fenceOk(fence);
    if (stale !== undefined) {
      const err = new FencedOutError(fence, stale < 0 ? undefined : stale);
      await quarantineDraft(draft, err.message);
      throw err;
    }
    const prepared = await prepareVersion(draft, { ...meta, job: { id: fence.jobId, attempt: fence.attempt } }, this.guard);
    const refs = await readKnowledgeRefs(draft.dir, meta);

    let moved: string | undefined;
    let published: Omit<PublishedVersion, "warnings">;
    try {
      published = tx(this.db, () => {
        const current = this.fenceOk(fence);
        if (current !== undefined) throw new FencedOutError(fence, current < 0 ? undefined : current);
        const number = versions.nextNumber(this.db, draft.sceneId);
        const versionId = newId("ver");
        const dir = join(prepared.versionsDir, versionId);
        const manifest = commitVersionFiles(prepared, { versionId, number, dir });
        moved = dir;
        versions.insert(this.db, {
          id: versionId,
          scene_id: draft.sceneId,
          parent_version_id: manifest.parent_version_id,
          number,
          status: manifest.status,
          prompt: manifest.prompt,
          edit_plan: manifest.edit_plan,
          settings: manifest.settings,
          path: `${sceneRel(draft.projectId, draft.sceneId)}/versions/${versionId}`,
          manifest_sha256: sha256(manifestText(manifest)),
          created_by_job_id: fence.jobId,
          created_at: manifest.created_at,
        });
        knowledgeRefs.insertMany(this.db, versionId, refs);
        if (manifest.status === "ready") scenes.setCurrent(this.db, draft.sceneId, versionId);
        return { versionId, dir, manifest };
      });
    } catch (e) {
      if (moved) undoCommitVersionFiles(prepared, moved);
      if (e instanceof FencedOutError) await quarantineDraft(draft, e.message);
      throw e;
    }
    return { ...published, warnings: await sealVersion(published.dir) };
  }

  /**
   * Восстановление (`05` §5, M17): новая версия-копия готовой версии `versionId` — файлы
   * (кроме manifest) копируются в draft попытки, `render_env` берётся из исходной или из
   * `opts.rerender`; parent = восстановленная, становится current. История не меняется.
   */
  async restore(sceneId: string, versionId: string, fence: Fence, opts: RestoreOptions = {}): Promise<PublishedVersion> {
    const row = versions.get(this.db, versionId);
    if (!row || row.scene_id !== sceneId) throw new Error(`scenes: версии ${versionId} нет у сцены ${sceneId}`);
    if (row.status !== "ready") throw new Error(`restore_not_ready: версия ${versionId} в статусе ${row.status}, восстанавливать можно только ready`);
    const scene = scenes.get(this.db, sceneId)!;
    const srcDir = join(this.root, row.path);
    const src = await readVersion(srcDir);

    const draft = await createDraft(this.root, {
      runId: fence.jobId, attempt: fence.attempt, sceneId, projectId: scene.project_id, parentVersionId: versionId,
    });
    for (const f of src.files) {
      const to = join(draft.dir, f.path);
      if (existsSync(to)) continue;
      await mkdir(dirname(to), { recursive: true });
      await copyFile(join(srcDir, f.path), to);
    }
    await setWritable(draft.dir);
    const render_env = opts.rerender ? (await opts.rerender(draft.dir)).render_env : src.render_env;
    const preview = src.preview ? { path: src.preview.path, sha256: await sha256File(join(draft.dir, src.preview.path)) } : null;
    const qa_frames_sha256 = [];
    for (const [i, frame] of src.qa_frames.entries()) {
      const file = join(draft.dir, "frames", `${frame}.png`);
      qa_frames_sha256.push(existsSync(file) ? await sha256File(file) : src.qa_frames_sha256[i]!);
    }
    const meta: PublishMeta = {
      schema_version: 1,
      scene_id: sceneId,
      parent_version_id: versionId,
      prompt: `restore v${src.number}`,
      edit_plan: { kind: "restore", base_version_id: versionId },
      settings: src.settings,
      changed_files: [],
      render_env,
      knowledge_refs: src.knowledge_refs,
      agent_runs: [],
      qa: src.qa ?? null,
      preview,
      status: "ready",
      qa_frames: src.qa_frames,
      qa_frames_sha256,
    };
    return this.publish(draft, meta, fence);
  }

  /** Сравнение двух версий: settings, props.json, spec.json и файлы `src/**`. */
  async diff(aId: string, bId: string): Promise<VersionDiff> {
    const load = async (id: string) => {
      const row = versions.get(this.db, id);
      if (!row) throw new Error(`scenes: версии нет: ${id}`);
      const dir = join(this.root, row.path);
      const manifest = VersionManifestSchema.parse(JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")));
      const json = async (name: string): Promise<unknown> =>
        manifest.files.some((f) => f.path === name) ? JSON.parse(await readFile(join(dir, name), "utf8")) : undefined;
      return { dir, manifest, props: await json("props.json"), spec: await json("spec.json") };
    };
    const [a, b] = await Promise.all([load(aId), load(bId)]);
    return {
      settings: jsonDiff(a.manifest.settings, b.manifest.settings),
      props: jsonDiff(a.props, b.props),
      spec: jsonDiff(a.spec, b.spec),
      files: srcFilesDiff(a, b),
    };
  }

  /**
   * Уборка draft (H6): draft без живой попытки с карантином `cancelled` / `abandoned…` /
   * `interrupted` удаляется (сначала снимается read-only). Карантин `fenced_out` /
   * `stale_process` / `publish` и прочие, draft живых попыток и draft без карантина
   * остаются до решения человека (или `sweepAbandonedDrafts`).
   */
  async cleanupDrafts(live: { runId: string; attempt: number }[]): Promise<{ removed: string[]; kept: string[] }> {
    const out = { removed: [] as string[], kept: [] as string[] };
    const draftsDir = join(this.root, "workspace/drafts");
    if (!existsSync(draftsDir)) return out;
    const alive = new Set(live.map((l) => `${l.runId}-a${l.attempt}`));
    const entries = (await readdir(draftsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    for (const name of entries) {
      const dir = join(draftsDir, name);
      if (alive.has(name) || !(await disposable(dir))) {
        out.kept.push(dir);
        continue;
      }
      await setWritable(dir);
      await rm(dir, { recursive: true, force: true });
      out.removed.push(dir);
    }
    return out;
  }
}

async function disposable(dir: string): Promise<boolean> {
  try {
    const q = JSON.parse(await readFile(join(dir, QUARANTINE), "utf8")) as { reason?: unknown };
    return typeof q.reason === "string" && DISPOSABLE.test(q.reason);
  } catch {
    return false; // без карантина или нечитаемый маркер — не трогаем
  }
}
