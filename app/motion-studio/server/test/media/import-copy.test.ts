// S17c (F4 приёмки Phase 2): копия оригинала читает исходник один раз — хеш при копировании,
// неизменность источника — по отпечатку stat (размер, inode, mtime/ctime в нс) до и после.
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { chmod, mkdir, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { REPO_TMP } from "../db/helpers.js";

const hashed = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock("../../src/scenes/hash.js", async (orig) => {
  const m = await orig<typeof import("../../src/scenes/hash.js")>();
  return { ...m, sha256File: (p: string, o?: Parameters<typeof m.sha256File>[1]) => (hashed.paths.push(p), m.sha256File(p, o)) };
});
const { copyOriginal } = await import("../../src/media/import.js");

let tmp: string;
beforeAll(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-import-copy-"));
});
afterAll(async () => {
  for (const d of readdirSync(tmp, { withFileTypes: true })) {
    if (d.isDirectory()) for (const f of readdirSync(join(tmp, d.name))) await chmod(join(tmp, d.name, f), 0o644).catch(() => undefined);
  }
  await rm(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  hashed.paths.length = 0;
});

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("copyOriginal: один проход чтения (S17c)", () => {
  for (const forceStream of [false, true]) {
    it(`${forceStream ? "потоковая копия" : "APFS-клон"}: прочитано ровно size байт, исходник хешем не перечитывается, sha256 копии = sha256 данных`, async () => {
      const data = Buffer.alloc(3 * 1024 * 1024 + 11);
      for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;
      const src = join(tmp, `src-${forceStream}.mov`);
      await writeFile(src, data);
      let bytes = 0;
      const r = await copyOriginal(src, join(tmp, `dest-${forceStream}`), { forceStream, onBytes: (n) => (bytes += n) });
      expect(r).toMatchObject({ sha256: sha(data), srcSha256Before: sha(data), srcSha256After: sha(data), cloned: !forceStream });
      expect(bytes).toBe(data.length);
      expect(hashed.paths).not.toContain(src);
    });
  }

  it("исходник переписан на месте тем же размером после копии → media_invalid, копия удалена", async () => {
    for (const forceStream of [false, true]) {
      const src = join(tmp, `inplace-${forceStream}.mov`);
      await writeFile(src, Buffer.alloc(1024 * 1024, 1));
      const dest = join(tmp, `dest-inplace-${forceStream}`);
      const rewrite = async () => {
        const fh = await open(src, "r+");
        await fh.write(Buffer.from("XX"), 0, 2, 100);
        await fh.close();
      };
      await expect(copyOriginal(src, dest, { forceStream, onCopied: rewrite })).rejects.toThrow(/media_invalid.*изменился/);
      expect(readdirSync(dest)).toEqual([]);
    }
  });

  it("sha256 источника от вызывающего не совпал с копией → media_invalid, копия удалена", async () => {
    const src = join(tmp, "known.mov");
    await writeFile(src, Buffer.alloc(4096, 9));
    const dest = join(tmp, "dest-known");
    await expect(copyOriginal(src, dest, { srcSha256: "0".repeat(64) })).rejects.toThrow(/media_invalid.*изменился/);
    expect(readdirSync(dest)).toEqual([]);
  });
});
