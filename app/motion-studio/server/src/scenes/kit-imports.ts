// Компоненты motion-kit, импортированные кодом версии: `VersionDto.kit_components` (routes/versions),
// разнообразие пакета сценария (script/diversity, S11) и приём сцены сценария до рендера (S14).
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const KIT_IMPORT_RE = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']@ms\/motion-kit["']/g;

/** Компоненты (имена с заглавной) из `import { A, B as C } from "@ms/motion-kit"`; хуки и токены (`useStyle`, `accent`) и `import type` — нет. */
export function kitImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(KIT_IMPORT_RE)) {
    if (m[1]) continue;
    for (const part of m[2]!.split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (/^[A-Z][\w$]*$/.test(name) && !/^type\s/.test(part.trim())) out.push(name);
    }
  }
  return out;
}

/** Компоненты kit, импортированные кодом `src/**` каталога (версии или draft), по алфавиту; нет `src/` — пусто. */
export async function kitImportsInDir(dir: string): Promise<string[]> {
  const src = join(dir, "src");
  let files: string[];
  try {
    files = await readdir(src, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const f of files) {
    if (!/\.(tsx|ts|jsx|js)$/.test(f)) continue;
    for (const n of kitImports(await readFile(join(src, f), "utf8").catch(() => ""))) out.add(n);
  }
  return [...out].sort();
}
