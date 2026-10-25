// S7: задача `script.package` — экспорты сцен по одному (фейковый exportOne), папка
// `packages/<id>` с жёсткими ссылками на экспорты, шпаргалка, манифест, fencing, повтор.
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_READING, type Fps, type ProjectStyleBase, type QAReport, type ScriptPlanRevisionDoc, type ScriptRevisionDoc,
  type ScriptSceneItem, ScriptPackageDtoSchema, ScriptPackageManifestSchema, defaultSettings, quoteOf, readingFrames, tokenizeScript,
} from "@ms/contracts";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptPackages, scriptPlans, scriptRevisions, scriptScenes, scripts } from "../../src/db/repos/script.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue, fenceOk, finish } from "../../src/jobs/queue.js";
import { Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import type { ExportOneInput } from "../../src/pipeline/scene-export.js";
import { type ScriptPackageDeps, exportFailedReason, packagesForState, scriptPackage } from "../../src/pipeline/script-package.js";
import { sha256File } from "../../src/scenes/hash.js";
import { newId } from "../../src/scenes/ids.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { QUARANTINE, exportRel } from "../../src/scenes/store.js";
import { itemFingerprint } from "../../src/script/fingerprint.js";
import { OVERLAY_IMPOSSIBLE } from "../../src/script/overlay-check.js";
import { SCRIPT_FILE, SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, type JobsEnv } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { okStatus } from "./helpers.js";

// какие файлы хешировались (M3: только экспорт совпавшего запроса)
const hashed = vi.hoisted(() => [] as string[]);
vi.mock("../../src/scenes/hash.js", async (orig) => {
  const real = await orig<typeof import("../../src/scenes/hash.js")>();
  return {
    ...real,
    sha256File: (path: string, ...rest: unknown[]) => {
      hashed.push(path);
      return (real.sha256File as (p: string, ...r: unknown[]) => Promise<string>)(path, ...rest);
    },
  };
});

const P = "p_pkg";
const events: { kind: string; message: string; data?: unknown }[] = [];
const SHA = "a".repeat(64);
const F30: Fps = { num: 30, den: 1 };
const TEXT = "Три вопроса, которые пережили смену реализации. Ключ проходит через хэш. Слот выбирают старшие биты. Группа держит восемь слотов.";
const BASE: ProjectStyleBase = { preset: "dark-premium", intensity: "balanced", depth: 2 };

let env: JobsEnv;
let repo: SceneRepo;
let script: ScriptRevisionDoc;
let styleRef: { id: string; revision: number };
let items: ScriptSceneItem[];
const sceneOf = new Map<string, string>();
const versionOf = new Map<string, string>();

function makeItems(): ScriptSceneItem[] {
  const bounds = [[1, 6], [7, 10], [11, 14], [15, 18]] as const;
  return bounds.map(([s, e], k) => {
    const start = `w_${String(s).padStart(6, "0")}`;
    const end = `w_${String(e).padStart(6, "0")}`;
    return {
      id: `ss_00${k + 1}`, status: "accepted", origin: "agent", start_word_id: start, end_word_id: end, quote: quoteOf(script, start, end), block_id: "b1",
      words: e - s + 1, at_s: k * 2.4, frames: readingFrames(e - s + 1, DEFAULT_READING, F30), technique: "hero-number", pattern: "quantities",
      purpose: "п", idea: "и", key_terms: [], data: [], importance: 2, anchor_ids: [],
    };
  });
}

function planDoc(): ScriptPlanRevisionDoc {
  return {
    schema_version: 1, plan_id: "pln_p", revision: 1,
    inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: styleRef.id, revision: 1, hash: SHA } },
    fps: F30, aspect: "16:9", reading: DEFAULT_READING,
    analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
    // rejected-сцена номер не занимает; порядок — по тексту, не по id
    items: [items[1]!, items[0]!, { ...items[0]!, id: "ss_009", status: "rejected" }, items[2]!, items[3]!],
    skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 },
  };
}

let gen = 0;
/** Готовая версия сцены через draft попытки фиктивной задачи генерации. */
async function publishVersion(sceneId: string, qa?: QAReport, reference?: string, durationFrames?: number): Promise<string> {
  const input = { n: ++gen, ...(reference ? { script: { reference_version_id: reference } } : {}) };
  const job = enqueue(env.db, { type: "playground.generate", projectId: P, sceneId, input, idempotencyKey: `gen${gen}` }).job;
  const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 9 }, { ids: new Set([job.id]) })!;
  const draft = await makeDraft(env.s.root, { runId: job.id, attempt: c.attempt, sceneId, projectId: P });
  if (qa) writeFileSync(join(draft.dir, "qa.json"), JSON.stringify(qa));
  // длительность версии — по плану (как у генерации сцены сценария), если тест не задал другую
  const item = items.find((x) => sceneOf.get(x.id) === sceneId);
  const settings = { ...defaultSettings(), duration_frames: durationFrames ?? item?.frames.total ?? defaultSettings().duration_frames };
  const v = await repo.publish(draft, meta(sceneId, { settings }), { jobId: job.id, attempt: c.attempt });
  finish(env.db, job.id, c.attempt, { status: "completed", outputRefs: { version_id: v.versionId } });
  return v.versionId;
}

beforeEach(async () => {
  env = await setupDb("ms-script-package-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  const store = new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard });
  projects.create(env.db, { id: P, kind: "script", title: "Go map", settings: defaultSettings() });
  script = { schema_version: 1, script_id: "scr_1", revision: 1, ...tokenizeScript([{ title: "Блок 1", text: TEXT }]), author: "user" };
  scripts.create(env.db, { id: "scr_1", project_id: P });
  const rel = `${artifactPaths(env.s.root, P).scriptRev("scr_1", 1)}/${SCRIPT_FILE}`;
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), JSON.stringify(script));
  scriptRevisions.insert(env.db, { script_id: "scr_1", revision: 1, rel_path: rel, sha256: SHA, hash: SHA });
  scripts.setCurrent(env.db, "scr_1", 1);
  const style = await saveProjectStyle({ db: env.db, store, root: env.s.root }, P, BASE, "user");
  styleRef = { id: style.style_id, revision: style.revision };
  items = makeItems();
  scriptPlans.create(env.db, { id: "pln_p", project_id: P });
  const doc = planDoc();
  const prel = `${artifactPaths(env.s.root, P).planRev("pln_p", 1)}/${SCRIPT_PLAN_FILE}`;
  mkdirSync(dirname(join(env.s.root, prel)), { recursive: true });
  writeFileSync(join(env.s.root, prel), JSON.stringify(doc));
  scriptPlans.insertRevision(env.db, { doc, rel_path: prel, sha256: SHA });
  sceneOf.clear();
  versionOf.clear();
  events.length = 0;
  hashed.length = 0;
  for (const it of items) {
    const scene = repo.createScene(P, { prompt: it.quote, settings: defaultSettings() });
    sceneOf.set(it.id, scene.id);
    // ss_004: отпечаток сцены плана изменился после генерации
    scriptScenes.insert(env.db, {
      project_id: P, plan_id: "pln_p", item_id: it.id, aspect: "16:9", scene_id: scene.id, batch_id: null, job_id: null,
      item_fingerprint: it.id === "ss_004" ? "old" : itemFingerprint(it, styleRef),
    });
    if (it.id !== "ss_002") versionOf.set(it.id, await publishVersion(scene.id));
  }
});
afterEach(async () => {
  env.db.close();
  await removeStore(env.s);
});

interface Call extends ExportOneInput {
  jobId: string;
  attempt: number;
}

/** Фейковый exportOne: публикует экспорт как настоящий (каталог a-w, манифест, строка) или падает. */
function fakeExport(o: { fail?: (c: Call) => string | undefined } = {}) {
  const calls: Call[] = [];
  const fn = async (ctx: JobContext, _d: unknown, input: ExportOneInput): Promise<HandlerResult> => {
    const call = { ...input, jobId: ctx.job.id, attempt: ctx.attempt };
    calls.push(call);
    const msg = o.fail?.(call);
    if (msg) return { status: "failed", error: { code: "pipeline", stage: "export", message: msg } };
    const id = newId("exp");
    const ext = input.request.format === "prores4444" ? "mov" : "mp4";
    const dir = join(env.s.root, exportRel(P, id));
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `scene.${ext}`);
    writeFileSync(file, `video ${input.versionId} ${ext}`);
    const prores = ext === "mov";
    const ffprobe = { durationMs: 3000, width: 1920, height: 1080, fps: F30, codec: prores ? "prores" : "h264", ...(prores ? { pixFmt: "yuva444p12le", profile: "4444" } : { audioCodec: "aac" }) };
    writeFileSync(join(dir, "export-manifest.json"), JSON.stringify({ request: input.request, ffprobe, ...(prores ? { warnings: ["overlay_haze: дымка"] } : {}) }));
    for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o444);
    chmodSync(dir, 0o555);
    const sha256 = await sha256File(file);
    exportsRepo.insert(env.db, { id, version_id: input.versionId, job_id: ctx.job.id, format: input.request.format, path: `${exportRel(P, id)}/scene.${ext}`, sha256 });
    return { status: "completed", outputRefs: { export_id: id, sha256, ffprobe } };
  };
  return { fn, calls };
}

let k = 0;
function ctxOf(jobId: string, attempt: number): JobContext {
  const job = jobs.get(env.db, jobId)!;
  return {
    db: env.db, job, attempt, signal: new AbortController().signal,
    run: { root: env.s.root, runId: job.id, attempt, registry: { add: async () => undefined, end: async () => undefined, live: async () => [] } },
    emit: (kind, message, data) => void events.push({ kind, message, data }), progress: () => undefined, fenceOk: () => fenceOk(env.db, job.id, attempt),
    agents: new Semaphore(2), renders: new Semaphore(1), heavy: new Semaphore(1),
  };
}

function deps(exp: ReturnType<typeof fakeExport>, over: Partial<ScriptPackageDeps> = {}): ScriptPackageDeps {
  return {
    root: env.s.root, storage: () => okStatus(env.s.root), exporter: { repo, deps: () => { throw new Error("не вызывается"); } },
    exportOne: exp.fn as ScriptPackageDeps["exportOne"], ...over,
  };
}

/** Новая задача (или новая попытка той же) → обработчик. */
async function run(d: ScriptPackageDeps, jobId?: string, aspect: "16:9" | "9:16" = "16:9") {
  const id = jobId ?? enqueue(env.db, { type: "script.package", projectId: P, input: { projectId: P, aspect }, idempotencyKey: `pk${++k}` }).job.id;
  if (jobId) {
    releaseLocks(env.db, jobs.get(env.db, id)!);
    jobs.update(env.db, id, { status: "pending", lease_owner: null, lease_until: null });
  }
  const c = claimNext(env.db, "srv", Date.now(), { running: 0, maxRunning: 9 }, { ids: new Set([id]) })!;
  const r = await scriptPackage(() => d)(ctxOf(id, c.attempt));
  finish(env.db, id, c.attempt, r); // как раннер; у устаревшей попытки — без последствий
  return { id, attempt: c.attempt, r };
}

type Refs = { package_id: string; rel_path: string; files: number; missing: { item_id: string; reason: string }[] };
const refsOf = (r: HandlerResult) => (r as { outputRefs: Refs }).outputRefs;

describe("scriptPackage", () => {
  it("S10 fix I3: 9:16 — двойник не по текущей 16:9-версии → missing «сцена устарела»; по текущей — в папке", async () => {
    for (const id of ["ss_001", "ss_003"]) {
      const it = items.find((x) => x.id === id)!;
      const twin = repo.createScene(P, { prompt: `${it.quote} 9:16`, settings: defaultSettings() });
      scriptScenes.insert(env.db, { project_id: P, plan_id: "pln_p", item_id: id, aspect: "9:16", scene_id: twin.id, batch_id: null, job_id: null, item_fingerprint: itemFingerprint(it, styleRef) });
      // ss_001 — по текущей 16:9; ss_003 — по прежней (16:9 перегенерирована позже)
      await publishVersion(twin.id, undefined, id === "ss_001" ? versionOf.get(id)! : "ver_old");
    }
    const exp = fakeExport();
    const { r } = await run(deps(exp), undefined, "9:16");
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const missing = refsOf(r).missing;
    expect(missing).toEqual(expect.arrayContaining([{ item_id: "ss_003", reason: "сцена устарела" }]));
    expect(missing.map((m) => m.item_id)).not.toContain("ss_001");
  });

  it("4 сцены: нет версии, сбой экспорта, устарела → missing; папка: ссылки на экспорты, шпаргалка, манифест, a-w", async () => {
    const exp = fakeExport({ fail: (c) => (c.versionId === versionOf.get("ss_003") ? "экспорт не удался: media: кодек упал" : undefined) });
    const { id: jobId, r } = await run(deps(exp));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const refs = refsOf(r);
    // номера — позиции среди принятых сцен по тексту (ss_001 → 1, хотя в плане он второй)
    expect(refs).toMatchObject({
      files: 1,
      missing: [
        { item_id: "ss_002", reason: "нет готовой версии" },
        { item_id: "ss_003", reason: expect.stringMatching(/^экспорт не удался: кодек упал/) },
        { item_id: "ss_004", reason: "сцена устарела" },
      ],
    });
    for (const m of refs.missing) expect(m.reason).not.toMatch(/ss_|[a-z]+_[a-z]+:|media:/);
    expect(refs.package_id).toBe(`pkg_${jobId.slice(4)}`);
    expect(refs.rel_path).toBe(artifactPaths(env.s.root, P).package(refs.package_id));
    const pkgDir = join(env.s.root, refs.rel_path);
    expect(readdirSync(pkgDir).sort()).toEqual([
      "01_tri-voprosa-kotorye-perezhili-smenu.mp4", "01_tri-voprosa-kotorye-perezhili-smenu_alpha.mov",
      "package-manifest.json", "шпаргалка.csv", "шпаргалка.md", "шпаргалка.txt",
    ]);
    // draft у каждого экспорта свой; ss_001 ×2 + ss_003 ×1 (сбой mp4 — альфа не делается)
    expect(new Set(exp.calls.map((c) => c.draftKey)).size).toBe(exp.calls.length);
    expect(exp.calls.map((c) => c.draftKey)).toEqual(["1-mp4", "1-alpha", "3-mp4"]);
    expect(exp.calls[0]!.request).toEqual({ format: "mp4", crf: 18, scale: 1 });
    expect(exp.calls[1]!.request).toEqual({ format: "prores4444", crf: 18, scale: 1, overlay: true });
    expect(exp.calls[1]!.frames).toEqual(items[0]!.frames);
    // жёсткие ссылки: общий inode с файлом экспорта
    const [mp4Row, movRow] = exportsRepo.listByVersion(env.db, versionOf.get("ss_001")!);
    const exportFile = join(env.s.root, mp4Row!.path);
    expect(statSync(join(pkgDir, "01_tri-voprosa-kotorye-perezhili-smenu.mp4")).ino).toBe(statSync(exportFile).ino);
    expect(statSync(join(pkgDir, "01_tri-voprosa-kotorye-perezhili-smenu_alpha.mov")).ino).toBe(statSync(join(env.s.root, movRow!.path)).ino);
    for (const f of [".", ...readdirSync(pkgDir)]) expect(statSync(join(pkgDir, f)).mode & 0o222, f).toBe(0);

    const m = ScriptPackageManifestSchema.parse(JSON.parse(readFileSync(join(pkgDir, "package-manifest.json"), "utf8")));
    expect(m).toMatchObject({
      package_id: refs.package_id, project_id: P, project_title: "Go map", aspect: "16:9", script: { id: "scr_1", revision: 1 }, plan: { id: "pln_p", revision: 1 },
      reading: DEFAULT_READING,
    });
    expect(m.name).toMatch(/^Go map_16x9_\d{4}-\d{2}-\d{2}$/);
    expect(m.scenes).toHaveLength(1);
    expect(m.scenes[0]).toMatchObject({
      n: 1, item_id: "ss_001", scene_id: sceneOf.get("ss_001"), version_id: versionOf.get("ss_001"), block_id: "b1",
      mp4: { file: "01_tri-voprosa-kotorye-perezhili-smenu.mp4", export_id: mp4Row!.id, sha256: mp4Row!.sha256, ffprobe: { codec: "h264" } },
      alpha: { export_id: movRow!.id, ffprobe: { codec: "prores" } },
    });
    expect(m.scenes[0]!.warnings).toContain("overlay_haze: дымка");
    expect(m.missing.map((x) => x.item_id)).toEqual(["ss_002", "ss_003", "ss_004"]);

    // шпаргалка: все принятые сцены по порядку, пропущенные — «нет сцены»
    const txt = readFileSync(join(pkgDir, "шпаргалка.txt"), "utf8").trimEnd().split("\n");
    expect(txt).toHaveLength(4);
    expect(txt[0]).toMatch(/^01 · 0:00 · «Три вопроса, которые пережили смену реализации\.?» · \d+,\d с \(запас 0,5 \/ 1,0\)$/);
    expect(txt[1]).toBe(`02 · 0:02 · «${items[1]!.quote}» · нет сцены: нет готовой версии`);
    expect(readFileSync(join(pkgDir, "шпаргалка.csv"), "utf8").startsWith("\uFEFF№;")).toBe(true);
    expect(readFileSync(join(pkgDir, "шпаргалка.md"), "utf8")).toMatch(/^## Блок 1/m);

    // строка пакета и DTO для scriptState
    expect(scriptPackages.get(env.db, refs.package_id)).toMatchObject({ project_id: P, job_id: jobId, aspect: "16:9", rel_path: refs.rel_path });
    const [dto] = packagesForState(env.db, env.s.root, P);
    expect(ScriptPackageDtoSchema.parse(dto)).toMatchObject({
      id: refs.package_id, aspect: "16:9", rel_path: refs.rel_path, abs_path: pkgDir, display_name: m.name,
      files: [{ n: 1, item_id: "ss_001", mp4: "01_tri-voprosa-kotorye-perezhili-smenu.mp4", alpha: "01_tri-voprosa-kotorye-perezhili-smenu_alpha.mov", sha256: { mp4: mp4Row!.sha256, alpha: movRow!.sha256 } }],
      missing: refs.missing,
    });
  });

  it("повторная сборка: готовые экспорты тех же запросов переиспользуются; пакеты — новые первыми", async () => {
    const exp = fakeExport();
    const first = await run(deps(exp));
    expect(first.r.status).toBe("completed");
    const n1 = exp.calls.length;
    expect(n1).toBe(4); // ss_001 и ss_003 ×2
    const second = await run(deps(exp));
    expect(second.r.status).toBe("completed");
    expect(exp.calls.length).toBe(n1);
    expect(packagesForState(env.db, env.s.root, P).map((p) => p.id)).toEqual([refsOf(second.r).package_id, refsOf(first.r).package_id]);
  });

  it("альфа невозможна (overlay_opaque в QA версии): MP4 в папке, alpha null, сцена и в missing", async () => {
    const sid = sceneOf.get("ss_001")!;
    const qa: QAReport = {
      gate: { technical: "pass", visual: "warn", semantic: "not_checked", style: "not_checked" }, checked_frames: [0], ocr: [], automated: true,
      issues: [{ source: "programmatic", code: "overlay_opaque", severity: "warning", description: "сцена рисует свой фон", fix_hint: "фон — только Background" }],
    };
    versionOf.set("ss_001", await publishVersion(sid, qa));
    const exp = fakeExport({ fail: (c) => (c.versionId === versionOf.get("ss_003") && c.request.format === "prores4444" ? "overlay_opaque: сцена рисует свой фон — альфа-версия непрозрачна на 99.0 %" : undefined) });
    const { r } = await run(deps(exp));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const refs = refsOf(r);
    expect(refs.files).toBe(2);
    expect(refs.missing).toEqual([
      { item_id: "ss_001", reason: OVERLAY_IMPOSSIBLE },
      { item_id: "ss_002", reason: "нет готовой версии" },
      { item_id: "ss_003", reason: OVERLAY_IMPOSSIBLE },
      { item_id: "ss_004", reason: "сцена устарела" },
    ]);
    expect(exp.calls.filter((c) => c.versionId === versionOf.get("ss_001")).map((c) => c.request.format)).toEqual(["mp4"]);
    const pkg = packagesForState(env.db, env.s.root, P)[0]!;
    expect(pkg.files.map((f) => [f.n, f.alpha, f.sha256.alpha])).toEqual([[1, null, null], [3, null, null]]);
    const pkgDir = join(env.s.root, refs.rel_path);
    expect(readdirSync(pkgDir).filter((f) => f.endsWith(".mov"))).toEqual([]);
    expect(readFileSync(join(pkgDir, "шпаргалка.md"), "utf8")).toContain(OVERLAY_IMPOSSIBLE);
  });

  it("F8: в шпаргалке — короткие фразы по кодам QA (≤ 3 на сцену, без id элементов); полные тексты — в манифесте", async () => {
    const sid = sceneOf.get("ss_001")!;
    const long = (code: string, area: string) => ({
      source: "agent" as const, code, severity: "warning" as const, area,
      description: `На кадре 39 элемент ${area} (card-3, node-ptr) занимает половину ширины, и это видно на кадрах 120–180; подробное описание дефекта на несколько предложений. Ещё одно предложение.`,
      fix_hint: "поправь",
    });
    const qa: QAReport = {
      gate: { technical: "pass", visual: "warn", semantic: "warn", style: "pass" }, checked_frames: [0], ocr: [], automated: true,
      issues: [long("no_hero", "hero-num"), long("composition", "left-stack"), long("no_hero", "card-3"), long("rhythm", "byte-strip"), long("frame0_coverage", "bg"), long("some_new_code", "x-1")],
    };
    versionOf.set("ss_001", await publishVersion(sid, qa));
    const { r } = await run(deps(fakeExport()));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const pkgDir = join(env.s.root, refsOf(r).rel_path);
    const md = readFileSync(join(pkgDir, "шпаргалка.md"), "utf8");
    const line = md.split("\n").find((l) => l.startsWith("| 01 |"))!;
    const notes = line.split(" | ").at(-1)!.replace(/\s*\|$/, "").split("; ");
    // фон-дымка альфы (экспорт) не влезла: сначала три кода QA по порядку, повтор кода — одна фраза
    expect(notes).toEqual(["нет главного героя", "композиция неровная", "рваный ритм"]);
    for (const n of notes) {
      expect(n.length).toBeLessThanOrEqual(60);
      expect(n).toMatch(/^[а-яё ,.:«»()%\d—-]+$/iu);
    }
    expect(md).not.toMatch(/card-3|node-ptr|hero-num/);
    const csv = readFileSync(join(pkgDir, "шпаргалка.csv"), "utf8");
    expect(csv).not.toMatch(/card-3|подробное описание/);
    // манифест — полные тексты
    const m = ScriptPackageManifestSchema.parse(JSON.parse(readFileSync(join(pkgDir, "package-manifest.json"), "utf8")));
    expect(m.scenes[0]!.warnings.filter((w) => w.includes("подробное описание дефекта"))).toHaveLength(6);
  });

  it("F7: длительность версии не по плану — в манифест и шпаргалку из файла версии и замечание", async () => {
    const sid = sceneOf.get("ss_001")!;
    const plan = items[0]!.frames;
    versionOf.set("ss_001", await publishVersion(sid, undefined, undefined, plan.total + 71));
    const { r } = await run(deps(fakeExport()));
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const pkgDir = join(env.s.root, refsOf(r).rel_path);
    const m = ScriptPackageManifestSchema.parse(JSON.parse(readFileSync(join(pkgDir, "package-manifest.json"), "utf8")));
    expect(m.scenes[0]!.frames).toEqual({ lead: plan.lead, speech: plan.speech, tail: plan.tail + 71, total: plan.total + 71 });
    const s = (f: number) => (f / 30).toFixed(1).replace(".", ",");
    const note = `длительность не по плану: ${s(plan.total + 71)} с вместо ${s(plan.total)} с`;
    expect(m.scenes[0]!.warnings).toContain(`duration_off_plan: ${note}`);
    const txt = readFileSync(join(pkgDir, "шпаргалка.txt"), "utf8").split("\n");
    expect(txt[0]).toMatch(new RegExp(`· ${s(plan.total + 71)} с \\(запас 0,5 / ${s(plan.tail + 71)}\\)$`));
    const md = readFileSync(join(pkgDir, "шпаргалка.md"), "utf8");
    expect(md.split("\n").find((l) => l.startsWith("| 01 |"))).toContain(note);
    // сцена по плану — без замечания
    expect(md.split("\n").find((l) => l.startsWith("| 03 |"))).not.toContain("длительность не по плану");
  });

  it("ни одной сцены в папке → failed package_empty, каталога нет", async () => {
    const exp = fakeExport({ fail: () => "экспорт не удался: render: упал" });
    const { r } = await run(deps(exp));
    expect(r).toMatchObject({ status: "failed", error: { code: "package_empty" } });
    expect(existsSync(join(env.s.root, artifactPaths(env.s.root, P).project, "packages"))).toBe(false);
    expect(scriptPackages.listByProject(env.db, P)).toEqual([]);
  });

  it("fenced-out попытка: draft в карантине, строки нет, файл экспорта по-прежнему a-w; следующая попытка публикует", async () => {
    const exp = fakeExport();
    let bumped = false;
    const d = deps(exp, {
      beforePublish: (ctx) => {
        if (bumped) return;
        bumped = true;
        jobs.update(env.db, ctx.job.id, { attempt: ctx.attempt + 1 }); // сервер отдал задачу другой попытке
      },
    });
    const a1 = await run(d);
    expect(a1.r).toMatchObject({ status: "failed", error: { code: "fenced_out" } });
    expect(scriptPackages.listByProject(env.db, P)).toEqual([]);
    const draft = join(env.s.root, "workspace/drafts", `${a1.id}-a${a1.attempt}`);
    expect(existsSync(join(draft, QUARANTINE))).toBe(true);
    // медиафайлы (жёсткие ссылки на экспорты) убраны из draft до карантина
    expect(readdirSync(draft).filter((f) => /\.(mp4|mov)$/.test(f))).toEqual([]);
    const exportFile = join(env.s.root, exportsRepo.listByVersion(env.db, versionOf.get("ss_001")!)[0]!.path);
    expect(statSync(exportFile).mode & 0o222).toBe(0);
    expect(existsSync(join(env.s.root, artifactPaths(env.s.root, P).package(`pkg_${a1.id.slice(4)}`)))).toBe(false);

    const a2 = await run(d, a1.id);
    expect(a2.r.status, JSON.stringify(a2.r)).toBe("completed");
    expect(exp.calls.length).toBe(4); // экспорты первой попытки переиспользованы
    expect(refsOf(a2.r).package_id).toBe(`pkg_${a1.id.slice(4)}`);
  });

  it("восстановление: попытка после публикации пакета (сбой до finish) возвращает тот же пакет без экспортов; сирота без строки — в карантин", async () => {
    const exp = fakeExport();
    const a1 = await run(deps(exp));
    expect(a1.r.status).toBe("completed");
    const calls = exp.calls.length;
    const a2 = await run(deps(exp), a1.id);
    expect(a2.r).toEqual(a1.r);
    expect(exp.calls.length).toBe(calls);

    // сирота: каталог пакета есть, строки нет (rename прошёл, COMMIT — нет)
    const job = enqueue(env.db, { type: "script.package", projectId: P, input: { projectId: P, aspect: "16:9" }, idempotencyKey: "orphan" }).job;
    const orphan = join(env.s.root, artifactPaths(env.s.root, P).package(`pkg_${job.id.slice(4)}`));
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "мусор.txt"), "x");
    const a3 = await run(deps(exp), job.id);
    expect(a3.r.status, JSON.stringify(a3.r)).toBe("completed");
    expect(readdirSync(orphan)).not.toContain("мусор.txt");
    expect(readdirSync(join(env.s.root, "workspace/quarantine/artifacts"))).toHaveLength(1);
  });

  it("отмена или хранилище при экспорте — итог задачи, не missing", async () => {
    const exp = fakeExport();
    const d = deps(exp, { exportOne: async () => ({ status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "экспорт отменён" } }) });
    expect((await run(d)).r).toMatchObject({ status: "cancelled" });
    const off = deps(exp, { storage: async () => ({ ok: false, reason: "not_found", detail: "SSD отключён" }) });
    expect((await run(off)).r).toMatchObject({ status: "failed", error: { code: "storage_unavailable" } });
  });

  /** Файлы всех экспортов версий проекта. */
  const exportFiles = () => [...versionOf.values()].flatMap((v) => exportsRepo.listByVersion(env.db, v).map((r) => join(env.s.root, r.path)));

  it("отмена перед публикацией: медиа убраны из draft до карантина, уборка draft не снимает a-w с экспортов", async () => {
    const exp = fakeExport();
    const d = deps(exp, { beforePublish: (ctx) => void env.db.prepare("UPDATE jobs SET cancel_requested = 1 WHERE id = ?").run(ctx.job.id) });
    const a = await run(d);
    expect(a.r).toMatchObject({ status: "cancelled" });
    const draft = join(env.s.root, "workspace/drafts", `${a.id}-a${a.attempt}`);
    expect((JSON.parse(readFileSync(join(draft, QUARANTINE), "utf8")) as { reason: string }).reason).toMatch(/^cancelled/);
    expect(readdirSync(draft).filter((f) => /\.(mp4|mov)$/.test(f))).toEqual([]);
    expect(exportFiles().length).toBe(4);
    const out = await repo.cleanupDrafts([]);
    expect(out.removed).toContain(draft);
    for (const f of exportFiles()) expect(statSync(f).mode & 0o222, f).toBe(0);
  });

  it("уборка draft прерванной попытки с жёсткими ссылками на экспорты: экспорты остаются a-w", async () => {
    const exp = fakeExport();
    expect((await run(deps(exp))).r.status).toBe("completed");
    const [exportFile] = exportFiles();
    const draft = join(env.s.root, "workspace/drafts", "job_dead-a1");
    mkdirSync(join(draft, "sub"), { recursive: true });
    linkSync(exportFile!, join(draft, "01_x.mp4"));
    linkSync(exportFile!, join(draft, "sub", "01_x.mp4"));
    writeFileSync(join(draft, QUARANTINE), JSON.stringify({ reason: "interrupted: сервер упал во время сборки" }));
    chmodSync(join(draft, "sub"), 0o555);
    chmodSync(draft, 0o555);
    const out = await repo.cleanupDrafts([]);
    expect(out.removed).toContain(draft);
    expect(existsSync(draft)).toBe(false);
    expect(statSync(exportFile!).mode & 0o222).toBe(0);
  });

  it("сбой после COMMIT до запечатывания корня: восстановление закрывает корень пакета от записи", async () => {
    const exp = fakeExport();
    const a1 = await run(deps(exp));
    const dir = join(env.s.root, refsOf(a1.r).rel_path);
    chmodSync(dir, 0o755);
    const a2 = await run(deps(exp), a1.id);
    expect(a2.r).toEqual(a1.r);
    expect(statSync(dir).mode & 0o222).toBe(0);
  });

  it("готовый экспорт ищется по манифесту: хешируется только файл совпавшего запроса", async () => {
    const exp = fakeExport();
    expect((await run(deps(exp))).r.status).toBe("completed");
    // экспорт той же версии и формата с другим запросом — новее, проверяется первым
    const vid = versionOf.get("ss_001")!;
    const id = newId("exp");
    const dir = join(env.s.root, exportRel(P, id));
    mkdirSync(dir, { recursive: true });
    const other = join(dir, "scene.mp4");
    writeFileSync(other, "другой запрос");
    writeFileSync(join(dir, "export-manifest.json"), JSON.stringify({ request: { format: "mp4", crf: 28, scale: 0.5 }, ffprobe: { durationMs: 1, width: 960, height: 540, fps: F30, codec: "h264" } }));
    exportsRepo.insert(env.db, { id, version_id: vid, job_id: null, format: "mp4", path: `${exportRel(P, id)}/scene.mp4`, sha256: SHA });
    hashed.length = 0;
    const calls = exp.calls.length;
    expect((await run(deps(exp))).r.status).toBe("completed");
    expect(exp.calls.length).toBe(calls);
    expect(hashed).not.toContain(other);
    expect(hashed.length).toBe(4); // по одному совпавшему экспорту на файл пакета
  });

  it("сторонняя (английская) ошибка экспорта: в missing — общий русский текст, подробности — в манифесте и журнале задачи", async () => {
    const raw = "render: Failed to launch the browser process! /store/workspace/drafts/job_01ABC-a1--3-mp4/run: No such file";
    const exp = fakeExport({ fail: (c) => (c.versionId === versionOf.get("ss_003") ? raw : undefined) });
    const { r } = await run(deps(exp));
    expect(r.status).toBe("completed");
    const miss = refsOf(r).missing.find((m) => m.item_id === "ss_003")!;
    expect(miss.reason).toBe("экспорт не удался: ошибка рендера (подробности в журнале задачи)");
    const m = ScriptPackageManifestSchema.parse(JSON.parse(readFileSync(join(env.s.root, refsOf(r).rel_path, "package-manifest.json"), "utf8")));
    expect(m.missing.find((x) => x.item_id === "ss_003")).toMatchObject({ reason: miss.reason, detail: raw });
    expect(events).toContainEqual(expect.objectContaining({ kind: "export_failed", message: expect.stringContaining("Failed to launch the browser process") }));
  });
});

describe("exportFailedReason", () => {
  const GENERIC = "экспорт не удался: ошибка рендера (подробности в журнале задачи)";
  it("русская причина — как есть, без английских кодов этапов и id", () => {
    expect(exportFailedReason("media: кодек упал")).toBe("экспорт не удался: кодек упал");
    expect(exportFailedReason("экспорт не удался: overlay_empty: альфа пустая у ver_01J9ZQ3K4M5N6P7Q8R9S0T1V2W")).toBe("экспорт не удался: альфа пустая у");
  });
  it("английский остаток (сторонняя ошибка) — общий русский текст", () => {
    expect(exportFailedReason("Failed to launch the browser process!")).toBe(GENERIC);
    expect(exportFailedReason("render: рендер упал: Error: Protocol error (Target.setAutoAttach): Target closed")).toBe(GENERIC);
    expect(exportFailedReason("")).toBe(GENERIC);
  });
  it("пути и имена draft (…-a1--1-mp4) из текста убираются", () => {
    const r = exportFailedReason("ffmpeg вернул код 1: файл /Volumes/SSD/MS/workspace/drafts/job_01J-a1--1-mp4/scene.mp4 не записан, draft job_01J-a1--1-mp4 оставлен");
    expect(r).toBe("экспорт не удался: ffmpeg вернул код 1: файл не записан, draft оставлен");
    expect(r).not.toMatch(/-a\d+--|\/Volumes/);
  });
});

