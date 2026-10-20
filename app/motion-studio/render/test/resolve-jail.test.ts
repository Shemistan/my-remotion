// Разрешение модулей бандла сцены (resolve-jail.ts) на enhanced-resolve — том же
// резолвере, что у webpack Remotion. Воспроизводит подмену пакета из draft обычным
// поиском вверх и проверяет, что конфиг worker её не допускает.
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import enhanced from "enhanced-resolve";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_NODE_MODULES, MOTION_KIT_DIR } from "../src/node/entry.js";
import { NestedNodeModulesPlugin, jailResolve } from "../src/node/resolve-jail.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let draft: string;

async function put(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

beforeEach(async () => {
  tmp = await makeTmp();
  draft = join(tmp, "drafts", "run_x-a1");
  await put(join(draft, "src", "Scene.tsx"), "export const Scene = () => null;\n");
  // подмена пакета в node_modules draft (вне src/) …
  await put(join(draft, "node_modules", "@remotion", "fonts", "package.json"), JSON.stringify({ name: "@remotion/fonts", main: "index.js" }));
  await put(join(draft, "node_modules", "@remotion", "fonts", "index.js"), "module.exports = 'shadow';\n");
  // … и пакет внутри src/, чей main уводит за пределы src/
  await put(join(draft, "src", "node_modules", "x", "package.json"), JSON.stringify({ name: "x", main: "../../../evil.js" }));
  await put(join(draft, "evil.js"), "module.exports = 'evil';\n");
});
afterEach(() => removeTmp(tmp));

type Opts = Parameters<typeof enhanced.ResolverFactory.createResolver>[0];
function resolver(resolve: Partial<Opts>) {
  const r = enhanced.ResolverFactory.createResolver({
    fileSystem: new enhanced.CachedInputFileSystem(fs, 4000),
    extensions: [".tsx", ".ts", ".mjs", ".js"],
    conditionNames: ["import", "module", "default"],
    mainFields: ["module", "main"],
    ...resolve,
  } as Opts);
  return (from: string, request: string) =>
    new Promise<string>((ok, fail) => r.resolve({}, from, request, {}, (err, res) => (err || !res ? fail(err ?? new Error("не найдено")) : ok(res))));
}

const jail = () => resolver(jailResolve({}, { nodeModules: APP_NODE_MODULES, motionKitDir: MOTION_KIT_DIR }) as Partial<Opts>);

describe("resolve-jail", () => {
  it("воспроизведение: прежний modules ['node_modules', …] берёт пакеты из draft", async () => {
    const old = resolver({ modules: ["node_modules", APP_NODE_MODULES] });
    expect(await old(join(draft, "src"), "@remotion/fonts")).toBe(join(draft, "node_modules", "@remotion", "fonts", "index.js"));
    expect(await old(join(draft, "src"), "x")).toBe(join(draft, "evil.js"));
  });

  it("конфиг worker: пакет берётся из node_modules приложения, подмена из draft не видна", async () => {
    const res = await jail()(join(draft, "src"), "@remotion/fonts");
    expect(res.startsWith(join(APP_NODE_MODULES, "@remotion", "fonts") + "/")).toBe(true);
    expect(res.startsWith(draft)).toBe(false);
  });

  it("конфиг worker: src/node_modules/x не разрешается вовсе (evil.js недостижим)", async () => {
    await expect(jail()(join(draft, "src"), "x")).rejects.toThrow();
  });

  it("вложенные node_modules пакетов внутри корня работают (zod 4 у @remotion/studio)", async () => {
    const from = join(APP_NODE_MODULES, "@remotion", "studio", "dist", "esm");
    const res = await jail()(from, "zod");
    expect(res.startsWith(join(APP_NODE_MODULES, "@remotion", "studio", "node_modules", "zod") + "/")).toBe(true);
    // а из draft тот же запрос — к zod корня
    expect((await jail()(join(draft, "src"), "zod")).startsWith(join(APP_NODE_MODULES, "zod") + "/")).toBe(true);
  });

  it("nestedDirs: только каталоги внутри корня, ближние первыми; вне корня — пусто", () => {
    const p = new NestedNodeModulesPlugin(APP_NODE_MODULES);
    expect(p.nestedDirs(join(APP_NODE_MODULES, "@remotion", "studio", "dist"))).toEqual([
      join(APP_NODE_MODULES, "@remotion", "studio", "dist", "node_modules"),
      join(APP_NODE_MODULES, "@remotion", "studio", "node_modules"),
      join(APP_NODE_MODULES, "@remotion", "node_modules"),
    ]);
    expect(p.nestedDirs(join(draft, "src"))).toEqual([]);
    expect(p.nestedDirs(APP_NODE_MODULES)).toEqual([]);
  });

  it("jailResolve: модули — один абсолютный корень, алиас kit и extensionAlias сохранены", () => {
    const r = jailResolve({ alias: { react: "/r" }, extensionAlias: { ".mjs": [".mjs"] }, plugins: [] }, { nodeModules: APP_NODE_MODULES, motionKitDir: MOTION_KIT_DIR }) as Record<string, unknown>;
    expect(r.modules).toEqual([APP_NODE_MODULES]);
    expect(r.alias).toEqual({ react: "/r", "@ms/motion-kit": MOTION_KIT_DIR });
    expect(r.extensionAlias).toEqual({ ".mjs": [".mjs"], ".js": [".ts", ".tsx", ".js"] });
    expect((r.plugins as unknown[]).some((x) => x instanceof NestedNodeModulesPlugin)).toBe(true);
  });
});
