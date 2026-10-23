// Отдача файла версии или экспорта с поддержкой Range (перемотка видео в плеере): один
// диапазон → 206 + Content-Range; несколько или неразборчивый — весь файл (200); вне файла — 416.
// Путь собирает сервер из строки БД; путь клиента сюда не попадает.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import { notFound } from "./errors.js";

export type ByteRange = { start: number; end: number };

/** `Range: bytes=a-b | a- | -n` против размера файла; `undefined` — заголовка нет или он не годится. */
export function parseRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | undefined {
  if (!header) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return undefined;
  const [, a, b] = m;
  if (a === "" && b === "") return undefined;
  if (a === "") {
    const n = Number(b);
    if (n === 0 || size === 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export interface SendFileOptions {
  contentType: string;
  /** Имя файла для `Content-Disposition: attachment`. */
  attachment?: string;
}

export async function sendFile(req: FastifyRequest, reply: FastifyReply, path: string, o: SendFileOptions): Promise<FastifyReply> {
  let size: number;
  try {
    const st = await stat(path);
    if (!st.isFile()) throw notFound("файл");
    size = st.size;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw notFound("файл");
    throw e;
  }
  reply.header("accept-ranges", "bytes").header("content-type", o.contentType).header("cache-control", "no-cache");
  if (o.attachment) reply.header("content-disposition", `attachment; filename="${o.attachment.replace(/[^\w.-]/g, "_")}"`);
  // HEAD: пустой поток, а не undefined — иначе Fastify перепишет Content-Length в 0 (F5)
  const body = (r?: { start: number; end: number }) => (req.method === "HEAD" ? Readable.from([]) : createReadStream(path, r));
  const range = parseRange(req.headers.range, size);
  if (range === "unsatisfiable") return reply.status(416).header("content-range", `bytes */${size}`).send();
  if (!range) {
    reply.header("content-length", size);
    return reply.status(200).send(body());
  }
  reply.header("content-range", `bytes ${range.start}-${range.end}/${size}`).header("content-length", range.end - range.start + 1);
  return reply.status(206).send(body(range));
}
