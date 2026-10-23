// Общее для тестов Control API: настоящий `bootCore` в tmp-хранилище (без обработчиков
// задач — проверяется только контракт API: задачи остаются в очереди), `app.inject` с
// заголовками браузера, опубликованная версия с превью и кадром.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { reapAttempt } from "@ms/core";
import { defaultSettings } from "@ms/contracts";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type BuildAppOptions, buildApp } from "../../src/api/app.js";
import { type BootOptions, type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";

export const ORIGIN = "http://127.0.0.1:8790";
export const okHeaders = { host: "127.0.0.1:8790", origin: ORIGIN };
export const getHeaders = { host: "127.0.0.1:8790" };

export interface Api {
  s: TestStore;
  core: Core;
  app: FastifyInstance;
  inj(method: string, url: string, headers?: Record<string, string | undefined>, body?: unknown): Promise<LightMyRequestResponse>;
  close(): Promise<void>;
}

/** KB из двух записей: permissive и restricted (обе — «счётчик»). */
export async function makeKb(tmp: string): Promise<KnowledgeAdapter> {
  const root = join(tmp, "kb");
  await mkdir(join(root, "components/r"), { recursive: true });
  const rec = (o: Record<string, unknown>) => ({
    name: "X", kind: "component", category: "misc", visualizes: "", use_when: "", voiceover_cues: [], inputs: "",
    adaptations: "", patterns: [], compat_flags: [], source_files: ["a.tsx"], docs: [], verification: "static-review",
    remotion_compat: "native", card: "components/r/x.md", license: "MIT (x)", ...o,
  });
  const rows = [
    rec({ id: "r/counter", repo: "r", name: "Counter", visualizes: "счётчик числа", patterns: ["quantities"] }),
    rec({ id: "q/restricted", repo: "q", name: "R", visualizes: "счётчик", license: "MIT + Commons Clause" }),
  ];
  await writeFile(join(root, "capabilities.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  await writeFile(join(root, "components/r/x.md"), "# Counter\n\nкарточка\n");
  await writeFile(
    join(root, "repositories.json"),
    JSON.stringify({ repositories: [
      { id: "r", name: "r", url: "https://example.test/r", commit: "abcdef1", license: "MIT" },
      { id: "q", name: "q", url: "https://example.test/q", commit: "abcdef2", license: "MIT + Commons Clause" },
    ] }),
  );
  return KnowledgeAdapter.load({ kbRoot: root, sourceRoot: root });
}

export async function makeApi(opts: { boot?: Partial<BootOptions>; app?: Partial<BuildAppOptions>; env?: NodeJS.ProcessEnv; store?: TestStore } = {}): Promise<Api> {
  const s = opts.store ?? (await makeStore("ms-api-"));
  const kb = await makeKb(s.tmp);
  const core = await bootCore({
    env: { MS_DATA_DIR: s.root, ...opts.env },
    kind: "server",
    probe,
    kb,
    agents: {} as AgentRuntimeAdapter,
    reap: (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 }),
    reapStrays: async () => [],
    handlers: {},
    ...opts.boot,
  });
  const app = await buildApp(core, { port: 8790, ...opts.app });
  return {
    s,
    core,
    app,
    inj(method, url, headers = okHeaders, body) {
      const h = Object.fromEntries(Object.entries({ ...getHeaders, ...headers }).filter(([, v]) => v !== undefined)) as Record<string, string>;
      return app.inject({ method: method as "GET", url, headers: h, ...(body === undefined ? {} : { payload: body as object }) });
    },
    async close() {
      await app.close();
      await core.close();
      await removeStore(s);
    },
  };
}

/** Проект + сцена + опубликованная ready-версия (превью `previewBytes` байт, кадр 0). */
export async function seedVersion(api: Api, opts: { projectId?: string; previewBytes?: number; props?: unknown } = {}) {
  const { core } = api;
  const projectId = opts.projectId ?? "playground";
  if (!projects.get(core.db, projectId)) projects.create(core.db, { id: projectId, title: projectId });
  const scene = core.repo.createScene(projectId, { prompt: "Рост выручки", settings: defaultSettings() });
  const jobId = `job_seed_${scene.id}`;
  jobs.insert(core.db, { id: jobId, type: "playground.generate", project_id: projectId, scene_id: scene.id, input: {}, status: "completed", attempt: 1 });
  const preview = "v".repeat(opts.previewBytes ?? 1000);
  const draft = await makeDraft(core.root, { runId: jobId, attempt: 1, sceneId: scene.id, projectId }, { preview, ...(opts.props ? { props: opts.props } : {}) });
  const v = await core.repo.publish(draft, meta(scene.id, {}, preview), { jobId, attempt: 1 });
  return { projectId, scene, versionId: v.versionId, dir: v.dir, preview };
}
