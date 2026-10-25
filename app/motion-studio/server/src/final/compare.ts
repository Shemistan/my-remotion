// Воспроизводимость финала (Task 44): два экспорта одного (ревизия таймлайна, настройки) —
// одинаковые входы и ffprobe, 12 кадров попарно PSNR ≥ 50 дБ. Совпадение sha256 файла пишется
// отдельно и не требуется (x264 и AAC не обязаны давать байт в байт тот же файл).
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { FinalManifest } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { ffprobe } from "@ms/render";
import { type MediaCtx, extractFrame, psnr } from "./frames.js";

export const REPRODUCE_MIN_PSNR_DB = 50;
export const REPRODUCE_FRAMES = 12;

export interface CompareResult {
  inputs_equal: boolean;
  probe_equal: boolean;
  frames: { frame: number; psnr_db: number }[];
  file_sha256_equal: boolean;
  verdict: "reproduced" | "differs";
}

/** `n` кадров равномерно по `[0, total)`: середины равных долей. */
export function evenFrames(total: number, n = REPRODUCE_FRAMES): number[] {
  const k = Math.min(n, total);
  return Array.from({ length: k }, (_, i) => Math.floor(((i + 0.5) * total) / k));
}

async function fileSha256(path: string): Promise<string> {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest("hex");
}

type Export = FinalManifest & { path: string };

/** Входы экспорта: хеш входов, сами входы и настройки. */
const inputsKey = (m: FinalManifest): string => canonicalHash({ inputs_hash: m.inputs_hash, inputs: m.inputs, request: m.request, timeline: m.timeline });

/**
 * Сравнение двух экспортов: `reproduced`, если входы и ffprobe файлов совпадают, а 12 кадров
 * попарно PSNR ≥ 50 дБ. `workDir` — каталог для кадров (Task 44: черновик попытки).
 */
export async function compareExports(a: Export, b: Export, o: MediaCtx & { workDir: string }): Promise<CompareResult> {
  const inputs_equal = inputsKey(a) === inputsKey(b);
  const [pa, pb] = [await ffprobe(a.path), await ffprobe(b.path)];
  const probe_equal = canonicalHash(pa) === canonicalHash(pb);
  const fps = a.output.fps;
  const frames: CompareResult["frames"] = [];
  for (const f of evenFrames(Math.min(a.output.frames, b.output.frames))) {
    const fa = await extractFrame(a.path, f, fps, join(o.workDir, `a-${f}.png`), undefined, o);
    const fb = await extractFrame(b.path, f, b.output.fps, join(o.workDir, `b-${f}.png`), undefined, o);
    frames.push({ frame: f, psnr_db: Math.round((await psnr(fa, fb, o)) * 100) / 100 });
  }
  const file_sha256_equal = (await fileSha256(a.path)) === (await fileSha256(b.path));
  const ok = inputs_equal && probe_equal && frames.length > 0 && frames.every((x) => x.psnr_db >= REPRODUCE_MIN_PSNR_DB);
  return { inputs_equal, probe_equal, frames, file_sha256_equal, verdict: ok ? "reproduced" : "differs" };
}
