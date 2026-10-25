// S17c (F4 приёмки Phase 2): копия оригинала читает исходник один раз — хеш при копировании,
// неизменность источника — по отпечатку stat (размер, inode, mtime/ctime в нс) до и после.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, openSync, readdirSync, statSync, writeSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, open, rename, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { REPO_TMP } from "../db/helpers.js";

const hashed = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock("../../src/scenes/hash.js", async (orig) => {
  const m = await orig<typeof import("../../src/scenes/hash.js")>();
  return { ...m, sha256File: (p: string, o?: Parameters<typeof m.sha256File>[1]) => (hashed.paths.push(p), m.sha256File(p, o)) };
});
const { copyOriginal, sampleOffsets, SAMPLE_BLOCK } = await import("../../src/media/import.js");

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

  it("ревью S17c I2: перезапись того же размера с прежним mtime (как на exFAT/FAT) — ловят выборочные блоки", async () => {
    for (const forceStream of [false, true]) {
      const src = join(tmp, `samesize-${forceStream}.mov`);
      await writeFile(src, Buffer.alloc(3 * 1024 * 1024, 2));
      const dest = join(tmp, `dest-samesize-${forceStream}`);
      await utimes(src, 1_700_000_000, 1_700_000_000); // целые секунды — восстановимы точно
      const rewrite = async () => {
        const fh = await open(src, "r+");
        await fh.write(Buffer.from("XX"), 0, 2, 100); // в первом МиБ — блок начала проверяется всегда
        await fh.close();
        await utimes(src, 1_700_000_000, 1_700_000_000); // ФС без надёжного времени: mtime прежний
        expect(statSync(src, { bigint: true }).mtimeNs).toBe(1_700_000_000_000_000_000n);
      };
      await expect(copyOriginal(src, dest, { forceStream, onCopied: rewrite })).rejects.toThrow(/media_invalid.*изменился/);
      expect(readdirSync(dest)).toEqual([]);
    }
  });

  it("ревью S17c I2: xattr источника (Finder/Spotlight) меняет ctime — не ошибка", async () => {
    for (const forceStream of [false, true]) {
      const src = join(tmp, `xattr-${forceStream}.mov`);
      await writeFile(src, Buffer.alloc(2 * 1024 * 1024, 4));
      const r = await copyOriginal(src, join(tmp, `dest-xattr-${forceStream}`), {
        forceStream, onCopied: () => void execFileSync("xattr", ["-w", "com.apple.metadata:kMDItemWhereFroms", "x", src]),
      });
      expect(r.sha256).toBe(sha(Buffer.alloc(2 * 1024 * 1024, 4)));
    }
  });

  it("ревью S17c: запись в источник между чанками потоковой копии → media_invalid", async () => {
    const src = join(tmp, "during.mov");
    await writeFile(src, Buffer.alloc(4 * 1024 * 1024, 6));
    const dest = join(tmp, "dest-during");
    let done = false;
    const onBytes = () => {
      if (done) return;
      done = true;
      const fd = openSync(src, "r+");
      writeSync(fd, Buffer.alloc(4096, 0x55), 0, 4096, 3 * 1024 * 1024);
      closeSync(fd);
    };
    await expect(copyOriginal(src, dest, { forceStream: true, onBytes })).rejects.toThrow(/media_invalid.*изменился/);
    expect(readdirSync(dest)).toEqual([]);
  });

  it("ревью S17c: путь подменён другим файлом (новый inode) → media_invalid «подменён»", async () => {
    for (const forceStream of [false, true]) {
      const src = join(tmp, `swap-${forceStream}.mov`);
      await writeFile(src, Buffer.alloc(1024 * 1024, 8));
      const dest = join(tmp, `dest-swap-${forceStream}`);
      const swap = async () => {
        await rename(src, `${src}.old`);
        await copyFile(`${src}.old`, src);
      };
      await expect(copyOriginal(src, dest, { forceStream, onCopied: swap })).rejects.toThrow(/media_invalid.*подменён/);
      expect(readdirSync(dest)).toEqual([]);
    }
  });

  it("sampleOffsets: 6 блоков — начало, конец и 4 детерминированных внутри файла", () => {
    const h = "ab".repeat(32);
    const size = 11 * 1024 ** 3;
    const o = sampleOffsets(size, h);
    expect(o).toHaveLength(6);
    expect(o.slice(0, 2)).toEqual([0, size - SAMPLE_BLOCK]);
    expect(o.every((x) => x >= 0 && x <= size - SAMPLE_BLOCK)).toBe(true);
    expect(sampleOffsets(size, h)).toEqual(o);
    expect(sampleOffsets(size, "cd".repeat(32)).slice(2)).not.toEqual(o.slice(2));
    expect(sampleOffsets(1000, h)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("sha256 источника от вызывающего не совпал с копией → media_invalid, копия удалена", async () => {
    const src = join(tmp, "known.mov");
    await writeFile(src, Buffer.alloc(4096, 9));
    const dest = join(tmp, "dest-known");
    await expect(copyOriginal(src, dest, { srcSha256: "0".repeat(64) })).rejects.toThrow(/media_invalid.*изменился/);
    expect(readdirSync(dest)).toEqual([]);
  });
});
