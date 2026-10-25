// Приёмка S7 по-настоящему (рендер, без LLM): сценарный проект на e2e-хранилище SSD (текст →
// план без агента → три сцены человеком), у двух сцен — готовые версии из фикстуры kit
// render/test/fixtures/transparent-scene (непрозрачная, фон — только <Background>), у третьей
// версии нет → задача `script.package` через очередь и раннер с настоящим `exportOne`:
// 2 × MP4 H.264 + 2 × ProRes 4444 с альфой, шпаргалка md/csv/txt, манифест, права, жёсткие ссылки.
// Повторная сборка переиспользует экспорты. Evidence — docs/evidence/script-mvp/s7/.
// Запуск: `MS_E2E=1 vitest run server/test/pipeline/script-package.e2e.test.ts`.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  type Job, MotionSpecSchema, ScriptPackageManifestSchema, type ScriptSceneItem, type Settings, defaultSettings,
} from "@ms/contracts";
import { ensureRenderBrowser, ffprobe } from "@ms/render";
import { currentProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptScenes } from "../../src/db/repos/script.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { claimNext, enqueue, finish } from "../../src/jobs/queue.js";
import { packagesForState } from "../../src/pipeline/script-package.js";
import { newId } from "../../src/scenes/ids.js";
import { itemFingerprint } from "../../src/script/fingerprint.js";
import { savePlanOps } from "../../src/script/plan-ops.js";
import { currentScriptPlan } from "../../src/script/read.js";
import { saveScriptText } from "../../src/script/text.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { materialsPath, materialsRoot, assertSsdWriteAllowed } from "@ms/core";

const T = 60 * 60_000;
// своё хранилище S7 (`doctor --init`): e2e-script занят прогонами других задач с LLM
const DATA_DIR = process.env.MS_E2E_S7_DATA_DIR ?? materialsPath("e2e", "s7");
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const EVIDENCE = join(REPO, "docs/evidence/script-mvp/s7");
const FIXTURE = fileURLToPath(new URL("../../../render/test/fixtures/transparent-scene/", import.meta.url));
/** Начало блока 1 текста человека (tmp/script-mvp/block-1.txt). */
const TITLE = "Блок 1. Три вопроса, которые пережили смену реализации";
const TEXT =
  "Начнём с честной рамки. Несколько лет назад на русскоязычном YouTube вышел, пожалуй, самый известный разбор map в Go, " +
  "и построен он был на трёх вопросах с собеседования. Зачем заранее выделять память под map.";

let core: Core;
const mine = new Set<string>();
const lines: string[] = [];
let projectId: string;

beforeAll(async () => {
  expect(existsSync(materialsRoot()), "внешний SSD не подключён").toBe(true);
  assertSsdWriteAllowed(DATA_DIR); // S18: на SSD — только в папке материалов
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: DATA_DIR },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  mkdirSync(EVIDENCE, { recursive: true });
}, T);

afterAll(async () => {
  if (lines.length > 0) {
    const readme = ["# S7: папка сцен со шпаргалкой — реальный рендер, e2e-хранилище SSD", "", `Прогон ${new Date().toISOString()}, хранилище ${DATA_DIR}.`, "", ...lines, ""].join("\n");
    writeFileSync(join(EVIDENCE, "README.md"), readme);
    console.log(readme);
  }
  await core?.close();
});

async function wait(id: string): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Готовая версия сцены из фикстуры kit: непрозрачная, 1920×1080, длина и тайминги — по кадрам сцены плана. */
async function fixtureVersion(sceneId: string, item: ScriptSceneItem, title: string): Promise<string> {
  const f = item.frames;
  const settings: Settings = { ...defaultSettings(), width: 1920, height: 1080, duration_frames: f.total, transparent_export: false, background: "#0b0d12" };
  const cardsEnd = f.lead + Math.min(45, f.speech);
  const props = {
    timing: { duration_frames: f.total, beats: [{ id: "cards", start_frame: f.lead, end_frame: cardsEnd }, { id: "title", start_frame: 0, end_frame: f.total }] },
    style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false },
    content: { title, stagger: 6 },
  };
  const spec = MotionSpecSchema.parse({
    title, purpose: "фикстура S7: сцена пакета", duration_frames: f.total, fps: settings.fps, style_preset: "dark-premium",
    elements: [
      { id: "title", kind: "text", role: "заголовок", entrance: "rise", content: { text: title }, layout: { x: 0.1, y: 0.2, w: 0.8, h: 0.2 } },
      { id: "cards", kind: "shape", role: "карточки", entrance: "rise", content: {}, layout: { x: 0.1, y: 0.5, w: 0.8, h: 0.3 } },
    ],
    beats: [
      { id: "cards", start_frame: f.lead, end_frame: cardsEnd, action: "enter", description: "карточки", element_ids: ["cards"] },
      { id: "hold", start_frame: f.lead + f.speech, end_frame: f.total, action: "hold", description: "удержание", element_ids: ["title", "cards"] },
    ],
  });
  const job = enqueue(core.db, { type: "playground.generate", projectId, sceneId, input: { fixture: newId("run") }, idempotencyKey: `e2e-s7-${newId("run")}` }).job;
  const c = claimNext(core.db, "e2e-s7", Date.now(), { running: 0, maxRunning: 9 }, { ids: new Set([job.id]) })!;
  const draft = await makeDraft(core.root, { runId: job.id, attempt: c.attempt, sceneId, projectId }, {
    scene: readFileSync(join(FIXTURE, "src/Scene.tsx"), "utf8"), props, spec,
  });
  writeFileSync(join(draft.dir, "settings.json"), JSON.stringify(settings));
  const v = await core.repo.publish(draft, meta(sceneId, { settings, prompt: title }), { jobId: job.id, attempt: c.attempt });
  finish(core.db, job.id, c.attempt, { status: "completed", outputRefs: { version_id: v.versionId } });
  return v.versionId;
}

it("сценарий из трёх сцен (две готовы) → папка: 2 MP4 + 2 ProRes 4444 с альфой, шпаргалка, манифест, a-w", async () => {
  // проект, текст, план без агента, три сцены человеком (S4 ops)
  projectId = newId("prj");
  projects.create(core.db, { id: projectId, kind: "script", title: "e2e S7 Go map", settings: defaultSettings() });
  const store = new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
  const deps = { db: core.db, store, root: core.root };
  const script = await saveScriptText(deps, projectId, { blocks: [{ title: TITLE, text: TEXT }] });
  const planJob = await wait(enqueue(core.db, { type: "script.plan", projectId, input: { projectId, useAgent: false }, idempotencyKey: `e2e-s7-plan-${projectId}` }).job.id);
  expect(planJob.status, JSON.stringify(planJob.error)).toBe("completed");
  const sentence = (k: number) => script.words.filter((w) => w.sentence === k);
  const range = (k: number) => ({ start_word_id: sentence(k)[0]!.id, end_word_id: sentence(k).at(-1)!.id });
  const base = currentScriptPlan(core.db, core.root, projectId)!.doc.revision;
  await savePlanOps(deps, projectId, {
    base_revision: base,
    ops: [
      { op: "add", ...range(0), technique: "kinetic-quote" },
      { op: "add", ...range(1), technique: "structure-build" },
      { op: "add", ...range(2), technique: "callout-diagram" },
    ],
  });
  const cur = currentScriptPlan(core.db, core.root, projectId)!;
  const items = cur.doc.items.filter((i) => i.status === "accepted");
  expect(items).toHaveLength(3);
  const style = currentProjectStyle(core.db, core.root, projectId);
  const styleRef = style ? { id: style.style_id, revision: style.revision } : null;
  const titles = ["Честная рамка", "Три вопроса с собеседования"];
  for (const [i, item] of items.entries()) {
    const scene = core.repo.createScene(projectId, { prompt: item.quote, settings: { ...defaultSettings(), duration_frames: item.frames.total } });
    scriptScenes.insert(core.db, {
      project_id: projectId, plan_id: cur.planId, item_id: item.id, aspect: "16:9", scene_id: scene.id, batch_id: null, job_id: null,
      item_fingerprint: itemFingerprint(item, styleRef),
    });
    if (i < 2) await fixtureVersion(scene.id, item, titles[i]!);
  }

  // пакет через очередь и раннер
  const t0 = Date.now();
  const job = await wait(enqueue(core.db, { type: "script.package", projectId, input: { projectId, aspect: "16:9" }, idempotencyKey: `e2e-s7-pkg-${projectId}` }).job.id);
  const ms = Date.now() - t0;
  expect(job.status, JSON.stringify(job.error)).toBe("completed");
  const refs = job.output_refs as { package_id: string; rel_path: string; files: number; missing: { item_id: string; reason: string }[] };
  expect(refs.files).toBe(2);
  expect(refs.missing).toEqual([{ item_id: items[2]!.id, reason: "нет готовой версии" }]);
  const dir = join(core.root, refs.rel_path);
  const names = readdirSync(dir).sort();
  const videos = names.filter((n) => /\.(mp4|mov)$/.test(n));
  expect(videos).toHaveLength(4);
  expect(names.filter((n) => !videos.includes(n))).toEqual(["package-manifest.json", "шпаргалка.csv", "шпаргалка.md", "шпаргалка.txt"]);
  expect(videos.every((n) => /^0[12]_[a-z0-9-]+(_alpha\.mov|\.mp4)$/.test(n))).toBe(true);

  // ffprobe обеих версий каждой сцены
  const probes: string[] = [];
  for (const n of videos) {
    const p = await ffprobe(join(dir, n));
    probes.push(`| ${n} | ${p.codec} | ${p.profile ?? "—"} | ${p.pixFmt ?? "—"} | ${p.width}×${p.height} | ${p.fps.num}/${p.fps.den} | ${p.audioCodec ?? "—"} | ${(p.durationMs / 1000).toFixed(2)} |`);
    expect(p).toMatchObject({ width: 1920, height: 1080, fps: { num: 30, den: 1 } });
    if (n.endsWith(".mp4")) expect(p).toMatchObject({ codec: "h264", audioCodec: "aac" });
    else {
      expect(p.codec).toBe("prores");
      expect(p.profile).toMatch(/4444/);
      expect(p.pixFmt).toMatch(/^yuva/);
    }
  }

  // манифест, шпаргалка, права, жёсткие ссылки
  const m = ScriptPackageManifestSchema.parse(JSON.parse(readFileSync(join(dir, "package-manifest.json"), "utf8")));
  expect(m.scenes.map((s) => [s.n, s.item_id])).toEqual([[1, items[0]!.id], [2, items[1]!.id]]);
  for (const s of m.scenes) {
    for (const f of [s.mp4, s.alpha!]) {
      const ex = exportsRepo.get(core.db, f.export_id)!;
      expect(statSync(join(dir, f.file)).ino).toBe(statSync(join(core.root, ex.path)).ino);
      expect(f.sha256).toBe(ex.sha256);
    }
  }
  for (const n of [".", ...names]) expect(statSync(join(dir, n)).mode & 0o222, n).toBe(0);
  const txt = readFileSync(join(dir, "шпаргалка.txt"), "utf8").trimEnd().split("\n");
  expect(txt).toHaveLength(3);
  expect(txt.filter((l) => !l.includes("нет сцены"))).toHaveLength(2);
  const md = readFileSync(join(dir, "шпаргалка.md"), "utf8");
  const csv = readFileSync(join(dir, "шпаргалка.csv"), "utf8");
  expect(csv.startsWith("﻿№;")).toBe(true);
  for (const n of videos) {
    expect(md).toContain(n);
    expect(csv).toContain(n);
  }
  const [dto] = packagesForState(core.db, core.root, projectId);
  expect(dto).toMatchObject({ id: refs.package_id, abs_path: dir, files: [{ n: 1 }, { n: 2 }] });

  // повторная сборка: экспорты переиспользуются (новых строк exports нет)
  const before = m.scenes.flatMap((s) => exportsRepo.listByVersion(core.db, s.version_id)).length;
  const t1 = Date.now();
  const again = await wait(enqueue(core.db, { type: "script.package", projectId, input: { projectId, aspect: "16:9" }, idempotencyKey: `e2e-s7-pkg2-${projectId}` }).job.id);
  const ms2 = Date.now() - t1;
  expect(again.status, JSON.stringify(again.error)).toBe("completed");
  expect(m.scenes.flatMap((s) => exportsRepo.listByVersion(core.db, s.version_id)).length).toBe(before);

  writeFileSync(join(EVIDENCE, "шпаргалка.md"), md);
  writeFileSync(join(EVIDENCE, "шпаргалка.txt"), txt.join("\n") + "\n");
  writeFileSync(join(EVIDENCE, "package-manifest.json"), JSON.stringify(m, null, 2) + "\n");
  lines.push(
    `Проект ${projectId}, пакет ${refs.package_id} (${m.name}), папка ${dir}.`,
    `Сборка с экспортами — ${(ms / 1000).toFixed(1)} с; повторная (экспорты переиспользованы) — ${(ms2 / 1000).toFixed(1)} с.`,
    "",
    "| Файл | Кодек | Профиль | Пиксели | Размер | fps | Аудио | Длительность, с |",
    "|---|---|---|---|---|---|---|---|",
    ...probes,
    "",
    `Не вошли: ${refs.missing.map((x) => `${x.item_id} — ${x.reason}`).join("; ")}.`,
    "Права: корень папки и все файлы без записи; видео — жёсткие ссылки на файлы экспортов (общий inode).",
  );
}, T);
