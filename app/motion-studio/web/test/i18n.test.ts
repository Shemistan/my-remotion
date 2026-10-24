// Строки интерфейса — только через `t(key)` из `src/i18n/ru.ts` (Global Constraints Phase 1):
// кириллица в коде UI вне словаря — ошибка; каждый ключ `t("…")` есть в словаре; данные не
// попадают в разметку как HTML.
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import { t } from "../src/i18n/index.js";
import { ru } from "../src/i18n/ru.js";

const SRC = join(import.meta.dirname, "../src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

const sources = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(join("i18n", "ru.ts")));

/** Импорты и комментарии: в них кириллица допустима (комментарии — по-русски, ruling 8). */
export function stripImports(src: string): string {
  return src
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

/** Ключи из вызовов `t("…")` и `tk("…")` (строковые литералы). */
export function usedKeys(files: string[]): string[] {
  const keys = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/\b(?:t|tk)\(\s*["']([a-zA-Z0-9_.]+)["']/g)) keys.add(m[1]!);
  return [...keys];
}

it("кириллица в коде UI — только в словаре ru.ts", () => {
  expect(sources.length).toBeGreaterThan(20);
  const bad = sources.filter((f) => /[А-Яа-яЁё]/.test(stripImports(readFileSync(f, "utf8")))).map((f) => relative(SRC, f));
  expect(bad).toEqual([]);
});

it("stripImports не прячет строки: кириллица в JSX и строке ловится", () => {
  expect(stripImports('const a = "Привет"; // комментарий')).toMatch(/[А-Яа-я]/);
  expect(stripImports("<b>Текст</b>")).toMatch(/[А-Яа-я]/);
  expect(stripImports('const u = "http://x"; /* блок */')).toContain("http://x");
  expect(stripImports("// только комментарий\n/* и блок */")).not.toMatch(/[А-Яа-я]/);
});

it("все ключи t() есть в словаре", () => {
  const used = usedKeys(sources);
  expect(used.length).toBeGreaterThan(50);
  expect(used.filter((k) => !(k in ru))).toEqual([]);
});

it("ключи словаря плоские `раздел.ключ`, значения — непустые строки", () => {
  for (const [k, v] of Object.entries(ru)) {
    expect(k).toMatch(/^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_-]+)+$/);
    expect(typeof v).toBe("string");
    expect(v.trim().length).toBeGreaterThan(0);
  }
});

it("t подставляет параметры, неизвестный параметр остаётся как есть", () => {
  expect(t("player.frame", { frame: 11, total: 150 })).toBe("Кадр 11 / 150");
  expect(t("versions.label", { n: 3 })).toBe("v3");
  expect(t("player.frame", { frame: 1 })).toContain("{total}");
});

it("данные не попадают в разметку как HTML", () => {
  for (const f of sources) {
    const src = readFileSync(f, "utf8");
    expect(src, relative(SRC, f)).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/);
  }
});

it("usedKeys ловит и литеральные tk(\"…\")", () => {
  const f = join(mkdtempSync(join(tmpdir(), "i18n-")), "x.tsx");
  writeFileSync(f, 'const a = t("a.b"); const b = tk("c.d", "x"); const c = tk(`e.${x}`, x);');
  expect(usedKeys([f]).sort()).toEqual(["a.b", "c.d"]);
});

const APP = join(import.meta.dirname, "../..");
/** Коды замечаний QA, которые порождает сервер (`code: "…", severity`) и просит промпт Visual QA. */
function qaCodes(): string[] {
  const codes = new Set<string>();
  const files = [...walk(join(APP, "server/src/qa")), join(APP, "server/src/pipeline/provenance.ts")];
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/code: "([a-z_]+)",\s*severity/g)) codes.add(m[1]!);
  const prompt = readFileSync(join(APP, "prompts/visual-qa.md"), "utf8");
  const list = /`code` \(коротко, латиницей:([\s\S]*?)\),/.exec(prompt)?.[1] ?? "";
  for (const m of list.matchAll(/`([a-z_]+)`/g)) codes.add(m[1]!);
  return [...codes].sort();
}

it("коды замечаний QA (сервер и промпт Visual QA) переведены: qa.code.*", () => {
  const codes = qaCodes();
  expect(codes.length).toBeGreaterThan(30);
  expect(codes.filter((c) => !(`qa.code.${c}` in ru))).toEqual([]);
});

it("этапы задач (FailureStage и прогресс) переведены: stage.*", () => {
  const src = walk(join(APP, "server/src")).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(f, "utf8")).join("\n");
  const stages = new Set<string>();
  for (const m of src.matchAll(/stage: "([a-z_]+)"/g)) stages.add(m[1]!);
  for (const m of src.matchAll(/progress\([^)]*?"([a-z_]+)"\)/g)) stages.add(m[1]!);
  for (const m of readFileSync(join(APP, "contracts/src/failure.ts"), "utf8").matchAll(/^\s*"([a-z_]+)",?$/gm)) stages.add(m[1]!);
  expect(stages.size).toBeGreaterThan(15);
  expect([...stages].filter((s) => !(`stage.${s}` in ru))).toEqual([]);
});
