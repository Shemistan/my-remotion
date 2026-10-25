// Клиент API сцен видеопроекта (Task 40): состояние сцен по плану, пакет генерации, Approval C,
// превью в контексте. Создающие POST несут `Idempotency-Key` (повтор того же действия — тот же
// ключ); мутации перечитывают состояние. Ключ запроса — под `["video", …]`: события задач (SSE)
// инвалидируют его вместе с видеопроектом.
import type { Approval, Job, SceneApprovalDto, VideoBatchDto, VideoGenerateBody, VideoSceneDto, VideoScenesStateDto } from "@ms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shortHash } from "../script/output.js";
import { errorText, tk } from "../i18n/index.js";
import { ApiError, newKey, request } from "./client.js";
import { isActive } from "./queries.js";

const enc = encodeURIComponent;
const POLL_MS = 5_000;

export const videoScenesApi = {
  state: (projectId: string) => request<VideoScenesStateDto>("GET", `/api/projects/${enc(projectId)}/video/scenes`),
  generate: (projectId: string, body: VideoGenerateBody, key: string = newKey()) =>
    request<VideoBatchDto>("POST", `/api/projects/${enc(projectId)}/video/generate`, { body, idempotency: key }),
  batch: (batchId: string) => request<VideoBatchDto>("GET", `/api/video-batches/${enc(batchId)}`),
  cancelBatch: (batchId: string) => request<VideoBatchDto>("POST", `/api/video-batches/${enc(batchId)}/cancel`),
  approve: (sceneId: string, versionId: string) => request<Approval>("POST", `/api/scenes/${enc(sceneId)}/approve`, { body: { version_id: versionId } }),
  unapprove: (sceneId: string) => request<SceneApprovalDto>("POST", `/api/scenes/${enc(sceneId)}/unapprove`),
  previewContext: (sceneId: string, versionId: string, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/scenes/${enc(sceneId)}/preview-context`, { body: { version_id: versionId }, idempotency: key }),
};

export const videoScenesUrls = {
  /** Превью версии в контексте исходника (Range). */
  contextPreview: (sceneId: string, versionId: string) => `/api/scenes/${enc(sceneId)}/preview-context.mp4?versionId=${enc(versionId)}`,
};

export const videoScenesKey = (projectId: string) => ["video", "scenes", projectId] as const;

/** Задача сцены или пакета ещё идёт — состояние опрашивается. */
export function videoScenesActive(s: VideoScenesStateDto | undefined): boolean {
  if (!s) return false;
  return s.scenes.some((x) => x.job !== null && isActive(x.job.status)) || s.batches.some((b) => b.counts.pending + b.counts.running > 0);
}

export const useVideoScenes = (projectId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: videoScenesKey(projectId ?? ""),
    queryFn: () => videoScenesApi.state(projectId!),
    enabled: Boolean(projectId) && enabled,
    refetchInterval: (q) => (videoScenesActive(q.state.data) ? POLL_MS : false),
  });

/** Мутация с перечитыванием состояния сцен (успех или ошибка). */
function useScenesMutation<V, R>(projectId: string, fn: (v: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: videoScenesKey(projectId) });
      void client.invalidateQueries({ queryKey: ["scene"] });
    },
  });
}

export const useVideoGenerate = (projectId: string) =>
  useScenesMutation(projectId, ({ body, key }: { body: VideoGenerateBody; key: string }) => videoScenesApi.generate(projectId, body, key));
export const useCancelVideoBatch = (projectId: string) => useScenesMutation(projectId, (batchId: string) => videoScenesApi.cancelBatch(batchId));
export const useApproveScene = (projectId: string) =>
  useScenesMutation(projectId, ({ sceneId, versionId }: { sceneId: string; versionId: string }) => videoScenesApi.approve(sceneId, versionId));
export const useUnapproveScene = (projectId: string) => useScenesMutation(projectId, (sceneId: string) => videoScenesApi.unapprove(sceneId));
export const usePreviewContext = (projectId: string) =>
  useScenesMutation(projectId, ({ sceneId, versionId, key }: { sceneId: string; versionId: string; key: string }) => videoScenesApi.previewContext(sceneId, versionId, key));

/**
 * Ключ «Повторить» / «Перегенерировать» сцены: то же действие над той же задачей и версией — тот
 * же ключ (двойной клик — один пакет); после новой задачи — новый.
 */
export function videoRetryKey(kind: "retry" | "regen", s: Pick<VideoSceneDto, "item_id" | "job" | "version_id">): string {
  return `video-${kind}:${s.item_id}:${s.job?.id ?? "nojob"}:${s.version_id ?? "nover"}`;
}

/** Ключ «Сгенерировать все»: ревизия плана и задачи сцен — до новой задачи тот же. */
export function videoAllKey(s: Pick<VideoScenesStateDto, "plan" | "scenes">): string {
  return `video-all:r${s.plan?.revision ?? 0}:${shortHash(s.scenes.map((x) => `${x.item_id}=${x.job?.id ?? "-"}`).join(","))}`;
}


/** Текст ошибки маршрутов сцен: свои коды (B вместо A, plan_changed …) — из словаря области. */
export function videoScenesErrorText(e: unknown): string {
  return e instanceof ApiError ? tk(`videoScenes.error.${e.code}`, errorText(e)) : errorText(e);
}
