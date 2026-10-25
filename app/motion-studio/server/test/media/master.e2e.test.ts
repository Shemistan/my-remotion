// Task 36 e2e (`make e2e`): ensureMaster на фикстурах Task 25 (`scripts/make-media-fixtures.mjs`) —
// talk-ru-cfr.mp4 (повторный вызов — из кэша: ffmpeg не запускается, реестр процессов попытки
// пуст, sha256 тот же) и talk-ru-vfr.mov (части 25 и 30 fps → master CFR, кадров round(duration · fps),
// цвет BT.709 с тегами), audio-long.mp4 (звук длиннее видео на 40 мс — кадров всё равно
// round(duration · fps)) и hdr-hlg.mp4 (отказ hdr_unsupported). Хранилище — tmp/ репозитория (initStore с фейковым томом), исходник — копия.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Fps } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { claimNext, enqueue } from "../../src/jobs/queue.js";
import { HdrUnsupportedError, type MasterDeps, ensureMaster, masterFrames } from "../../src/media/master.js";
import { probeMedia } from "../../src/media/probe.js";
import { asset } from "../db/video-fixtures.js";
import { type TestStore, makeStore, removeStore } from "../db/helpers.js";

const MEDIA = fileURLToPath(new URL("../../../../../tmp/media-fixtures/", import.meta.url));
let s: TestStore;
let db: Db;
let n = 0;

beforeAll(async () => {
  if (!existsSync(join(MEDIA, "talk-ru-vfr.mov")) || !existsSync(join(MEDIA, "hdr-hlg.mp4"))) throw new Error(`нет фикстур в ${MEDIA}: ./scripts/with-node.sh node scripts/make-media-fixtures.mjs`);
  s = await makeStore("ms-master-e2e-");
  db = openDb(s.root);
  await migrate(db);
}, 60_000);
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

async function seed(file: string): Promise<{ mediaId: string; duration_us: number; vfr: boolean }> {
  const k = ++n;
  projects.create(db, { id: `p${k}`, kind: "video", title: `master e2e ${k}` });
  const rel = `workspace/projects/p${k}/source/med_${k}/original${file.slice(file.lastIndexOf("."))}`;
  await mkdir(join(s.root, rel, ".."), { recursive: true });
  copyFileSync(join(MEDIA, file), join(s.root, rel));
  const probe = await probeMedia(join(s.root, rel));
  media.insert(db, asset({ id: `med_${k}`, project_id: `p${k}`, rel_path: rel, probe }));
  return { mediaId: `med_${k}`, duration_us: probe.duration_us, vfr: probe.vfr };
}

function deps(): MasterDeps {
  enqueue(db, { type: "roughcut.preview", projectId: `p${n}`, input: { edlId: `edl_${n}`, revision: 1 }, idempotencyKey: `me${n}-${Math.random()}` });
  const { job, attempt } = claimNext(db, "test", 0, { running: 0, maxRunning: 8 })!;
  return { root: s.root, db, storage: s.guard, signal: new AbortController().signal, run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) } };
}

const packets = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", f]).toString().trim());
const colors = (f: string) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_space,color_primaries,color_transfer,color_range", "-of", "csv=p=0", f]).toString().trim();

it("talk-ru-cfr: master@30-1, повторный ensureMaster — из кэша без процессов, sha256 тот же", async () => {
  const F30: Fps = { num: 30, den: 1 };
  const { mediaId, duration_us } = await seed("talk-ru-cfr.mp4");
  const t0 = Date.now();
  const m = await ensureMaster(deps(), mediaId, F30);
  console.log(`master talk-ru-cfr: ${((Date.now() - t0) / 1000).toFixed(1)} с, ${m.path}`);
  expect(packets(m.path)).toBe(masterFrames({ duration_us }, F30));
  expect(colors(m.path)).toBe("tv,bt709,bt709,bt709");
  const d2 = deps();
  const spawned: string[] = [];
  const m2 = await ensureMaster({ ...d2, spawn: async (_r, _ref, cmd) => { spawned.push(cmd); throw new Error("ffmpeg не должен запускаться"); } }, mediaId, F30);
  expect(m2).toEqual(m);
  expect(spawned).toEqual([]);
  // реестр попытки пуст: второй вызов процессов не запускал
  expect(await fileProcessRegistry(s.root).live({ runId: d2.run.runId, attempt: d2.run.attempt })).toEqual([]);
}, 120_000);

it("talk-ru-vfr.mov (25 + 30 fps): master CFR на timeline_fps, кадров round(duration · fps)", async () => {
  const { mediaId, duration_us, vfr } = await seed("talk-ru-vfr.mov");
  expect(vfr).toBe(true);
  const fps = (await probeMedia(join(MEDIA, "talk-ru-vfr.mov"))).timeline_fps;
  const m = await ensureMaster(deps(), mediaId, fps);
  const p = await probeMedia(m.path);
  expect(p.vfr).toBe(false);
  expect(p.video.r_frame_rate).toEqual(fps);
  expect(packets(m.path)).toBe(Math.round((duration_us * fps.num) / (fps.den * 1e6)));
  console.log(`master talk-ru-vfr: timeline_fps ${fps.num}/${fps.den}, ${packets(m.path)} кадров, ${duration_us} µs`);
}, 120_000);

it("audio-long.mp4 (звук на 40 мс длиннее видео): master — round(duration · fps) кадров, хвост — повтор последнего", async () => {
  const F30: Fps = { num: 30, den: 1 };
  const { mediaId, duration_us } = await seed("audio-long.mp4");
  expect(duration_us).toBeGreaterThanOrEqual(5_030_000);
  const m = await ensureMaster(deps(), mediaId, F30);
  expect(packets(m.path)).toBe(masterFrames({ duration_us }, F30));
  expect(packets(m.path)).toBeGreaterThan(150);
}, 120_000);

it("hdr-hlg.mp4: отказ hdr_unsupported с советом экспортировать в SDR", async () => {
  const { mediaId } = await seed("hdr-hlg.mp4");
  const err = await ensureMaster(deps(), mediaId, { num: 30, den: 1 }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(HdrUnsupportedError);
  expect((err as Error).message).toMatch(/HLG.*SDR/s);
}, 60_000);
