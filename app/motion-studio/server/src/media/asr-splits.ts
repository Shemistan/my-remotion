// Разрезы звука для воркера ASR (Task 26): воркер режет запись по `--splits` и распознаёт
// куски по отдельности; разрез — в тишине (silencedetect по audio16k), кусок ≤ 290 с
// (ai-platform: «в тишине, кусок ≤ 5 мин»).
import { type RunRef, runTool } from "./ffmpeg.js";

export interface Silence {
  start_s: number;
  end_s: number;
}

/** Длина куска по умолчанию, с. */
export const MAX_CHUNK_S = 290;
/** Последний кусок короче этого — последний разрез сдвигается раньше, с (ревью Task 26, m2). */
export const MIN_TAIL_S = 30;

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Ближайшая к `target` середина тишины в `[lo, hi]`, иначе `undefined`. */
function nearest(mids: number[], lo: number, hi: number, target: number): number | undefined {
  let best: number | undefined;
  for (const m of mids) if (m >= lo && m <= hi && (best === undefined || Math.abs(m - target) < Math.abs(best - target))) best = m;
  return best;
}

/**
 * Точки разреза (ревью Task 26, m2). В окне `[начало, начало + maxChunkS]` разрез — середина
 * самой поздней тишины во второй половине окна (кусок не короче maxChunkS / 2); нет такой
 * тишины — жёсткий разрез равными частями остатка (`остаток / ⌈остаток / maxChunkS⌉`). Если после
 * разреза остался последний кусок короче 30 с, разрез переносится: два последних куска
 * уравниваются — тишина, ближайшая к середине остатка (оба куска ≤ maxChunkS и ≥ 30 с), иначе сама
 * середина. Остаток ≤ maxChunkS — без разреза.
 */
export function chooseSplits(silences: Silence[], durationS: number, maxChunkS = MAX_CHUNK_S): number[] {
  const mids = silences
    .filter((s) => Number.isFinite(s.start_s) && Number.isFinite(s.end_s) && s.end_s >= s.start_s)
    .map((s) => (s.start_s + s.end_s) / 2)
    .sort((a, b) => a - b);
  const out: number[] = [];
  let start = 0;
  while (start + maxChunkS < durationS) {
    const rest = durationS - start;
    const limit = start + maxChunkS;
    const inWindow = mids.filter((m) => m >= start + maxChunkS / 2 && m <= limit);
    let cut = inWindow.length > 0 ? inWindow.at(-1)! : start + rest / Math.ceil(rest / maxChunkS);
    if (durationS - cut <= maxChunkS && durationS - cut < Math.min(MIN_TAIL_S, rest / 2)) {
      const half = start + rest / 2;
      cut = nearest(mids, Math.max(start + MIN_TAIL_S, durationS - maxChunkS), Math.min(limit, durationS - MIN_TAIL_S), half) ?? half;
    }
    cut = round3(cut);
    out.push(cut);
    start = cut;
  }
  return out;
}

/**
 * Пары `silence_start` / `silence_end` из stderr ffmpeg (`silencedetect`). Отрицательное
 * начало (фильтр вычитает длительность) — 0; незакрытая тишина в конце отбрасывается.
 */
export function parseSilencedetect(stderr: string): Silence[] {
  const out: Silence[] = [];
  let open: number | undefined;
  for (const m of stderr.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)/g)) {
    const v = Number(m[2]);
    if (!Number.isFinite(v)) continue;
    if (m[1] === "start") open = Math.max(0, v);
    else if (open !== undefined) {
      out.push({ start_s: open, end_s: v });
      open = undefined;
    }
  }
  return out;
}

/** Порог и минимальная длительность тишины для разрезов (план: `-35dB:d=0.4`). */
export const SILENCE_FILTER = "silencedetect=noise=-35dB:d=0.4";

/**
 * silencedetect по wav (audio16k). Строки тишины берутся из потока stderr целиком (хвост
 * `runTool` короток для длинной записи); вход — `file:` с `-protocol_whitelist file`.
 */
export async function detectSilences(wav: string, o: { run?: RunRef; signal: AbortSignal; timeoutMs?: number }): Promise<Silence[]> {
  let buf = "";
  let lines = "";
  const r = await runTool("ffmpeg", [
    "-hide_banner", "-nostdin", "-nostats", "-protocol_whitelist", "file", "-f", "wav", "-i", `file:${wav}`,
    "-vn", "-af", SILENCE_FILTER, "-f", "null", "-",
  ], {
    ...(o.run ? { run: o.run } : {}),
    signal: o.signal,
    ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
    onStderr: (d) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.includes("silence_")) lines += line + "\n";
      }
      if (buf.length > 64 * 1024) buf = buf.slice(-1024); // строка без перевода — не тишина
    },
  });
  if (r.code !== 0) throw new Error(`silencedetect: ffmpeg код ${r.code}: ${r.stderrTail.trim().slice(-1000)}`);
  if (buf.includes("silence_")) lines += buf;
  return parseSilencedetect(lines);
}
