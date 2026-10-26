// Клиент API таймлайна видеопроекта и финала (Task 45). Создающие задачи POST несут
// `Idempotency-Key` (повтор того же действия — тот же ключ); правка ревизии — по базе
// (`base_revision`, 409 `revision_conflict` — перечитать). Ключи запросов — под `["video", …]`:
// события задач (SSE) инвалидируют их вместе с видеопроектом.
import type {
  Approval, FinalExportDto, FinalExportRequest, Fps, Job, TimelineDto, TimelineRevisionBody, VideoTimelineDoc,
} from "@ms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, newKey, request } from "./client.js";
import { isActive } from "./queries.js";

const enc = encodeURIComponent;
const POLL_MS = 3_000;

/** Ревизия в списке (`GET /timelines/:id/revisions`). */
export interface TimelineRevisionEntry {
  revision: number;
  parent_revision: number | null;
  created_at: string;
  current: boolean;
  ops: number;
  scenes: number;
}

/** Оценка места под финал (`GET …/final/estimate`). */
export interface FinalEstimate {
  width: number;
  height: number;
  fps: Fps;
  frames: number;
  bytes: number;
  free_bytes: number;
  min_free_bytes: number;
  master_cached: boolean;
  ok: boolean;
}

/** Состояние таймлайна проекта: ревизии нет — `dto: null`, задача сборки — из тела 404. */
export interface TimelineState {
  dto: TimelineDto | null;
  job: Job | null;
}

const fpsParam = (f: Fps | undefined) => (f ? `&fps=${f.den === 1 ? f.num : `${f.num}/${f.den}`}` : "");

export const timelineApi = {
  async state(projectId: string): Promise<TimelineState> {
    try {
      const dto = await request<TimelineDto>("GET", `/api/projects/${enc(projectId)}/timeline`);
      return { dto, job: dto.job };
    } catch (e) {
      if (e instanceof ApiError && e.code === "timeline_not_found") return { dto: null, job: ((e.body as { job?: Job | null } | null)?.job) ?? null };
      throw e;
    }
  },
  build: (projectId: string, key: string = newKey()) => request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/timeline/build`, { body: {}, idempotency: key }),
  save: (timelineId: string, body: TimelineRevisionBody) => request<TimelineDto>("POST", `/api/timelines/${enc(timelineId)}/revisions`, { body }),
  revisions: (timelineId: string) => request<TimelineRevisionEntry[]>("GET", `/api/timelines/${enc(timelineId)}/revisions`),
  revision: (timelineId: string, n: number) => request<{ timeline_id: string; revision: number; doc: VideoTimelineDoc }>("GET", `/api/timelines/${enc(timelineId)}/revisions/${n}`),
  preview: (timelineId: string, n: number, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/timelines/${enc(timelineId)}/revisions/${n}/preview`, { body: {}, idempotency: key }),
  estimate: (timelineId: string, n: number, r: Pick<FinalExportRequest, "resolution" | "quality" | "fps">) =>
    request<FinalEstimate>("GET", `/api/timelines/${enc(timelineId)}/revisions/${n}/final/estimate?resolution=${r.resolution}&quality=${r.quality}${fpsParam(r.fps)}`),
  final: (timelineId: string, n: number, req: FinalExportRequest, key: string = newKey()) =>
    request<{ approval: Approval; job: Job }>("POST", `/api/timelines/${enc(timelineId)}/revisions/${n}/final`, { body: { request: req }, idempotency: key }),
  exports: (projectId: string) => request<FinalExportDto[]>("GET", `/api/projects/${enc(projectId)}/final-exports`),
  reproduce: (exportId: string, key: string = newKey()) => request<{ job: Job }>("POST", `/api/final-exports/${enc(exportId)}/reproduce`, { body: {}, idempotency: key }),
};

export const timelineUrls = {
  preview: (timelineId: string, n: number) => `/api/timelines/${enc(timelineId)}/revisions/${n}/preview.mp4`,
  finalFile: (exportId: string) => `/api/final-exports/${enc(exportId)}/file`,
};

export const timelineKey = (projectId: string) => ["video", "timeline", projectId] as const;
export const finalExportsKey = (projectId: string) => ["video", "finalExports", projectId] as const;

export const useTimeline = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: timelineKey(projectId),
    queryFn: () => timelineApi.state(projectId),
    enabled,
    refetchInterval: (q) => (q.state.data?.job && isActive(q.state.data.job.status) ? POLL_MS : false),
  });

export const useTimelineRevisions = (timelineId: string | undefined, revision: number | undefined) =>
  useQuery({
    queryKey: ["video", "timelineRevisions", timelineId, revision],
    queryFn: () => timelineApi.revisions(timelineId!),
    enabled: Boolean(timelineId),
  });

export const useFinalEstimate = (timelineId: string, n: number, r: Pick<FinalExportRequest, "resolution" | "quality" | "fps">) =>
  useQuery({ queryKey: ["video", "finalEstimate", timelineId, n, r.resolution, r.quality, r.fps?.num, r.fps?.den], queryFn: () => timelineApi.estimate(timelineId, n, r) });

/** Экспорты финала проекта; пока идёт задача финала (`active`) — опрос. */
export const useFinalExports = (projectId: string, active = false) =>
  useQuery({ queryKey: finalExportsKey(projectId), queryFn: () => timelineApi.exports(projectId), refetchInterval: active ? POLL_MS : false });

/** Мутация с перечитыванием таймлайна и экспортов проекта (успех или ошибка). */
function useTimelineMutation<V, R>(projectId: string, fn: (v: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: timelineKey(projectId) });
      void client.invalidateQueries({ queryKey: ["video", "timelineRevisions"] });
      void client.invalidateQueries({ queryKey: finalExportsKey(projectId) });
    },
  });
}

export const useBuildTimeline = (projectId: string) => useTimelineMutation(projectId, (key: string) => timelineApi.build(projectId, key));
export const useSaveTimeline = (projectId: string) =>
  useTimelineMutation(projectId, ({ timelineId, body }: { timelineId: string; body: TimelineRevisionBody }) => timelineApi.save(timelineId, body));
export const useTimelinePreview = (projectId: string) =>
  useTimelineMutation(projectId, ({ timelineId, n, key }: { timelineId: string; n: number; key: string }) => timelineApi.preview(timelineId, n, key));
export const useStartFinal = (projectId: string) =>
  useTimelineMutation(projectId, ({ timelineId, n, request: r, key }: { timelineId: string; n: number; request: FinalExportRequest; key: string }) => timelineApi.final(timelineId, n, r, key));
export const useReproduceFinal = (projectId: string) =>
  useTimelineMutation(projectId, ({ exportId, key }: { exportId: string; key: string }) => timelineApi.reproduce(exportId, key));

