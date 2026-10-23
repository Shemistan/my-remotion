// Task 25: обработчик `media.import` на маленьком синтетическом ролике (реальные ffmpeg/ffprobe,
// хранилище в tmp/): оригинал не меняется, один исходник на проект, нехватка места, abort на
// каждом этапе, повтор после публикации прокси (ревью Task 24, M3).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, truncateSync, copyFileSync, renameSync, unlinkSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Job } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue, finish, requestCancel } from "../../src/jobs/queue.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { type ImportStage, type MediaImportDeps, type MediaImportResult, mediaImport } from "../../src/pipeline/media-import.js";
import { sha256File } from "../../src/scenes/hash.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

// Ревью Task 25 (I5): инъекции в копию оригинала и в аргументы ffmpeg прокси.
const hooks = vi.hoisted(() => ({
  onCopied: undefined as undefined | (() => Promise<void> | void),
  badProxy: false,
}));
vi.mock("../../src/media/import.js", async (orig) => {
  const m = await orig<typeof import("../../src/media/import.js")>();
  return {
    ...m,
    copyOriginal: (src: string, dir: string, o: Parameters<typeof m.copyOriginal>[2] = {}) =>
      m.copyOriginal(src, dir, { ...o, ...(hooks.onCopied ? { onCopied: hooks.onCopied } : {}) }),
  };
});
vi.mock("../../src/media/proxy.js", async (orig) => {
  const m = await orig<typeof import("../../src/media/proxy.js")>();
  return { ...m, proxyArgs: (...a: Parameters<typeof m.proxyArgs>) => (hooks.badProxy ? ["-no-such-option", ...m.proxyArgs(...a)] : m.proxyArgs(...a)) };
});

let s: TestStore;
let db: Db;
let roots: string;
let clip: string;
let other: string;
let silent: string;
let broken: string;
let long: string;
let n = 0;

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);

beforeAll(async () => {
  s = await makeStore("ms-media-import-");
  db = openDb(s.root);
  await migrate(db);
  roots = join(s.tmp, "Мои видео");
  await mkdir(join(roots, "папка с пробелами"), { recursive: true });
  clip = join(roots, "папка с пробелами", "Мой ролик 1.mp4");
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
  other = join(roots, "other.mov");
  ff(["-f", "lavfi", "-i", "testsrc2=size=240x320:rate=25", "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", other]);
  silent = join(roots, "silent.mp4");
  ff(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-t", "1", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", silent]);
  broken = join(roots, "broken.mp4");
  copyFileSync(clip, broken);
  truncateSync(broken, Math.floor(statSync(broken).size / 3));
  // для отмены посреди ffmpeg (M13): прокси идёт заметно дольше опроса реестра
  long = join(roots, "long.mp4");
  ff(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-t", "12", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", long]);
}, 60_000);
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

function newProject(): string {
  const id = `p${++n}`;
  projects.create(db, { id, kind: "video", title: `Видео ${n}` });
  return id;
}

interface RunOpts {
  path?: string;
  input?: unknown;
  minFreeBytes?: number;
  onStage?: (stage: ImportStage, ac: AbortController, job: Job) => void | Promise<void>;
  onProgress?: (p: number, stage: string, ac: AbortController, job: Job) => void;
  /** Не вызывать `finish` (имитация падения попытки). */
  noFinish?: boolean;
  jobId?: string;
  importRoots?: string[];
  storage?: MediaImportDeps["storage"];
}

async function runImport(projectId: string, o: RunOpts = {}): Promise<{ r: HandlerResult; job: Job; attempt: number }> {
  if (!o.jobId) enqueue(db, { type: "media.import", projectId, input: o.input ?? { projectId, method: "path", path: o.path ?? clip }, idempotencyKey: `k${++n}` });
  const claim = claimNext(db, "test", 0, { running: 0, maxRunning: 2 })!;
  expect(claim, "задача не захвачена").toBeTruthy();
  const { job, attempt } = claim;
  const ac = new AbortController();
  const deps: MediaImportDeps = {
    root: s.root,
    media: { importRoots: o.importRoots ?? [roots], proxyShortSide: 720, thumbEveryUs: 500_000 },
    storage: o.storage ?? (async () => ({ ok: true, root: s.root, marker: s.marker, freeBytes: 50 * 1024 ** 3 })),
    minFreeBytes: o.minFreeBytes ?? 10 * 1024 ** 3,
    onStage: (st) => o.onStage?.(st, ac, job),
  };
  const sem = () => new AttemptPermits(new Semaphore(1));
  const ctx: JobContext = {
    db, job, attempt, signal: ac.signal,
    run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
    emit: () => undefined,
    progress: (p, st) => o.onProgress?.(p, st, ac, job),
    fenceOk: () => true,
    agents: sem(), renders: sem(), heavy: sem(),
  };
  const r = await mediaImport(() => deps)(ctx);
  if (!o.noFinish) finish(db, job.id, attempt, r);
  return { r, job, attempt };
}

const ls = (rel: string): string[] => (existsSync(join(s.root, rel)) ? readdirSync(join(s.root, rel)) : []);
const draftsOf = (jobId: string) => ls("workspace/drafts").filter((d) => d.startsWith(jobId));
const live = async () => fileProcessRegistry(s.root).live();

describe("media.import", () => {
  it("файл с пробелами и кириллицей: оригинал не меняется, source 0444, прокси/audio16k/waveform/миниатюры, настройки проекта", async () => {
    const p = newProject();
    const before = await sha256File(clip);
    const mtime = statSync(clip).mtimeMs;
    const { r, job } = await runImport(p);
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const out = (r as { outputRefs: MediaImportResult }).outputRefs;
    expect(out).toMatchObject({ deduplicated: false, sha256: before, proxy_reused: false });
    expect(await sha256File(clip)).toBe(before);
    expect(statSync(clip).mtimeMs).toBe(mtime);
    const a = media.byProject(db, p)!;
    expect(a).toMatchObject({ id: out.media_id, sha256: before, original_name: "Мой ролик 1.mp4", import: { method: "path", source_path: clip } });
    const orig = join(s.root, a.rel_path);
    expect(statSync(orig).mode & 0o222).toBe(0);
    expect(statSync(join(orig, "..")).mode & 0o222).toBe(0);
    expect(await sha256File(orig)).toBe(before);
    expect(ls(`workspace/projects/${p}/source/${a.id}`)).toEqual(["original.mp4"]);
    expect(ls(`workspace/projects/${p}/proxy/${a.id}`).sort()).toEqual(
      ["audio16k.wav", "manifest.json", "proxy.mp4", "thumbs", "thumbs.json", "waveform.bin", "waveform.json"]);
    const ds = media.derivatives(db, a.id);
    expect(ds.map((d) => d.kind)).toEqual(["audio16k", "proxy", "thumbs", "waveform"]);
    for (const d of ds) expect(await sha256File(join(s.root, d.rel_path))).toBe(d.sha256);
    const thumbs = JSON.parse(readFileSync(join(s.root, `workspace/projects/${p}/proxy/${a.id}/thumbs.json`), "utf8"));
    expect(thumbs).toMatchObject({ every_us: 500_000, height: 180 });
    expect(thumbs.count).toBeGreaterThanOrEqual(4);
    const wf = JSON.parse(readFileSync(join(s.root, `workspace/projects/${p}/proxy/${a.id}/waveform.json`), "utf8"));
    expect(wf).toMatchObject({ bucket_ms: 10, sample_rate: 16000, file: "waveform.bin" });
    expect(wf.length).toBeGreaterThanOrEqual(195);
    expect(projects.get(db, p)!.settings).toMatchObject({ fps: { num: 30, den: 1 }, aspect_ratio: "16:9" });
    expect(draftsOf(job.id)).toEqual([]);
    expect(await live()).toEqual([]);
  });

  it("повторный импорт того же файла → тот же исходник (deduplicated), второй другой файл → media_exists", async () => {
    const p = newProject();
    const first = await runImport(p);
    const id = (first.r as { outputRefs: MediaImportResult }).outputRefs.media_id;
    const again = await runImport(p);
    expect(again.r).toMatchObject({ status: "completed", outputRefs: { media_id: id, deduplicated: true } });
    const second = await runImport(p, { path: other });
    expect(second.r).toMatchObject({ status: "failed", error: { code: "media_exists", message: expect.stringMatching(/один исходник на проект/) } });
    expect(ls(`workspace/projects/${p}/source`)).toEqual([id]);
    expect(ls(`workspace/projects/${p}/proxy`)).toEqual([id]);
    expect(draftsOf(second.job.id)).toEqual([]);
  });

  it("без звука — импорт успешен, audio16k/waveform нет; битый файл и путь вне корней — media_invalid, source/ пуст", async () => {
    const p = newProject();
    const { r } = await runImport(p, { path: silent });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const a = media.byProject(db, p)!;
    expect(a.probe.audio).toBeUndefined();
    expect(media.derivatives(db, a.id).map((d) => d.kind)).toEqual(["proxy", "thumbs"]);
    expect(db.prepare("SELECT has_audio FROM media_assets WHERE id = ?").pluck().get(a.id)).toBe(0);

    const p2 = newProject();
    const bad = await runImport(p2, { path: broken });
    expect(bad.r).toMatchObject({ status: "failed", error: { code: "media_invalid" } });
    const outside = await runImport(p2, { path: "/etc/hosts" });
    expect(outside.r).toMatchObject({ status: "failed", error: { code: "media_invalid" } });
    expect(ls(`workspace/projects/${p2}/source`)).toEqual([]);
    expect(draftsOf(bad.job.id)).toEqual([]);
  });

  it("загрузка (upload): файл только из workspace/drafts, имя — из originalName", async () => {
    const p = newProject();
    const up = join(s.root, "workspace/drafts/upload-1.bin");
    await mkdir(join(s.root, "workspace/drafts"), { recursive: true });
    copyFileSync(silent, up);
    const ok = await runImport(p, { input: { projectId: p, method: "upload", uploadPath: up, originalName: "Съёмка.MOV" } });
    expect(ok.r.status, JSON.stringify(ok.r)).toBe("completed");
    expect(media.byProject(db, p)).toMatchObject({ original_name: "Съёмка.MOV", import: { method: "upload" } });
    const p2 = newProject();
    const outside = await runImport(p2, { input: { projectId: p2, method: "upload", uploadPath: silent, originalName: "a.mp4" } });
    expect(outside.r).toMatchObject({ status: "failed", error: { code: "media_invalid" } });
  });

  it("нехватка места → low_space до копирования, ничего не создано", async () => {
    const p = newProject();
    const { r, job } = await runImport(p, { minFreeBytes: 50 * 1024 ** 3 });
    expect(r).toMatchObject({ status: "failed", error: { code: "low_space", message: expect.stringMatching(/ГиБ/) } });
    expect(ls(`workspace/projects/${p}`)).toEqual([]);
    expect(draftsOf(job.id)).toEqual([]);
    expect(media.byProject(db, p)).toBeUndefined();
  });

  const STAGES: ImportStage[] = ["space", "copy", "probe", "proxy", "audio16k", "waveform", "thumbs", "publish"];
  for (const stage of STAGES) {
    it(`отмена на этапе ${stage} → cancelled, source/ пуст, draft убран, оригинал цел`, async () => {
      const p = newProject();
      const before = await sha256File(clip);
      const { r, job } = await runImport(p, {
        onStage: (st, ac, j) => {
          if (st !== stage) return;
          requestCancel(db, j.id);
          ac.abort();
        },
      });
      expect(r).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
      expect(ls(`workspace/projects/${p}/source`)).toEqual([]);
      expect(media.byProject(db, p)).toBeUndefined();
      expect(draftsOf(job.id)).toEqual([]);
      expect(await sha256File(clip)).toBe(before);
      expect(await live()).toEqual([]);
    });
  }

  it("abort посреди ffmpeg прокси → группа убита, реестр пуст, draft убран (M13: детерминированно — по записи ffmpeg в реестре)", async () => {
    const p = newProject();
    let killedPid: number | undefined;
    const { r, job } = await runImport(p, {
      path: long,
      onStage: (st, ac, j) => {
        if (st !== "proxy") return;
        // ждём, пока ffmpeg прокси появится в реестре процессов попытки, и отменяем
        const t = setInterval(() => {
          void live().then((ps) => {
            if (killedPid !== undefined || ps.length === 0) return;
            killedPid = ps[0]!.pid;
            clearInterval(t);
            requestCancel(db, j.id);
            ac.abort();
          });
        }, 5);
      },
    });
    expect(killedPid, "ffmpeg прокси не застали в реестре").toBeDefined();
    expect(r).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    expect(await live()).toEqual([]);
    expect(() => process.kill(killedPid!, 0)).toThrow();
    expect(ls(`workspace/projects/${p}/source`)).toEqual([]);
    expect(draftsOf(job.id)).toEqual([]);
  }, 60_000);

  it("M3: прокси опубликован попыткой 1, попытка упала до source → попытка 2 не публикует прокси повторно", async () => {
    const p = newProject();
    let publishes = 0;
    const first = await runImport(p, {
      noFinish: true,
      onStage: (st) => {
        if (st === "publish" && ++publishes === 2) throw new Error("сбой после публикации прокси");
      },
    });
    expect(first.r.status).toBe("failed");
    const medId = `med_${first.job.id.slice(4)}`;
    const pxRel = `workspace/projects/${p}/proxy/${medId}`;
    expect(db.prepare("SELECT job_id, attempt FROM artifact_publications WHERE dest_rel = ?").get(pxRel)).toEqual({ job_id: first.job.id, attempt: 1 });
    expect(ls(`workspace/projects/${p}/source`)).toEqual([]);
    // восстановление: задача снова pending, следующая попытка — 2
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const second = await runImport(p, { jobId: first.job.id });
    expect(second.attempt).toBe(2);
    expect(second.r).toMatchObject({ status: "completed", outputRefs: { media_id: medId, proxy_reused: true, deduplicated: false } });
    expect(db.prepare("SELECT attempt FROM artifact_publications WHERE dest_rel = ?").pluck().get(pxRel)).toBe(1);
    expect(db.prepare("SELECT job_id, attempt FROM artifact_publications WHERE dest_rel = ?").get(`workspace/projects/${p}/source/${medId}`))
      .toEqual({ job_id: first.job.id, attempt: 2 });
    expect(media.derivatives(db, medId)).toHaveLength(4);
    // и третья попытка того же job после завершения — по опубликованному (не дубль)
    expect(draftsOf(first.job.id)).toEqual([]);
  });

  it("I3: попытка 1 закоммитила media_assets и упала до finish, исходник удалён → попытка 2 completed по БД", async () => {
    const p = newProject();
    const src = join(roots, "i3.mp4");
    copyFileSync(clip, src);
    const first = await runImport(p, { path: src, noFinish: true });
    expect(first.r.status).toBe("completed");
    const id = (first.r as { outputRefs: MediaImportResult }).outputRefs.media_id;
    unlinkSync(src);
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const second = await runImport(p, { jobId: first.job.id });
    expect(second.attempt).toBe(2);
    expect(second.r).toMatchObject({ status: "completed", outputRefs: { media_id: id, deduplicated: false } });
    expect(db.prepare("SELECT COUNT(*) FROM artifact_publications WHERE job_id = ?").pluck().get(first.job.id)).toBe(2);
  });

  it("M5: projectId входа не совпадает с проектом задачи → отказ до файлов", async () => {
    const p = newProject();
    const q = newProject();
    const { r } = await runImport(p, { input: { projectId: q, method: "path", path: clip } });
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "prepare", message: expect.stringMatching(/не совпадает/) } });
    expect(media.byProject(db, q)).toBeUndefined();
  });

  it("M3: файл внутри хранилища (MS_DATA_DIR) — media_invalid, даже если корень импорта его включает", async () => {
    const p = newProject();
    const inside = join(s.root, "workspace", "inside.mp4");
    copyFileSync(silent, inside);
    const { r } = await runImport(p, { path: inside, importRoots: [s.tmp] });
    expect(r).toMatchObject({ status: "failed", error: { code: "media_invalid", message: expect.stringMatching(/хранилищ/) } });
    unlinkSync(inside);
  });

  it("I5: исходник дописан между хешами → media_invalid, sha исходника — только чужая правка, source/ пуст, draft убран", async () => {
    const p = newProject();
    const src = join(roots, "mutating.mp4");
    copyFileSync(clip, src);
    hooks.onCopied = () => appendFile(src, "пользователь дописал");
    try {
      const { r, job } = await runImport(p, { path: src });
      expect(r).toMatchObject({ status: "failed", error: { code: "media_invalid", message: expect.stringMatching(/изменился/) } });
      expect(draftsOf(job.id)).toEqual([]);
    } finally {
      hooks.onCopied = undefined;
    }
    expect(readFileSync(src)).toEqual(Buffer.concat([readFileSync(clip), Buffer.from("пользователь дописал")]));
    expect(ls(`workspace/projects/${p}/source`)).toEqual([]);
    expect(media.byProject(db, p)).toBeUndefined();
  });

  it("M2: путь подменён другим файлом (новый inode, то же содержимое) во время копии → media_invalid", async () => {
    const p = newProject();
    const src = join(roots, "swapped.mp4");
    copyFileSync(clip, src);
    hooks.onCopied = () => {
      renameSync(src, `${src}.old`);
      copyFileSync(`${src}.old`, src);
    };
    try {
      const { r, job } = await runImport(p, { path: src });
      expect(r).toMatchObject({ status: "failed", error: { code: "media_invalid", message: expect.stringMatching(/подменён/) } });
      expect(draftsOf(job.id)).toEqual([]);
    } finally {
      hooks.onCopied = undefined;
    }
    expect(ls(`workspace/projects/${p}/source`)).toEqual([]);
  });

  it("I5: ffmpeg прокси падает (невалидные аргументы) → failed, оригинал цел, source/ пуст, draft убран, реестр пуст", async () => {
    const p = newProject();
    const before = await sha256File(clip);
    hooks.badProxy = true;
    try {
      const { r, job } = await runImport(p);
      expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", message: expect.stringMatching(/proxy: .*no-such-option/) } });
      expect(draftsOf(job.id)).toEqual([]);
    } finally {
      hooks.badProxy = false;
    }
    expect(await sha256File(clip)).toBe(before);
    expect(ls(`workspace/projects/${p}/source`)).toEqual([]);
    expect(media.byProject(db, p)).toBeUndefined();
    expect(await live()).toEqual([]);
  });

  it("M6: ffmpeg упал, а хранилище к этому моменту отключено → storage_unavailable", async () => {
    const p = newProject();
    let offline = false;
    hooks.badProxy = true;
    try {
      const { r } = await runImport(p, {
        storage: async () => (offline
          ? { ok: false, reason: "offline", detail: "диск отключён" } as never
          : { ok: true, root: s.root, marker: s.marker, freeBytes: 50 * 1024 ** 3 }),
        onStage: (st) => {
          if (st === "proxy") offline = true;
        },
      });
      expect(r).toMatchObject({ status: "failed", error: { code: "storage_unavailable", stage: "storage" } });
    } finally {
      hooks.badProxy = false;
    }
  });

  it("`%` в пути исходника: импорт проходит (шаблон миниатюр с % в каталоге — args.test.ts, M11)", async () => {
    const p = newProject();
    const dir = join(roots, "100% готово");
    await mkdir(dir, { recursive: true });
    const src = join(dir, "клип %d.mp4");
    copyFileSync(clip, src);
    const { r } = await runImport(p, { path: src });
    expect(r.status, JSON.stringify(r)).toBe("completed");
  });
});
