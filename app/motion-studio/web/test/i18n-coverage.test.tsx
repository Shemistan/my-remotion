import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { ru } from "../src/i18n/ru.js";

const SRC = join(import.meta.dirname, "../src");
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const dictionaries = walk(join(SRC, "i18n")).filter((f) => /ru(?:-[a-z-]+)?\.ts$/.test(f));
const components = walk(SRC).filter((f) => f.endsWith(".tsx"));
const code = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !f.includes("/i18n/"));

const executable = (src: string) => src
  .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|\s)\/\/.*$/gm, "$1");

it("все ru-словари подключены к общему словарю", () => {
  const root = readFileSync(join(SRC, "i18n/ru.ts"), "utf8");
  const missing = dictionaries
    .filter((f) => !f.endsWith("/ru.ts"))
    .filter((f) => !root.includes(`./${f.split("/").at(-1)!.replace(/\.ts$/, ".js")}`))
    .map((f) => relative(SRC, f));
  expect(missing).toEqual([]);
});

it("видимая кириллица в TSX находится только в словарях", () => {
  const bad = components.filter((f) => /[А-Яа-яЁё]/.test(executable(readFileSync(f, "utf8")))).map((f) => relative(SRC, f));
  expect(bad).toEqual([]);
});

it("литеральные ключи t/tk из кода существуют", () => {
  const missing = new Set<string>();
  for (const f of code) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/\b(?:t|tk)\(\s*["']([a-zA-Z0-9_.-]+)["']/g)) if (!(m[1]! in ru)) missing.add(m[1]!);
  }
  expect([...missing]).toEqual([]);
});
