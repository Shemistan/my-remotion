// Шоты исходника (Task 30): смены сцен фильтром ffmpeg `scdet` по прокси (время прокси =
// время исходника, Task 25) → границы шотов; шоты короче секунды сливаются со следующим.
import { runTool, type RunRef } from "../media/ffmpeg.js";
import { FfmpegError } from "../media/ffmpeg.js";

/** Порог `scdet` (0–100, по умолчанию ffmpeg — 10). */
export const SCDET_THRESHOLD = 10;
/** Ширина кадра для `scdet`: смена сцены видна и на уменьшенном кадре, а декод дешевле. */
const SCDET_WIDTH = 320;

export interface Shot {
  id: string;
  start_us: number;
  end_us: number;
}

/** Моменты смен сцен из лога `metadata=print` (`lavfi.scd.time=<с>`) → µs, по возрастанию, без повторов. */
export function parseScdet(stderr: string): number[] {
  const out = new Set<number>();
  for (const m of stderr.matchAll(/lavfi\.scd\.time=(-?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?)/gi)) {
    const s = Number(m[1]);
    if (Number.isFinite(s) && s >= 0) out.add(Math.round(s * 1e6));
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Шоты по моментам смен: смена принимается, если от прошлой границы прошло не меньше
 * `minShotUs`; последний шот короче `minShotUs` сливается с предыдущим. Без смен — один шот.
 */
export function shotsFromCuts(cutsUs: number[], durationUs: number, minShotUs = 1_000_000): Shot[] {
  const bounds = [0];
  for (const c of [...cutsUs].sort((a, b) => a - b)) {
    if (c <= 0 || c >= durationUs) continue;
    if (c - bounds.at(-1)! >= minShotUs) bounds.push(c);
  }
  while (bounds.length > 1 && durationUs - bounds.at(-1)! < minShotUs) bounds.pop();
  bounds.push(durationUs);
  return bounds.slice(0, -1).map((s, k) => ({ id: `sh_${k + 1}`, start_us: s, end_us: bounds[k + 1]! }));
}

/** Аргументы ffmpeg для `scdet` по прокси (mp4): только `file:` и явный демультиплексор. */
export function scdetArgs(proxy: string, threshold = SCDET_THRESHOLD): string[] {
  return [
    "-hide_banner", "-nostdin", "-nostats", "-v", "info",
    "-protocol_whitelist", "file", "-f", "mov", "-i", `file:${proxy}`,
    "-an", "-sn", "-dn",
    "-vf", `scale=${SCDET_WIDTH}:-2,scdet=threshold=${threshold}:sc_pass=1,metadata=mode=print:key=lavfi.scd.time`,
    "-f", "null", "-",
  ];
}

/** Смены сцен прокси (µs). Строки лога читаются потоком: хвост stderr для длинного ролика короток. */
export async function detectCuts(proxy: string, o: { run?: RunRef; signal: AbortSignal; timeoutMs?: number }): Promise<number[]> {
  let buf = "";
  const found: string[] = [];
  const r = await runTool("ffmpeg", scdetArgs(proxy), {
    ...(o.run ? { run: o.run } : {}),
    signal: o.signal,
    ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
    onStderr: (d) => {
      buf += d;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.includes("lavfi.scd.time=")) found.push(line);
      }
      if (buf.length > 64 * 1024) buf = buf.slice(-1024);
    },
  });
  if (buf.includes("lavfi.scd.time=")) found.push(buf);
  if (r.code !== 0) throw new FfmpegError("failed", `ffmpeg scdet: код ${r.code}: ${r.stderrTail.trim().slice(-2000)}`);
  return parseScdet(found.join("\n"));
}
