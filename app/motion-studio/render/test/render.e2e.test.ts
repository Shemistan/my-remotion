// Реальный рендер Remotion 4.0.537: Chrome Headless Shell, бандл, кадры, превью, ffprobe.
// Запуск: `make e2e`. Пишет только в tmp/ репозитория.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { groupExists, reapStale } from "@ms/core";
import type { Settings } from "@ms/contracts";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "../src/node/browser.js";
import { reapStrayRenderers } from "../src/node/processes.js";
import { ffprobe, probeGate } from "../src/node/ffprobe.js";
import { type RenderRequest, renderVersion } from "../src/node/render-version.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "./helpers.js";

const T = 300_000;
const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

let tmp: string;
let s640: Settings;
let req: RenderRequest;
const timings: Record<string, number> = {};

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    timings[name] = Math.round(performance.now() - t0);
  }
}

/** Процессы, в командной строке которых есть путь run/tmp нашего хранилища. */
function strays(root: string): string[] {
  const out = execFileSync("ps", ["-axww", "-o", "pid=,command="], { encoding: "utf8" });
  return out.split("\n").filter((l) => l.includes(join(root, "run", "tmp")));
}

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  const root = await makeStore(tmp);
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  s640 = await fixtureSettings("hello-scene");
  req = {
    versionDir: await copyFixture("hello-scene", join(tmp, "hello")),
    settings: s640,
    cacheDir,
    stills: [0, 30, 59],
    preview: { scale: 1, crf: 23 },
    timeoutMs: 120_000,
    run: { root, runId: "e2e", attempt: 1 },
  };
}, T);

afterAll(async () => {
  console.log("render timings, ms:", JSON.stringify(timings));
  if (tmp) await removeTmp(tmp);
});

it("renders hello-scene: stills, preview that passes the probe gate, deterministic on a copy", async () => {
  const r = await timed("first", () => renderVersion(req));
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(r.stills).toEqual([0, 30, 59].map((f) => join(req.versionDir, "frames", `${f}.png`)));
  expect(r.previewPath).toBe(join(req.versionDir, "preview.mp4"));
  expect(probeGate(r.probe!, s640, 1)).toEqual([]);
  expect(await ffprobe(r.previewPath!)).toEqual(r.probe);
  // анимация идёт: разные кадры различаются
  expect(sha256(r.stills[0]!)).not.toBe(sha256(r.stills[1]!));

  const copy = await copyFixture("hello-scene", join(tmp, "hello-copy"));
  const r2 = await timed("repeat", () => renderVersion({ ...req, versionDir: copy }));
  expect(r2.ok).toBe(true);
  expect(sha256(r2.stills[1]!)).toBe(sha256(r.stills[1]!)); // детерминизм, тот же contentKey
  // повтор взял бандл из кэша: каталог бандла один
  expect(readdirSync(join(req.cacheDir, "bundles"))).toHaveLength(1);
  expect(readdirSync(join(req.run.root, "run/processes"))).toEqual([]);
  expect(strays(req.run.root)).toEqual([]);
}, T);

it("settings apply over a cached bundle: scale 0.5, shorter duration", async () => {
  const short = { ...s640, duration_frames: 45 };
  const versionDir = await copyFixture("hello-scene", join(tmp, "hello-short"));
  const r = await timed("scaled", () =>
    renderVersion({ ...req, versionDir, settings: short, stills: [44], preview: { scale: 0.5, crf: 28 } }),
  );
  expect(r.error).toBeUndefined();
  expect(r.probe).toMatchObject({ width: 320, height: 180 });
  expect(probeGate(r.probe!, short, 0.5)).toEqual([]);
  expect(statSync(r.stills[0]!).size).toBeGreaterThan(0);
}, T);

it("hang-scene times out, the process group is killed and browser logs survive", async () => {
  const hang = await copyFixture("hang-scene", join(tmp, "hang"));
  const h = await timed("hang", () => renderVersion({ ...req, versionDir: hang, stills: [0], timeoutMs: 15_000 }));
  expect(h).toMatchObject({ ok: false, error: { stage: "timeout" } });
  expect(h.browserLogs.join("\n")).toMatch(/hang-scene: delayRender/);
  expect(readdirSync(join(req.run.root, "run/processes"))).toEqual([]); // группа убита
  expect(strays(req.run.root)).toEqual([]); // и Chrome в своей группе тоже
  expect(readdirSync(join(req.run.root, "run/tmp"))).toEqual([]);
}, T);

it("worker killed by SIGKILL: Chrome in its own process group is still reaped", async () => {
  const hang = await copyFixture("hang-scene", join(tmp, "hang-kill"));
  const pending = renderVersion({ ...req, versionDir: hang, stills: [0], run: { ...req.run, attempt: 2 }, timeoutMs: 60_000 });
  // ждём, пока worker запустит Chrome, и убиваем только лидера — обработчики выхода
  // Remotion не срабатывают, Chrome остаётся в своей группе
  const procDir = join(req.run.root, "run/processes");
  let pid: number | undefined;
  for (let i = 0; i < 300 && (pid === undefined || strays(req.run.root).length === 0); i++) {
    const rec = (existsSync(procDir) ? readdirSync(procDir) : []).find((n) => n.startsWith("e2e-a2-"));
    if (rec) pid = Number(/-(\d+)\.json$/.exec(rec)![1]);
    await new Promise((r) => setTimeout(r, 100));
  }
  expect(strays(req.run.root).length).toBeGreaterThan(0);
  process.kill(pid!, "SIGKILL");
  const h = await pending;
  expect(h).toMatchObject({ ok: false, error: { stage: "still" } });
  expect(h.error!.message).toMatch(/SIGKILL/);
  expect(strays(req.run.root)).toEqual([]);
  expect(readdirSync(procDir)).toEqual([]);
}, T);

it("fractional fps 30000/1001 renders exactly and passes the probe gate", async () => {
  const ntsc = { ...s640, fps: { num: 30000, den: 1001 }, duration_frames: 30 };
  const versionDir = await copyFixture("hello-scene", join(tmp, "hello-ntsc"));
  const r = await timed("ntsc", () => renderVersion({ ...req, versionDir, settings: ntsc, stills: [0] }));
  expect(r.error).toBeUndefined();
  expect(r.probe!.fps).toEqual({ num: 30000, den: 1001 });
  expect(probeGate(r.probe!, ntsc, 1)).toEqual([]);
}, T);

it("Chrome has no network during render, local bundle assets still load", async () => {
  const versionDir = await copyFixture("net-scene", join(tmp, "net"));
  const r = await timed("net", () => renderVersion({ ...req, versionDir, stills: [0] }));
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true); // <Img> локального png загрузился, иначе рендер упал бы
  const lines = r.browserLogs.filter((l) => l.includes("net-scene:"));
  expect(lines.length).toBeGreaterThan(0);
  for (const l of lines) expect(l).toMatch(/example\.com blocked, 1\.1\.1\.1 blocked/);
}, T);

it("parent and worker die together: Chrome stays registered and reapStale kills it", async () => {
  const hang = await copyFixture("hang-scene", join(tmp, "hang-gone"));
  const run = { ...req.run, runId: "gone", attempt: 1 };
  const script = join(tmp, "render-child.mts");
  const rv = pathToFileURL(fileURLToPath(new URL("../src/node/render-version.ts", import.meta.url))).href;
  writeFileSync(
    script,
    `import { renderVersion } from ${JSON.stringify(rv)};\n` +
      `const req = JSON.parse(process.argv[2]);\n` +
      `await renderVersion(req);\n`,
  );
  const parentReq = { ...req, versionDir: hang, stills: [0], timeoutMs: 120_000, run };
  const parent = spawn(process.execPath, ["--import", "tsx", script, JSON.stringify(parentReq)], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    stdio: "ignore",
    detached: true,
  });
  const procDir = join(req.run.root, "run/processes");
  const records = () =>
    (existsSync(procDir) ? readdirSync(procDir) : [])
      .filter((n) => n.startsWith("gone-a1-") && n.endsWith(".json"))
      .map((n) => JSON.parse(readFileSync(join(procDir, n), "utf8")) as { pid: number; pgid: number; cmd: string });
  let chrome: { pgid: number } | undefined;
  let worker: { pgid: number } | undefined;
  for (let i = 0; i < 600 && !chrome; i++) {
    await new Promise((r) => setTimeout(r, 100));
    chrome = records().find((p) => p.cmd.startsWith("chrome-headless-shell"));
    worker = records().find((p) => !p.cmd.startsWith("chrome-headless-shell"));
  }
  expect(chrome && worker).toBeTruthy();

  // сервер и worker погибают разом: никто не успевает прибраться
  process.kill(-worker!.pgid, "SIGKILL");
  process.kill(-parent.pid!, "SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
  expect(groupExists(chrome!.pgid)).toBe(true); // Chrome пережил обоих
  expect(strays(req.run.root).length).toBeGreaterThan(0);

  const reaped = await reapStale(req.run.root, "gone", { graceMs: 1000, waitMs: 10_000 });
  expect(reaped).toEqual({ clean: true, alive: [] });
  expect(groupExists(chrome!.pgid)).toBe(false);
  expect(strays(req.run.root)).toEqual([]);
  expect(records()).toEqual([]);
  // осиротевший run/tmp попытки — забота восстановления, не reapStale
  expect(await reapStrayRenderers(req.run.root)).toEqual([]);
}, T);
