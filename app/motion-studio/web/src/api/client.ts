// Типизированный клиент Control API. `Origin` ставит браузер (запросы — только со своей
// страницы 127.0.0.1:8790/localhost:8790); создающие задачи POST несут `Idempotency-Key`
// (`crypto.randomUUID()`, повтор того же действия — тот же ключ). Ответ 503
// `storage_offline` (или health с ним) включает баннер хранилища, успешный ответ — выключает.
import type {
  AppSettingsDto,
  ChatMessage,
  ExportDto,
  ExportRequest,
  HealthDto,
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

export const newKey = (): string => crypto.randomUUID();

interface RequestOpts {
  body?: unknown;
  /** Ключ идемпотентности: `true` — новый, строка — заданный (повтор того же действия). */
  idempotency?: true | string;
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
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
  createProject: (title: string) => request<ProjectDto>("POST", "/api/projects", { body: { title } }),
  createScene: (projectId: string, body: { prompt: string; settings: Settings }, key: string = newKey()) =>
    request<{ scene: SceneDto; job: Job }>("POST", `/api/projects/${enc(projectId)}/scenes`, { body, idempotency: key }),
  scene: (id: string) => request<SceneDetailDto>("GET", `/api/scenes/${enc(id)}`),
  messages: (sceneId: string) => request<ChatMessage[]>("GET", `/api/scenes/${enc(sceneId)}/messages`),
  sendMessage: (sceneId: string, body: { text: string; baseVersionId?: string }, key: string = newKey()) =>
    request<{ message: ChatMessage; job: Job }>("POST", `/api/scenes/${enc(sceneId)}/messages`, { body, idempotency: key }),
  restore: (sceneId: string, versionId: string, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/scenes/${enc(sceneId)}/restore`, { body: { versionId }, idempotency: key }),
  render: (sceneId: string, patch: RenderBody["settings_patch"], key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/scenes/${enc(sceneId)}/render`, { body: { settings_patch: patch }, idempotency: key }),
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
};

/** URL файлов версии и экспорта (для `<video>`, `<img>` и скачивания). */
export const urls = {
  preview: (versionId: string) => `/api/versions/${enc(versionId)}/preview.mp4`,
  frame: (versionId: string, frame: number) => `/api/versions/${enc(versionId)}/frames/${frame}.png`,
  exportFile: (exportId: string) => `/api/exports/${enc(exportId)}/file`,
};
