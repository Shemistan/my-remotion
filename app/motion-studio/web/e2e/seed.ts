// Версии для Playwright UI (Task 21, Q8, M14): рукописные фикстуры сцен рендерятся по-настоящему
// (`renderVersion`: бандл Remotion, Chrome, превью H.264, стоп-кадры) и публикуются через
// `SceneRepo.publish` — без LLM. Фикстура, рендер которой падает (hang-scene, короткий
// `timeoutMs`), публикуется failed-версией с `failure.stage = "render"` и журналом рендера —
// это «ошибка рендера с логами» (ТЗ §11.3). QA агентом не выполнялся: gate версии —
// технический pass, остальные `not_checked` (как у версий среза).
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type Settings, SettingsSchema } from "@ms/contracts";
import { renderVersion } from "@ms/render";
import type { Core } from "../../server/src/boot.js";
import * as jobs from "../../server/src/db/repos/jobs.js";
import * as projects from "../../server/src/db/repos/projects.js";
import { renderEnv } from "../../server/src/pipeline/render-env.js";
import { sha256File } from "../../server/src/scenes/hash.js";
import { createDraft } from "../../server/src/scenes/store.js";

export interface SeedFixture {
  /** Каталог фикстуры: `src/Scene.tsx`, `props.json`, `settings.json`, необязательно `spec.json`. */
  dir: string;
  /** Таймаут рендера (hang-scene — коротко, чтобы упасть `timeout`). */
  timeoutMs?: number;
  /** Поверх `settings.json` фикстуры (например, `transparent_export: true`). */
  settings?: Partial<Settings>;
  prompt?: string;
  /** Motion Spec вместо `spec.json` фикстуры (рукописная фикстура без него — для «Рендера»). */
  specFile?: string;
}

export interface SeedOptions {
  projectId: string;
  projectTitle?: string;
  sceneTitle?: string;
}

const RENDER_TIMEOUT = 300_000;
const LOG_TAIL = 20;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** QA-кадры: начало, середина, последний кадр. */
const qaFramesOf = (duration: number) => [...new Set([0, Math.floor(duration / 2), duration - 1])];

export async function seedScene(core: Core, fixtures: SeedFixture[], opts: SeedOptions): Promise<{ sceneId: string; versionIds: string[] }> {
  if (!projects.get(core.db, opts.projectId)) projects.create(core.db, { id: opts.projectId, title: opts.projectTitle ?? opts.projectId });
  const first = fixtures[0]!;
  const baseSettings = SettingsSchema.parse({ ...(await readJson(join(first.dir, "settings.json")) as object), ...first.settings });
  const scene = core.repo.createScene(opts.projectId, { prompt: first.prompt ?? opts.sceneTitle ?? "сцена", settings: baseSettings });
  const env = await renderEnv();
  const cacheDir = join(core.root, "cache");
  await mkdir(cacheDir, { recursive: true });
  const versionIds: string[] = [];
  let parent: string | undefined;

  for (const [i, fx] of fixtures.entries()) {
    const settings = SettingsSchema.parse({ ...(await readJson(join(fx.dir, "settings.json")) as object), ...fx.settings });
    const jobId = `job_seed_${scene.id}_${i + 1}`;
    jobs.insert(core.db, {
      id: jobId, type: i === 0 ? "playground.generate" : "playground.edit", project_id: opts.projectId, scene_id: scene.id,
      input: { seed: true }, status: "running", attempt: 1, started_at: new Date().toISOString(),
    });
    const draft = await createDraft(core.root, { runId: jobId, attempt: 1, sceneId: scene.id, projectId: opts.projectId, ...(parent ? { parentVersionId: parent } : {}) });
    await cp(join(fx.dir, "src"), join(draft.dir, "src"), { recursive: true });
    await cp(join(fx.dir, "props.json"), join(draft.dir, "props.json"));
    await writeFile(join(draft.dir, "settings.json"), JSON.stringify(settings, null, 2) + "\n");
    const spec = fx.specFile ? await readJson(fx.specFile) : existsSync(join(fx.dir, "spec.json")) ? await readJson(join(fx.dir, "spec.json")) : { title: fx.prompt ?? "сцена", duration_frames: settings.duration_frames };
    await writeFile(join(draft.dir, "spec.json"), JSON.stringify(spec, null, 2) + "\n");
    await writeFile(join(draft.dir, "knowledge-refs.json"), "[]\n");
    await mkdir(join(draft.dir, "frames"), { recursive: true });

    const qaFrames = qaFramesOf(settings.duration_frames);
    const t0 = Date.now();
    const r = await renderVersion({
      versionDir: draft.dir,
      settings,
      cacheDir,
      stills: qaFrames,
      preview: { scale: 1, crf: 23 },
      timeoutMs: fx.timeoutMs ?? RENDER_TIMEOUT,
      run: { root: core.root, runId: jobId, attempt: 1 },
    });
    const wall = Date.now() - t0;
    // время — реальное время рендера; стоимость 0: агенты не вызывались
    await writeFile(join(draft.dir, "pipeline-log.json"), JSON.stringify({ run_id: jobId, attempt: 1, cost_usd: 0, stage_wall_ms: { render: wall, total: wall }, seed: true }, null, 2) + "\n");

    const common = {
      schema_version: 1 as const,
      scene_id: scene.id,
      parent_version_id: parent ?? null,
      prompt: fx.prompt ?? "сцена",
      edit_plan: null,
      settings,
      changed_files: ["src/Scene.tsx", "props.json"],
      render_env: env,
      knowledge_refs: [],
      agent_runs: [],
      job: { id: jobId, attempt: 1 },
    };
    let meta;
    if (r.ok && r.previewPath) {
      const shas = [];
      for (const f of qaFrames) shas.push(await sha256File(join(draft.dir, "frames", `${f}.png`)));
      meta = {
        ...common,
        status: "ready" as const,
        qa: { technical: "pass" as const, visual: "not_checked" as const, semantic: "not_checked" as const, style: "not_checked" as const },
        preview: { path: "preview.mp4", sha256: await sha256File(join(draft.dir, "preview.mp4")) },
        qa_frames: qaFrames,
        qa_frames_sha256: shas,
      };
    } else {
      // как в конвейере (fix-loop): этап рендера, сообщение и хвост консоли браузера
      const logs = r.browserLogs.slice(-LOG_TAIL);
      const message = `${r.error?.stage ?? "render"}: ${r.error?.message ?? "рендер не удался"}${logs.length ? `\nконсоль браузера:\n${logs.join("\n")}` : ""}`;
      // превью у failed-версии нет (`preview: null`): ошибка не подменяется видео
      meta ={ ...common, status: "failed" as const, qa: null, preview: null, failure: { stage: "render" as const, message }, qa_frames: [], qa_frames_sha256: [] };
    }
    const v = await core.repo.publish(draft, meta, { jobId, attempt: 1 });
    jobs.update(core.db, jobId, meta.status === "ready"
      ? { status: "completed", progress: 1, finished_at: new Date().toISOString(), output_refs: { version_id: v.versionId, seed: true } }
      : { status: "failed", finished_at: new Date().toISOString(), error: { code: "pipeline", stage: "render", message: meta.failure!.message } });
    versionIds.push(v.versionId);
    if (meta.status === "ready") parent = v.versionId;
  }
  return { sceneId: scene.id, versionIds };
}
