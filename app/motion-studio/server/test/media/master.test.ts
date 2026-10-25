// Task 36 (F1): CFR-дериватив исходника для композиции `ProjectTimeline` — аргументы ffmpeg,
// публикация в `master/<media>@<num>-<den>` (вне read-only `proxy/`), кэш без второго ffmpeg и
// сверка sha256, VFR → CFR с числом кадров `round(duration · fps)`. Реальный ffmpeg на крошечном
// синтетическом ролике (64×64, части 25 и 30 fps, склейка concat-демуксером — как talk-ru-vfr).
import { execFileSync } from "node:child_process";
import { appendFileSync, chmodSync, closeSync, openSync, readFileSync, readSync, statSync, utimesSync, writeFileSync, writeSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Fps, ProbeSummary } from "@ms/contracts";
import { type SpawnTrackedOptions, fileProcessRegistry, spawnTracked } from "@ms/core";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { isPublished } from "../../src/artifacts/store.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { claimNext, enqueue } from "../../src/jobs/queue.js";
import { assertOutsideSource } from "../../src/media/guards.js";
import { HdrUnsupportedError, MASTER_CRF, type MasterDeps, ensureMaster, hdrReason, masterArgs } from "../../src/media/master.js";
import { probeMedia } from "../../src/media/probe.js";
import { asset } from "../db/video-fixtures.js";
import { type TestStore, makeStore, removeStore } from "../db/helpers.js";

const F30: Fps = { num: 30, den: 1 };
const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);

function probe(over: Partial<ProbeSummary> = {}): ProbeSummary {
  return { ...asset().probe, container: "mov,mp4,m4a,3gp,3g2,mj2", duration_us: 20_021_333, ...over };
}

describe("masterArgs", () => {
  it("CFR по pts, x264 CRF 12, GOP = 1 с, без звука, число кадров — round(duration · fps)", () => {
    const a = masterArgs("in.mov", "out.mp4", probe({ video: { ...asset().probe.video, rotation: 90 } }), F30, 12);
    expect(a).toEqual(expect.arrayContaining(["-crf", "12", "-g", "30", "-an", "-fps_mode", "cfr"]));
    expect(a.join(" ")).toContain("-protocol_whitelist file -f mov -i file:in.mov");
    expect(a[a.indexOf("-vf") + 1]).toBe("fps=30/1:start_time=0,scale=out_color_matrix=bt709:out_range=tv,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,tpad=stop_mode=clone:stop=-1,format=yuv420p");
    expect(a[a.indexOf("-frames:v") + 1]).toBe(String(Math.round((20_021_333 * 30) / 1e6)));
    expect(a).toEqual(expect.arrayContaining(["-c:v", "libx264", "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]));
    // автоповорот ffmpeg (по умолчанию) не выключается: master — в отображаемой ориентации
    expect(a).not.toContain("-noautorotate");
    // цвет: BT.709 limited с явными тегами (Remotion читает файл без тегов как BT.709, ffmpeg — как BT.601)
    expect(a.join(" ")).toContain("-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv");
    expect(a.slice(-2)).toEqual(["-n", "out.mp4"]);
  });

  it("29,97: GOP — округлённая секунда, fps дробью", () => {
    const a = masterArgs("in.mp4", "out.mp4", probe({ duration_us: 10_000_000 }), { num: 30000, den: 1001 }, MASTER_CRF);
    expect(a[a.indexOf("-g") + 1]).toBe("30");
    expect(a[a.indexOf("-vf") + 1]).toBe("fps=30000/1001:start_time=0,scale=out_color_matrix=bt709:out_range=tv,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv,tpad=stop_mode=clone:stop=-1,format=yuv420p");
    expect(a[a.indexOf("-frames:v") + 1]).toBe("300");
    expect(a[a.indexOf("-crf") + 1]).toBe("12");
  });

  it("HDR: HLG/PQ или BT.2020 — причина отказа, SDR и файл без тегов — нет", () => {
    const v = asset().probe.video;
    expect(hdrReason(probe())).toBeUndefined();
    expect(hdrReason(probe({ video: { ...v, color_transfer: "bt709", color_primaries: "bt709" } }))).toBeUndefined();
    expect(hdrReason(probe({ video: { ...v, color_transfer: "arib-std-b67", color_primaries: "bt2020" } }))).toMatch(/HLG/);
    expect(hdrReason(probe({ video: { ...v, color_transfer: "smpte2084" } }))).toMatch(/PQ/);
    expect(hdrReason(probe({ video: { ...v, color_primaries: "bt2020" } }))).toMatch(/BT\.2020/);
  });

  it("выход в source/ проекта запрещён", () => {
    const root = "/store";
    expect(() => assertOutsideSource(join(root, "workspace/projects/p1/source/med_1/master.mp4"), root)).toThrow(/source/);
    expect(() => assertOutsideSource(join(root, artifactPaths(root, "p1").master("med_1", F30), "master.mp4"), root)).not.toThrow();
  });
});

describe("ensureMaster", () => {
  let s: TestStore;
  let db: Db;
  let n = 0;

  beforeAll(async () => {
    s = await makeStore("ms-master-");
    db = openDb(s.root);
    await migrate(db);
  }, 30_000);
  afterAll(async () => {
    db?.close();
    if (s) await removeStore(s);
  });

  /** VFR-исходник 64×64: 1 с при 25 fps + 1 с при 30 fps, склейка без перекодирования. */
  async function seedVfr(): Promise<{ mediaId: string; probe: ProbeSummary }> {
    const k = ++n;
    const projectId = `p${k}`;
    const mediaId = `med_${k}`;
    projects.create(db, { id: projectId, kind: "video", title: `Master ${k}` });
    const rel = `workspace/projects/${projectId}/source/${mediaId}/original.mov`;
    const dir = join(s.root, rel, "..");
    await mkdir(dir, { recursive: true });
    const parts: string[] = [];
    for (const [fps, name] of [[25, "p25.mov"], [30, "p30.mov"]] as const) {
      const p = join(s.tmp, `${k}-${name}`);
      ff(["-f", "lavfi", "-i", `testsrc2=size=64x64:rate=${fps}`, "-t", "1", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-video_track_timescale", "15000", p]);
      parts.push(p);
    }
    const list = join(s.tmp, `${k}-list.txt`);
    writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n") + "\n");
    ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", join(s.root, rel)]);
    const pr = await probeMedia(join(s.root, rel));
    media.insert(db, asset({ id: mediaId, project_id: projectId, rel_path: rel, probe: pr }));
    return { mediaId, probe: pr };
  }

  /** Исходник 64×64 30 fps по готовым аргументам ffmpeg (вход lavfi). */
  async function seedWith(args: string[], ext = "mp4", stripColor = false): Promise<{ mediaId: string; probe: ProbeSummary }> {
    const k = ++n;
    const projectId = `p${k}`;
    const mediaId = `med_${k}`;
    projects.create(db, { id: projectId, kind: "video", title: `Master ${k}` });
    const rel = `workspace/projects/${projectId}/source/${mediaId}/original.${ext}`;
    await mkdir(join(s.root, rel, ".."), { recursive: true });
    ff([...args, join(s.root, rel)]);
    const pr = await probeMedia(join(s.root, rel));
    // сводка исходника, импортированного до Task 36 (без полей цвета)
    const stored: ProbeSummary = stripColor ? { ...pr, video: { ...pr.video } } : pr;
    if (stripColor) {
      delete stored.video.color_transfer;
      delete stored.video.color_primaries;
    }
    media.insert(db, asset({ id: mediaId, project_id: projectId, rel_path: rel, probe: stored }));
    return { mediaId, probe: pr };
  }

  function deps(spawns: string[]): MasterDeps {
    enqueue(db, { type: "roughcut.preview", projectId: `p${n}`, input: { edlId: `edl_${n}`, revision: 1 }, idempotencyKey: `m${n}-${spawns.length}-${Math.random()}` });
    const { job, attempt } = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
    return {
      root: s.root, db, storage: s.guard, signal: new AbortController().signal,
      run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
      spawn: (root, ref, cmd, args, opts: SpawnTrackedOptions) => {
        spawns.push(cmd);
        return spawnTracked(root, ref, cmd, args, opts);
      },
    };
  }

  it("VFR → CFR в master/<media>@30-1, кадров round(duration · fps); повтор — из кэша без ffmpeg; подмена файла — ошибка", async () => {
    const { mediaId, probe: pr } = await seedVfr();
    expect(pr.vfr).toBe(true);
    const spawns: string[] = [];
    const m = await ensureMaster(deps(spawns), mediaId, F30);
    const rel = artifactPaths(s.root, `p${n}`).master(mediaId, F30);
    expect(m.path).toBe(join(s.root, rel, "master.mp4"));
    expect(isPublished(db, rel)).toBe(true);
    expect(spawns.length).toBeGreaterThan(0);
    const out = await probeMedia(m.path);
    expect(out.vfr).toBe(false);
    expect(out.audio).toBeUndefined();
    expect(out.video.r_frame_rate).toEqual(F30);
    const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", m.path]).toString().trim());
    expect(frames).toBe(Math.round((pr.duration_us * 30) / 1e6));

    const again: string[] = [];
    const m2 = await ensureMaster(deps(again), mediaId, F30);
    expect(again).toEqual([]);
    expect(m2).toEqual(m);

    // кэш сверяет размер и mtime с master.json, полный sha256 — только при расхождении
    const meta = JSON.parse(readFileSync(join(m.path, "..", "master.json"), "utf8")) as { size_bytes: number; mtime_ms: number };
    const st = statSync(m.path);
    expect(meta.size_bytes).toBe(st.size);
    expect(meta.mtime_ms).toBe(Math.floor(st.mtimeMs));
    chmodSync(m.path, 0o644);
    // та же длина и тот же mtime — файл не перечитывается (подмена байта не видна: цена быстрого кэша)
    const fd = openSync(m.path, "r+");
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, st.size - 1);
    writeSync(fd, Buffer.from([last[0]! ^ 0xff]), 0, 1, st.size - 1);
    closeSync(fd);
    // секунды числом: Date из stat округляет мс вверх (…794,989 → 795)
    utimesSync(m.path, st.atimeMs / 1000, st.mtimeMs / 1000);
    expect((await ensureMaster(deps([]), mediaId, F30)).sha256).toBe(m.sha256);
    // mtime изменился — подозрение: полный sha256 находит подмену
    utimesSync(m.path, st.atime, new Date(st.mtimeMs + 5_000));
    await expect(ensureMaster(deps([]), mediaId, F30)).rejects.toThrow(/sha256/);
    appendFileSync(m.path, "x");
    await expect(ensureMaster(deps([]), mediaId, F30)).rejects.toThrow(/sha256/);
  }, 30_000);

  it("звук длиннее видео (iPhone, 10–40 мс): последний кадр повторяется до конца звука — ровно round(duration · fps) кадров", async () => {
    // видео 30 кадров (1,000 с), звук 1,040 с: duration_us — по звуку
    const { mediaId, probe: pr } = await seedWith([
      "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.04",
      "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac",
    ]);
    expect(pr.duration_us).toBeGreaterThan(1_020_000);
    const want = Math.round((pr.duration_us * 30) / 1e6);
    expect(want).toBeGreaterThan(30);
    const m = await ensureMaster(deps([]), mediaId, F30);
    const frames = Number(execFileSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", m.path]).toString().trim());
    expect(frames).toBe(want);
  }, 30_000);

  it("HDR (HLG, BT.2020): отказ hdr_unsupported до ffmpeg, в сообщении — что сделать; старая сводка без цвета — перечитывается", async () => {
    const hlg = [
      "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=30", "-t", "0.5", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      // ffmpeg 7: x264 берёт primaries/trc из кадра — теги ставит setparams
      "-vf", "setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc", "-colorspace", "bt2020nc",
    ];
    const { mediaId, probe: pr } = await seedWith(hlg);
    expect(pr.video.color_transfer).toBe("arib-std-b67");
    expect(pr.video.color_primaries).toBe("bt2020");
    const spawns: string[] = [];
    const err = await ensureMaster(deps(spawns), mediaId, F30).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HdrUnsupportedError);
    expect((err as HdrUnsupportedError).code).toBe("hdr_unsupported");
    expect((err as Error).message).toMatch(/^hdr_unsupported: .*HDR.*SDR/s);
    expect(spawns.filter((c) => /ffmpeg$/.test(c))).toEqual([]);
    expect(isPublished(db, artifactPaths(s.root, `p${n}`).master(mediaId, F30))).toBe(false);

    const old = await seedWith(hlg, "mp4", true);
    await expect(ensureMaster(deps([]), old.mediaId, F30)).rejects.toBeInstanceOf(HdrUnsupportedError);
  }, 30_000);
});
