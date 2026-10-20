import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** sha256 файла; с `sync` тем же дескриптором делает fsync (данные на диске до публикации). */
export async function sha256File(path: string, opts: { sync?: boolean } = {}): Promise<string> {
  const h = createHash("sha256");
  const fh = await open(path, "r");
  try {
    for await (const chunk of fh.createReadStream({ autoClose: false, start: 0 })) h.update(chunk as Buffer);
    if (opts.sync) await fh.sync();
  } finally {
    await fh.close();
  }
  return h.digest("hex");
}
