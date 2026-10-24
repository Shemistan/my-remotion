// Task 25: пути импорта и защита оригинала.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import { appendFile, chmod, mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertOutsideSource, resolveImportFile, resolveImportPath } from "../../src/media/guards.js";
import { copyOriginal } from "../../src/media/import.js";
import type { MediaInvalidError } from "../../src/media/probe.js";
import { sha256File } from "../../src/scenes/hash.js";
import { REPO_TMP } from "../db/helpers.js";

let tmp: string;
let tmpRoot: string;
beforeAll(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-media-guards-"));
  tmpRoot = join(tmp, "roots");
  await mkdir(join(tmpRoot, "Видео с пробелами"), { recursive: true });
});
afterAll(async () => {
  await chmod(join(tmp, "dest", "original.mp4"), 0o644).catch(() => undefined);
  await rm(tmp, { recursive: true, force: true });
});

const symlinkInsideRootTo = async (target: string) => {
  const p = join(tmpRoot, `link-${Math.random().toString(36).slice(2)}.mp4`);
  await symlink(target, p);
  return p;
};

describe("resolveImportPath", () => {
  it("вне корней, симлинк наружу, каталог, не видео, относительный путь, URL → media_invalid", async () => {
    await expect(resolveImportPath("/etc/passwd", [tmpRoot])).rejects.toThrow(/media_invalid/);
    await expect(resolveImportPath(await symlinkInsideRootTo("/etc/hosts"), [tmpRoot])).rejects.toThrow(/media_invalid/);
    await mkdir(join(tmpRoot, "dir.mp4"));
    await expect(resolveImportPath(join(tmpRoot, "dir.mp4"), [tmpRoot])).rejects.toThrow(/media_invalid/);
    await writeFile(join(tmpRoot, "notes.txt"), "x");
    await expect(resolveImportPath(join(tmpRoot, "notes.txt"), [tmpRoot])).rejects.toThrow(/media_invalid/);
    await expect(resolveImportPath("video.mp4", [tmpRoot])).rejects.toThrow(/media_invalid/);
    await expect(resolveImportPath("http://example.com/a.mp4", [tmpRoot])).rejects.toThrow(/media_invalid/);
    await expect(resolveImportPath(join(tmpRoot, "нет.mp4"), [tmpRoot])).rejects.toThrow(/media_invalid/);
    // корень-префикс: <roots>-evil не внутри <roots>
    await mkdir(`${tmpRoot}-evil`, { recursive: true });
    await writeFile(`${tmpRoot}-evil/a.mp4`, "x");
    await expect(resolveImportPath(`${tmpRoot}-evil/a.mp4`, [tmpRoot])).rejects.toThrow(/media_invalid/);
  });

  it("код причины отказа (`reason`) — без разбора текста сообщения", async () => {
    const reason = (p: string, o?: { forbidden: string[] }) => resolveImportPath(p, [tmpRoot], o).then(() => "ok", (e: MediaInvalidError) => e.reason);
    expect(await reason("video.mp4")).toBe("not_absolute");
    expect(await reason(join(tmpRoot, "нет.mp4"))).toBe("not_found");
    await mkdir(join(tmpRoot, "d2.mp4"), { recursive: true });
    expect(await reason(join(tmpRoot, "d2.mp4"))).toBe("not_file");
    await writeFile(join(tmpRoot, "n2.txt"), "x");
    expect(await reason(join(tmpRoot, "n2.txt"))).toBe("bad_extension");
    await mkdir(`${tmpRoot}-out`, { recursive: true });
    await writeFile(`${tmpRoot}-out/a.mp4`, "x");
    expect(await reason(`${tmpRoot}-out/a.mp4`)).toBe("outside_roots");
    await mkdir(join(tmpRoot, "store"), { recursive: true });
    await writeFile(join(tmpRoot, "store", "a.mp4"), "x");
    expect(await reason(join(tmpRoot, "store", "a.mp4"), { forbidden: [join(tmpRoot, "store")] })).toBe("in_storage");
  });

  it("файл с пробелами и кириллицей, симлинк внутри корня → realpath", async () => {
    const f = join(tmpRoot, "Видео с пробелами", "Мой ролик 1.MOV");
    await writeFile(f, "x");
    expect(await resolveImportPath(f, [tmpRoot])).toBe(f);
    expect(await resolveImportPath(await symlinkInsideRootTo(f), [tmpRoot])).toBe(f);
    expect(await resolveImportPath(f, ["/nonexistent-root", tmpRoot])).toBe(f);
  });
});

describe("assertOutsideSource", () => {
  const root = "/data/store";
  it("выход в source/ проекта или равный оригиналу → ошибка", () => {
    expect(() => assertOutsideSource(join(root, "workspace/projects/p1/source/med_1/x.mp4"), root)).toThrow(/source/);
    expect(() => assertOutsideSource(join(root, "workspace/projects/p1/source"), root)).toThrow(/source/);
    expect(() => assertOutsideSource(`${root}/workspace/projects/p1/proxy/../source/med_1/x.mp4`, root)).toThrow(/source/);
    expect(() => assertOutsideSource("/Users/u/Movies/a.mov", root, ["/Users/u/Movies/a.mov"])).toThrow(/оригинал/);
  });
  it("draft и прокси — можно", () => {
    expect(() => assertOutsideSource(join(root, "workspace/drafts/job_1-a1/proxy.mp4"), root)).not.toThrow();
    expect(() => assertOutsideSource(join(root, "workspace/projects/p1/proxy/med_1/proxy.mp4"), root)).not.toThrow();
  });
});

describe("copyOriginal", () => {
  it("копия 0444, sha256 до/после/копии совпадают, источник не тронут", async () => {
    const src = join(tmpRoot, "Видео с пробелами", "исходник.mp4");
    const data = Buffer.alloc(3 * 1024 * 1024 + 7, 7);
    await writeFile(src, data);
    const want = createHash("sha256").update(data).digest("hex");
    const mtime = statSync(src).mtimeMs;
    const r = await copyOriginal(src, join(tmp, "dest"));
    expect(r).toMatchObject({ sha256: want, srcSha256Before: want, srcSha256After: want, path: join(tmp, "dest", "original.mp4") });
    expect(r.cloned).toBe(true); // тот же том (tmp репозитория) — APFS-клон
    expect(statSync(r.path).mode & 0o777).toBe(0o444);
    expect((await readFile(r.path)).equals(data)).toBe(true);
    expect(statSync(src).mtimeMs).toBe(mtime);
    // повтор в тот же каталог — отказ (копия не перезаписывается)
    await expect(copyOriginal(src, join(tmp, "dest"))).rejects.toThrow();
    expect(existsSync(r.path)).toBe(true);
  });
});

describe("ревью Task 25: M2/M3 resolveImportFile", () => {
  it("dev/ino из lstat; путь внутри хранилища (MS_DATA_DIR) — media_invalid, даже если корень импорта его включает", async () => {
    const f = join(tmpRoot, "Видео с пробелами", "m2.mp4");
    await writeFile(f, "x");
    const r = await resolveImportFile(f, [tmpRoot]);
    const st = statSync(f);
    expect(r).toMatchObject({ path: f, dev: st.dev, ino: st.ino, size: 1 });
    const store = join(tmpRoot, "store");
    await mkdir(join(store, "workspace"), { recursive: true });
    await writeFile(join(store, "workspace", "a.mp4"), "x");
    await expect(resolveImportPath(join(store, "workspace", "a.mp4"), [tmpRoot], { forbidden: [store] })).rejects.toThrow(/media_invalid.*хранилищ/);
    await expect(resolveImportPath(f, [tmpRoot], { forbidden: [store] })).resolves.toBe(f);
  });
});

describe("ревью Task 25: I4 sha256File с отменой и прогрессом", () => {
  it("onBytes считает прочитанное; abort посреди большого (sparse) файла прерывает за < 2 с", async () => {
    const small = join(tmp, "small.bin");
    await writeFile(small, Buffer.alloc(5 * 1024 * 1024 + 3, 1));
    let seen = 0;
    const h = await sha256File(small, { onBytes: (n) => (seen += n) });
    expect(seen).toBe(5 * 1024 * 1024 + 3);
    expect(h).toBe(createHash("sha256").update(Buffer.alloc(5 * 1024 * 1024 + 3, 1)).digest("hex"));

    const big = join(tmp, "sparse.bin");
    const fh = await open(big, "w");
    await fh.truncate(64 * 1024 ** 3); // 64 ГиБ без занятого места
    await fh.close();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 150);
    const t0 = Date.now();
    await expect(sha256File(big, { signal: ac.signal })).rejects.toThrow(/abort/i);
    expect(Date.now() - t0).toBeLessThan(2000);
    await rm(big);
  }, 10_000);
});

describe("ревью Task 25: I4/I5 copyOriginal", () => {
  it("потоковая копия (другой том) — хеш на лету, cloned=false, прогресс копирования", async () => {
    const src = join(tmpRoot, "Видео с пробелами", "stream.mp4");
    const data = Buffer.alloc(2 * 1024 * 1024 + 1, 3);
    await writeFile(src, data);
    let bytes = 0;
    const r = await copyOriginal(src, join(tmp, "dest-stream"), { forceStream: true, onBytes: (n) => (bytes += n) });
    const want = createHash("sha256").update(data).digest("hex");
    expect(r).toMatchObject({ sha256: want, srcSha256Before: want, srcSha256After: want, cloned: false });
    expect(bytes).toBeGreaterThanOrEqual(data.length);
    expect(statSync(r.path).mode & 0o777).toBe(0o444);
  });

  it("исходник дописан между хешами → ошибка, копия удалена, исходник нами не тронут", async () => {
    for (const forceStream of [false, true]) {
      const src = join(tmpRoot, "Видео с пробелами", `mut-${forceStream}.mp4`);
      await writeFile(src, Buffer.alloc(1024 * 1024, 5));
      const dest = join(tmp, `dest-mut-${forceStream}`);
      await expect(copyOriginal(src, dest, { forceStream, onCopied: async () => appendFile(src, "tail") })).rejects.toThrow(/media_invalid.*изменился/);
      expect(readdirSync(dest)).toEqual([]);
      // содержимое источника — ровно то, что записал «пользователь» (мы не писали)
      expect(await sha256File(src)).toBe(createHash("sha256").update(Buffer.concat([Buffer.alloc(1024 * 1024, 5), Buffer.from("tail")])).digest("hex"));
    }
  });

  it("abort во время хеширования источника → быстрый отказ, копии нет", async () => {
    const big = join(tmpRoot, "Видео с пробелами", "sparse.mov");
    const fh = await open(big, "w");
    await fh.truncate(64 * 1024 ** 3);
    await fh.close();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 150);
    const t0 = Date.now();
    const dest = join(tmp, "dest-abort");
    await expect(copyOriginal(big, dest, { signal: ac.signal, forceStream: true })).rejects.toThrow(/abort/i);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(existsSync(join(dest, "original.mov"))).toBe(false);
    await rm(big);
  }, 10_000);
});
