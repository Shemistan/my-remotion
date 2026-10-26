// Отметки использования кэша (Task 49a): на пару (ключ, задача); ставятся до первой записи в кэш.
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { cacheUseDir, markCacheUse } from "../src/node/cache-use.js";
import { contentKey, writeEntry } from "../src/node/entry.js";
import { copyFixture, fixtureSettings, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
beforeEach(async () => { tmp = await makeTmp(); });
afterEach(async () => { await removeTmp(tmp); });

it("writeEntry зовёт onKey с ключом до записи entries/<ключ>", async () => {
  const versionDir = await copyFixture("hello-scene", join(tmp, "v"));
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  const seen: { key: string; entryExisted: boolean }[] = [];
  const file = await writeEntry(versionDir, cacheDir, await fixtureSettings("hello-scene"), async (key) => {
    seen.push({ key, entryExisted: existsSync(join(cacheDir, "entries", key)) });
    await markCacheUse(cacheDir, key, "job_a");
  });
  const key = await contentKey(versionDir);
  expect(seen).toEqual([{ key, entryExisted: false }]);
  expect(file).toBe(join(cacheDir, "entries", key, "index.tsx"));
  await markCacheUse(cacheDir, key, "job_b");
  await markCacheUse(cacheDir, key);
  expect(readdirSync(cacheUseDir(cacheDir, key)).sort()).toEqual(["_.json", "job_a.json", "job_b.json"]);
  expect(() => cacheUseDir(cacheDir, "../x")).toThrow(/ключ/);
});
