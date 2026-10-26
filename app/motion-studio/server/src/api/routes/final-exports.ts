// Маршруты Task 45: финал видеопроекта. «Смонтировать и экспортировать» — явное действие (F6):
// гейт `assembleGate` → Approval final (`timeline:<id>@r<N>` + хеш настроек, Р-V4) → задача
// `final.render` (`requestFinal`, одна транзакция); гейт не пройден — 409 с перечнем причин, места
// не хватит — 409 `low_space` (та же оценка, что у задачи). Оценка места для диалога, экспорты
// проекта с `verify.json` и итогом повтора, файл с Range и `Content-Disposition`, повтор экспорта
// из сохранённого проекта (`final.reproduce`).
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ApprovalSchema, CreatedJobDtoSchema, type FinalExportDto, FinalExportDtoSchema, FinalExportBodySchema, FinalExportRequestSchema, type FinalExportRequest,
  FinalManifestSchema, FinalVerifyReportSchema, FpsSchema, type Fps, JobSchema, type VideoTimelineDoc,
} from "@ms/contracts";
import { z } from "zod";
import { artifactPaths } from "../../artifacts/paths.js";
import { isPublished } from "../../artifacts/store.js";
import type { Core } from "../../boot.js";
import * as edls from "../../db/repos/edls.js";
import * as jobs from "../../db/repos/jobs.js";
import * as media from "../../db/repos/media.js";
import * as projects from "../../db/repos/projects.js";
import { type FinalExportRow, finalExports } from "../../db/repos/video.js";
import { tx } from "../../db/tx.js";
import { timelineFor } from "../../edit/timeline-store.js";
import { type FinalGateCode, FinalGateFailed } from "../../final/gate.js";
import { COMPARE_FILE, FINAL_MANIFEST_FILE, VERIFY_FILE } from "../../final/manifest.js";
import { finalOutput } from "../../final/render.js";
import { requestFinal } from "../../final/request.js";
import { enqueue } from "../../jobs/queue.js";
import { masterFrames } from "../../media/master.js";
import { checkImportSpace, editedAudioBytes, estimateFinalBytes, estimateMasterBytes, gib } from "../../media/space.js";
import { deletedRefusal } from "../../projects/lifecycle.js";
import { readTimelineDoc } from "../../timeline/ops.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { sendFile } from "../range.js";
import { rfc5987 } from "./script-batch.js";
import { RevParams, timelineOr404, videoProjectOr4xx } from "./timelines.js";

/** `POST /timelines/:id/revisions/:n/final` (план v2): ревизия — в пути. */
export const FinalRevisionBodySchema = z.object({ request: FinalExportRequestSchema }).strict();

const FinalCreatedSchema = z.object({ approval: ApprovalSchema, job: JobSchema }).strict();

/** Оценка места под финал: размер выхода, байт нужно (файл, master, звук), свободно. */
export const FinalEstimateSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: FpsSchema,
  frames: z.number().int().positive(),
  /** Оценка работы: файл финала с запасом, master (если не в кэше) и звук. */
  bytes: z.number().int().nonnegative(),
  /** Свободно на томе хранилища и сколько должно остаться (порог StorageGuard). */
  free_bytes: z.number().int().nonnegative(),
  min_free_bytes: z.number().int().nonnegative(),
  master_cached: z.boolean(),
  ok: z.boolean(),
}).strict();
export type FinalEstimate = z.infer<typeof FinalEstimateSchema>;

const EstimateQuery = z.object({
  resolution: FinalExportRequestSchema.shape.resolution,
  quality: FinalExportRequestSchema.shape.quality,
  fps: z.string().regex(/^\d{1,3}(\/\d{1,4})?$/).optional(),
}).strict();

const parseFps = (s: string): Fps => {
  const [num, den] = s.split("/").map(Number);
  return FpsSchema.parse({ num, den: den ?? 1 });
};

/** Порядок кода ответа 409: что делать первым — утвердить, пересобрать, исправить. */
const GATE_PRIORITY: FinalGateCode[] = ["approval_required", "timeline_stale", "blocking_issues"];

/**
 * Оценка места под финал ревизии `doc` — те же слагаемые, что проверяет задача `final.render`:
 * файл с запасом, master на fps таймлайна (не в кэше — ещё и копия во временном каталоге Remotion),
 * копия `edited-audio.wav`.
 */
export async function finalEstimate(core: Core, projectId: string, doc: VideoTimelineDoc, request: FinalExportRequest): Promise<FinalEstimate> {
  const { db, root } = core;
  const e = edls.get(db, doc.inputs.edl.id);
  const asset = e ? media.get(db, e.media_id) : undefined;
  if (!e || !asset) throw new ApiError(409, "timeline_stale", "исходника таймлайна нет — пересоберите таймлайн");
  const display = { width: asset.probe.video.display_width, height: asset.probe.video.display_height };
  const out = finalOutput(doc, request, display);
  const masterCached = isPublished(db, artifactPaths(root, projectId).master(asset.id, doc.fps));
  const masterBytes = estimateMasterBytes({ frames: masterFrames(asset.probe, doc.fps), ...display });
  const tl = timelineFor(db, doc.inputs.edl.id, doc.inputs.edl.revision);
  const bytes = estimateFinalBytes({ ...out, quality: request.quality }) + masterBytes * (masterCached ? 1 : 2)
    + 2 * editedAudioBytes({ durationUs: tl.duration_us, channels: asset.probe.audio?.channels ?? 0 });
  const status = await core.storageCheck();
  const free = status.ok ? status.freeBytes : 0;
  const minFree = core.minFreeBytes;
  return { ...out, bytes, free_bytes: free, min_free_bytes: minFree, master_cached: masterCached, ok: status.ok && checkImportSpace(bytes, free, minFree).ok };
}

const fpsText = (f: Fps): string => (f.den === 1 ? `${f.num}` : (f.num / f.den).toFixed(2));

function readJson<T>(path: string, schema: z.ZodType<T>): T | undefined {
  try {
    const r = schema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return r.success ? r.data : undefined;
  } catch {
    return undefined;
  }
}

const CompareSchema = FinalExportDtoSchema.shape.compare.unwrap();

/** Экспорт для UI: строка, `verify.json`, выход из манифеста, размер файла, итог повтора. */
export function finalExportDto(core: Pick<Core, "db" | "root">, row: FinalExportRow): FinalExportDto {
  const file = join(core.root, row.rel_path);
  const dir = dirname(file);
  const job = row.job_id ? jobs.get(core.db, row.job_id) : undefined;
  const manifest = readJson(join(dir, FINAL_MANIFEST_FILE), FinalManifestSchema);
  const compare = readJson(join(dir, COMPARE_FILE), CompareSchema);
  let bytes: number | undefined;
  try {
    bytes = statSync(file).size;
  } catch {
    bytes = undefined;
  }
  return {
    id: row.id, timeline_id: row.timeline_id, timeline_revision: row.timeline_revision, request: row.request, status: row.status,
    verify: readJson(join(dir, VERIFY_FILE), FinalVerifyReportSchema) ?? null,
    job: job ? publicJob(job, core.root) : null,
    created_at: row.created_at,
    ...(bytes !== undefined ? { bytes } : {}),
    ...(manifest ? { output: manifest.output } : {}),
    ...(compare ? { compare } : {}),
  };
}

export const finalExportRoutes: (app: ZApp, ctx: ApiContext) => void = (app, { core }) => {
  const { db, root } = core;

  const exportOr404 = (id: string): FinalExportRow => {
    const row = finalExports.get(db, id);
    if (!row) throw notFound(`экспорт финала ${id}`);
    const deleted = deletedRefusal(db, row.project_id);
    if (deleted) throw deleted;
    return row;
  };

  /** Ревизия таймлайна (есть) и её документ. */
  const revisionDoc = (timelineId: string, n: number) => {
    const t = timelineOr404(db, timelineId);
    videoProjectOr4xx(db, t.project_id);
    let doc: VideoTimelineDoc;
    try {
      doc = readTimelineDoc(db, root, t.id, n);
    } catch {
      throw new ApiError(404, "timeline_not_found", `нет ревизии r${n} таймлайна ${t.id}`);
    }
    return { t, doc };
  };

  async function startFinal(timelineId: string, n: number, request: FinalExportRequest, key: string) {
    const prev = jobs.findByIdempotencyKey(db, key);
    const { t, doc } = revisionDoc(timelineId, n);
    if (!prev) {
      const est = await finalEstimate(core, t.project_id, doc, request);
      if (!est.ok) {
        throw new ApiError(409, "low_space", `для финала нужно свободно ${gib(est.bytes + est.min_free_bytes)} (оценка ${gib(est.bytes)} + порог ${gib(est.min_free_bytes)}), на томе хранилища ${gib(est.free_bytes)}`, {
          need_bytes: est.bytes + est.min_free_bytes, free_bytes: est.free_bytes,
        });
      }
    }
    try {
      const out = requestFinal(core, { timelineId: t.id, revision: n, request, idempotencyKey: key });
      return { status: prev ? (200 as const) : (202 as const), body: { approval: out.approval, job: publicJob(out.job, root) } };
    } catch (e) {
      if (!(e instanceof FinalGateFailed)) throw e;
      const code = GATE_PRIORITY.find((c) => e.errors.some((x) => x.code === c)) ?? e.errors[0]!.code;
      throw new ApiError(409, code, e.message, { errors: e.errors });
    }
  }

  // 202 — новое решение и задача, 200 — повтор того же Idempotency-Key
  app.post("/api/timelines/:id/revisions/:n/final", {
    schema: { params: RevParams, body: FinalRevisionBodySchema, response: { 200: FinalCreatedSchema, 202: FinalCreatedSchema } },
  }, async (req, reply) => {
    const out = await startFinal(req.params.id, req.params.n, req.body.request, idempotencyKey(req));
    return reply.status(out.status).send(out.body);
  });

  // то же по контракту 35′ (`FinalExportBodySchema`: ревизия — в теле)
  app.post("/api/timelines/:id/final", {
    schema: { params: IdParams, body: FinalExportBodySchema, response: { 200: FinalCreatedSchema, 202: FinalCreatedSchema } },
  }, async (req, reply) => {
    const out = await startFinal(req.params.id, req.body.revision, req.body.request, idempotencyKey(req));
    return reply.status(out.status).send(out.body);
  });

  app.get("/api/timelines/:id/revisions/:n/final/estimate", {
    schema: { params: RevParams, querystring: EstimateQuery, response: { 200: FinalEstimateSchema } },
  }, async (req) => {
    const { t, doc } = revisionDoc(req.params.id, req.params.n);
    const request = FinalExportRequestSchema.parse({
      resolution: req.query.resolution, quality: req.query.quality, audio_bitrate_kbps: 192, ...(req.query.fps ? { fps: parseFps(req.query.fps) } : {}),
    });
    return finalEstimate(core, t.project_id, doc, request);
  });

  app.get("/api/projects/:id/final-exports", { schema: { params: IdParams, response: { 200: z.array(FinalExportDtoSchema) } } }, async (req) => {
    videoProjectOr4xx(db, req.params.id);
    return finalExports.listByProject(db, req.params.id).reverse().map((r) => finalExportDto(core, r));
  });

  app.get("/api/final-exports/:id", { schema: { params: IdParams, response: { 200: FinalExportDtoSchema } } }, async (req) => finalExportDto(core, exportOr404(req.params.id)));

  // имя для скачивания: `<проект>-r<N>-<разрешение>-<fps>.mp4` (UTF-8 в filename*, ASCII — по id проекта)
  app.get("/api/final-exports/:id/file", { schema: { params: IdParams } }, async (req, reply) => {
    const row = exportOr404(req.params.id);
    const title = projects.get(db, row.project_id)?.title ?? row.project_id;
    const fps = finalOutputFps(core, row);
    const tail = `-r${row.timeline_revision}-${row.request.resolution}-${fpsText(fps)}.mp4`;
    reply.header("content-disposition", `attachment; filename="${row.project_id.replace(/[^\w.-]/g, "_")}${tail}"; filename*=UTF-8''${rfc5987(title + tail)}`);
    return sendFile(req, reply, join(root, row.rel_path), { contentType: "video/mp4" });
  });

  app.post("/api/final-exports/:id/reproduce", {
    schema: { params: IdParams, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = { exportId: req.params.id };
    const out = tx(db, () => {
      const prev = replay(db, key, "final.reproduce", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const row = exportOr404(req.params.id);
      return { status: 202 as const, job: enqueue(db, { type: "final.reproduce", projectId: row.project_id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, root) });
  });
};

/** fps файла экспорта: из манифеста, иначе из настроек, иначе fps ревизии таймлайна. */
function finalOutputFps(core: Pick<Core, "db" | "root">, row: FinalExportRow): Fps {
  const m = readJson(join(dirname(join(core.root, row.rel_path)), FINAL_MANIFEST_FILE), FinalManifestSchema);
  if (m) return m.output.fps;
  if (row.request.fps) return row.request.fps;
  try {
    return readTimelineDoc(core.db, core.root, row.timeline_id, row.timeline_revision).fps;
  } catch {
    return { num: 30, den: 1 };
  }
}
