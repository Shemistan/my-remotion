import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export interface Sha256FileOptions {
  /** Тем же дескриптором fsync (данные на диске до публикации). */
  sync?: boolean;
  /** Отмена между кусками чтения (большие исходники видео — десятки ГБ). */
  signal?: AbortSignal;
  /** Прочитано байт (прирост) — прогресс этапа. */
  onBytes?: (n: number) => void;
}

/** sha256 файла; с `sync` тем же дескриптором делает fsync. Отмена — `AbortError` из `signal`. */
export async function sha256File(path: string, opts: Sha256FileOptions = {}): Promise<string> {
  opts.signal?.throwIfAborted();
  const h = createHash("sha256");
  const fh = await open(path, "r");
  try {
    const stream = fh.createReadStream({ autoClose: false, start: 0, highWaterMark: 1024 * 1024, ...(opts.signal ? { signal: opts.signal } : {}) });
    for await (const chunk of stream) {
      h.update(chunk as Buffer);
      opts.onBytes?.((chunk as Buffer).length);
    }
    opts.signal?.throwIfAborted();
    if (opts.sync) await fh.sync();
  } finally {
    await fh.close();
  }
  return h.digest("hex");
}
