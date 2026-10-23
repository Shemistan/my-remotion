// Task 25: пути импорта и защита оригинала.
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertOutsideSource, resolveImportPath } from "../../src/media/guards.js";
import { copyOriginal } from "../../src/media/import.js";
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
