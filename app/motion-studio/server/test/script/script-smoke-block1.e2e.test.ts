// S11 смоук качества пакета (спека §12 п.5): блок 1 целиком — реальный claude и рендер.
// `script.plan` → пакет всех принятых сцен → упавшие один раз повторяются → `packageDiversity`
// (`warningsForState`) → судья bench (`runJudge`, справочно) по превью каждой версии →
// MP4 (`scene.export`, crf 18) и по 3 кадра (начало речи, середина, удержание).
// [A] ≥ 80 % сцен ready; `technique_not_realized` ≤ 1; ≥ 3 разных структуры;
// `adjacent_structure_repeat` плана = 0. Отчёт — docs/evidence/script-mvp/smoke-block-1.json,
// кадры ≤ 480 px — docs/evidence/script-mvp/smoke-block-1/, полноразмерное — tmp/s11-smoke/.
// `MS_SMOKE_BLOCK2=1` — ещё 2 сцены block-2 (hero-number «256», process-steps «порциями») для
// сравнения «до/после» правил S11 с кадрами e2e S5 (docs/evidence/script-mvp/generate/).
// Хранилище — `MS_DATA_DIR` (по умолчанию /Volumes/External SSD/MotionStudio-e2e-s11, создаётся
// initStore, как doctor --init). Платный (≈ $15–20) — только явно, `MS_SMOKE=1`:
// `MS_E2E=1 MS_SMOKE=1 npx vitest run server/test/script/script-smoke-block1.e2e.test.ts`.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type MotionSpec, type PlanIssue, type ScriptPlanRevisionDoc, type ScriptSceneItem, type VersionManifest, holdModeFor, structureOf } from "@ms/contracts";
import { MARKER_FILE, initStore, macosProbe } from "@ms/core";
import { ensureRenderBrowser } from "@ms/render";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { judgeRuntime, loadJudgePrompt, prepareJudgeInput, runJudge } from "../../src/bench/judge.js";
import { REFERENCE } from "../../src/bench/reference.js";
import { type Core, bootCore } from "../../src/boot.js";
import { loadConfig, readConfigFile } from "../../src/config.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptScenes } from "../../src/db/repos/script.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, provideInput } from "../../src/jobs/queue.js";
import type { ScriptPlanResult } from "../../src/pipeline/script-plan.js";
import { newId } from "../../src/scenes/ids.js";
import { startScriptBatch } from "../../src/script/batch.js";
import { packageDiversity, warningsForState } from "../../src/script/diversity.js";
import { currentScriptPlan } from "../../src/script/read.js";
import { saveScriptText } from "../../src/script/text.js";
import { kitImports } from "../../src/scenes/kit-imports.js";

const T = 180 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const ROOT = process.env.MS_DATA_DIR ?? "/Volumes/External SSD/MotionStudio-e2e-s11";
/**
 * Метка повторного смоука (S14: `MS_SMOKE_TAG=s14`): отчёт и кадры — в
 * docs/evidence/script-mvp/<метка>/, полноразмерное — tmp/<метка>-smoke/; без метки — как в S11.
 */
const TAG = process.env.MS_SMOKE_TAG;
const EVIDENCE = join(REPO, "docs/evidence/script-mvp", ...(TAG ? [TAG] : []));
const TMP = join(REPO, `tmp/${TAG ?? "s11"}-smoke`);
const FINAL = ["completed", "failed", "cancelled", "blocked"];
const run = promisify(execFile);

let core: Core;
let guard: ConstructorParameters<typeof ArtifactStore>[0]["guard"];
const mine = new Set<string>();
const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};

/** Смоук платный: только по `MS_SMOKE=1`, не каждым `make e2e`. */
const SMOKE = process.env.MS_SMOKE === "1";

beforeAll(async () => {
  if (!SMOKE) return;
  expect(existsSync("/Volumes/External SSD") || process.env.MS_DATA_DIR !== undefined, "внешний SSD не подключён").toBe(true);
  if (!existsSync(join(ROOT, MARKER_FILE))) await initStore(ROOT, macosProbe, {});
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: ROOT },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => {
      guard = svc.storageCheck;
      return registerHandlers(svc, { log: () => undefined });
    },
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  mkdirSync(join(TMP, "frames"), { recursive: true });
}, T);

afterAll(async () => {
  if (!SMOKE) return;
  writeFileSync(join(TMP, "run.log"), log.join("\n") + "\n");
  await core?.close();
});

async function wait(id: string, poll = 3000): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j?.status === "awaiting_input") provideInput(core.db, j.id, "skip");
    if (j && FINAL.includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, poll));
  }
}
const cost = (jobId: string): number =>
  (core.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM agent_runs WHERE job_id = ?").get(jobId) as { c: number }).c;
const min = (ms: number) => Number((ms / 60_000).toFixed(1));

interface Scene {
  item: ScriptSceneItem;
  n: number;
  sceneId?: string;
  jobs: Job[];
  version?: versions.VersionRow;
  spec?: MotionSpec;
  kit: string[];
  warnings: PlanIssue[];
  qaWarnings: string[];
  judge?: { overall: number; notes: Record<string, string>; cost_usd: number } | { error: string };
  /** S15b: вызовы Engineer и раунды на код (попытки, где код был blocking), из pipeline-log.json версии. */
  rounds?: { engineer_calls: number; attempts: number; blocking_by_code: Record<string, number> };
  frames: string[];
  mp4?: string;
}

interface Run {
  label: string;
  projectId: string;
  doc: ScriptPlanRevisionDoc;
  planId: string;
  plan: { seconds: number; cost_usd: number; adjacent_structure_repeat: number; issues: PlanIssue[] };
  scenes: Scene[];
  genMinutes: number;
  genCost: number;
}

const runs: Run[] = [];

/**
 * Готовый проект прошлого прогона (`MS_SMOKE_REUSE=<проект block-1>[,<проект block-2>]`): план и
 * задачи сцен — из базы, без новых трат на агентов (повтор судьи и экспорта).
 */
function reuse(label: string, projectId: string): Run {
  const cur = currentScriptPlan(core.db, ROOT, projectId)!;
  const acc = cur.doc.items.filter((x) => x.status === "accepted");
  const scenes = acc.map((item, k): Scene => {
    const row = scriptScenes.get(core.db, cur.planId, item.id, "16:9");
    const j = row?.job_id ? jobs.get(core.db, row.job_id) : undefined;
    return { item, n: k + 1, ...(row ? { sceneId: row.scene_id } : {}), jobs: j ? [j] : [], kit: [], warnings: [], qaWarnings: [], frames: [] };
  });
  const issues = cur.doc.issues;
  say(`${label}: проект ${projectId} (повтор без генерации), принятых ${acc.length}`);
  return { label, projectId, doc: cur.doc, planId: cur.planId, plan: { seconds: 0, cost_usd: 0, adjacent_structure_repeat: issues.filter((x) => x.code === "adjacent_structure_repeat").length, issues }, scenes, genMinutes: 0, genCost: 0 };
}
const REUSE = (process.env.MS_SMOKE_REUSE ?? "").split(",").filter(Boolean);

/** Текст блока → проект → `script.plan`. */
async function plan(label: string, file: string): Promise<Run> {
  const [title, ...rest] = readFileSync(file, "utf8").split("\n");
  const projectId = projects.create(core.db, { kind: "script", title: `S11 смоук ${label} ${new Date().toISOString()}` }).id;
  const store = new ArtifactStore({ root: ROOT, db: core.db, guard });
  await saveScriptText({ db: core.db, store, root: ROOT }, projectId, { blocks: [{ title: title!.trim(), text: rest.join("\n").trim() }] });
  const t0 = Date.now();
  const id = enqueue(core.db, { type: "script.plan", projectId, input: { projectId }, idempotencyKey: `s11-plan-${newId("run")}` }).job.id;
  const j = await wait(id, 1000);
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const res = j.output_refs as ScriptPlanResult;
  const cur = currentScriptPlan(core.db, ROOT, projectId)!;
  writeFileSync(join(TMP, `plan-${label}.json`), JSON.stringify(cur.doc, null, 2) + "\n");
  const acc = cur.doc.items.filter((x) => x.status === "accepted");
  const issues = cur.doc.issues;
  const r: Run = {
    label, projectId, doc: cur.doc, planId: cur.planId,
    plan: { seconds: Math.round((Date.now() - t0) / 1000), cost_usd: res.agent.cost_usd, adjacent_structure_repeat: issues.filter((x) => x.code === "adjacent_structure_repeat").length, issues },
    scenes: acc.map((item, k) => ({ item, n: k + 1, jobs: [], kit: [], warnings: [], qaWarnings: [], frames: [] })),
    genMinutes: 0, genCost: 0,
  };
  say(`${label}: script.plan ${r.plan.seconds} с, $${res.agent.cost_usd}, принятых ${acc.length}, adjacent_structure_repeat ${r.plan.adjacent_structure_repeat}`);
  for (const x of acc) say(`  ${x.id} ${x.technique}/${x.structure_rule ?? "—"} ${x.frames.total} кадров «${x.quote.slice(0, 90)}»`);
  return r;
}

/** Пакет сцен (`itemIds` — только эти), упавшие — один повтор; версии, kit, предупреждения. */
async function generate(r: Run, itemIds?: string[]): Promise<void> {
  const t0 = Date.now();
  const pick = (ids?: string[]) => r.scenes.filter((s) => !ids || ids.includes(s.item.id));
  const go = async (ids: string[] | undefined, tag: string) => {
    const b = startScriptBatch(core, { projectId: r.projectId, revision: r.doc.revision, ...(ids ? { itemIds: ids } : {}), idempotencyKey: `s11-${tag}-${newId("run")}` });
    await Promise.all(b.items.filter((bi) => bi.job).map(async (bi) => {
      const s = r.scenes.find((x) => x.item.id === bi.item_id)!;
      s.sceneId = bi.scene_id;
      const j = await wait(bi.job!.id);
      s.jobs.push(j);
      say(`${r.label} ${s.item.id} ${s.item.technique}: ${j.status} за ${min(Date.now() - t0)} мин, $${cost(j.id).toFixed(2)}${j.error ? ` — ${JSON.stringify(j.error).slice(0, 300)}` : ""}`);
    }));
  };
  await go(itemIds, "gen");
  const failed = pick(itemIds).filter((s) => s.jobs.at(-1)?.status !== "completed");
  if (failed.length > 0) await go(failed.map((s) => s.item.id), "retry");
  r.genMinutes = min(Date.now() - t0);
  collect(r, itemIds);
}

/** Версии, kit, предупреждения пакета и QA сцен прогона (после генерации или по готовому проекту). */
function collect(r: Run, itemIds?: string[]): void {
  const pick = (ids?: string[]) => r.scenes.filter((s) => !ids || ids.includes(s.item.id));
  r.genCost = r.scenes.flatMap((s) => s.jobs).reduce((a, j) => a + cost(j.id), 0);
  const warns = warningsForState(core.db, ROOT, r.projectId, r.doc);
  for (const s of pick(itemIds)) {
    const row = scriptScenes.get(core.db, r.planId, s.item.id, "16:9");
    const last = s.jobs.at(-1);
    const v = last ? versions.listByJob(core.db, last.id).filter((x) => x.status === "ready").at(-1) : undefined;
    if (!v || !row) continue;
    s.version = v;
    const dir = join(ROOT, v.path);
    s.spec = JSON.parse(readFileSync(join(dir, "spec.json"), "utf8")) as MotionSpec;
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as VersionManifest;
    s.kit = [...new Set(m.files.filter((f) => /^src\/.+\.tsx?$/.test(f.path)).flatMap((f) => kitImports(readFileSync(join(dir, f.path), "utf8"))))].sort();
    s.warnings = warns[row.scene_id] ?? [];
    const qa = JSON.parse(readFileSync(join(dir, "qa.json"), "utf8")) as { issues: { code: string; severity: string; description: string }[] };
    s.qaWarnings = qa.issues.filter((x) => x.severity === "warning").map((x) => `${x.code}: ${x.description.slice(0, 160)}`);
    try {
      const pl = JSON.parse(readFileSync(join(dir, "pipeline-log.json"), "utf8")) as { engineer_calls?: number; attempts?: { blocking: string[] }[] };
      const by: Record<string, number> = {};
      for (const a of pl.attempts ?? []) for (const c of new Set(a.blocking)) by[c] = (by[c] ?? 0) + 1;
      s.rounds = { engineer_calls: pl.engineer_calls ?? 0, attempts: pl.attempts?.length ?? 0, blocking_by_code: by };
    } catch {
      // журнала нет — без раундов
    }
  }
}

/** Судья bench по превью версии (справочно) и экспорт MP4 с 3 кадрами. */
async function review(r: Run, prefix: string): Promise<void> {
  const config = loadConfig({ ...process.env, MS_DATA_DIR: ROOT }, await readConfigFile(ROOT));
  const agents = judgeRuntime({ bin: config.claudeBin, logRoot: join(ROOT, "logs", "s11-judge"), systemPrompt: await loadJudgePrompt() });
  const out = join(EVIDENCE, prefix);
  mkdirSync(out, { recursive: true });
  for (const s of r.scenes.filter((x) => x.version)) {
    const dir = join(ROOT, s.version!.path);
    const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as VersionManifest;
    const name = `${prefix}-${String(s.n).padStart(2, "0")}-${s.item.technique}`;
    if (m.preview) {
      try {
        const jdir = join(TMP, "judge", name);
        await prepareJudgeInput(join(dir, m.preview.path), jdir, { prompt: s.item.quote, duration_frames: s.item.frames.total, fps: 30 });
        const res = await runJudge({ agents, dir: jdir, anchors: REFERENCE, durationFrames: s.item.frames.total, model: "opus", runRef: { root: ROOT, runId: `s11-judge-${newId("run")}`, attempt: 1 }, signal: new AbortController().signal });
        s.judge = res.output
          ? { overall: res.output.overall, notes: Object.fromEntries(Object.entries(res.output.criteria).map(([k, v]) => [k, `${v.score}: ${v.note}`])), cost_usd: res.usage.costUsd }
          : { error: JSON.stringify(res.error).slice(0, 300) };
      } catch (e) {
        s.judge = { error: (e as Error).message.slice(0, 300) };
      }
      say(`  судья ${name}: ${"overall" in (s.judge ?? {}) ? (s.judge as { overall: number }).overall : JSON.stringify(s.judge)}`);
    }
    const id = enqueue(core.db, { type: "scene.export", projectId: r.projectId, versionId: s.version!.id, input: { versionId: s.version!.id, request: { format: "mp4", crf: 18, scale: 1 } }, idempotencyKey: `s11-exp-${newId("run")}` }).job.id;
    const j = await wait(id, 1000);
    if (j.status !== "completed") {
      say(`  экспорт ${name}: ${j.status} ${JSON.stringify(j.error)}`);
      continue;
    }
    const ex = exportsRepo.get(core.db, (j.output_refs as { export_id: string }).export_id)!;
    s.mp4 = join(TMP, `${name}.mp4`);
    copyFileSync(join(ROOT, ex.path), s.mp4);
    const fr = s.item.frames;
    const at = { speech: fr.lead + 2, mid: fr.lead + Math.floor(fr.speech / 2), hold: fr.total - Math.ceil(fr.tail / 2) };
    for (const [k, f] of Object.entries(at)) {
      const full = join(TMP, "frames", `${name}-${k}-f${f}.png`);
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", s.mp4, "-vf", `select=eq(n\\,${f})`, "-vframes", "1", full]);
      await run("/usr/bin/sips", ["-Z", "480", full, "--out", join(out, `${name}-${k}-f${f}.png`)]);
      s.frames.push(full);
    }
  }
}

const sceneJson = (s: Scene) => ({
  item_id: s.item.id, n: s.n, technique: s.item.technique, structure_rule: s.item.structure_rule ?? null, quote: s.item.quote, frames: s.item.frames,
  status: s.version ? "ready" : (s.jobs.at(-1)?.status ?? "none"), jobs: s.jobs.map((j) => ({ id: j.id, status: j.status, cost_usd: Number(cost(j.id).toFixed(3)) })),
  version_id: s.version?.id ?? null, structure: s.spec ? structureOf(s.spec) : null, hold_mode: s.spec ? holdModeFor(s.spec) : null, kit: s.kit,
  warnings: s.warnings.map((w) => `${w.code}: ${w.message ?? ""}`), qa_warnings: s.qaWarnings, judge: s.judge ?? null, rounds: s.rounds ?? null,
});

it.runIf(SMOKE)("блок 1 целиком: план → пакет → разнообразие → судья → MP4 и кадры; [A]", async () => {
  const r = REUSE[0] ? reuse("block-1", REUSE[0]) : await plan("block-1", join(REPO, "tmp/script-mvp/block-1.txt"));
  runs.push(r);
  if (REUSE[0]) collect(r);
  else await generate(r);
  await review(r, "smoke-block-1");
  const d = packageDiversity(r.scenes.map((s) => ({ item: s.item, spec: s.spec ?? null, kit: s.kit })));
  const ready = r.scenes.filter((s) => s.version).length;
  const notRealized = r.scenes.filter((s) => s.warnings.some((w) => w.code === "technique_not_realized")).length;
  const structures = Object.keys(d.summary.structures).length;
  const acceptance = {
    ready_share: ready / r.scenes.length, technique_not_realized: notRealized, structures, adjacent_structure_repeat: r.plan.adjacent_structure_repeat,
    ok: ready / r.scenes.length >= 0.8 && notRealized <= 1 && structures >= 3 && r.plan.adjacent_structure_repeat === 0,
  };
  const report = {
    project_id: r.projectId, plan_id: r.planId, plan_revision: r.doc.revision, plan: r.plan,
    generate: { minutes: r.genMinutes, cost_usd: Number(r.genCost.toFixed(2)) },
    diversity: d.summary, acceptance, scenes: r.scenes.map(sceneJson),
  };
  writeFileSync(join(EVIDENCE, "smoke-block-1.json"), JSON.stringify(report, null, 2) + "\n");
  say(`[A] ${JSON.stringify(acceptance)}`);
  expect(acceptance.ok, JSON.stringify(acceptance)).toBe(true);
}, T);

it.runIf(SMOKE && process.env.MS_SMOKE_BLOCK2 === "1")("block-2: hero-number «256» и process-steps «порциями» — до/после правил S11", async () => {
  const r = REUSE[1] ? reuse("block-2", REUSE[1]) : await plan("block-2", join(REPO, "tmp/script-mvp/block-2.txt"));
  runs.push(r);
  const acc = r.scenes.map((s) => s.item);
  const hero = acc.find((x) => x.technique === "hero-number" && /двумстам|256/.test(x.quote)) ?? acc.find((x) => x.technique === "hero-number");
  const steps = acc.find((x) => x.technique === "process-steps" && /порци|разом|переезжа/i.test(x.quote + x.idea)) ?? acc.find((x) => x.technique === "process-steps");
  const ids = [hero, steps].filter((x): x is ScriptSceneItem => x !== undefined).map((x) => x.id);
  expect(ids.length).toBeGreaterThan(0);
  if (REUSE[1]) collect(r, ids);
  else await generate(r, ids);
  r.scenes = r.scenes.filter((s) => ids.includes(s.item.id));
  await review(r, "smoke-block-2");
  writeFileSync(join(EVIDENCE, "smoke-block-2-compare.json"), JSON.stringify({ project_id: r.projectId, generate: { minutes: r.genMinutes, cost_usd: Number(r.genCost.toFixed(2)) }, scenes: r.scenes.map(sceneJson) }, null, 2) + "\n");
}, T);
