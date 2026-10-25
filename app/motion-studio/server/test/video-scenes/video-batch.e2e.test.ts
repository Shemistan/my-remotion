// Task 38-39 e2e: пакет видеосцен реальными claude и рендером на КОПИИ хранилища приёмки Phase 3
// (`MS_DATA_DIR`, по умолчанию `materialsPath("e2e", "v38-video")`; оригинал не трогается).
// Пакет из трёх сцен разных режимов (по умолчанию overlay sp_009, callout sp_003, split_screen
// sp_002 — `MS_V38_ITEMS`) → все до конечного статуса; Approval C одной; правка чатом другой
// («крупнее подпись») → v2 от v1, длительность та же, C на v2 не отзывает C первой;
// `scene.preview_context` → MP4 длиной (сцена + 2 · 30) кадров ± 1, кадры ≤ 480 px —
// docs/evidence/phase-4/context/; повтор превью — тот же каталог; отмена пакета «Перегенерировать»
// третьей сцены — задача cancelled, её версии на месте. Время и стоимость — tmp/v38-e2e/summary.json.
// Запуск: `MS_E2E=1 ./scripts/with-node.sh npx vitest run server/test/video-scenes/video-batch.e2e.test.ts`.
import { execFile } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type ScenePlanItem, type VisualPlanRevisionDoc, videoSceneFrames } from "@ms/contracts";
import { MARKER_FILE, assertSsdWriteAllowed, materialsPath } from "@ms/core";
import { ensureRenderBrowser, ffprobe } from "@ms/render";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { currentPlan } from "../../src/analysis/plan-ops.js";
import { peekApprovalState } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as chat from "../../src/db/repos/chat.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as plans from "../../src/db/repos/plans.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, provideInput } from "../../src/jobs/queue.js";
import type { ScenePreviewContextResult } from "../../src/pipeline/scene-preview-context.js";
import { newId } from "../../src/scenes/ids.js";
import { approveScene, sceneApprovalState } from "../../src/video-scenes/approval-c.js";
import { cancelVideoBatch, startVideoBatch, videoBatchStatus } from "../../src/video-scenes/batch.js";
import { videoScenesState } from "../../src/video-scenes/state.js";

const T = 180 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const ROOT = process.env.MS_DATA_DIR ?? materialsPath("e2e", "v38-video");
const EXAMPLES = process.env.MS_V38_EXAMPLES ?? materialsPath("examples", "phase4", "v38");
const EVIDENCE = join(REPO, "docs/evidence/phase-4/context");
const TMP = join(REPO, "tmp/v38-e2e");
const ITEMS = (process.env.MS_V38_ITEMS ?? "sp_009,sp_003,sp_002").split(",");
const FINAL = ["completed", "failed", "cancelled", "blocked"];
const run = promisify(execFile);
const RUN = newId("run");

let core: Core;
const mine = new Set<string>();
const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};
const cost = (jobId: string): number =>
  (core.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM agent_runs WHERE job_id = ?").get(jobId) as { c: number }).c;
const procCore = () => ({ db: core.db, root: ROOT, processes: core.processes });

beforeAll(async () => {
  expect(existsSync(join(ROOT, MARKER_FILE)), `нет копии хранилища в ${ROOT}`).toBe(true);
  assertSsdWriteAllowed(ROOT);
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: ROOT },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  mkdirSync(TMP, { recursive: true });
}, T);

afterAll(async () => {
  writeFileSync(join(TMP, "run.log"), log.join("\n") + "\n");
  writeFileSync(join(TMP, "summary.json"), JSON.stringify({ project_id: st.projectId, plan: st.doc ? `${st.doc.plan_id}@r${st.doc.revision}` : null, ...st.summary }, null, 2) + "\n");
  await core?.close();
});

async function wait(id: string, poll = 2000, until: (j: Job) => boolean = (j) => FINAL.includes(j.status)): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j?.status === "awaiting_input") provideInput(core.db, j.id, "skip");
    if (j && until(j)) return j;
    await new Promise((r) => setTimeout(r, poll));
  }
}

interface Scene { item: ScenePlanItem; sceneId: string; job: Job; ms: number; versionId?: string }
const st: { projectId?: string; doc?: VisualPlanRevisionDoc; batchId?: string; scenes: Scene[]; summary: Record<string, unknown> } = { scenes: [], summary: {} };

it("пакет из трёх видеосцен разных режимов → все до конечного статуса", async () => {
  const pid = process.env.MS_V38_PROJECT
    ?? (core.db.prepare("SELECT p.id FROM projects p JOIN visual_plans v ON v.project_id = p.id WHERE p.kind = 'video' AND v.current_revision IS NOT NULL ORDER BY p.created_at DESC LIMIT 1").get() as { id: string } | undefined)?.id;
  expect(pid, "видеопроекта с планом нет").toBeDefined();
  st.projectId = pid!;
  const plan = plans.byProject(core.db, pid!)!;
  const doc = currentPlan(core.db, ROOT, plan.id);
  st.doc = doc;
  const b = peekApprovalState(core.db, pid!, "B", currentSubject(core.db, pid!, "B"));
  if (b.state !== "valid") {
    // человек утверждает план во вкладке «План» — здесь за него (пакет B не ставит)
    approveVisualPlan(core.db, pid!, ROOT);
    say(`Approval B: было ${b.state}${b.reason ? ` (${b.reason})` : ""} — утверждено r${doc.revision}`);
  } else say(`Approval B: валидно ${b.approval!.subject_ref}`);
  const items = ITEMS.map((id) => doc.items.find((x) => x.id === id)!);
  for (const x of items) say(`сцена ${x.id}: ${x.composition_mode}/${x.zone}, ${videoSceneFrames(x)} кадров, «${x.evidence.map((e) => e.quote).join(" … ")}»`);
  expect(new Set(items.map((x) => x.composition_mode)).size, "режимы сцен разные").toBe(items.length);

  const t0 = Date.now();
  const batch = startVideoBatch(core, { projectId: pid!, revision: doc.revision, itemIds: ITEMS, idempotencyKey: `e2e-v38-${RUN}` });
  st.batchId = batch.id;
  say(`пакет ${batch.id}: ${batch.items.length} задач${batch.skipped ? `, пропущено: ${JSON.stringify(batch.skipped)}` : ""}`);
  expect(batch.items.map((x) => x.item_id).sort()).toEqual([...ITEMS].sort());
  // повтор того же ключа — тот же пакет
  expect(startVideoBatch(core, { projectId: pid!, revision: doc.revision, itemIds: ITEMS, idempotencyKey: `e2e-v38-${RUN}` }).id).toBe(batch.id);
  await Promise.all(batch.items.map(async (x) => {
    const job = await wait(x.job!.id);
    const ms = Date.now() - t0;
    const item = items.find((i) => i.id === x.item_id)!;
    const s: Scene = { item, sceneId: x.scene_id, job, ms };
    const v = versions.listByJob(core.db, job.id).filter((y) => y.status === "ready" && !y.broken_reason).at(-1);
    if (v) s.versionId = v.id;
    st.scenes.push(s);
    say(`${item.id} (${item.composition_mode}): ${job.status} за ${(ms / 60_000).toFixed(1)} мин, $${cost(job.id).toFixed(2)}${job.error ? ` — ${JSON.stringify(job.error)}` : ""}`);
  }));
  st.scenes.sort((a, b2) => ITEMS.indexOf(a.item.id) - ITEMS.indexOf(b2.item.id));
  const status = videoBatchStatus(core.db, ROOT, batch.id);
  say(`пакет: ${JSON.stringify(status.counts)}`);
  st.summary.batch = { id: batch.id, counts: status.counts, minutes: Number(((Date.now() - t0) / 60_000).toFixed(1)), cost_usd: Number(st.scenes.reduce((a, s) => a + cost(s.job.id), 0).toFixed(3)) };
  st.summary.scenes = st.scenes.map((s) => ({ item_id: s.item.id, mode: s.item.composition_mode, zone: s.item.zone, frames: videoSceneFrames(s.item), job: s.job.id, key: s.job.idempotency_key, status: s.job.status, minutes: Number((s.ms / 60_000).toFixed(1)), cost_usd: Number(cost(s.job.id).toFixed(3)), version_id: s.versionId ?? null, error: s.job.error ?? null }));
  for (const s of st.scenes) expect(FINAL).toContain(s.job.status);
  expect(st.scenes.filter((s) => s.versionId).length, "хотя бы две готовые сцены").toBeGreaterThanOrEqual(2);
  for (const s of st.scenes.filter((x) => x.versionId)) expect(versions.get(core.db, s.versionId!)!.settings.duration_frames).toBe(videoSceneFrames(s.item));
}, T);

it("Approval C одной сцены; правка чатом другой — v2 от v1, длительность та же; C на v2 не отзывает C первой", async () => {
  const ready = st.scenes.filter((s) => s.versionId);
  const [a, b] = ready as [Scene, Scene];
  const ca = approveScene(core.db, { sceneId: a.sceneId, versionId: a.versionId! });
  say(`C ${a.item.id}: ${ca.subject_ref}`);
  const t0 = Date.now();
  const msg = chat.add(core.db, { scene_id: b.sceneId, role: "user", text: "Сделай подпись крупнее" });
  const edit = enqueue(core.db, { type: "playground.edit", projectId: st.projectId!, sceneId: b.sceneId, input: { sceneId: b.sceneId, messageId: msg.id }, idempotencyKey: `e2e-v38-edit-${RUN}` }).job;
  const done = await wait(edit.id);
  const ms = Date.now() - t0;
  say(`правка ${b.item.id}: ${done.status} за ${(ms / 60_000).toFixed(1)} мин, $${cost(done.id).toFixed(2)}${done.error ? ` — ${JSON.stringify(done.error)}` : ""}`);
  const v2 = versions.listByScene(core.db, b.sceneId).at(-1)!;
  const reply = chat.list(core.db, b.sceneId).filter((x) => x.role === "assistant").at(-1)?.text ?? "";
  say(`  ответ: ${reply.slice(0, 400)}`);
  st.summary.edit = { item_id: b.item.id, job: done.id, status: done.status, minutes: Number((ms / 60_000).toFixed(1)), cost_usd: Number(cost(done.id).toFixed(3)), v2: v2.id, number: v2.number, parent: v2.parent_version_id, duration_frames: v2.settings.duration_frames, error: done.error ?? null };
  expect(done.status, JSON.stringify(done.error)).toBe("completed");
  expect(v2.number).toBe(2);
  expect(v2.parent_version_id).toBe(b.versionId);
  expect(v2.settings.duration_frames).toBe(videoSceneFrames(b.item));
  b.versionId = v2.id;
  const cb = approveScene(core.db, { sceneId: b.sceneId, versionId: v2.id });
  say(`C ${b.item.id}: ${cb.subject_ref}`);
  expect(sceneApprovalState(core.db, a.sceneId).state).toBe("valid");
  expect(sceneApprovalState(core.db, b.sceneId)).toMatchObject({ state: "valid", versionNumber: 2 });
  const state = videoScenesState(core.db, ROOT, st.projectId!);
  st.summary.state = state.scenes.filter((x) => ITEMS.includes(x.item_id)).map((x) => ({ item_id: x.item_id, status: x.status, version: x.version_number, approved: x.approved_version_number, c: x.approval.state, stale: x.stale }));
  say(`состояние: ${JSON.stringify(st.summary.state)}`);
}, T);

it("scene.preview_context: MP4 (сцена + 2 · 30) кадров ± 1, половинный масштаб; повтор — тот же каталог; кадры ≤ 480 px", async () => {
  const s = st.scenes.filter((x) => x.versionId)[1]!;
  const t0 = Date.now();
  const j = await wait(enqueue(core.db, { type: "scene.preview_context", projectId: st.projectId!, sceneId: s.sceneId, input: { sceneId: s.sceneId, versionId: s.versionId! }, idempotencyKey: `e2e-v38-ctx-${RUN}` }).job.id, 1000);
  const ms = Date.now() - t0;
  say(`превью в контексте ${s.item.id}: ${j.status} за ${(ms / 1000).toFixed(0)} с${j.error ? ` — ${JSON.stringify(j.error)}` : ""}`);
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const out = j.output_refs as ScenePreviewContextResult;
  const file = join(ROOT, out.rel_path);
  const p = await ffprobe(file);
  const frames = out.range[1] - out.range[0] + 1;
  const ver = versions.get(core.db, s.versionId!)!;
  say(`  ${out.rel_path}: ${p.codec} ${p.width}×${p.height}, ${p.durationMs} мс, окно ${JSON.stringify(out.range)} (сцена ${JSON.stringify(out.scene_frames)}, поля ${out.pad_frames})`);
  expect(frames).toBe(videoSceneFrames(s.item) + 2 * out.pad_frames);
  expect(Math.abs(p.durationMs - (frames * 1000) / 30)).toBeLessThanOrEqual(1000 / 30 + 1);
  expect(p.width).toBe(ver.settings.width / 2);
  const again = await wait(enqueue(core.db, { type: "scene.preview_context", projectId: st.projectId!, sceneId: s.sceneId, input: { sceneId: s.sceneId, versionId: s.versionId! }, idempotencyKey: `e2e-v38-ctx2-${RUN}` }).job.id, 500);
  expect(again.status).toBe("completed");
  expect(again.output_refs).toMatchObject({ reused: true, rel_path: out.rel_path });
  st.summary.preview = { item_id: s.item.id, version: ver.number, job: j.id, seconds: Math.round(ms / 1000), rel_path: out.rel_path, duration_ms: p.durationMs, width: p.width, height: p.height, range: out.range, scene_frames: out.scene_frames, reused_second: true };

  mkdirSync(EVIDENCE, { recursive: true });
  const name = `v38-${s.item.id}-v${ver.number}`;
  const at = [Math.floor(out.pad_frames / 2), out.pad_frames + Math.floor(videoSceneFrames(s.item) / 2), frames - Math.floor(out.pad_frames / 2) - 1];
  for (const f of at) {
    const png = join(TMP, `${name}-ctx-f${f}.png`);
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-vf", `select=eq(n\\,${f}),scale=480:-2`, "-vframes", "1", png]);
    copyFileSync(png, join(EVIDENCE, `${name}-ctx-f${f}.png`));
  }
  mkdirSync(EXAMPLES, { recursive: true });
  copyFileSync(file, join(EXAMPLES, `${name}-в-контексте.mp4`));
  const readme = join(EXAMPLES, "README.txt");
  const head = existsSync(readme) ? "" : "Примеры Task 38-39 (пакет видеосцен, правка, превью в контексте): сцены вашего ролика IMG_0685 (отрезок приёмки Phase 3) на копии хранилища приёмки.\n";
  appendFileSync(readme, `${head}\n${new Date().toISOString()} — ${name}-в-контексте.mp4: сцена ${s.item.id} (${s.item.composition_mode}/${s.item.zone}) версии v${ver.number} поверх смонтированного ролика с ${out.pad_frames} кадрами до и после, половинный размер, со звуком; фраза «${s.item.evidence.map((e) => e.quote).join(" … ")}».\n`);
  writeFileSync(join(EVIDENCE, "README.md"), [
    "# Превью сцены в контексте (Task 38-39) — e2e",
    "",
    `Прогон ${new Date().toISOString()}: копия хранилища приёмки Phase 3, проект ${st.projectId}, план ${st.doc!.plan_id}@r${st.doc!.revision}.`,
    `Сцена ${s.item.id} (${s.item.composition_mode}/${s.item.zone}), версия v${ver.number} (правка чатом «Сделай подпись крупнее»).`,
    `\`scene.preview_context\`: окно кадров таймлайна ${JSON.stringify(out.range)} (сцена ${JSON.stringify(out.scene_frames)} ± ${out.pad_frames}), ${p.codec} ${p.width}×${p.height}, ${p.durationMs} мс за ${Math.round(ms / 1000)} с; повтор — тот же каталог (reused).`,
    "Ролик в git не кладётся; кадры уменьшены до 480 px: поле до сцены, середина сцены, поле после.",
    "",
  ].join("\n"));
}, T);

it("отмена пакета «Перегенерировать» — задача cancelled, версии сцены на месте", async () => {
  const s = st.scenes.at(-1)!;
  const before = versions.listByScene(core.db, s.sceneId).map((x) => x.id);
  const b = startVideoBatch(core, { projectId: st.projectId!, revision: st.doc!.revision, itemIds: [s.item.id], regenerate: true, idempotencyKey: `e2e-v38-regen-${RUN}` });
  const id = b.items[0]!.job!.id;
  say(`перегенерация ${s.item.id}: пакет ${b.id}, задача ${id} (${jobs.get(core.db, id)!.idempotency_key})`);
  // дождаться старта (агенты уже идут), затем отменить пакет
  await wait(id, 500, (j) => j.status === "running" || FINAL.includes(j.status));
  await new Promise((r) => setTimeout(r, 15_000));
  const t0 = Date.now();
  await cancelVideoBatch(procCore(), b.id);
  const j = await wait(id, 500);
  say(`отмена: ${j.status} через ${((Date.now() - t0) / 1000).toFixed(1)} с, $${cost(id).toFixed(2)}`);
  expect(j.status).toBe("cancelled");
  expect(videoBatchStatus(core.db, ROOT, b.id).counts).toMatchObject({ total: 1, cancelled: 1 });
  expect(versions.listByScene(core.db, s.sceneId).map((x) => x.id)).toEqual(before);
  st.summary.cancel = { item_id: s.item.id, batch: b.id, job: id, key: jobs.get(core.db, id)!.idempotency_key, status: j.status, cancel_seconds: Number(((Date.now() - t0) / 1000).toFixed(1)), cost_usd: Number(cost(id).toFixed(3)) };
  say(JSON.stringify(st.summary));
}, T);
