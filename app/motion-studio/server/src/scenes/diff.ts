// Сравнение версий (`05` §5): JSON — собственный обход с путями JSON Pointer, файлы `src/**` — unified diff.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTwoFilesPatch } from "diff";
import type { JsonChange, VersionDiff, VersionManifest } from "@ms/contracts";

const esc = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Изменения от `a` к `b`: путь — JSON Pointer (RFC 6901), ключи объектов по алфавиту,
 * массивы — по индексам. Нет `before` — значение добавлено, нет `after` — удалено;
 * смена типа — замена значения целиком.
 */
export function jsonDiff(a: unknown, b: unknown, path = ""): JsonChange[] {
  if (a === undefined && b === undefined) return [];
  if (a === undefined) return [{ path, after: b }];
  if (b === undefined) return [{ path, before: a }];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: JsonChange[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...jsonDiff(a[i], b[i], `${path}/${i}`));
    return out;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => jsonDiff(a[k], b[k], `${path}/${esc(k)}`));
  }
  return Object.is(a, b) ? [] : [{ path, before: a, after: b }];
}

const MAX_UNIFIED_BYTES = 256 * 1024;

function text(dir: string, path: string): string | undefined {
  const buf = readFileSync(join(dir, path));
  if (buf.length > MAX_UNIFIED_BYTES || buf.includes(0)) return undefined; // бинарный или слишком большой
  return buf.toString("utf8");
}

/** Файлы `src/**` двух версий по sha256 из manifest; для отличающихся текстовых — unified diff. */
export function srcFilesDiff(
  a: { dir: string; manifest: VersionManifest },
  b: { dir: string; manifest: VersionManifest },
): VersionDiff["files"] {
  const src = (m: VersionManifest) => new Map(m.files.filter((f) => f.path.startsWith("src/")).map((f) => [f.path, f.sha256]));
  const fa = src(a.manifest);
  const fb = src(b.manifest);
  const paths = [...new Set([...fa.keys(), ...fb.keys()])].sort();
  return paths.map((path) => {
    const ha = fa.get(path);
    const hb = fb.get(path);
    const status = ha === undefined ? "added" : hb === undefined ? "removed" : ha === hb ? "same" : "changed";
    if (status === "same") return { path, status };
    const before = ha === undefined ? "" : text(a.dir, path);
    const after = hb === undefined ? "" : text(b.dir, path);
    if (before === undefined || after === undefined) return { path, status };
    return { path, status, unified: createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after) };
  });
}
