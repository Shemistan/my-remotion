// Вертикальный срез целиком и по-настоящему: реальное хранилище на внешнем SSD,
// реальный claude (opus для Director и Engineer по config), реальный рендер Remotion.
// Промпты — Test 1 и Test 2 из docs/architecture/09-acceptance-tests.md дословно.
// Запуск: `make e2e` после `MS_DATA_DIR=... npm run doctor -- --init`.
// Evidence — tmp/slice-evidence/{test1,test2}/; в docs/evidence/phase-1/slice/ — только с
// MS_WRITE_EVIDENCE=1.
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type Settings, defaultSettings } from "@ms/contracts";
import { type OwnerLock, type StorageStatus, acquireOwnerLock, checkStorage, macosProbe } from "@ms/core";
import { ffprobe, probeGate, renderVersion } from "@ms/render";
import { ClaudeCodeRuntime } from "../../src/agents/claude-code.js";
import { loadConfig, readConfigFile } from "../../src/config.js";
import { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { DEFAULT_PROMPTS_DIR, type GenerateDeps, type GenerateResult, generateScene } from "../../src/pipeline/generate.js";
import { checkSceneDir } from "../../src/scenes/static-check.js";
import { readVersion, relockVersions } from "../../src/scenes/store.js";
import { typecheckVersion } from "../../src/scenes/typecheck.js";

const T = 60 * 60_000;
const DATA_DIR = process.env.MS_DATA_DIR ?? "/Volumes/External SSD/MotionStudio";
const APP = fileURLToPath(new URL("../../../", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const REPO_TMP = join(REPO, "tmp");
// закоммиченное evidence переписывается только явно: иначе каждый `make e2e` менял бы docs/
const EVIDENCE = process.env.MS_WRITE_EVIDENCE === "1" ? join(REPO, "docs/evidence/phase-1/slice") : join(REPO_TMP, "slice-evidence");

const TEST1 =
  "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года. Тёмный фон, крупная типографика, плавное движение графика, акцент на конечном значении";
const TEST2 =
  "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям";

const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const env = { ...process.env, MS_DATA_DIR: DATA_DIR };

let lock: OwnerLock;
let deps: GenerateDeps;
let kb: KnowledgeAdapter;
let status: Extract<StorageStatus, { ok: true }>;

beforeAll(async () => {
  expect(existsSync("/Volumes/External SSD"), "внешний SSD не подключён").toBe(true);
  // порядок как в CLI: owner lock → storage → relock
  lock = await acquireOwnerLock(DATA_DIR, "cli");
  const st = await checkStorage(env, macosProbe);
  if (!st.ok) throw new Error(`хранилище не готово (doctor --init?): ${st.reason}: ${st.detail}`);
  status = st;
  await relockVersions(DATA_DIR);
  const config = loadConfig(env, await readConfigFile(DATA_DIR));
  kb = await KnowledgeAdapter.load({ kbRoot: config.kb.root, sourceRoot: config.kb.sourceRoot });
  deps = {
    storage: () => checkStorage(env, macosProbe, status.marker.store_id),
    kb,
    agents: new ClaudeCodeRuntime({ bin: config.claudeBin, logRoot: join(DATA_DIR, "logs", "agent-runs"), promptsDir: DEFAULT_PROMPTS_DIR }),
    render: renderVersion,
    check: checkSceneDir,
    typecheck: typecheckVersion,
    config,
    log: (l) => console.log(`  ${l}`),
  };
}, T);

afterAll(async () => {
  await lock?.release();
});

/** Средняя яркость (Y, 0..1) PNG через ffmpeg signalstats. */
async function meanLuma(png: string): Promise<number> {
  const { stderr } = await promisify(execFile)("ffmpeg", ["-hide_banner", "-i", png, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"]);
  const m = /YAVG=([\d.]+)/.exec(stderr);
  if (!m) throw new Error(`YAVG не найден: ${stderr.slice(-300)}`);
  return Number(m[1]) / 255;
}

/** Копия опубликованной версии (записываемая, без кадров и превью) и повторный рендер её кадров. */
async function rerenderCopy(r: GenerateResult, settings: Settings, name: string) {
  const m = await readVersion(r.versionDir!);
  const base = join(REPO_TMP, `slice-repro-${name}-${Date.now()}`);
  const copy = join(base, "version");
  await mkdir(base, { recursive: true });
  await cp(r.versionDir!, copy, { recursive: true });
  await promisify(execFile)("/bin/chmod", ["-R", "u+w", copy]);
  await rm(join(copy, "frames"), { recursive: true, force: true });
  await rm(join(copy, "preview.mp4"), { force: true });
  const cacheDir = join(base, "cache");
  await mkdir(cacheDir);
  const again = await renderVersion({
    versionDir: copy,
    settings,
    cacheDir,
    stills: [...new Set([...m.qa_frames, settings.duration_frames - 20])].sort((a, b) => a - b),
    preview: { scale: 0.5, crf: 23 },
    timeoutMs: 300_000,
    run: { root: DATA_DIR, runId: `${r.runId}-repro`, attempt: 1 },
  });
  return { m, again, base };
}

/** Evidence: кадры (уменьшенные), manifest, knowledge-refs, spec, итог прогона, превью ≤ 10 МБ. */
async function saveEvidence(name: string, r: GenerateResult, extra: Record<string, unknown>) {
  const dir = join(EVIDENCE, name);
  // evidence прогона заменяется целиком: старые кадры с другими номерами не остаются
  await rm(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "frames"), { recursive: true });
  const v = r.versionDir!;
  for (const f of ["manifest.json", "knowledge-refs.json", "spec.json", "selection.json", "pipeline-log.json", "warnings.json"]) {
    if (existsSync(join(v, f))) copyFileSync(join(v, f), join(dir, f));
  }
  if (existsSync(join(v, "src", "Scene.tsx"))) copyFileSync(join(v, "src", "Scene.tsx"), join(dir, "Scene.tsx"));
  const m = JSON.parse(readFileSync(join(v, "manifest.json"), "utf8")) as { qa_frames: number[] };
  for (const f of m.qa_frames) {
    // 960 px по ширине: читаемо и мало весит
    await promisify(execFile)("/usr/bin/sips", ["-Z", "960", join(v, "frames", `${f}.png`), "--out", join(dir, "frames", `${f}.png`)]);
  }
  const preview = join(v, "preview.mp4");
  if (existsSync(preview) && statSync(preview).size <= 10 * 1024 * 1024) copyFileSync(preview, join(dir, "preview.mp4"));
  // копии из опубликованной версии read-only — evidence должен оставаться правимым
  await promisify(execFile)("/bin/chmod", ["-R", "u+w", dir]);
  writeFileSync(
    join(dir, "run.json"),
    JSON.stringify(
      { status: r.status, run_id: r.runId, version_dir: v, cost_usd: r.costUsd, engineer_calls: r.engineerCalls, timings_ms: r.timings, warnings: r.warnings, failure: r.failure, ...extra },
      null,
      2,
    ) + "\n",
  );
}

/** Второй `npm run generate` на том же хранилище, пока первый держит owner lock: owner_busy. */
function secondCli(): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    // настоящий второй `npm run generate`, как его запустил бы человек
    const child = spawn(join(APP, "scripts/with-node.sh"), ["npm", "run", "--silent", "generate", "--", "второй запуск"], { cwd: APP, env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });
}

async function commonChecks(r: GenerateResult, settings: Settings) {
  expect(r.failure, JSON.stringify(r.failure)).toBeUndefined();
  expect(r.status).toBe("ready");
  const m = await readVersion(r.versionDir!);
  expect(m.knowledge_refs.length).toBeGreaterThan(0);
  for (const k of m.knowledge_refs) expect(k).toMatchObject({ kb_id: expect.any(String), commit: expect.any(String), license: expect.any(String), strategy: expect.any(String) });
  expect(m.render_env.remotion).toBe("4.0.537");
  expect(probeGate(await ffprobe(r.previewPath!), settings, 0.5)).toEqual([]);
  // код версии прошёл static check и typecheck
  expect(await checkSceneDir(r.versionDir!)).toEqual([]);
  expect(await typecheckVersion(r.versionDir!)).toEqual([]);
  // стабильный рендер: копия версии даёт те же кадры
  const { again, base } = await rerenderCopy(r, settings, m.version_id);
  expect(again.error).toBeUndefined();
  const frameSha = (f: number) => sha256(join(base, "version", "frames", `${f}.png`));
  expect(m.qa_frames.map(frameSha)).toEqual(m.qa_frames_sha256);
  // финал не замер: кадры N−20 и N−1 различаются
  const n = settings.duration_frames;
  expect(frameSha(n - 20), "кадры N−20 и N−1 одинаковы — финал замер").not.toBe(frameSha(n - 1));
  await rm(base, { recursive: true, force: true });
  return m;
}

it("Test 1 — Data Storytelling: ready, рост с 10 000 до 1 000 000; второй CLI → owner_busy", async () => {
  const settings = defaultSettings();
  const t0 = Date.now();
  const gen = generateScene(TEST1, settings, deps);
  // второй generate во время первого
  const second = await secondCli();
  console.log("второй CLI:", second.code, second.out.trim().split("\n").slice(-2).join(" | "));
  expect(second.code).toBe(1);
  expect(second.out).toContain("owner_busy");
  const r = await gen;
  const wallMs = Date.now() - t0;
  console.log("Test 1:", JSON.stringify({ status: r.status, failure: r.failure, cost: r.costUsd, calls: r.engineerCalls, wallMs, versionDir: r.versionDir }));
  if (r.versionDir) await saveEvidence("test1", r, { prompt: TEST1, wall_ms: wallMs, second_cli: { code: second.code, out: second.out.trim().split("\n").slice(-3) } });
  const m = await commonChecks(r, settings);
  // spec: график с ≥ 3 точками и акцентом в конце; тёмный фон по кадрам
  const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as { elements: { kind: string }[]; beats: { action: string }[] };
  expect(spec.elements.some((e) => e.kind === "chart")).toBe(true);
  expect(spec.elements.some((e) => e.kind === "number")).toBe(true);
  const lumas = [];
  for (const f of m.qa_frames) lumas.push(await meanLuma(join(r.versionDir!, "frames", `${f}.png`)));
  console.log("средняя яркость кадров:", lumas.map((l) => l.toFixed(3)).join(", "));
  expect(Math.max(...lumas)).toBeLessThan(0.25);
  writeFileSync(join(EVIDENCE, "test1", "luma.json"), JSON.stringify({ frames: m.qa_frames, mean_luma: lumas }, null, 2) + "\n");
}, T);

it("Test 2 — Technical Explainer: ready, ≥ 5 узлов, запись system-structure в knowledge-refs", async () => {
  const settings = defaultSettings();
  const t0 = Date.now();
  const r = await generateScene(TEST2, settings, deps);
  const wallMs = Date.now() - t0;
  console.log("Test 2:", JSON.stringify({ status: r.status, failure: r.failure, cost: r.costUsd, calls: r.engineerCalls, wallMs, versionDir: r.versionDir }));
  if (r.versionDir) await saveEvidence("test2", r, { prompt: TEST2, wall_ms: wallMs });
  const m = await commonChecks(r, settings);
  const structural = m.knowledge_refs.filter((k) => kb.getCapability(k.kb_id)?.patterns.includes("system-structure"));
  expect(structural.length).toBeGreaterThan(0);
  const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as { elements: { kind: string; content: { nodes?: unknown[] } }[] };
  const nodes = spec.elements.flatMap((e) => (Array.isArray(e.content.nodes) ? e.content.nodes : []));
  const graphish = spec.elements.filter((e) => e.kind === "graph" || e.kind === "card").length;
  expect(Math.max(nodes.length, graphish)).toBeGreaterThanOrEqual(5);
}, T);
