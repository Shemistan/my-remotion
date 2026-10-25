// Чтение zip в тестах (центральный каталог, stored/deflate) — проверка архива диагностики.
// `verifyCrc` — сверка CRC-32 распакованных данных с каталогом и локальным заголовком (как
// сторонний распаковщик), а также размеров.
import { readFileSync } from "node:fs";
import { crc32, inflateRawSync } from "node:zlib";

export function readZip(path: string, opts: { verifyCrc?: boolean } = {}): Map<string, Buffer> {
  const buf = readFileSync(path);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("zip: нет конца центрального каталога");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: битая запись каталога");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip: нет локального заголовка ${name}`);
    const lname = buf.readUInt16LE(local + 26);
    const lextra = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lname + lextra, local + 30 + lname + lextra + size);
    const raw = method === 8 ? inflateRawSync(data) : Buffer.from(data);
    if (opts.verifyCrc) {
      if (crc32(raw) !== crc || buf.readUInt32LE(local + 14) !== crc) throw new Error(`zip: CRC ${name} не сходится`);
      if (raw.length !== usize || buf.readUInt32LE(local + 22) !== usize) throw new Error(`zip: размер ${name} не сходится`);
    }
    out.set(name, raw);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

export const zipEntries = (path: string): string[] => [...readZip(path).keys()];
export const zipText = (path: string): string => [...readZip(path).values()].map((b) => b.toString("utf8")).join("\n");
