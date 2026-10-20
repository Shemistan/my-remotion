import { existsSync, statSync } from "node:fs";
import { mkdir, rename, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MARKER_FILE, StorageError, StoragePathError, initStore } from "../../src/storage/guard.js";
import { safeMkdir, safeMkdirSync } from "../../src/storage/safe-mkdir.js";
import { fakeProbe, makeTmp, removeTmp } from "../helpers.js";

let tmp: string;
let root: string;

beforeEach(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, fakeProbe(), {});
});
afterEach(() => removeTmp(tmp));

it("creates nested directories under root", async () => {
  const dir = await safeMkdir(root, "cache/bundles");
  expect(dir).toBe(join(root, "cache/bundles"));
  expect(statSync(dir).isDirectory()).toBe(true);
  // повторный вызов — не ошибка
  await expect(safeMkdir(root, "cache/bundles")).resolves.toBe(dir);
});

it("safeMkdir refuses when root vanished", async () => {
  await rename(root, root + ".gone");
  await expect(safeMkdir(root, "cache/bundles")).rejects.toThrow(/storage/);
  expect(existsSync(root)).toBe(false);
});

it("refuses when marker is missing", async () => {
  await rm(join(root, MARKER_FILE));
  await expect(safeMkdir(root, "cache")).rejects.toThrow(/storage/);
  expect(existsSync(join(root, "cache"))).toBe(false);
});

it.each(["../x", "a/../../x", "/etc/x", "", "."])("safeMkdir refuses path escape %j", async (rel) => {
  const err = await safeMkdir(root, rel).catch((e: unknown) => e);
  // ошибка программиста, а не состояние хранилища
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(StorageError);
  expect(err).toBeInstanceOf(StoragePathError);
  expect((err as StoragePathError).code).toBe("path_escape");
  // не похоже на сообщение StorageError (`storage: …`)
  expect(String((err as Error).message)).toMatch(/^storage_path:/);
  expect(existsSync(join(tmp, "x"))).toBe(false);
});

it("refuses a symlinked root", async () => {
  const link = join(tmp, "link-root");
  await symlink(root, link);
  await expect(safeMkdir(link, "cache")).rejects.toThrow(/симлинк/);
  expect(existsSync(join(root, "cache"))).toBe(false);
});

it("refuses to descend through a symlink", async () => {
  const outside = join(tmp, "outside");
  await mkdir(outside);
  await symlink(outside, join(root, "link"));
  await expect(safeMkdir(root, "link/sub")).rejects.toThrow(/storage/);
  expect(existsSync(join(outside, "sub"))).toBe(false);
});

describe("safeMkdirSync (для записи внутри синхронной транзакции SQLite)", () => {
  it("creates nested directories under root, repeat is fine", () => {
    const dir = safeMkdirSync(root, "workspace/projects/p/scenes/s");
    expect(dir).toBe(join(root, "workspace/projects/p/scenes/s"));
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(safeMkdirSync(root, "workspace/projects/p/scenes/s")).toBe(dir);
  });
  it("refuses when root vanished or marker is missing", async () => {
    await rm(join(root, MARKER_FILE));
    expect(() => safeMkdirSync(root, "cache")).toThrow(StorageError);
    expect(existsSync(join(root, "cache"))).toBe(false);
    await rename(root, root + ".gone");
    expect(() => safeMkdirSync(root, "cache")).toThrow(/storage/);
    expect(existsSync(root)).toBe(false);
  });
  it.each(["../x", "/etc/x", ""])("refuses path escape %j", (rel) => {
    expect(() => safeMkdirSync(root, rel)).toThrow(StoragePathError);
  });
  it("refuses symlinked root and symlink inside", async () => {
    const link = join(tmp, "link-root");
    await symlink(root, link);
    expect(() => safeMkdirSync(link, "cache")).toThrow(/симлинк/);
    const outside = join(tmp, "outside");
    await mkdir(outside);
    await symlink(outside, join(root, "link"));
    expect(() => safeMkdirSync(root, "link/sub")).toThrow(/storage/);
    expect(existsSync(join(outside, "sub"))).toBe(false);
  });
});
