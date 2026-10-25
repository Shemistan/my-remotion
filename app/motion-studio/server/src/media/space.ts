// Место под импорт (Task 25): оценка до копирования, чтобы не упереться в диск посреди работы.

/** Прокси ≈ 2,5 Мбит/с, audio16k = 32 000 Б/с, запас на миниатюры, waveform и метаданные. */
const PROXY_BYTES_PER_S = 312_500;
const AUDIO16K_BYTES_PER_S = 32_000;
const RESERVE_BYTES = 50_000_000;

/** Копия (на том же томе — APFS-клон, 0) + прокси + audio16k + запас, байт. */
export function estimateImportBytes(i: { sizeBytes: number; durationUs: number; sameVolume: boolean }): number {
  const s = i.durationUs / 1_000_000;
  return Math.ceil((i.sameVolume ? 0 : i.sizeBytes) + PROXY_BYTES_PER_S * s + AUDIO16K_BYTES_PER_S * s + RESERVE_BYTES);
}

/** После импорта на томе должно остаться `minFreeBytes` (порог StorageGuard); `needBytes` — сколько нужно свободно всего. */
export function checkImportSpace(est: number, freeBytes: number, minFreeBytes: number): { ok: true } | { ok: false; code: "low_space"; needBytes: number } {
  const need = est + minFreeBytes;
  return freeBytes >= need ? { ok: true } : { ok: false, code: "low_space", needBytes: need };
}

const GiB = 1024 ** 3;
export const gib = (b: number): string => `${(b / GiB).toFixed(2)} ГиБ`;
