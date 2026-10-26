// Место под импорт (Task 25) и финал (Task 43): оценка до работы, чтобы не упереться в диск посреди неё.
import type { FinalQuality } from "@ms/contracts";

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

/** Бит на пиксель кадра финала H.264 по качеству (CRF 16 / 20 / 24) — с запасом. */
export const FINAL_BITS_PER_PIXEL: Record<FinalQuality, number> = { high: 0.12, standard: 0.08, draft: 0.05 };
/** Запас под временные файлы рендера финала (кадры и куски кодирования Remotion, копия WAV). */
export const FINAL_RESERVE_BYTES = 1_000_000_000;
/**
 * master x264 CRF 12 — почти без потерь: бит на пиксель кадра (ADR 0010). Калибровка приёмки Task 43:
 * 4K 272 с живой съёмки → 3,9 ГБ ≈ 0,46 бит/пиксель; с запасом — 0,5.
 */
export const MASTER_BITS_PER_PIXEL = 0.5;

/** Файл финала + запас, байт: `round(w·h·кадры·k(q)/8) + 1 ГБ`. */
export function estimateFinalBytes(i: { frames: number; width: number; height: number; quality: FinalQuality }): number {
  return Math.round((i.width * i.height * i.frames * FINAL_BITS_PER_PIXEL[i.quality]) / 8) + FINAL_RESERVE_BYTES;
}

/** CFR master исходника (если его нет в кэше), байт. */
export function estimateMasterBytes(i: { frames: number; width: number; height: number }): number {
  return Math.round((i.width * i.height * i.frames * MASTER_BITS_PER_PIXEL) / 8);
}

/** `edited-audio.wav`: 48 кГц `pcm_s24le` + заголовок, байт. */
export function editedAudioBytes(i: { durationUs: number; channels: number }): number {
  return Math.round((i.durationUs * 48_000) / 1_000_000) * 3 * i.channels + 44;
}

const GiB = 1024 ** 3;
export const gib = (b: number): string => `${(b / GiB).toFixed(2)} ГиБ`;
