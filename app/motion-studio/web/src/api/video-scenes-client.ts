// Клиент API сцен видеопроекта (Task 40): состояние сцен по плану, пакет генерации, Approval C,
// превью в контексте. Создающие POST несут `Idempotency-Key` (повтор того же действия — тот же
// ключ); мутации перечитывают состояние. Ключ запроса — под `["video", …]`: события задач (SSE)
// инвалидируют его вместе с видеопроектом.
import type { Approval, Job, SceneApprovalDto, VideoBatchDto, VideoGenerateBody, VideoSceneDto, VideoScenesStateDto } from "@ms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { shortHash } from "../script/output.js";
import { tk } from "../i18n/index.js";
import { api, newKey, request } from "./client.js";
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
export const useImproveVideoScene = (projectId: string) =>
  useScenesMutation(projectId, ({ sceneId, versionId }: { sceneId: string; versionId: string }) => api.improve(sceneId, { base_version_id: versionId }));
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

/**
 * Ключ «Сгенерировать все» (как ключ генерации сценария, ревью I2): план и его ревизия, стиль, и по
 * каждой сцене — задача и её статус, `stale`, версия. Повторное нажатие при том же состоянии — тот
 * же пакет; после отмены, падения, новой версии или смены стиля — новый ключ.
 */
export function videoAllKey(s: Pick<VideoScenesStateDto, "plan" | "scenes">, style: { id: string; current_revision: number } | null): string {
  return `video-all:r${s.plan?.revision ?? 0}:${shortHash(stateBase(s, s.scenes, style))}`;
}

function stateBase(s: Pick<VideoScenesStateDto, "plan">, scenes: VideoScenesStateDto["scenes"], style: { id: string; current_revision: number } | null): string {
  const list = scenes.map((x) => `${x.item_id}=${x.job?.id ?? "-"}/${x.job?.status ?? "-"}/${x.stale ? 1 : 0}/${x.version_id ?? "-"}`).join(",");
  return `${s.plan?.id ?? "noplan"}@r${s.plan?.revision ?? 0}:${style ? `${style.id}@r${style.current_revision}` : "nostyle"}:${list}`;
}

/**
 * S21: ключ пакетной перегенерации («выбранные» — `regenerate: true`, «устаревшие» — без него) по
 * образцу `videoAllKey`, но только по сценам набора (порядок выбора не важен): то же действие над
 * тем же состоянием набора — тот же пакет; после новой задачи, версии или смены стиля — новый.
 */
export function videoBatchKey(
  kind: "regen-selected" | "stale", s: Pick<VideoScenesStateDto, "plan" | "scenes">, itemIds: readonly string[],
  style: { id: string; current_revision: number } | null,
): string {
  const want = new Set(itemIds);
  const scenes = s.scenes.filter((x) => want.has(x.item_id)).sort((a, b) => a.item_id.localeCompare(b.item_id));
  return `video-${kind}:r${s.plan?.revision ?? 0}:${shortHash(stateBase(s, scenes, style))}`;
}

/**
 * Готовые сцены, не вошедшие в полный пакет (ревью I1, по образцу `readySkipped` сценария): по
 * состоянию, а не по ответу запроса — переживает смену вкладки и перезагрузку. Пакет полный и по
 * текущей ревизии плана; сцены — принятые сцены плана (`scenes` состояния), готовые, не устаревшие
 * и не в пакете. Частичный пакет («Повторить», «Перегенерировать») не досчитывается.
 */
export function videoReadySkipped(batch: VideoBatchDto, s: Pick<VideoScenesStateDto, "plan" | "scenes">): { item_id: string; reason: string }[] {
  if (!batch.full || !s.plan || s.plan.revision !== batch.plan_revision) return [];
  const inBatch = new Set(batch.items.map((x) => x.item_id));
  return s.scenes.filter((x) => x.status === "ready" && !x.stale && !inBatch.has(x.item_id)).map((x) => ({ item_id: x.item_id, reason: "ready_version" }));
}

/** Причина «не вошли»: код сервера → словарь; неизвестный код (или текст) — как есть. */
export const skipReasonText = (reason: string): string => tk(`videoScenes.skipReason.${reason}`, reason);
