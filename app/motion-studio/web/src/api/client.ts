// Типизированный клиент Control API. `Origin` ставит браузер (запросы — только со своей
// страницы 127.0.0.1:8790/localhost:8790); создающие задачи POST несут `Idempotency-Key`
// (`crypto.randomUUID()`, повтор того же действия — тот же ключ). Ответ 503
// `storage_offline` (или health с ним) включает баннер хранилища, успешный ответ — выключает.
import type {
  AppSettingsDto,
  Approval,
  AsrCapabilityDto,
  EdlDto,
  EdlOp,
  FootageDto,
  PlanDto,
  PlanOp,
  ProjectStyleBase,
  ProjectStyleDto,
  SemanticDto,
  MediaDto,
  ProjectApprovalsDto,
  RevisionEntry,
  TranscriptDto,
  TranscriptOp,
  TranscribeBody,
  VideoProjectDto,
  ChatMessage,
  ExportDto,
  ExportRequest,
  HealthDto,
  ImproveBody,
  Job,
  JobDetailDto,
  JobInputBody,
  JobStatus,
  KbCardDto,
  KbHitDto,
  ProjectDetailDto,
  ProjectDto,
  RenderBody,
  SceneDetailDto,
  SceneDto,
  Settings,
  VersionDiff,
  VersionDto,
} from "@ms/contracts";

/** Ошибка API: HTTP-статус, машинный код (`error`) и сообщение сервера. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Повтор запроса TanStack Query: 4xx — ошибка запроса, 503 storage_offline — хранилище
 * отключено (баннер, health и перечитывание после возврата); сеть и прочие 5xx — до двух раз.
 */
export function shouldRetry(failures: number, e: unknown): boolean {
  if (failures >= 2) return false;
  if (e instanceof ApiError && ((e.status >= 400 && e.status < 500) || e.code === "storage_offline")) return false;
  return true;
}

type Listener = (offline: boolean) => void;

/** Признак «хранилище недоступно» для баннера (одно значение на вкладку). */
export const storageStatus = (() => {
  let offline = false;
  const listeners = new Set<Listener>();
  return {
    get: () => offline,
    set(next: boolean) {
      if (next === offline) return;
      offline = next;
      for (const l of [...listeners]) l(offline);
    },
    subscribe(l: Listener): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
})();

/**
 * Ключ идемпотентности — только ASCII (UUID): заголовок fetch/XHR не принимает кириллицу, сервер —
 * длиннее 200 символов. Из пути, имени файла и других пользовательских данных ключ не строится:
 * один ключ на одну попытку (ревью Task 29 C1).
 */
export const newKey = (): string => crypto.randomUUID();

export interface RequestOpts {
  body?: unknown;
  /** Ключ идемпотентности: `true` — новый, строка — заданный (повтор того же действия). */
  idempotency?: true | string;
}

/** Запрос к Control API (общий для `client.ts` и `script-client.ts`). */
export async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.idempotency) headers["idempotency-key"] = opts.idempotency === true ? newKey() : opts.idempotency;
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: unknown; message?: unknown };
    const code = typeof err.error === "string" ? err.error : `http_${res.status}`;
    if (res.status === 503 && code === "storage_offline") storageStatus.set(true);
    throw new ApiError(res.status, code, typeof err.message === "string" ? err.message : res.statusText, data);
  }
  storageStatus.set(false);
  return data as T;
}

const enc = encodeURIComponent;

export interface KbSearchParams {
  q: string;
  patterns?: string[];
  kinds?: string[];
  allowRestricted?: boolean;
}

export const api = {
  async health(): Promise<HealthDto> {
    const h = await request<HealthDto>("GET", "/api/health");
    storageStatus.set(h.storage === "storage_offline");
    return h;
  },
  projects: () => request<ProjectDto[]>("GET", "/api/projects"),
  project: (id: string) => request<ProjectDetailDto>("GET", `/api/projects/${enc(id)}`),
  createProject: (title: string, kind?: ProjectDto["kind"]) => request<ProjectDto>("POST", "/api/projects", { body: { title, ...(kind ? { kind } : {}) } }),
  createScene: (projectId: string, body: { prompt: string; settings: Settings }, key: string = newKey()) =>
    request<{ scene: SceneDto; job: Job }>("POST", `/api/projects/${enc(projectId)}/scenes`, { body, idempotency: key }),
  scene: (id: string) => request<SceneDetailDto>("GET", `/api/scenes/${enc(id)}`),
  messages: (sceneId: string) => request<ChatMessage[]>("GET", `/api/scenes/${enc(sceneId)}/messages`),
  sendMessage: (sceneId: string, body: { text: string; baseVersionId?: string }, key: string = newKey()) =>
    request<{ message: ChatMessage; job: Job }>("POST", `/api/scenes/${enc(sceneId)}/messages`, { body, idempotency: key }),
  restore: (sceneId: string, versionId: string, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/scenes/${enc(sceneId)}/restore`, { body: { versionId }, idempotency: key }),
  render: (sceneId: string, patch: RenderBody["settings_patch"], baseVersionId: string, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/scenes/${enc(sceneId)}/render`, { body: { settings_patch: patch, base_version_id: baseVersionId }, idempotency: key }),
  improve: (sceneId: string, body: ImproveBody, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/scenes/${enc(sceneId)}/improve`, { body, idempotency: key }),
  version: (id: string) => request<VersionDto>("GET", `/api/versions/${enc(id)}`),
  diff: (a: string, b: string) => request<VersionDiff>("GET", `/api/versions/${enc(a)}/diff/${enc(b)}`),
  exportVersion: (versionId: string, req: ExportRequest, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/versions/${enc(versionId)}/exports`, { body: req, idempotency: key }),
  exportInfo: (id: string) => request<ExportDto>("GET", `/api/exports/${enc(id)}`),
  jobs: (filter: { status?: JobStatus; sceneId?: string } = {}) => {
    const q = new URLSearchParams();
    if (filter.status) q.set("status", filter.status);
    if (filter.sceneId) q.set("sceneId", filter.sceneId);
    const s = q.toString();
    return request<Job[]>("GET", `/api/jobs${s ? `?${s}` : ""}`);
  },
  job: (id: string) => request<JobDetailDto>("GET", `/api/jobs/${enc(id)}`),
  cancelJob: (id: string) => request<Job>("POST", `/api/jobs/${enc(id)}/cancel`),
  retryJob: (id: string) => request<Job>("POST", `/api/jobs/${enc(id)}/retry`),
  jobInput: (id: string, body: JobInputBody) => request<Job>("POST", `/api/jobs/${enc(id)}/input`, { body }),
  kbSearch: (p: KbSearchParams) => {
    const q = new URLSearchParams({ q: p.q });
    if (p.patterns?.length) q.set("patterns", p.patterns.join(","));
    if (p.kinds?.length) q.set("kinds", p.kinds.join(","));
    if (p.allowRestricted) q.set("allowRestricted", "1");
    return request<KbHitDto[]>("GET", `/api/kb/search?${q.toString()}`);
  },
  // id записи KB содержит «/» (`repo/name`): сегменты кодируются по отдельности
  kbCard: (id: string) => request<KbCardDto>("GET", `/api/kb/${id.split("/").map(enc).join("/")}`),
  settings: () => request<AppSettingsDto>("GET", "/api/settings"),
  putSettings: (body: unknown) => request<AppSettingsDto>("PUT", "/api/settings", { body }),

  // видеопроект (Task 29)
  videoProject: (id: string) => request<VideoProjectDto>("GET", `/api/projects/${enc(id)}/video`),
  importMedia: (projectId: string, path: string, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/media/import`, { body: { path }, idempotency: key }),
  media: (id: string) => request<MediaDto>("GET", `/api/media/${enc(id)}`),
  transcribe: (mediaId: string, body: TranscribeBody, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/media/${enc(mediaId)}/transcribe`, { body, idempotency: key }),
  asrCapability: () => request<AsrCapabilityDto>("GET", "/api/asr/capability"),
  transcript: (id: string, revision?: number) =>
    request<TranscriptDto>("GET", `/api/transcripts/${enc(id)}${revision ? `?revision=${revision}` : ""}`),
  transcriptRevisions: (id: string) => request<RevisionEntry[]>("GET", `/api/transcripts/${enc(id)}/revisions`),
  saveTranscript: (id: string, baseRevision: number, ops: TranscriptOp[]) =>
    request<TranscriptDto>("POST", `/api/transcripts/${enc(id)}/revisions`, { body: { base_revision: baseRevision, ops } }),
  proposeRoughCut: (projectId: string, useAgent: boolean, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/roughcut/propose`, { body: { useAgent }, idempotency: key }),
  edl: (id: string, revision?: number) => request<EdlDto>("GET", `/api/edls/${enc(id)}${revision ? `?revision=${revision}` : ""}`),
  saveEdl: (id: string, baseRevision: number, ops: EdlOp[]) =>
    request<EdlDto>("POST", `/api/edls/${enc(id)}/revisions`, { body: { base_revision: baseRevision, ops } }),
  buildPreview: (edlId: string, revision: number, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/edls/${enc(edlId)}/revisions/${revision}/preview`, { body: {}, idempotency: key }),
  approvals: (projectId: string) => request<ProjectApprovalsDto>("GET", `/api/projects/${enc(projectId)}/approvals`),
  approve: (projectId: string, kind: "A" | "B") => request<Approval>("POST", `/api/projects/${enc(projectId)}/approvals`, { body: { kind } }),
  revokeApproval: (id: string) => request<Approval>("POST", `/api/approvals/${enc(id)}/revoke`, { body: {} }),

  // анализ и визуальный план (Task 33)
  analyzeFootage: (projectId: string, useAgent: boolean, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/footage/analyze`, { body: { useAgent }, idempotency: key }),
  footage: (id: string) => request<FootageDto>("GET", `/api/footage/${enc(id)}`),
  analyzeSemantic: (projectId: string, useAgent: boolean, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/semantic/analyze`, { body: { useAgent }, idempotency: key }),
  semantic: (id: string) => request<SemanticDto>("GET", `/api/semantic/${enc(id)}`),
  generatePlan: (projectId: string, useAgent: boolean, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/plan/generate`, { body: { useAgent }, idempotency: key }),
  plan: (id: string, revision?: number) => request<PlanDto>("GET", `/api/plans/${enc(id)}${revision ? `?revision=${revision}` : ""}`),
  savePlan: (id: string, baseRevision: number, ops: PlanOp[]) =>
    request<PlanDto>("POST", `/api/plans/${enc(id)}/revisions`, { body: { base_revision: baseRevision, ops } }),
  recheckPlan: (id: string, key: string = newKey()) => request<{ job: Job }>("POST", `/api/plans/${enc(id)}/recheck`, { body: {}, idempotency: key }),
  projectStyle: (projectId: string) => request<ProjectStyleDto>("GET", `/api/projects/${enc(projectId)}/style`),
  saveProjectStyle: (projectId: string, base: ProjectStyleBase, baseRevision?: number) =>
    request<ProjectStyleDto>("PUT", `/api/projects/${enc(projectId)}/style`, { body: { base, ...(baseRevision ? { base_revision: baseRevision } : {}) } }),
};

/**
 * Потоковая загрузка видео (`PUT …/media/upload`): XHR — ради прогресса отправки (у fetch его
 * нет). Тело — сам файл, имя — только для отображения на сервере.
 */
export function uploadMedia(projectId: string, file: File, key: string, onProgress: (sent: number, total: number) => void): Promise<{ job: Job }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/projects/${enc(projectId)}/media/upload?name=${enc(file.name)}`);
    xhr.setRequestHeader("idempotency-key", key);
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
    xhr.onload = () => {
      let data: unknown;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        storageStatus.set(false);
        resolve(data as { job: Job });
        return;
      }
      const err = (data ?? {}) as { error?: unknown; message?: unknown };
      const code = typeof err.error === "string" ? err.error : `http_${xhr.status}`;
      if (xhr.status === 503 && code === "storage_offline") storageStatus.set(true);
      reject(new ApiError(xhr.status, code, typeof err.message === "string" ? err.message : xhr.statusText, data));
    };
    xhr.onerror = () => reject(new TypeError("network"));
    xhr.send(file);
  });
}

/** URL файлов версии и экспорта (для `<video>`, `<img>` и скачивания). */
export const urls = {
  preview: (versionId: string) => `/api/versions/${enc(versionId)}/preview.mp4`,
  frame: (versionId: string, frame: number) => `/api/versions/${enc(versionId)}/frames/${frame}.png`,
  exportFile: (exportId: string) => `/api/exports/${enc(exportId)}/file`,
  proxy: (mediaId: string) => `/api/media/${enc(mediaId)}/proxy.mp4`,
  waveform: (mediaId: string) => `/api/media/${enc(mediaId)}/waveform.bin`,
  thumb: (mediaId: string, n: number) => `/api/media/${enc(mediaId)}/thumbs/${n}.jpg`,
  edlPreview: (edlId: string, revision: number) => `/api/edls/${enc(edlId)}/revisions/${revision}/preview.mp4`,
  footageFrame: (footageId: string, us: number) => `/api/footage/${enc(footageId)}/frames/${us}.png`,
};
