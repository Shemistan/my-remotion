// Готовые экспорты: строка `exports` и файл (Range, `Content-Disposition: attachment`).
import { basename, join } from "node:path";
import { ExportDtoSchema } from "@ms/contracts";
import * as exportsRepo from "../../db/repos/exports.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { notFound } from "../errors.js";
import { sendFile } from "../range.js";

const TYPES = { mp4: "video/mp4", prores4444: "video/quicktime" } as const;

export function exportRoutes(app: ZApp, { core }: ApiContext): void {
  const exportOr404 = (id: string) => {
    const e = exportsRepo.getWithScene(core.db, id);
    if (!e) throw notFound(`экспорт ${id}`);
    return e;
  };

  app.get("/api/exports/:id", { schema: { params: IdParams, response: { 200: ExportDtoSchema } } }, async (req) => exportOr404(req.params.id));

  app.get("/api/exports/:id/file", { schema: { params: IdParams } }, async (req, reply) => {
    const e = exportOr404(req.params.id);
    // путь — из строки БД (относительно корня хранилища), имя для скачивания — id экспорта
    const ext = basename(e.path).split(".").pop() ?? "bin";
    return sendFile(req, reply, join(core.root, e.path), { contentType: TYPES[e.format], attachment: `${e.id}.${ext}` });
  });
}
