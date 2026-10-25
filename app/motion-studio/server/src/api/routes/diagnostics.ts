// Маршруты диагностики (Task 48): doctor в UI (кэш 30 с), журнал сервера, трассировка задачи,
// архив диагностики. Здесь же журнал сервера подключается к шине событий: каждое событие задачи
// (кроме прогресса) пишется в `logs/server-*.jsonl` с корреляционными полями задачи, без текста
// пользователя (`privacy.ts`); 5xx API — тоже. Секреты — через `redact`; наружу — без абсолютных
// путей (`maskExport` всей записи журнала).
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { DoctorReportDtoSchema, type DoctorReportDto, type JobEventDto } from "@ms/contracts";
import {
  BUNDLE_NAME_RE,
  BundleBodySchema,
  type BundleDto,
  BundleDtoSchema,
  JobTraceDtoSchema,
  LogEntrySchema,
  LogsQuerySchema,
} from "@ms/contracts/diagnostics";
import { z } from "zod";
import * as jobs from "../../db/repos/jobs.js";
import { BUNDLE_DIR, bundleName, diagnosticBundle } from "../../diagnostics/bundle.js";
import { runDoctor } from "../../diagnostics/doctor-checks.js";
import { createLogger, type LogFields, readLogs } from "../../diagnostics/logger.js";
import { hasUserText, maskExport, stripEvent } from "../../diagnostics/privacy.js";
import { redactDeep } from "../../diagnostics/redact.js";
import { jobTrace } from "../../diagnostics/trace.js";
import { type ApiContext, IdParams, QueryBool, type ZApp } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { maskPaths, publicEvent, publicJob } from "../job-dto.js";
import { sendFile } from "../range.js";

/** Сколько живёт результат doctor в UI. */
export const DOCTOR_CACHE_MS = 30_000;
/** Повтор подписки журнала на события задач, если база была недоступна. */
export const TAIL_RETRY_MS = 5_000;

/** Поля корреляции из данных события (запуск агента, рендер). */
function lift(data: unknown): LogFields {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  const out: LogFields = {};
  if (typeof d.agent_run_id === "string") out.agent_run_id = d.agent_run_id;
  if (typeof d.render_job_id === "string") out.render_job_id = d.render_job_id;
  return out;
}

export const diagnosticsRoutes = (app: ZApp, { core }: ApiContext): void => {
  const logger = createLogger(core.root);

  // события задач → журнал сервера (прогресс — только в job_events, иначе он забил бы журнал).
  // Allowlist (`privacy.ts`): сообщение пишется только у видов из `SAFE_KINDS`; у остальных —
  // kind, level, корреляция, ids и коды; полный текст — в job_events (трассировка).
  const logEvent = (ev: JobEventDto) => {
    if (ev.kind === "progress") return;
    let fields: LogFields = { job_id: ev.job_id, kind: ev.kind };
    try {
      const j = jobs.get(core.db, ev.job_id);
      if (j) {
        fields = {
          ...fields,
          project_id: j.project_id,
          ...(j.scene_id ? { scene_id: j.scene_id } : {}),
          ...(j.version_id ? { version_id: j.version_id } : {}),
          attempt: j.attempt,
        };
      }
    } catch {
      // база недоступна (storage_offline) — пишем без корреляции
    }
    const safe = hasUserText(ev.kind) ? stripEvent(ev) : ev;
    logger.log(ev.level, safe.message, { ...fields, ...lift(safe.data), ...(safe.data === undefined ? {} : { data: safe.data }) });
  };
  // подписка ленивая: база недоступна при старте маршрутов (storage_offline) — повтор при
  // следующем запросе и по таймеру, пока не подключится
  let untail: (() => void) | undefined;
  let closed = false;
  const attach = () => {
    if (untail || closed) return;
    try {
      untail = core.events.tail(logEvent);
    } catch {
      // база всё ещё недоступна — следующая попытка позже
    }
  };
  attach();
  const retry = untail ? undefined : setInterval(() => {
    attach();
    if (untail) clearInterval(retry);
  }, TAIL_RETRY_MS);
  retry?.unref();
  app.addHook("onRequest", async () => attach());
  app.addHook("onError", async (req, reply, err) => {
    if (reply.statusCode >= 500 || !(err as { statusCode?: number }).statusCode) {
      logger.error(`${req.method} ${req.url.split("?")[0]}: ${err.message}`, { kind: "api_error", data: { stack: err.stack?.split("\n").slice(0, 8).join("\n") } });
    }
  });
  app.addHook("onClose", async () => {
    closed = true;
    if (retry) clearInterval(retry);
    untail?.();
    await logger.flush();
  });

  // ---- doctor ----
  const doctorCache = new Map<boolean, { at: number; report: Promise<DoctorReportDto> }>();
  const doctor = (fast: boolean, refresh: boolean): Promise<DoctorReportDto> => {
    const hit = doctorCache.get(fast);
    if (hit && !refresh && Date.now() - hit.at < DOCTOR_CACHE_MS) return hit.report;
    const report = runDoctor({ fast, db: core.db, storage: core.storageCheck, env: { ...process.env, MS_DATA_DIR: core.root } })
      .then((r) => ({ ...r, rows: r.rows.map((row) => ({ ...row, detail: maskPaths(row.detail, core.root) })) }));
    doctorCache.set(fast, { at: Date.now(), report });
    report.catch(() => doctorCache.delete(fast));
    return report;
  };
  app.get("/api/diagnostics/doctor", {
    schema: { querystring: z.object({ fast: QueryBool.optional(), refresh: QueryBool.optional() }).strict(), response: { 200: DoctorReportDtoSchema } },
  }, async (req) => doctor(req.query.fast ?? false, req.query.refresh ?? false));

  // ---- журнал сервера ----
  app.get("/api/logs", { schema: { querystring: LogsQuerySchema, response: { 200: z.array(LogEntrySchema) } } }, async (req) => {
    await logger.flush();
    // всю запись (msg и data): секреты — ещё раз (строки старых версий журнала), затем пути
    return (await readLogs(core.root, req.query)).map((e) => maskExport(redactDeep(e), core.root));
  });

  // ---- трассировка ----
  app.get("/api/jobs/:id/trace", { schema: { params: IdParams, response: { 200: JobTraceDtoSchema } } }, async (req) => {
    const tr = jobTrace(core.db, req.params.id);
    if (!tr) throw notFound(`задача ${req.params.id}`);
    return {
      ...tr,
      job: publicJob(tr.job, core.root),
      children: tr.children.map((c) => publicJob(c, core.root)),
      events: tr.events.map((e) => publicEvent(e, core.root)),
    };
  });

  // ---- архив ----
  const bundles = new Map<string, BundleDto>();
  const dir = join(core.root, BUNDLE_DIR);
  const onDisk = async (): Promise<BundleDto[]> => {
    const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => BUNDLE_NAME_RE.test(n));
    return Promise.all(names.map(async (name) => {
      const s = await stat(join(dir, name));
      return { name, status: "ready" as const, bytes: s.size, created_at: s.mtime.toISOString() };
    }));
  };

  app.post("/api/diagnostics/bundle", { schema: { body: BundleBodySchema, response: { 202: BundleDtoSchema } } }, async (req, reply) => {
    const now = new Date();
    const taken = new Set([...bundles.keys(), ...(await onDisk()).map((b) => b.name)]);
    let n = 0;
    while (taken.has(bundleName(now, n))) n++;
    const name = bundleName(now, n);
    const dto: BundleDto = { name, status: "building", created_at: now.toISOString() };
    bundles.set(name, dto);
    void diagnosticBundle(core, { includePrompts: req.body.includePrompts, now: () => now, name }).then(
      (b) => bundles.set(name, { ...dto, status: "ready", bytes: b.bytes }),
      (e: unknown) => {
        bundles.set(name, { ...dto, status: "failed", error: maskPaths((e as Error).message ?? String(e), core.root) });
        logger.error(`архив диагностики ${name} не собран: ${(e as Error).message}`, { kind: "bundle_failed" });
      },
    );
    return reply.code(202).send(dto);
  });

  app.get("/api/diagnostics/bundles", { schema: { response: { 200: z.array(BundleDtoSchema) } } }, async () => {
    const all = new Map((await onDisk()).map((b) => [b.name, b]));
    for (const [name, b] of bundles) {
      if (b.status !== "ready") all.set(name, b);
      else if (!all.has(name)) bundles.delete(name); // удалён ротацией (последние BUNDLE_KEEP)
    }
    return [...all.values()].sort((a, b) => (a.name < b.name ? 1 : -1));
  });

  app.get("/api/diagnostics/bundles/:name", { schema: { params: z.object({ name: z.string().min(1).max(100) }).strict() } }, async (req, reply) => {
    const { name } = req.params;
    if (!BUNDLE_NAME_RE.test(name)) throw notFound("архив");
    const state = bundles.get(name);
    if (state && state.status === "building") throw new ApiError(409, "bundle_not_ready", "архив ещё собирается");
    return sendFile(req, reply, join(dir, name), { contentType: "application/zip", attachment: name });
  });
};
