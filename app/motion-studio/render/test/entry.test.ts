import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { contentKey, writeEntry } from "../src/node/entry.js";
import { copyFixture, fixtureSettings, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let a: string;
beforeEach(async () => {
  tmp = await makeTmp();
  a = await copyFixture("hello-scene", join(tmp, "a"));
});
afterEach(() => removeTmp(tmp));

it("contentKey depends on src/** and props.json content, not on the location", async () => {
  const b = await copyFixture("hello-scene", join(tmp, "elsewhere", "b"));
  const key = await contentKey(a);
  expect(key).toMatch(/^[0-9a-f]{64}$/);
  expect(await contentKey(b)).toBe(key);

  // артефакты рендера и settings.json в ключ не входят
  await mkdir(join(b, "frames"));
  await writeFile(join(b, "frames", "0.png"), "x");
  await writeFile(join(b, "preview.mp4"), "x");
  await writeFile(join(b, "settings.json"), "{}");
  expect(await contentKey(b)).toBe(key);

  await writeFile(join(b, "props.json"), '{ "title": "Другой" }');
  const k2 = await contentKey(b);
  expect(k2).not.toBe(key);
  await writeFile(join(b, "src", "extra.ts"), "export const x = 1;\n");
  expect(await contentKey(b)).not.toBe(k2);
});

it("contentKey distinguishes file names, not only bytes", async () => {
  const b = await copyFixture("hello-scene", join(tmp, "b"));
  await writeFile(join(a, "src", "one.ts"), "x");
  await writeFile(join(b, "src", "two.ts"), "x");
  expect(await contentKey(a)).not.toBe(await contentKey(b));
});

it("contentKey rejects symlinks and missing files", async () => {
  await symlink("/etc/hosts", join(a, "src", "link.ts"));
  await expect(contentKey(a)).rejects.toThrow(/симлинк/);
  await rm(join(a, "src", "link.ts"));
  await rm(join(a, "props.json"));
  await expect(contentKey(a)).rejects.toThrow(/props\.json/);
});

it("writeEntry writes <cacheDir>/entries/<key>/index.tsx with one Scene composition", async () => {
  const cache = join(tmp, "cache");
  await mkdir(cache);
  const settings = await fixtureSettings("hello-scene");
  const entry = await writeEntry(a, cache, settings);
  expect(entry).toBe(join(cache, "entries", await contentKey(a), "index.tsx"));
  const text = await readFile(entry, "utf8");
  expect(text).toContain("registerRoot");
  expect(text).toContain('id="Scene"');
  expect(text).toContain(JSON.stringify(join(a, "src", "Scene.tsx")));
  expect(text).toContain("width={640}");
  expect(text).toContain("height={360}");
  expect(text).toContain("fps={30}");
  expect(text).toContain("durationInFrames={60}");
  expect(text).toContain('"Hello, Motion Studio"');
  // повторный вызов перезаписывает тот же файл
  expect(await writeEntry(a, cache, settings)).toBe(entry);
});

it("writeEntry rejects props.json that is not a JSON object", async () => {
  const cache = join(tmp, "cache");
  await mkdir(cache);
  await writeFile(join(a, "props.json"), "[1, 2]");
  await expect(writeEntry(a, cache, await fixtureSettings("hello-scene"))).rejects.toThrow(/props\.json/);
});

it("two concurrent writeEntry of the same content in one process both succeed (parallel takes)", async () => {
  const cache = join(tmp, "cache");
  await mkdir(cache);
  const settings = await fixtureSettings("hello-scene");
  const b = await copyFixture("hello-scene", join(tmp, "b"));
  const [ea, eb] = await Promise.all([writeEntry(a, cache, settings), writeEntry(b, cache, settings)]);
  expect(ea).toBe(eb);
  expect(await readFile(ea, "utf8")).toContain("registerRoot");
});
