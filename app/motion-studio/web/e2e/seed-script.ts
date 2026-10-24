// Сценарный проект для Playwright UI (S9): текст (начало блока 1 человека) → план без агента
// (задача `script.plan` через очередь, `useAgent: false`) → три сцены человеком (операции плана
// S4) → у двух первых — готовые версии реальным рендером фикстуры kit `transparent-scene`
// (непрозрачная, фон — только <Background>, длина — по кадрам сцены плана), как в e2e S7. У третьей
// версии нет: её генерирует UI (claudeBin — заглушка, задача падает) и она попадает в «не вошли».
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// дополнение типов Fastify (`reply.sendFile` в server/src/api/errors.ts) — сервер подключает его в
// app.ts, а typecheck web видит только то, что импортирует засев
import type {} from "@fastify/static";
import { type Job, MotionSpecSchema, type ScriptSceneItem, defaultSettings } from "@ms/contracts";
import { currentProjectStyle } from "../../server/src/analysis/project-style.js";
import { ArtifactStore } from "../../server/src/artifacts/store.js";
import type { Core } from "../../server/src/boot.js";
import * as jobs from "../../server/src/db/repos/jobs.js";
import * as projects from "../../server/src/db/repos/projects.js";
import { scriptScenes } from "../../server/src/db/repos/script.js";
import { enqueue } from "../../server/src/jobs/queue.js";
import { itemFingerprint } from "../../server/src/script/fingerprint.js";
import { savePlanOps } from "../../server/src/script/plan-ops.js";
import { currentScriptPlan } from "../../server/src/script/read.js";
import { saveScriptText } from "../../server/src/script/text.js";
import { newId } from "../../server/src/scenes/ids.js";
import { seedScene } from "./seed.js";

const SCENE_SRC = fileURLToPath(new URL("../../render/test/fixtures/transparent-scene/src/", import.meta.url));

export const SCRIPT_TITLE = "Go map: сценарий";
const BLOCK_TITLE = "Блок 1. Три вопроса, которые пережили смену реализации";
const TEXT =
  "Начнём с честной рамки. Несколько лет назад на русскоязычном YouTube вышел, пожалуй, самый известный разбор map в Go, " +
  "и построен он был на трёх вопросах с собеседования. Зачем заранее выделять память под map.";

export interface SeededScript {
  projectId: string;
  /** Принятые сцены плана по порядку. */
  itemIds: string[];
  /** Сцены Playground первых двух сцен плана (с готовой версией). */
  sceneIds: string[];
}

async function waitJob(core: Core, id: string, mine: Set<string>): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** Каталог фикстуры для `seedScene`: исходник transparent-scene, props/settings/spec по кадрам сцены. */
function fixtureDir(base: string, item: ScriptSceneItem, title: string): string {
  const f = item.frames;
  const dir = join(base, item.id);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/Scene.tsx"), readFileSync(join(SCENE_SRC, "Scene.tsx"), "utf8"));
  const cardsEnd = f.lead + Math.min(45, f.speech);
  const settings = { ...defaultSettings(), width: 1920, height: 1080, duration_frames: f.total, transparent_export: false, background: "#0b0d12" };
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings, null, 2));
  writeFileSync(join(dir, "props.json"), JSON.stringify({
    timing: { duration_frames: f.total, beats: [{ id: "cards", start_frame: f.lead, end_frame: cardsEnd }, { id: "title", start_frame: 0, end_frame: f.total }] },
    style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false },
    content: { title, stagger: 6 },
  }, null, 2));
  const spec = MotionSpecSchema.parse({
    title, purpose: "фикстура UI-e2e: сцена сценария", duration_frames: f.total, fps: settings.fps, style_preset: "dark-premium",
    elements: [
      { id: "title", kind: "text", role: "заголовок", entrance: "rise", content: { text: title }, layout: { x: 0.1, y: 0.2, w: 0.8, h: 0.2 } },
      { id: "cards", kind: "shape", role: "карточки", entrance: "rise", content: {}, layout: { x: 0.1, y: 0.5, w: 0.8, h: 0.3 } },
    ],
    beats: [
      { id: "cards", start_frame: f.lead, end_frame: cardsEnd, action: "enter", description: "карточки", element_ids: ["cards"] },
      { id: "hold", start_frame: f.lead + f.speech, end_frame: f.total, action: "hold", description: "удержание", element_ids: ["title", "cards"] },
    ],
  });
  writeFileSync(join(dir, "spec.json"), JSON.stringify(spec, null, 2));
  return dir;
}


export async function seedScript(core: Core, mine: Set<string>, workDir: string): Promise<SeededScript> {
  // id — как у проектов сервера (`prj_<ULID>`): из него строятся каталоги артефактов
  const projectId = newId("prj");
  projects.create(core.db, { id: projectId, kind: "script", title: SCRIPT_TITLE, settings: defaultSettings() });
  const store = new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
  const deps = { db: core.db, store, root: core.root };
  const script = await saveScriptText(deps, projectId, { blocks: [{ title: BLOCK_TITLE, text: TEXT }] });
  const plan = await waitJob(core, enqueue(core.db, { type: "script.plan", projectId, input: { projectId, useAgent: false }, idempotencyKey: `e2e-ui-plan-${projectId}` }).job.id, mine);
  if (plan.status !== "completed") throw new Error(`seed: план сценария не построен: ${JSON.stringify(plan.error)}`);
  const sentence = (k: number) => script.words.filter((w) => w.sentence === k);
  const range = (k: number) => ({ start_word_id: sentence(k)[0]!.id, end_word_id: sentence(k).at(-1)!.id });
  await savePlanOps(deps, projectId, {
    base_revision: currentScriptPlan(core.db, core.root, projectId)!.doc.revision,
    ops: [
      { op: "add", ...range(0), technique: "kinetic-quote" },
      { op: "add", ...range(1), technique: "structure-build" },
      { op: "add", ...range(2), technique: "callout-diagram" },
    ],
  });
  const cur = currentScriptPlan(core.db, core.root, projectId)!;
  const items = cur.doc.items.filter((i) => i.status === "accepted");
  const style = currentProjectStyle(core.db, core.root, projectId);
  const styleRef = style ? { id: style.style_id, revision: style.revision } : null;
  const titles = ["Честная рамка", "Три вопроса с собеседования"];
  const sceneIds: string[] = [];
  for (const [i, item] of items.slice(0, 2).entries()) {
    const seeded = await seedScene(core, [{ dir: fixtureDir(workDir, item, titles[i]!), prompt: item.quote }], { projectId });
    scriptScenes.insert(core.db, {
      project_id: projectId, plan_id: cur.planId, item_id: item.id, aspect: "16:9", scene_id: seeded.sceneId, batch_id: null, job_id: null,
      item_fingerprint: itemFingerprint(item, styleRef),
    });
    sceneIds.push(seeded.sceneId);
  }
  return { projectId, itemIds: items.map((x) => x.id), sceneIds };
}
