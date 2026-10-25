// SceneRepo (P1-11): сцены и версии поверх studio.db и иммутабельных каталогов версий.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  KnowledgeRefSchema, SettingsSchema, VersionManifestSchema, type Settings, type VersionDiff, type VersionManifest,
} from "@ms/contracts";
import { type ProcessRegistry, fileProcessRegistry, type StorageStatus } from "@ms/core";
import { z } from "zod";
import type { Db } from "../db/open.js";
import { tx } from "../db/tx.js";
import * as jobProcesses from "../db/repos/job-processes.js";
import * as jobs from "../db/repos/jobs.js";
import * as knowledgeRefs from "../db/repos/knowledge-refs.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { assertProjectOpen } from "../projects/lifecycle.js";
import { jsonDiff, srcFilesDiff } from "./diff.js";
import { sha256, sha256File } from "./hash.js";
import { newId } from "./ids.js";
import {
  QUARANTINE, SYNC_DRAFT_PREFIX, attachCause, commitVersionFiles, draftAttempt, createDraft, manifestText, prepareVersion, quarantineDraft, readVersion, sceneRel,
  sealVersion, setWritable, undoCommitVersionFiles, unlockDirs, writeBriefSync, type Draft, type PublishMeta,
} from "./store.js";

/** Предупреждение публикации: `unsealed` — корень версии не закрыт после COMMIT (закроет `relockVersions`). */
export interface PublishWarning {
  code: "unsealed";
  message: string;
}
export interface PublishedVersion {
  versionId: string;
  dir: string;
  manifest: VersionManifest;
  warnings: PublishWarning[];
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

/**
 * Отказ публикации по fencing: попытка устарела. Draft уже в карантине (`quarantined`) —
 * вызывающий второй раз его не помечает.
 */
export class FencedOutError extends Error {
  readonly quarantined = true;
  constructor(fence: Fence, current: number | undefined) {
    super(`fenced_out: попытка ${fence.attempt} задачи ${fence.jobId} устарела (текущая: ${current ?? "задачи нет"})`);
    this.name = "FencedOutError";
  }
}

/**
 * Отказ публикации: отмена задачи запрошена (Task 12/17). Отменённая задача версию не
 * публикует; draft уже в карантине `cancelled` (одноразовый, H6).
 */
export class PublishCancelledError extends Error {
  readonly quarantined = true;
  constructor(fence: Fence) {
    super(`cancelled: отмена задачи ${fence.jobId} запрошена — попытка ${fence.attempt} версию не публикует`);
    this.name = "PublishCancelledError";
  }
}

const RefsFile = z.array(KnowledgeRefSchema);

/**
 * Полные ссылки KB из `knowledge-refs.json` версии; нет файла — краткие из manifest.
 * Испорченный файл (не JSON или не по схеме) — ошибка: provenance не подменяется молча.
 */
export async function readKnowledgeRefs(dir: string, manifest: Pick<VersionManifest, "knowledge_refs">): Promise<knowledgeRefs.KnowledgeRefInsert[]> {
  let text: string;
  try {
    text = await readFile(join(dir, "knowledge-refs.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return manifest.knowledge_refs;
    throw e;
  }
  try {
    return RefsFile.parse(JSON.parse(text));
  } catch (e) {
    throw new Error(`scenes: knowledge-refs.json испорчен (${dir}): ${(e as Error).message}`, { cause: e });
  }
}

/** Наибольший номер среди каталогов версий сцены на диске (по их manifest.json); 0 — нет. */
function maxNumberOnDisk(versionsDir: string): number {
  let max = 0;
  for (const e of readdirSync(versionsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    try {
      const n = (JSON.parse(readFileSync(join(versionsDir, e.name, "manifest.json"), "utf8")) as { number?: unknown }).number;
      if (typeof n === "number" && Number.isInteger(n) && n > max) max = n;
    } catch {
      // каталог без manifest — не версия
    }
  }
  return max;
}

export class SceneRepo {
  readonly root: string;
  private dbRef: Db;
  private readonly guard: () => Promise<StorageStatus>;
  private readonly registry: ProcessRegistry | undefined;

  /**
   * `registry` — реестр процессов для `cleanupDrafts` (сервер: слияние SQLite и бокового
   * файлового); без него — `job_processes` этой БД и `run/processes/`.
   */
  constructor(deps: { root: string; db: Db; guard: () => Promise<StorageStatus>; registry?: ProcessRegistry }) {
    this.root = deps.root;
    this.dbRef = deps.db;
    this.guard = deps.guard;
    this.registry = deps.registry;
  }

  get db(): Db {
    return this.dbRef;
  }

  /** База переоткрыта после `storage_offline` (StorageSupervisor). */
  useDb(db: Db): void {
    this.dbRef = db;
  }

  /** Новая сцена: `brief.json` в каталоге сцены и строка в БД. Синхронно — годится внутри `tx`. */
  createScene(projectId: string, input: { prompt: string; settings: Settings }): scenes.SceneRow {
    if (!projects.get(this.db, projectId)) throw new Error(`scenes: проекта нет: ${projectId}`);
    // до записи brief.json: она пересоздала бы каталог проекта в корзине (Task 47)
    assertProjectOpen(this.db, projectId);
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

  /** Fencing и отмена: устаревшая попытка — `FencedOutError`, запрошенная отмена — `PublishCancelledError`. */
  private gate(fence: Fence): Error | undefined {
    const stale = this.fenceOk(fence);
    if (stale !== undefined) return new FencedOutError(fence, stale < 0 ? undefined : stale);
    if (jobs.get(this.db, fence.jobId)?.cancel_requested) return new PublishCancelledError(fence);
    return undefined;
  }

  /**
   * Публикация версии с fencing (ADR 0007, H9). До транзакции, асинхронно: `prepareVersion`
   * (guard, sha256, fsync). Затем одна транзакция `BEGIN IMMEDIATE`, только синхронное:
   * `jobs.attempt = fence.attempt` и отмена не запрошена (иначе `fenced_out` / `cancelled`
   * и карантин draft) → номер →
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

    const refused = this.gate(fence);
    if (refused) {
      await quarantineDraft(draft, refused.message);
      throw refused;
    }
    const prepared = await prepareVersion(draft, { ...meta, job: { id: fence.jobId, attempt: fence.attempt } }, this.guard);
    const refs = await readKnowledgeRefs(draft.dir, meta);

    let moved: string | undefined;
    let published: Omit<PublishedVersion, "warnings">;
    try {
      published = tx(this.db, () => {
        const refusedInTx = this.gate(fence);
        if (refusedInTx) throw refusedInTx;
        // Каталог версии без строки в БД (до reconcile) тоже занимает номер — иначе коллизия.
        const number = Math.max(versions.nextNumber(this.db, draft.sceneId), maxNumberOnDisk(prepared.versionsDir) + 1);
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
      if (moved) {
        try {
          undoCommitVersionFiles(prepared, moved);
        } catch (u) {
          attachCause(e, u);
        }
      }
      if (e instanceof FencedOutError || e instanceof PublishCancelledError) await quarantineDraft(draft, e.message);
      throw e;
    }
    // Версия уже в БД: незакрытый корень — не отказ, а предупреждение (relockVersions при старте).
    const warnings: PublishWarning[] = [];
    try {
      await sealVersion(published.dir);
    } catch (e) {
      warnings.push({ code: "unsealed", message: `корень версии не закрыт от записи: ${(e as Error).message}` });
    }
    return { ...published, warnings };
  }

  /**
   * Восстановление (`05` §5, M17): новая версия-копия готовой версии `versionId` — файлы
   * (кроме manifest) копируются в draft попытки, `render_env` берётся из исходной или из
   * `opts.rerender`; parent = восстановленная, становится current. История не меняется.
   */
  async restore(sceneId: string, versionId: string, fence: Fence, opts: RestoreOptions = {}): Promise<PublishedVersion> {
    const row = versions.get(this.db, versionId);
    if (!row || row.scene_id !== sceneId) throw new Error(`scenes: версии ${versionId} нет у сцены ${sceneId}`);
    if (row.broken_reason) throw new Error(`version_broken: версия ${versionId} недоступна: ${row.broken_reason}`);
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
      if (row.broken_reason) throw new Error(`version_broken: версия ${id} недоступна: ${row.broken_reason}`);
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
   * `interrupted` удаляется (сначала права записи каталогам; файлы не трогаются — в draft
   * пакета S7 жёсткие ссылки на экспорты). Карантин `fenced_out` /
   * `stale_process` / `publish` и прочие, draft живых попыток и draft без карантина
   * остаются до решения человека (или `sweepAbandonedDrafts`). Попытка живая, если она в
   * `live` или у неё есть незавершённые процессы в `job_processes` или файловом реестре.
   */
  async cleanupDrafts(live: { runId: string; attempt: number }[]): Promise<{ removed: string[]; kept: string[] }> {
    const out = { removed: [] as string[], kept: [] as string[] };
    const draftsDir = join(this.root, "workspace/drafts");
    if (!existsSync(draftsDir)) return out;
    const key = (runId: string, attempt: number) => `${runId}-a${attempt}`;
    const alive = new Set(live.map((l) => key(l.runId, l.attempt)));
    if (this.registry) for (const p of await this.registry.live()) alive.add(key(p.runId, p.attempt));
    else {
      for (const p of jobProcesses.listLive(this.db)) alive.add(key(p.job_id, p.attempt));
      for (const p of await fileProcessRegistry(this.root).live()) alive.add(key(p.runId, p.attempt));
    }
    const entries = (await readdir(draftsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
    for (const name of entries) {
      const dir = join(draftsDir, name);
      // <job>-a<n> и draft экспортов <job>-a<n>--<key> (S6) — по попытке
      const m = draftAttempt(name);
      // sync-<id> (синхронная правка) процессов не имеет: удаляется по одноразовому карантину
      const sync = name.startsWith(SYNC_DRAFT_PREFIX);
      if ((!sync && (!m || alive.has(key(m.runId, m.attempt)))) || !(await disposable(dir))) {
        out.kept.push(dir);
        continue;
      }
      await unlockDirs(dir);
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
