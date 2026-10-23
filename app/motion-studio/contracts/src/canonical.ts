import { createHash } from "node:crypto";

/**
 * Канонический JSON: ключи объектов по алфавиту (кодовые единицы), массивы как есть, `undefined`
 * в объекте опускается. NaN/Infinity, функции, BigInt и т. п. — ошибка, а не тихий `null`.
 * Импорт — `@ms/contracts/canonical` (в индекс не входит: `node:crypto` не для web).
 */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new TypeError(`canonicalJson: число ${v} не представимо в JSON`);
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x)).join(",")}]`;
  const proto = typeof v === "object" ? Object.getPrototypeOf(v) as unknown : undefined;
  if (proto === Object.prototype || proto === null) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  throw new TypeError(`canonicalJson: неподдерживаемое значение (${typeof v})`);
}

/** sha256 hex канонического JSON — `subject_hash` approvals и хеши входов плана. */
export function canonicalHash(v: unknown): string {
  return createHash("sha256").update(canonicalJson(v), "utf8").digest("hex");
}
