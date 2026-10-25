// S10 e2e: вертикальные двойники 9:16 — реальный claude и реальный рендер.
// Текст человека block-2 (`tmp/script-mvp/block-2.txt`) → `script.plan` → две сцены разных
// приёмов (предпочтительно split-versus — самая «горизонтальная» раскладка — и hero-number /
// process-steps) → эталоны 16:9 (`startScriptBatch`) → `startReframe` → двойники 9:16; упавшая
// задача — один повтор (`:try-n`). [A] двойник ready или failed с журналом; 1080×1920;
// длительность = эталону; Concept не вызывался; у ready нет blocking `clipping`.
// Затем пакет 9:16 (`script.package`: NN_*.mp4 + NN_*_alpha.mov 1080×1920) и кадры обеих версий
// (начало речи, середина, удержание) ≤ 480 px → docs/evidence/script-mvp/s10/, маска интерфейса
// Shorts на кадре удержания → s10/safe-area-*.png. Полноразмерные кадры и MP4 — tmp/s10-e2e/.
// Хранилище — `MS_DATA_DIR` (по умолчанию `materialsPath("e2e", "s10")`, `doctor --init`).
// Запуск: `MS_E2E=1 npx vitest run server/test/pipeline/script-reframe.e2e.test.ts`.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type MotionSpec, QAReportSchema, type ScriptPlanRevisionDoc, type ScriptSceneItem, type VersionManifest } from "@ms/contracts";
import { MARKER_FILE, initStore, macosProbe, materialsPath, materialsRoot, assertSsdWriteAllowed } from "@ms/core";
import { ensureRenderBrowser, ffprobe } from "@ms/render";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as versions from "../../src/db/repos/versions.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, provideInput } from "../../src/jobs/queue.js";
import { newId } from "../../src/scenes/ids.js";
import { startScriptBatch } from "../../src/script/batch.js";
import { currentScriptPlan } from "../../src/script/read.js";
import { startReframe } from "../../src/script/reframe.js";
import { saveScriptText } from "../../src/script/text.js";

const T = 180 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const ROOT = process.env.MS_DATA_DIR ?? materialsPath("e2e", "s10");
const EVIDENCE = join(REPO, "docs/evidence/script-mvp/s10");
const TMP = join(REPO, "tmp/s10-e2e");
const FINAL = ["completed", "failed", "cancelled", "blocked"];
const run = promisify(execFile);
/** Копия файла пакета/экспорта (у них нет права записи — прежнюю копию сначала удаляем). */
const copyOver = (from: string, to: string) => {
  rmSync(to, { force: true });
  copyFileSync(from, to);
};

let core: Core;
let guard: ConstructorParameters<typeof ArtifactStore>[0]["guard"];
const mine = new Set<string>();
const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};

beforeAll(async () => {
  expect(existsSync(materialsRoot()) || process.env.MS_DATA_DIR !== undefined, "внешний SSD не подключён").toBe(true);
  assertSsdWriteAllowed(ROOT); // S18: на SSD — только в папке материалов
  if (!existsSync(join(ROOT, MARKER_FILE))) await initStore(ROOT, macosProbe, {});
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: ROOT },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => {
      guard = svc.storageCheck;
      return registerHandlers(svc, { log: (l) => console.log(`  ${l}`) });
    },
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  mkdirSync(join(TMP, "frames"), { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });
}, T);

afterAll(async () => {
  writeFileSync(join(TMP, "run.log"), log.join("\n") + "\n");
  await core?.close();
});

async function wait(id: string, poll = 2000): Promise<Job> {
  mine.add(id);
  for (;;) {
    const j = jobs.get(core.db, id);
    if (j) {
      if (j.status === "awaiting_input") provideInput(core.db, j.id, "skip");
      if (FINAL.includes(j.status)) return j;
    }
    await new Promise((r) => setTimeout(r, poll));
  }
}

const cost = (jobId: string): number =>
  (core.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM agent_runs WHERE job_id = ?").get(jobId) as { c: number }).c;
const roles = (jobId: string): string[] =>
  (core.db.prepare("SELECT role FROM agent_runs WHERE job_id = ? ORDER BY rowid").all(jobId) as { role: string }[]).map((r) => r.role);
const minutes = (ms: number) => (ms / 60_000).toFixed(1);

/** Две сцены разных приёмов: split-versus (горизонтальная раскладка) и hero-number / process-steps. */
function pick(doc: ScriptPlanRevisionDoc): ScriptSceneItem[] {
  const acc = doc.items.filter((x) => x.status === "accepted");
  const want: ((x: ScriptSceneItem) => boolean)[] = [
    (x) => x.technique === "split-versus",
    (x) => x.technique === "hero-number",
    (x) => x.technique === "process-steps",
  ];
  const out: ScriptSceneItem[] = [];
  const add = (x: ScriptSceneItem | undefined) => {
    if (x && out.length < 2 && !out.includes(x) && !out.some((o) => o.technique === x.technique)) out.push(x);
  };
  for (const f of want) add(acc.find(f));
  for (const x of acc) add(x);
  return out.sort((a, b) => acc.indexOf(a) - acc.indexOf(b));
}

interface Side {
  jobs: Job[];
  version?: versions.VersionRow;
  manifest?: VersionManifest;
  spec?: MotionSpec;
}
interface Pair {
  item: ScriptSceneItem;
  n: number;
  h: Side;
  v: Side;
}
const state: { projectId?: string; planId?: string; doc?: ScriptPlanRevisionDoc; pairs: Pair[]; packageDir?: string } = { pairs: [] };

function readSide(s: Side): void {
  const v = versions.listByJob(core.db, s.jobs.at(-1)!.id).filter((x) => x.status === "ready").at(-1);
  if (!v) return;
  s.version = v;
  s.manifest = JSON.parse(readFileSync(join(ROOT, v.path, "manifest.json"), "utf8")) as VersionManifest;
  s.spec = JSON.parse(readFileSync(join(ROOT, v.path, "spec.json"), "utf8")) as MotionSpec;
}

/** Пакет задач до конечных статусов; упавшие — один повтор `again(itemIds)`. */
async function runBatch(items: { item_id: string; job: Job | null }[], side: (itemId: string) => Side, again: (itemIds: string[]) => { item_id: string; job: Job | null }[] | Promise<{ item_id: string; job: Job | null }[]>, label: string): Promise<void> {
  const t0 = Date.now();
  await Promise.all(items.map(async (bi) => {
    const j = await wait(bi.job!.id);
    side(bi.item_id).jobs.push(j);
    say(`${label} ${bi.item_id}: ${j.status} за ${minutes(Date.now() - t0)} мин, $${cost(j.id).toFixed(2)}${j.error ? ` — ${JSON.stringify(j.error)}` : ""}`);
  }));
  const failed = items.map((x) => x.item_id).filter((id) => side(id).jobs.at(-1)!.status !== "completed");
  if (failed.length > 0) {
    const retry = await again(failed);
    for (const bi of retry) {
      const k = jobs.get(core.db, bi.job!.id)!.idempotency_key;
      say(`${label} повтор ${bi.item_id}: ключ ${k}`);
      expect(k).toMatch(/:try-\d+$/);
    }
    await Promise.all(retry.map(async (bi) => {
      const j = await wait(bi.job!.id);
      side(bi.item_id).jobs.push(j);
      say(`${label} повтор ${bi.item_id}: ${j.status}, $${cost(j.id).toFixed(2)}${j.error ? ` — ${JSON.stringify(j.error)}` : ""}`);
    }));
  }
}

it("план block-2 и эталоны 16:9 двух сцен реальным claude", async () => {
  const [title, ...rest] = readFileSync(join(REPO, "tmp/script-mvp/block-2.txt"), "utf8").split("\n");
  const projectId = projects.create(core.db, { kind: "script", title: `e2e S10 block-2 ${new Date().toISOString()}` }).id;
  const store = new ArtifactStore({ root: ROOT, db: core.db, guard });
  await saveScriptText({ db: core.db, store, root: ROOT }, projectId, { blocks: [{ title: title!.trim(), text: rest.join("\n").trim() }] });
  const pj = await wait(enqueue(core.db, { type: "script.plan", projectId, input: { projectId }, idempotencyKey: `e2e-s10-plan-${newId("run")}` }).job.id, 500);
  expect(pj.status, JSON.stringify(pj.error)).toBe("completed");
  const cur = currentScriptPlan(core.db, ROOT, projectId)!;
  const acc = cur.doc.items.filter((x) => x.status === "accepted");
  const chosen = pick(cur.doc);
  expect(chosen).toHaveLength(2);
  Object.assign(state, { projectId, planId: cur.planId, doc: cur.doc });
  state.pairs = chosen.map((item) => ({ item, n: acc.indexOf(item) + 1, h: { jobs: [] }, v: { jobs: [] } }));
  say(`план: ${cur.doc.items.length} сцен; выбраны ${chosen.map((x) => `${x.id} ${x.technique} ${x.frames.total} кадров «${x.quote.slice(0, 70)}»`).join("; ")}`);
  const pair = (id: string) => state.pairs.find((p) => p.item.id === id)!;
  const ids = chosen.map((x) => x.id);
  const b = startScriptBatch(core, { projectId, revision: cur.doc.revision, itemIds: ids, idempotencyKey: `e2e-s10-gen-${newId("run")}` });
  await runBatch(b.items, (id) => pair(id).h, (f) => startScriptBatch(core, { projectId, revision: cur.doc.revision, itemIds: f, idempotencyKey: `e2e-s10-gen2-${newId("run")}` }).items, "16:9");
  for (const p of state.pairs) readSide(p.h);
  expect(state.pairs.filter((p) => p.h.version).length, "хотя бы один эталон ready").toBeGreaterThan(0);
}, T);

it("reframe 9:16: двойники готовых эталонов; [A] 1080×1920, длительность = эталону, без Concept, без blocking clipping", async () => {
  const { projectId } = state as Required<typeof state>;
  const ready = state.pairs.filter((p) => p.h.version);
  const pair = (id: string) => state.pairs.find((p) => p.item.id === id)!;
  const r = await startReframe(core, { projectId, itemIds: state.pairs.map((p) => p.item.id), idempotencyKey: `e2e-s10-reframe-${newId("run")}` });
  say(`reframe ${r.id}: в пакете ${r.items.map((x) => x.item_id).join(", ")}; пропущены ${JSON.stringify(r.skipped ?? [])}`);
  expect(r.items.map((x) => x.item_id)).toEqual(ready.map((p) => p.item.id));
  await runBatch(r.items, (id) => pair(id).v, async (f) => (await startReframe(core, { projectId, itemIds: f, idempotencyKey: `e2e-s10-reframe2-${newId("run")}` })).items, "9:16");
  const problems: string[] = [];
  const check = (ok: boolean, msg: string) => {
    say(`  ${ok ? "OK  " : "FAIL"} ${msg}`);
    if (!ok) problems.push(msg);
  };
  for (const p of ready) {
    readSide(p.v);
    const id = p.item.id;
    for (const j of p.v.jobs) {
      const input = j.input as { script: { reference_version_id?: string; aspect: string } };
      check(input.script.aspect === "9:16" && input.script.reference_version_id === p.h.version!.id, `${id}: вход двойника — 9:16, эталон ${p.h.version!.id}`);
      check(!roles(j.id).includes("concept"), `${id}: Concept не вызывался (роли: ${roles(j.id).join(", ")})`);
      const events = jobEvents.listSince(core.db, 0, { jobId: j.id, limit: 3000 }).filter((e) => e.kind !== "progress");
      writeFileSync(join(TMP, `events-${id}-${j.id}.txt`), events.map((e) => `${e.ts} ${e.level} ${e.kind}: ${e.message}`).join("\n") + "\n");
      if (j.status !== "completed") check(events.length > 0, `${id}: failed с журналом (${events.length} событий): ${JSON.stringify(j.error)}`);
    }
    if (!p.v.version) continue;
    const s = p.v.manifest!.settings;
    check(s.width === 1080 && s.height === 1920 && s.aspect_ratio === "9:16", `${id}: 9:16 ${s.width}×${s.height}`);
    check(s.duration_frames === p.h.manifest!.settings.duration_frames && p.v.spec!.duration_frames === p.h.spec!.duration_frames,
      `${id}: длительность ${s.duration_frames} = эталону ${p.h.manifest!.settings.duration_frames}`);
    const qa = QAReportSchema.parse(JSON.parse(readFileSync(join(ROOT, p.v.version.path, "qa.json"), "utf8")));
    const clip = qa.issues.filter((x) => x.code === "clipping" && x.severity === "blocking");
    check(clip.length === 0, `${id}: без blocking clipping`);
    say(`  ${id}: QA ${JSON.stringify(qa.gate)}; замечания: ${qa.issues.map((x) => `${x.code}/${x.severity}`).join(", ") || "—"}`);
    say(`  ${id}: структура ${p.h.spec!.composition?.structure ?? "build-strike"} → ${p.v.spec!.composition?.structure ?? "build-strike"}; фазы ${(p.h.spec!.phases ?? []).map((x) => `${x.role}:${x.weight}`).join(" ")} → ${(p.v.spec!.phases ?? []).map((x) => `${x.role}:${x.weight}`).join(" ")}`);
    say(`  ${id}: биты 16:9 ${p.h.spec!.beats.map((b) => `${b.id}[${b.start_frame};${b.end_frame})`).join(" ")}`);
    say(`  ${id}: биты 9:16 ${p.v.spec!.beats.map((b) => `${b.id}[${b.start_frame};${b.end_frame})`).join(" ")}`);
  }
  expect(problems).toEqual([]);
}, T);

it("пакет 9:16: NN_*.mp4 и NN_*_alpha.mov 1080×1920; кадры обеих версий и маска интерфейса Shorts", async () => {
  const { projectId } = state as Required<typeof state>;
  const both = state.pairs.filter((p) => p.h.version && p.v.version);
  expect(both.length).toBeGreaterThan(0);
  const pj = await wait(enqueue(core.db, { type: "script.package", projectId, input: { projectId, aspect: "9:16" }, idempotencyKey: `e2e-s10-pkg-${newId("run")}` }).job.id, 1000);
  expect(pj.status, JSON.stringify(pj.error)).toBe("completed");
  const refs = pj.output_refs as { rel_path: string; files: number; missing: { item_id: string; reason: string }[] };
  const dir = join(ROOT, refs.rel_path);
  state.packageDir = dir;
  const videos = readdirSync(dir).filter((n) => /\.(mp4|mov)$/.test(n)).sort();
  say(`пакет 9:16: ${dir}; файлы ${videos.join(", ")}; не вошли ${refs.missing.map((x) => `${x.item_id} — ${x.reason}`).join("; ") || "—"}`);
  for (const n of videos) {
    const pr = await ffprobe(join(dir, n));
    say(`  ${n}: ${pr.codec} ${pr.profile ?? ""} ${pr.pixFmt ?? ""} ${pr.width}×${pr.height} ${(pr.durationMs / 1000).toFixed(2)} с`);
    expect(pr).toMatchObject({ width: 1080, height: 1920 });
    if (n.endsWith(".mov")) expect(pr.pixFmt).toMatch(/^yuva/);
  }
  expect(videos.filter((n) => n.endsWith(".mp4"))).toHaveLength(both.length);

  for (const p of both) {
    const mp4v = videos.find((n) => n.startsWith(`${String(p.n).padStart(2, "0")}_`) && n.endsWith(".mp4"))!;
    const vFile = join(TMP, `9x16-${mp4v}`);
    copyOver(join(dir, mp4v), vFile);
    // эталон 16:9 — обычный экспорт MP4 полного размера
    const ej = await wait(enqueue(core.db, { type: "scene.export", projectId, versionId: p.h.version!.id, input: { versionId: p.h.version!.id, request: { format: "mp4", crf: 18, scale: 1 } }, idempotencyKey: `e2e-s10-exp-${newId("run")}` }).job.id, 1000);
    expect(ej.status, JSON.stringify(ej.error)).toBe("completed");
    const ex = exportsRepo.get(core.db, (ej.output_refs as { export_id: string }).export_id)!;
    const hFile = join(TMP, `16x9-${mp4v}`);
    copyOver(join(ROOT, ex.path), hFile);
    const fr = p.item.frames;
    const at = { speech: fr.lead + 2, mid: fr.lead + Math.floor(fr.speech / 2), hold: fr.total - Math.ceil(fr.tail / 2) };
    const name = `${String(p.n).padStart(2, "0")}-${p.item.technique}`;
    for (const [k, f] of Object.entries(at)) {
      for (const [tag, file] of [["16x9", hFile], ["9x16", vFile]] as const) {
        const full = join(TMP, "frames", `${name}-${tag}-${k}-f${f}.png`);
        await run("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-vf", `select=eq(n\\,${f})`, "-vframes", "1", full]);
        await run("/usr/bin/sips", ["-Z", "480", full, "--out", join(EVIDENCE, `${name}-${tag}-${k}-f${f}.png`)]);
      }
      // пара рядом: 16:9 и 9:16 одной высоты 270 (≤ 480 по ширине)
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", join(TMP, "frames", `${name}-16x9-${k}-f${f}.png`), "-i", join(TMP, "frames", `${name}-9x16-${k}-f${f}.png`),
        "-filter_complex", "[0:v]scale=-2:152[a];[1:v]scale=-2:270[b];[a]pad=iw:270:0:59:color=gray[a2];[a2][b]hstack=inputs=2", join(EVIDENCE, `${name}-pair-${k}-f${f}.png`)]);
    }
    // маска интерфейса Shorts: низ 20 % (красный), граница 15 % (жёлтая), колонка кнопок справа (синяя)
    const holdFull = join(TMP, "frames", `${name}-9x16-hold-f${at.hold}.png`);
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", holdFull, "-vf",
      "drawbox=x=0:y=1536:w=1080:h=384:color=red@0.35:t=fill,drawbox=x=0:y=1632:w=1080:h=6:color=yellow@0.9:t=fill,drawbox=x=940:y=1000:w=140:h=536:color=blue@0.25:t=fill,scale=270:480",
      join(EVIDENCE, `safe-area-${name}.png`)]);
  }
  const total = state.pairs.flatMap((p) => [...p.h.jobs, ...p.v.jobs]).reduce((a, j) => a + cost(j.id), 0);
  const summary = {
    project_id: projectId, plan_id: state.planId, package_dir: dir, cost_usd: Number(total.toFixed(2)),
    pairs: state.pairs.map((p) => ({
      item_id: p.item.id, n: p.n, technique: p.item.technique, quote: p.item.quote, frames: p.item.frames,
      h16x9: { version_id: p.h.version?.id ?? null, jobs: p.h.jobs.map((j) => ({ id: j.id, status: j.status, key: j.idempotency_key, cost_usd: Number(cost(j.id).toFixed(2)) })) },
      v9x16: { version_id: p.v.version?.id ?? null, jobs: p.v.jobs.map((j) => ({ id: j.id, status: j.status, key: j.idempotency_key, cost_usd: Number(cost(j.id).toFixed(2)), error: j.error ?? null })) },
    })),
  };
  writeFileSync(join(TMP, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(EVIDENCE, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  say(`итого $${summary.cost_usd}`);
}, T);
