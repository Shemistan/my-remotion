// Task 30 e2e: `footage.analyze` на реальном talking-head ролике `MS_TEST_TALKING_HEAD` (личный
// материал пользователя — только с его согласия, V4 плана). Без переменной тест ПАДАЕТ с понятным
// сообщением. Запуск — только `make e2e-footage` (MS_E2E_FACE=1). Ролик импортируется в tmp-хранилище
// (MS_ALLOW_SYSTEM_DISK=1; реальный MotionStudio не трогается) → `{ useAgent: false }`: ≥ 1 шот, у
// каждого ≥ 3 кадров, лицо на ≥ 80 % кадров, есть окно времени (~4 с) с зоной свободы ≥ 0,9 → `{ useAgent: true }`
// (реальный claude, Read кадров): схема, позиция автора совпадает с Vision или помечено расхождение,
// стоимость. Рамки зон (`scripts/draw-zones.mjs`) — в tmp/footage-evidence/talking-head/; в
// docs/evidence/phase-3/footage/ их переносит человек после просмотра (кадры ≤ 480 px, V4).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { FootageAnalysisSchema, type Job } from "@ms/contracts";
import { initStore, macosProbe } from "@ms/core";
import { DEFAULT_VISION_BIN, visionAvailable } from "../../src/analysis/vision.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import type { FootageAnalyzeResult } from "../../src/pipeline/footage-analyze.js";
import { newId } from "../../src/scenes/ids.js";
import { removeStore } from "../db/helpers.js";

const T = 30 * 60_000;
const VIDEO = process.env.MS_TEST_TALKING_HEAD;
const NO_VIDEO = "MS_TEST_TALKING_HEAD не задан или файла нет: укажите путь к реальному talking-head ролику (выбор — Task 34 Step 1; нужен явный «да» человека на личный материал, V4 плана). Запуск: MS_TEST_TALKING_HEAD=<путь> make e2e-footage";
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const EVIDENCE = join(REPO, "tmp/footage-evidence/talking-head");
const MS = join(REPO, "app/motion-studio");

let tmp: string | undefined;
let root: string;
let core: Core | undefined;
const mine = new Set<string>();
const notes: string[] = [];

beforeAll(async () => {
  if (!VIDEO || !existsSync(VIDEO)) return; // тест упадёт с понятным сообщением
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  tmp = await mkdtemp(join(REPO, "tmp", "ms-footage-th-"));
  root = join(tmp, "store");
  await initStore(root, macosProbe, { allowSystemDisk: true });
  writeFileSync(join(root, "config.json"), JSON.stringify({ media: { importRoots: [dirname(VIDEO)] } }) + "\n");
  core = await bootCore({
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
  });
}, T);

afterAll(async () => {
  await core?.close();
  if (notes.length) {
    mkdirSync(EVIDENCE, { recursive: true });
    const md = ["# footage.analyze на talking-head (Task 30)", "", `Прогон ${new Date().toISOString()}, ролик ${basename(VIDEO ?? "")}.`, "", ...notes, ""].join("\n");
    writeFileSync(join(EVIDENCE, "README.md"), md);
    console.log(md);
  }
  if (tmp) await removeStore({ tmp, root, marker: undefined as never, guard: undefined as never });
});

async function job(type: Job["type"], projectId: string, input: Record<string, unknown>): Promise<{ j: Job; s: number }> {
  const t0 = Date.now();
  const id = enqueue(core!.db, { type, projectId, input, idempotencyKey: `e2e-t30th-${newId("run")}` }).job.id;
  mine.add(id);
  for (;;) {
    const j = jobs.get(core!.db, id);
    if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) {
      expect(j.status, `${type}: ${JSON.stringify(j.error)}`).toBe("completed");
      return { j, s: (Date.now() - t0) / 1000 };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

it("talking head: Vision — лицо, свободная зона; агент — схема, позиция совпала или помечена; стоимость", async () => {
  expect(VIDEO && existsSync(VIDEO), NO_VIDEO).toBeTruthy();
  expect(await visionAvailable(), `нет ${DEFAULT_VISION_BIN}: npm run build:vision`).toBe(true);
  const projectId = projects.create(core!.db, { kind: "video", title: "footage e2e talking head" }).id;
  await job("media.import", projectId, { projectId, method: "path", path: VIDEO });
  const mediaId = media.byProject(core!.db, projectId)!.id;

  const a = await job("footage.analyze", projectId, { projectId, mediaId, useAgent: false });
  const o = a.j.output_refs as FootageAnalyzeResult;
  const doc = FootageAnalysisSchema.parse(JSON.parse(readFileSync(join(root, o.rel_path), "utf8")));
  expect(o.mode).toBe("vision");
  expect(doc.shots.length).toBeGreaterThanOrEqual(1);
  const best = (zs: { free_ratio: number }[]) => Math.max(0, ...zs.map((z) => z.free_ratio));
  notes.push(`- без агента: ${a.s.toFixed(1)} с, шотов ${doc.shots.length}, кадров ${o.keyframes}; этапы ${JSON.stringify(o.timings_ms)}`);
  for (const s of doc.shots) {
    notes.push(`  - ${s.id} ${(s.source_start_us / 1e6).toFixed(1)}–${(s.source_end_us / 1e6).toFixed(1)} с: кадров ${s.keyframes.length}, лицо ${s.face.detected_ratio.toFixed(2)} ${JSON.stringify(s.face.union)}, автор ${s.author_position}, руки ${s.hands.detected_ratio.toFixed(2)}, шот (худший случай) занято ${JSON.stringify(s.occupied)}, зоны ${s.free_zones.map((z) => `${z.zone} ${z.free_ratio.toFixed(2)}`).join(", ")}`);
    for (const w of s.windows) notes.push(`    - окно ${(w.start_us / 1e6).toFixed(1)}–${(w.end_us / 1e6).toFixed(1)} с: руки ${JSON.stringify(w.hands ?? null)}, зоны ${w.free_zones.map((z) => `${z.zone} ${z.free_ratio.toFixed(2)}`).join(", ")}`);
  }
  // документ и рамки — в tmp/ до проверок: при провале остаются для разбора
  const drawn = execFileSync(process.execPath, [join(MS, "scripts/draw-zones.mjs"), join(root, o.rel_path, ".."), join(EVIDENCE, "vision"), "3"]).toString().trim();
  notes.push(`- draw-zones: ${drawn.split("\n").map((x) => x.replace(REPO, "")).join(", ")}`);
  // документ и рамки детектора — рядом с рамками зон в tmp/ (хранилище удаляется после теста)
  // копия опубликованного файла — 0444: прошлый прогон оставил её только для чтения
  for (const f of ["footage.json", "detections.json"]) {
    rmSync(join(EVIDENCE, "vision", f), { force: true });
    copyFileSync(join(root, o.rel_path, "..", f), join(EVIDENCE, "vision", f));
  }
  // графика живёт на интервале: свободная зона нужна в окне времени (~4 с), а не на весь шот
  for (const s of doc.shots) {
    expect(s.keyframes.length, s.id).toBeGreaterThanOrEqual(3);
    expect(s.face.detected_ratio, `${s.id}: ${JSON.stringify(s.face)}`).toBeGreaterThanOrEqual(0.8);
    expect(s.windows.length, s.id).toBeGreaterThanOrEqual(1);
    expect(Math.max(...s.windows.map((w) => best(w.free_zones))), `${s.id}: ${JSON.stringify(s.windows.map((w) => w.free_zones))}`).toBeGreaterThanOrEqual(0.9);
  }

  const b = await job("footage.analyze", projectId, { projectId, mediaId });
  const ob = b.j.output_refs as FootageAnalyzeResult;
  const docB = FootageAnalysisSchema.parse(JSON.parse(readFileSync(join(root, ob.rel_path), "utf8")));
  expect(ob.mode).toBe("vision+llm");
  expect(ob.agent?.status).toBe("completed");
  for (const [k, s] of docB.shots.entries()) {
    const visionPos = doc.shots[k]?.author_position;
    // позиция в документе — по детектору; несогласие агента — пометка
    expect(s.author_position).toBe(visionPos);
    if (s.notes.includes("агент:")) expect(s.uncertainty).toContain("расхождение детектора и агента");
    expect(s.occupied).toContainEqual(doc.shots[k]!.face.union); // агент не убрал лицо
  }
  notes.push(`- агент sonnet: ${b.s.toFixed(1)} с, $${ob.agent!.cost_usd}, порций ${ob.agent!.batches}, отказов прав ${ob.agent!.permission_denials}, отброшено объектов ${ob.agent!.dropped_objects}`);
  for (const s of docB.shots) notes.push(`  - ${s.id}: ${s.author_position}/${s.motion}; объекты ${s.objects.map((x) => `${x.label}${x.important ? "!" : ""}`).join(", ") || "—"}; «${s.notes.slice(0, 200)}»; неуверенность ${s.uncertainty.join("; ") || "—"}`);
}, T);
