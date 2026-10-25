// Клиент диагностики (Task 48): doctor, журнал сервера, трассировка задачи, архив. Task 49a:
// сводка затрат (справочно) и уборка кэша.
import type { DoctorReportDto, Job } from "@ms/contracts";
import type { BundleDto, CostSummaryDto, JobTraceDto, LogEntry, LogLevel } from "@ms/contracts/diagnostics";
import { useQuery } from "@tanstack/react-query";
import { request } from "./client.js";

export interface LogFilter {
  level?: LogLevel;
  jobId?: string;
  projectId?: string;
  since?: string;
  limit?: number;
}

const qs = (o: Record<string, string | number | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const diagnosticsApi = {
  doctor: (fast: boolean, refresh = false) => request<DoctorReportDto>("GET", `/api/diagnostics/doctor${qs({ fast: fast ? 1 : 0, refresh: refresh ? 1 : undefined })}`),
  logs: (f: LogFilter) => request<LogEntry[]>("GET", `/api/logs${qs({ ...f })}`),
  trace: (jobId: string) => request<JobTraceDto>("GET", `/api/jobs/${encodeURIComponent(jobId)}/trace`),
  bundles: () => request<BundleDto[]>("GET", "/api/diagnostics/bundles"),
  makeBundle: (includePrompts: boolean) => request<BundleDto>("POST", "/api/diagnostics/bundle", { body: { includePrompts } }),
  bundleUrl: (name: string) => `/api/diagnostics/bundles/${encodeURIComponent(name)}`,
  costs: (f: CostQueryParams) => request<CostSummaryDto>("GET", `/api/costs${qs({ ...f, jobIds: f.jobIds?.join(",") })}`),
  cacheGc: () => request<{ job: Job }>("POST", "/api/cache/gc", { body: {}, idempotency: true }),
};

/** Фильтр сводки затрат: проект, сцена, последние N дней, задачи (пакет). */
export interface CostQueryParams {
  projectId?: string;
  sceneId?: string;
  /** Пакет генерации сценария: сумма всех задач его сцен (считает сервер). */
  batchId?: string;
  days?: number;
  jobIds?: string[];
}

/** Сводка затрат (справочно); пустой список задач — запроса нет; `refetchMs` — пока идёт пакет. */
export const useCosts = (f: CostQueryParams, o: { refetchMs?: number | false } = {}) =>
  useQuery({
    queryKey: ["costs", f],
    queryFn: () => diagnosticsApi.costs(f),
    enabled: f.jobIds === undefined || f.jobIds.length > 0,
    refetchInterval: o.refetchMs ?? false,
  });

/** Журнал; автообновление — по SSE в `LogViewer` (инвалидирует `["logs"]`). */
export const useLogs = (f: LogFilter) => useQuery({ queryKey: ["logs", f], queryFn: () => diagnosticsApi.logs(f) });
export const useTrace = (jobId: string | undefined) =>
  useQuery({ queryKey: ["trace", jobId], queryFn: () => diagnosticsApi.trace(jobId!), enabled: Boolean(jobId) });
export const useBundles = () =>
  useQuery({
    queryKey: ["bundles"],
    queryFn: diagnosticsApi.bundles,
    refetchInterval: (q) => (q.state.data?.some((b) => b.status === "building") ? 1_000 : false),
  });

/** Ссылка на диагностику с трассировкой задачи (`?job=`). */
export const diagnosticsHref = (jobId?: string) => `/diagnostics${jobId ? `?job=${encodeURIComponent(jobId)}` : ""}`;

/** Расчётная стоимость, справочно: `$0.1234` (до 4 знаков, без хвостовых нулей). */
export function usd(v: number): string {
  return `$${v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
}
