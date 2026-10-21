/** Время в формате столбцов БД: ISO 8601 UTC с миллисекундами. */
export const nowIso = (): string => new Date().toISOString();

export const toJson = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
export const fromJson = <T>(s: string | null): T | null => (s === null ? null : (JSON.parse(s) as T));
