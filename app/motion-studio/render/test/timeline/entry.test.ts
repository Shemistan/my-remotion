// Task 36: точка входа бандла таймлайна — статические импорты `src/Scene.tsx` версий в реестр и
// одна композиция `ProjectTimeline`; static check каждой версии до бандла (сцена в составе
// таймлайна его не обходит).
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkSceneDir } from "../../../server/src/scenes/static-check.js";
import { writeTimelineEntry } from "../../src/timeline/entry.js";
import { copyFixture, makeTmp, removeTmp } from "../helpers.js";

let tmp: string;
let card: string;
let lower: string;
let cacheDir: string;

beforeAll(async () => {
  tmp = await makeTmp();
  card = await copyFixture("timeline/fullscreen-card", join(tmp, "card"));
  lower = await copyFixture("timeline/overlay-lower-third", join(tmp, "lower"));
  cacheDir = join(tmp, "cache");
  await import("node:fs/promises").then((f) => f.mkdir(cacheDir));
});
afterAll(async () => {
  if (tmp) await removeTmp(tmp);
});

describe("writeTimelineEntry", () => {
  it("entries/tl-<sha256>/index.tsx: импорты версий, реестр по ключу, композиция ProjectTimeline; ключ не зависит от порядка", async () => {
    const checked: string[] = [];
    const check = async (dir: string) => {
      checked.push(dir);
      return checkSceneDir(dir);
    };
    const a = await writeTimelineEntry({ scenes: [{ key: "S0", versionDir: card }, { key: "S1", versionDir: lower }], cacheDir, check });
    expect(a).toMatch(/\/entries\/tl-[0-9a-f]{64}\/index\.tsx$/);
    expect(checked.sort()).toEqual([card, lower].sort());
    const text = await readFile(a, "utf8");
    expect(text).toContain(JSON.stringify(join(card, "src", "Scene.tsx")));
    expect(text).toContain(JSON.stringify(join(lower, "src", "Scene.tsx")));
    expect(text).toContain('id="ProjectTimeline"');
    expect(text).toMatch(/"S0": pick\(/);
    expect(text).toMatch(/ProjectTimeline\.tsx"/);
    const b = await writeTimelineEntry({ scenes: [{ key: "S1", versionDir: lower }, { key: "S0", versionDir: card }], cacheDir, check });
    expect(b).toBe(a);
    // другой ключ сцены — другая точка входа
    const c = await writeTimelineEntry({ scenes: [{ key: "S2", versionDir: card }], cacheDir, check });
    expect(c).not.toBe(a);
    // таймлайн без сцен — только видео и звук
    const empty = await writeTimelineEntry({ scenes: [], cacheDir, check });
    expect(await readFile(empty, "utf8")).toContain("const registry = {");
  });

  it("версия с fetch() отвергается до бандла (forbidden-global), entry не пишется", async () => {
    const bad = await copyFixture("timeline/fullscreen-card", join(tmp, "bad"));
    const scene = join(bad, "src", "Scene.tsx");
    await writeFile(scene, (await readFile(scene, "utf8")) + '\nexport const leak = () => fetch("https://example.com");\n');
    const before = await readdir(join(cacheDir, "entries"));
    await expect(writeTimelineEntry({ scenes: [{ key: "S0", versionDir: card }, { key: "S9", versionDir: bad }], cacheDir, check: checkSceneDir })).rejects.toThrow(/forbidden-global/);
    expect(await readdir(join(cacheDir, "entries"))).toEqual(before);
  });

  it("ключи — безопасные и уникальные; нет Scene.tsx — ошибка", async () => {
    await expect(writeTimelineEntry({ scenes: [{ key: "a/b", versionDir: card }], cacheDir, check: checkSceneDir })).rejects.toThrow(/ключ/);
    await expect(writeTimelineEntry({ scenes: [{ key: "S0", versionDir: card }, { key: "S0", versionDir: lower }], cacheDir, check: checkSceneDir })).rejects.toThrow(/повтор/);
    await expect(writeTimelineEntry({ scenes: [{ key: "S0", versionDir: join(tmp, "none") }], cacheDir, check: async () => [] })).rejects.toThrow();
  });
});
