import { existsSync, statSync } from "node:fs";
import { mkdir, rename, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { MARKER_FILE, StorageError, initStore } from "../../src/storage/guard.js";
import { safeMkdir } from "../../src/storage/safe-mkdir.js";
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
  expect(String((err as Error).message)).toMatch(/^storage:/);
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
