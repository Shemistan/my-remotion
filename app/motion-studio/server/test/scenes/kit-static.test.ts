// motion-kit проходит ту же статическую проверку, что и код сцены: kit не должен
// пользоваться тем, что запрещено агенту (таймеры, сеть, CSS-анимации, window …).
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { MOTION_KIT_DIR } from "@ms/render";
import { expect, it } from "vitest";
import { type SceneFile, checkSceneSource } from "../../src/scenes/static-check.js";

/** Документы kit (API.md, PROVENANCE.md, OFL.txt) — не код и в бандл не попадают. */
const DOCS = new Set([".md", ".txt"]);

async function list(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await list(p)));
    else out.push(p);
  }
  return out.sort();
}

it("файлы motion-kit проходят checkSceneSource без нарушений", async () => {
  const files: SceneFile[] = [];
  for (const abs of await list(MOTION_KIT_DIR)) {
    if (DOCS.has(extname(abs))) continue;
    const rel = relative(MOTION_KIT_DIR, abs).split("\\").join("/");
    const binary = extname(abs) === ".woff2";
    files.push({ path: `src/${rel}`, text: binary ? "" : await readFile(abs, "utf8") });
  }
  // код и шрифты на месте
  expect(files.some((f) => f.path === "src/index.ts")).toBe(true);
  expect(files.filter((f) => f.path.startsWith("src/components/")).length).toBeGreaterThanOrEqual(7);
  expect(files.filter((f) => f.path.endsWith(".woff2")).length).toBe(20);
  expect(checkSceneSource(files)).toEqual([]);
});
