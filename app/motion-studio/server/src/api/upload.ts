// Потоковая загрузка исходного видео (Task 29, V2; ревью Task 25 M4): `PUT
// /api/projects/:id/media/upload?name=<имя>` — сырое тело пишется сразу в
// `workspace/uploads/<upl_id>/upload.<ext>` (без буфера в памяти). До приёма: ключ
// идемпотентности, видеопроект без исходника, Content-Length обязателен, хранилище доступно и
// места хватит (`checkImportSpace`, иначе 507), не больше `UPLOAD_MAX_BYTES`. Тело короче или
// длиннее заявленного, обрыв соединения — каталог загрузки удаляется, задача не создаётся.
// Имя из query — только для отображения (`displayName`), на диске — серверное имя.
// Ответ до приёма всего тела (ранний отказ, повтор ключа) — `Connection: close` и разрыв
// соединения после ответа: браузер не досылает гигабайты (ревью Task 29 I1).
import { createWriteStream } from "node:fs";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { open, rm } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { CreatedJobDtoSchema, type Job } from "@ms/contracts";
import { safeMkdir } from "@ms/core";
import { z } from "zod";
import { tx } from "../db/tx.js";
import { IdempotencyKeyReusedError, enqueue } from "../jobs/queue.js";
import { checkImportSpace, estimateImportBytes, gib } from "../media/space.js";
import { UPLOADS_REL, displayName, uploadRel } from "../media/uploads.js";
import { videoExt } from "../media/guards.js";
import { newId } from "../scenes/ids.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "./context.js";
import { ApiError } from "./errors.js";
import { publicJob } from "./job-dto.js";
import { importTarget } from "./routes/media.js";

/** Лимит загрузки (V2): 64 ГиБ. */
export const UPLOAD_MAX_BYTES = 64 * 1024 ** 3;

const Query = z.object({ name: z.string().min(1).max(1000) }).strict();

/** Считает байты потока; больше `max` — ошибка (поток рвётся, файл не дописывается). */
function counter(max: number, onBytes: (n: number) => void): Transform {
  let n = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      n += chunk.length;
      onBytes(n);
      if (n > max) cb(new ApiError(400, "upload_length_mismatch", "тело длиннее заявленного Content-Length"));
      else cb(null, chunk);
    },
  });
}

/**
 * Пауза перед разрывом: клиент успевает прочитать ответ — разрыв при непрочитанном теле в
 * буфере сокета уходит RST, и ответ, ещё не прочитанный клиентом, теряется. Пока ждём, сокет не
 * читается: отправитель упирается в окно TCP и не шлёт дальше.
 */
const CLOSE_GRACE_MS = 2_000;

/**
 * Тело принято не целиком, а ответ уже уходит: сокет больше не читается (отправитель упирается
 * в окно TCP), после ответа — FIN и через `CLOSE_GRACE_MS` разрыв. Node после ответа сам
 * «досасывает» непрочитанное тело (`req._dump()` → `socket.resume()`) и при `Connection: close`
 * рвёт сокет сразу после FIN (`destroySoon`) — у этого сокета оба действия подменены: он всё
 * равно закрывается и в пул keep-alive не вернётся.
 */
function stopReceiving(raw: IncomingMessage, onFinish: (cb: () => void) => void): void {
  const socket = raw.socket as (Socket & { destroySoon?: () => void }) | undefined;
  // app.inject: сокета нет — нечего закрывать
  if (!socket || typeof socket.pause !== "function" || typeof socket.destroy !== "function") return;
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    socket.end();
    setTimeout(() => socket.destroy(), CLOSE_GRACE_MS).unref();
  };
  socket.pause();
  socket.resume = () => socket;
  socket.destroySoon = close;
  onFinish(close);
}

export function uploadRoute(app: ZApp, { core }: ApiContext): void {
  // свой контекст: тело не разбирается (любой Content-Type), поток читает обработчик
  void app.register(async (sub: ZApp) => {
    sub.removeAllContentTypeParsers();
    sub.addContentTypeParser("*", (_req, _payload, done) => done(null));
    // любой ответ до конца тела (ошибка проверки, схема, повтор ключа) закрывает соединение
    sub.addHook("onSend", async (req, reply, payload) => {
      if (!req.raw.complete && !req.raw.destroyed) {
        reply.header("connection", "close");
        stopReceiving(req.raw, (cb) => reply.raw.once("finish", cb));
      }
      return payload;
    });

    sub.put("/api/projects/:id/media/upload", {
      schema: { params: IdParams, querystring: Query, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
    }, async (req, reply) => {
      const key = idempotencyKey(req);
      const projectId = req.params.id;
      // повтор: тело второй раз не принимается — та же задача, если первая была загрузкой в этот
      // проект (и при гонке двух загрузок с одним ключом — тот же предикат, ревью M1)
      const sameUpload = (j: Job) => {
        const input = j.input as { method?: unknown; projectId?: unknown } | null;
        return input?.method === "upload" && input.projectId === projectId ? j.input : undefined;
      };
      const prev = replay(core.db, key, "media.import", sameUpload);
      if (prev) return reply.status(200).send({ job: publicJob(prev, core.root) });
      importTarget(core.db, projectId);
      const name = displayName(req.query.name);
      if (!name) throw new ApiError(400, "media_invalid", "имя файла не видео (mov, mp4, m4v, mkv, webm)");
      const raw = req.headers["content-length"];
      const length = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : undefined;
      if (length === undefined || req.headers["transfer-encoding"] !== undefined) throw new ApiError(411, "length_required", "нужен Content-Length (размер файла)");
      if (length === 0) throw new ApiError(400, "media_invalid", "пустой файл");

      const status = await core.storageCheck();
      if (!status.ok) {
        req.log.warn({ reason: status.reason, detail: status.detail }, "upload: storage_offline");
        throw new ApiError(503, "storage_offline", "хранилище недоступно: подключите SSD");
      }
      // загрузка + импорт (клон на том же томе, прокси оценит задача после probe) + порог StorageGuard
      const need = length + estimateImportBytes({ sizeBytes: length, durationUs: 0, sameVolume: true });
      const space = checkImportSpace(need, status.freeBytes, core.minFreeBytes);
      if (!space.ok) {
        throw new ApiError(507, "low_space", `мало места в хранилище: нужно ${gib(space.needBytes)}, свободно ${gib(status.freeBytes)}`);
      }
      if (length > UPLOAD_MAX_BYTES) throw new ApiError(413, "upload_too_large", `файл больше ${gib(UPLOAD_MAX_BYTES)}`);

      const id = newId("upl");
      const rel = uploadRel(id, videoExt(name)!);
      const dir = await safeMkdir(core.root, `${UPLOADS_REL}/${id}`);
      const file = join(core.root, rel);
      let created = false;
      try {
        let got = 0;
        await pipeline(req.raw, counter(length, (n) => (got = n)), createWriteStream(file, { flags: "wx" }));
        if (got !== length) throw new ApiError(400, "upload_length_mismatch", `получено ${got} байт из ${length}`);
        const fh = await open(file, "r");
        try {
          await fh.sync();
        } finally {
          await fh.close();
        }
        const input = { projectId, method: "upload" as const, uploadPath: rel, originalName: name };
        const out = tx(core.db, () => {
          const again = replay(core.db, key, "media.import", sameUpload);
          if (again) return { status: 200 as const, job: again };
          importTarget(core.db, projectId);
          return { status: 202 as const, job: enqueue(core.db, { type: "media.import", projectId, input, idempotencyKey: key }).job };
        });
        created = out.status === 202;
        return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOSPC") throw new ApiError(507, "low_space", "на томе хранилища кончилось место во время загрузки");
        if (e instanceof ApiError || e instanceof IdempotencyKeyReusedError) throw e;
        req.log.warn({ err: e }, "upload: приём прерван");
        throw new ApiError(400, "upload_aborted", "загрузка прервана");
      } finally {
        if (!created) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    });
  });
}
