// Компоненты motion-kit, импортированные кодом версии: `VersionDto.kit_components` (routes/versions)
// и разнообразие пакета сценария (script/diversity, S11).
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
