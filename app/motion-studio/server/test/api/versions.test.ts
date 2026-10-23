// Версии: файлы версии с provenance KB, окружение рендера, сравнение, экспорт.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { VersionDiffSchema, VersionDtoSchema } from "@ms/contracts";
import * as exportsRepo from "../../src/db/repos/exports.js";
import { renderEnv } from "../../src/pipeline/render-env.js";
import { type Api, getHeaders, makeApi, okHeaders, seedVersion } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

const ref = {
  kb_id: "r/counter", repository: "r", repository_url: "https://example.test/r", commit: "abcdef1", license: "MIT",
  license_class: "permissive", strategy: "adapt", source_paths: ["a.tsx"],
};

it("GET /versions/:id: manifest, spec, props, settings, qa, knowledge_refs, render_env_mismatch", async () => {
  const { versionId } = await seedVersion(api);
  const r = await api.inj("GET", `/api/versions/${versionId}`, getHeaders);
  expect(r.statusCode).toBe(200);
  const v = VersionDtoSchema.parse(r.json());
  expect(v.manifest.version_id).toBe(versionId);
  expect(v.spec).toMatchObject({ duration_frames: 180 });
  expect(v.props).toMatchObject({ style: { palette_overrides: { accent: ["#4F7CFF"] } } });
  expect(v.settings.duration_frames).toBe(180);
  // фикстура собрана с render_lock_sha256 "ddd…", текущий lockfile другой
  expect(v.render_env_mismatch).toBe(true);
  expect(v.manifest.render_env.render_lock_sha256).not.toBe((await renderEnv()).render_lock_sha256);
  expect((await api.inj("GET", "/api/versions/ver_nope", getHeaders)).statusCode).toBe(404);
});

it("knowledge_refs — полные (license_class, repository_url, commit) из knowledge-refs.json", async () => {
  const { core } = api;
  const { versionId } = await seedVersion(api, {});
  // ссылка KB — во второй версии
  const { makeDraft, meta } = await import("../scenes/helpers.js");
  const jobs = await import("../../src/db/repos/jobs.js");
  const sceneId = (await api.inj("GET", `/api/versions/${versionId}`, getHeaders)).json().manifest.scene_id as string;
  jobs.insert(core.db, { id: "job_ref", type: "playground.edit", project_id: "playground", scene_id: sceneId, input: {}, status: "completed", attempt: 1 });
  const draft = await makeDraft(core.root, { runId: "job_ref", attempt: 1, sceneId }, { refs: [ref], preview: "video" });
  const v2 = await core.repo.publish(draft, meta(sceneId, { knowledge_refs: [{ kb_id: ref.kb_id, commit: ref.commit, license: ref.license, strategy: "adapt" }] }), { jobId: "job_ref", attempt: 1 });
  const dto = (await api.inj("GET", `/api/versions/${v2.versionId}`, getHeaders)).json();
  expect(dto.knowledge_refs).toEqual([ref]);
  const diff = await api.inj("GET", `/api/versions/${versionId}/diff/${v2.versionId}`, getHeaders);
  expect(diff.statusCode).toBe(200);
  expect(VersionDiffSchema.parse(diff.json()).files.every((f) => f.status === "same")).toBe(true);
  expect((await api.inj("GET", `/api/versions/${versionId}/diff/ver_nope`, getHeaders)).statusCode).toBe(404);
});

it("файлы только по id из БД: обход пути и несуществующий кадр → 404", async () => {
  const { versionId, dir } = await seedVersion(api);
  expect((await api.inj("GET", `/api/versions/${versionId}/frames/0.png`, getHeaders)).statusCode).toBe(200);
  expect((await api.inj("GET", `/api/versions/${versionId}/frames/..%2F..%2Fmanifest.json.png`, getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", `/api/versions/${versionId}/frames/..%2Fpreview.mp4`, getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", `/api/versions/${versionId}/frames/7.png`, getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", `/api/versions/${versionId}/frames/-1.png`, getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", `/api/versions/${versionId}/frames/01.png`, getHeaders)).statusCode).toBe(404);
  // файл, подложенный в каталог версии, но не в manifest, не отдаётся
  try {
    mkdirSync(join(dir, "frames"), { recursive: true });
    writeFileSync(join(dir, "frames/9.png"), "x");
  } catch {
    // каталог версии read-only — тем более не подложить
  }
  expect((await api.inj("GET", `/api/versions/${versionId}/frames/9.png`, getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", "/api/versions/ver_nope/preview.mp4", getHeaders)).statusCode).toBe(404);
});

it("POST /versions/:id/exports → 202 scene.export; failed-версия → 409; GET /exports/:id и /file (attachment)", async () => {
  const { versionId, projectId } = await seedVersion(api);
  const r = await api.inj("POST", `/api/versions/${versionId}/exports`, { ...okHeaders, "idempotency-key": "e1" }, { format: "mp4", fps: 60 });
  expect(r.statusCode).toBe(202);
  expect(r.json().job).toMatchObject({ type: "scene.export", version_id: versionId, project_id: projectId, input: { versionId, request: { format: "mp4", fps: 60, crf: 18, scale: 1 } } });
  expect((await api.inj("POST", `/api/versions/${versionId}/exports`, { ...okHeaders, "idempotency-key": "e2" }, { format: "gif" })).statusCode).toBe(400);
  expect((await api.inj("POST", "/api/versions/ver_nope/exports", { ...okHeaders, "idempotency-key": "e3" }, { format: "mp4" })).statusCode).toBe(404);

  // файл экспорта, как его кладёт scene.export
  const rel = `workspace/projects/${projectId}/exports/exp_t/scene.mp4`;
  mkdirSync(join(api.s.root, `workspace/projects/${projectId}/exports/exp_t`), { recursive: true });
  writeFileSync(join(api.s.root, rel), "m".repeat(500));
  const e = exportsRepo.insert(api.core.db, { id: "exp_t", version_id: versionId, format: "mp4", path: rel, sha256: "a".repeat(64) });
  const g = await api.inj("GET", `/api/exports/${e.id}`, getHeaders);
  expect(g.statusCode).toBe(200);
  expect(g.json()).toMatchObject({ id: "exp_t", version_id: versionId, format: "mp4" });
  const f = await api.inj("GET", `/api/exports/${e.id}/file`, { ...getHeaders, range: "bytes=10-19" });
  expect(f.statusCode).toBe(206);
  expect(f.headers["content-disposition"]).toMatch(/^attachment; filename="[^"]+\.mp4"/);
  expect(f.rawPayload.length).toBe(10);
  expect((await api.inj("GET", "/api/exports/exp_nope", getHeaders)).statusCode).toBe(404);
});

it("POST exports для failed-версии → 409 export_not_ready", async () => {
  const { core } = api;
  const { scene } = await seedVersion(api);
  const { makeDraft, meta } = await import("../scenes/helpers.js");
  const jobs = await import("../../src/db/repos/jobs.js");
  jobs.insert(core.db, { id: "job_f", type: "playground.edit", project_id: "playground", scene_id: scene.id, input: {}, status: "completed", attempt: 1 });
  const v = await core.repo.publish(await makeDraft(core.root, { runId: "job_f", attempt: 1, sceneId: scene.id }), meta(scene.id, { status: "failed" }), { jobId: "job_f", attempt: 1 });
  const r = await api.inj("POST", `/api/versions/${v.versionId}/exports`, { ...okHeaders, "idempotency-key": "f1" }, { format: "mp4" });
  expect(r.statusCode).toBe(409);
  expect(r.json()).toMatchObject({ error: "export_not_ready" });
  expect((await api.inj("GET", `/api/versions/${v.versionId}/preview.mp4`, getHeaders)).statusCode).toBe(404);
});

it("GET /versions/:id: kit_components из импортов motion-kit в src/, generation из pipeline-log.json (Task 21)", async () => {
  const { core } = api;
  const { scene } = await seedVersion(api);
  const { makeDraft, meta } = await import("../scenes/helpers.js");
  const jobs = await import("../../src/db/repos/jobs.js");
  jobs.insert(core.db, { id: "job_kit", type: "playground.edit", project_id: "playground", scene_id: scene.id, input: {}, status: "completed", attempt: 1 });
  const src = [
    'import { FlowGraph, PulseAlongPath as Pulse, useStyle, accent } from "@ms/motion-kit";',
    "import type { NodeSpec } from '@ms/motion-kit';",
    'import { useCurrentFrame } from "remotion";',
    'import {\n  Card,\n  FlowGraph as FG2,\n} from "@ms/motion-kit";',
    "export const Scene = () => null;",
  ].join("\n");
  const draft = await makeDraft(core.root, { runId: "job_kit", attempt: 1, sceneId: scene.id }, { scene: src });
  writeFileSync(join(draft.dir, "pipeline-log.json"), JSON.stringify({ run_id: "r", attempt: 1, cost_usd: 2.7345, stage_wall_ms: { total: 312_000, engineer: 100 } }));
  const v = await core.repo.publish(draft, meta(scene.id), { jobId: "job_kit", attempt: 1 });
  const dto = VersionDtoSchema.parse((await api.inj("GET", `/api/versions/${v.versionId}`, getHeaders)).json());
  expect(dto.kit_components).toEqual(["Card", "FlowGraph", "PulseAlongPath"]);
  expect(dto.generation).toEqual({ cost_usd: 2.7345, wall_ms: 312_000 });
  // без журнала и без импортов kit
  const { versionId } = await seedVersion(api);
  const plain = VersionDtoSchema.parse((await api.inj("GET", `/api/versions/${versionId}`, getHeaders)).json());
  expect(plain.kit_components).toEqual([]);
  expect(plain.generation).toBeNull();
});
