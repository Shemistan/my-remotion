// S3 e2e: план сценария реальным `claude` через bootCore, очередь и раннер на тексте человека
// (`tmp/script-mvp/block-{1,2}.txt`, первая строка — заголовок блока). Хранилище — временный
// каталог SSD (`MS_DATA_DIR`, по умолчанию /Volumes/External SSD/MotionStudio-e2e-script): там
// новый проект на каждый прогон, рабочее хранилище человека не трогается.
// [A] block-1: completed ≤ 5 мин; цитаты проходят `verifyQuote`; blocking = 0; ≥ 3 сцены и ≥ 3
// приёма; есть число 1.24 или 2025; покрытие ≤ 85 % и нет сцен на мета-речи о ролике (ревью S3).
// [A] block-2: числа словами (256, 6,5, 8) не отклонены (`value_mismatch` = 0), ≥ 8 разных приёмов.
// Планы → docs/evidence/script-mvp/plan-block-{1,2}.json, читаемые — tmp/s3-fix/.
// Запуск: `MS_E2E=1 npx vitest run server/test/pipeline/script-plan.e2e.test.ts`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Job, type ScriptPlanRevisionDoc, verifyQuote } from "@ms/contracts";
import { MARKER_FILE, initStore, macosProbe } from "@ms/core";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type Core, bootCore } from "../../src/boot.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue } from "../../src/jobs/queue.js";
import type { ScriptPlanResult } from "../../src/pipeline/script-plan.js";
import { currentScriptPlan } from "../../src/script/read.js";
import { saveScriptText } from "../../src/script/text.js";
import { newId } from "../../src/scenes/ids.js";

const T = 15 * 60_000;
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const ROOT = process.env.MS_DATA_DIR ?? "/Volumes/External SSD/MotionStudio-e2e-script";
const EVIDENCE = join(REPO, "docs/evidence/script-mvp");
const TMP = join(REPO, "tmp/s3-fix");

let core: Core;
let guard: ConstructorParameters<typeof ArtifactStore>[0]["guard"];
const mine = new Set<string>();

beforeAll(async () => {
  expect(existsSync("/Volumes/External SSD") || process.env.MS_DATA_DIR !== undefined, "внешний SSD не подключён").toBe(true);
  if (!existsSync(join(ROOT, MARKER_FILE))) await initStore(ROOT, macosProbe, {});
  core = await bootCore({
    env: { PATH: process.env.PATH, HOME: process.env.HOME, MS_DATA_DIR: ROOT },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => {
      guard = svc.storageCheck;
      return registerHandlers(svc, { log: (l) => console.log(`  ${l}`) });
    },
  });
}, T);
afterAll(async () => {
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

/** Блок текста человека: первая строка — заголовок, остальное — текст. */
function block(n: number): { title: string; text: string } {
  const [title, ...rest] = readFileSync(join(REPO, `tmp/script-mvp/block-${n}.txt`), "utf8").split("\n");
  return { title: title!.trim(), text: rest.join("\n").trim() };
}

/** Читаемый план: сцена, приём, форма, цитата, идея, числа; пропуски. */
function readablePlan(doc: ScriptPlanRevisionDoc): string {
  const L: string[] = [];
  for (const x of doc.items) {
    const sec = (x.frames.speech / doc.fps.num * doc.fps.den).toFixed(1);
    L.push(`${x.id} ${x.technique} / ${x.pattern}${x.structure_rule ? ` / ${x.structure_rule}` : ""} · ${x.words} слов ≈ ${sec} с`);
    L.push(`   «${x.quote}»`);
    L.push(`   идея: ${x.idea}`);
    L.push(`   зачем: ${x.purpose}`);
    if (x.data.length) L.push(`   числа: ${x.data.map((d) => `${d.label}=${d.value}${d.unit ? ` ${d.unit}` : ""} («${d.quote}»)`).join("; ")}`);
  }
  for (const s of doc.skipped) L.push(`SKIP ${s.start_word_id}–${s.end_word_id} «${s.quote.slice(0, 90)}» — ${s.reason}`);
  for (const i of doc.issues) L.push(`ISSUE ${i.severity} ${i.code}${i.item_id ? ` ${i.item_id}` : ""}: ${i.message}`);
  return L.join("\n");
}

async function planOf(n: number): Promise<{ doc: ScriptPlanRevisionDoc; res: ScriptPlanResult; s: number; words: { id: string; text: string }[] }> {
  const projectId = projects.create(core.db, { kind: "script", title: `e2e S3 block-${n} ${new Date().toISOString()}` }).id;
  const store = new ArtifactStore({ root: ROOT, db: core.db, guard });
  const script = await saveScriptText({ db: core.db, store, root: ROOT }, projectId, { blocks: [block(n)] });
  const t0 = Date.now();
  const id = enqueue(core.db, { type: "script.plan", projectId, input: { projectId }, idempotencyKey: `e2e-s3-${newId("run")}` }).job.id;
  const j = await wait(id);
  const s = (Date.now() - t0) / 1000;
  expect(j.status, JSON.stringify(j.error)).toBe("completed");
  const doc = currentScriptPlan(core.db, ROOT, projectId)!.doc;
  const res = j.output_refs as ScriptPlanResult;
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, `plan-block-${n}.json`), JSON.stringify(doc, null, 2) + "\n");
  writeFileSync(join(TMP, `plan-block-${n}.txt`), `${s.toFixed(0)} с, $${res.agent.cost_usd}, вызовов ${res.agent.calls}, переотправок ${res.agent.retried}\n\n${readablePlan(doc)}\n`);
  console.log(`block-${n}: ${s.toFixed(0)} с, $${res.agent.cost_usd}, вызовов ${res.agent.calls}\n${readablePlan(doc)}`);
  return { doc, res, s, words: script.words };
}

/** Мета-речь о ролике в block-1 (ревью S3): на этих фразах сцен быть не должно. */
const META = ["План такой", "ссылки будут в описании", "И чек-лист", "не буду угадывать"];
const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

it("[A] block-1: план за ≤ 5 мин, цитаты дословны, без blocking, ≥ 3 сцены и приёма, число 1.24 или 2025, покрытие ≤ 85 %, без мета-речи", async () => {
  const { doc, s, words } = await planOf(1);
  expect(s).toBeLessThanOrEqual(300);
  for (const x of doc.items) expect(verifyQuote(words, x.start_word_id, x.end_word_id, x.quote), x.id).toEqual({ ok: true });
  expect(doc.issues.filter((x) => x.severity === "blocking")).toEqual([]);
  expect(doc.items.length).toBeGreaterThanOrEqual(3);
  expect(new Set(doc.items.map((x) => x.technique)).size).toBeGreaterThanOrEqual(3);
  expect(doc.items.some((x) => x.data.some((d) => d.value === 1.24 || d.value === 2025))).toBe(true);
  const covered = doc.items.reduce((a, x) => a + x.words, 0) / words.length;
  expect(covered, `покрытие ${Math.round(covered * 100)} %`).toBeLessThanOrEqual(0.85);
  for (const m of META) expect(doc.items.filter((x) => norm(x.quote).includes(norm(m))).map((x) => x.id), m).toEqual([]);
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, "plan-block-1.json"), JSON.stringify(doc, null, 2) + "\n");
}, T);

it("[A] block-2: числа словами не отклонены (value_mismatch = 0), ≥ 8 разных приёмов", async () => {
  const { doc } = await planOf(2);
  expect(doc.skipped.filter((x) => x.reason.startsWith("отклонено проверкой (value_mismatch)"))).toEqual([]);
  expect(doc.items.length).toBeGreaterThanOrEqual(3);
  expect(new Set(doc.items.map((x) => x.technique)).size).toBeGreaterThanOrEqual(8);
  expect(doc.issues.filter((x) => x.severity === "blocking")).toEqual([]);
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(join(EVIDENCE, "plan-block-2.json"), JSON.stringify(doc, null, 2) + "\n");
}, T);
