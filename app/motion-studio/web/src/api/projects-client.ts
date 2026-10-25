// Клиент API управления проектами и восстановления (Task 47): переименование, архив, удаление в
// два шага (сводка с токеном → удаление с токеном и названием), корзина, центр восстановления.
// Мутации обновляют списки проектов, корзины и отчёт восстановления.
import type { DeleteIntentDto, Job, ProjectDto, ProjectLifecycleDto, RecoveryDto } from "@ms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newKey, request } from "./client.js";

const enc = encodeURIComponent;

export type ProjectView = "active" | "archived";

/** Строка корзины (`GET /trash`). */
export interface TrashEntryDto {
  id: string;
  project_id: string;
  title: string;
  kind: ProjectDto["kind"];
  bytes: number;
  created_at: string;
  /** Идёт очистка — восстановить нельзя. */
  purging: boolean;
}

export interface PurgeIntentDto {
  token: string;
  count: number;
  bytes: number;
  files: number;
  expires_at: string;
}

export interface DiscardIntentDto {
  dir: string;
  token: string;
  bytes: number;
  expires_at: string;
}

export const projectsApi = {
  list: (view: ProjectView) => request<ProjectDto[]>("GET", `/api/projects${view === "archived" ? "?view=archived" : ""}`),
  rename: (id: string, title: string) => request<ProjectDto>("PATCH", `/api/projects/${enc(id)}`, { body: { title } }),
  archive: (id: string) => request<ProjectLifecycleDto>("POST", `/api/projects/${enc(id)}/archive`),
  unarchive: (id: string) => request<ProjectLifecycleDto>("POST", `/api/projects/${enc(id)}/unarchive`),
  deleteIntent: (id: string) => request<DeleteIntentDto>("POST", `/api/projects/${enc(id)}/delete-intent`),
  remove: (id: string, token: string, confirmTitle: string) =>
    request<{ trash_id: string }>("DELETE", `/api/projects/${enc(id)}`, { body: { token, confirm_title: confirmTitle } }),
  trash: () => request<TrashEntryDto[]>("GET", "/api/trash"),
  restore: (trashId: string) => request<ProjectDto>("POST", `/api/trash/${enc(trashId)}/restore`),
  purgeIntent: (trashIds: string[]) => request<PurgeIntentDto>("POST", "/api/trash/purge-intent", { body: { trash_ids: trashIds } }),
  purge: (trashIds: string[], token: string, key: string = newKey()) =>
    request<{ job: Job }>("POST", "/api/trash/purge", { body: { trash_ids: trashIds, token }, idempotency: key }),
  recovery: () => request<RecoveryDto>("GET", "/api/recovery"),
  ack: (bootId: string) => request<RecoveryDto>("POST", `/api/recovery/${enc(bootId)}/ack`),
  discardIntent: (dir: string) => request<DiscardIntentDto>("POST", "/api/recovery/quarantine/intent", { body: { dir } }),
  discard: (dir: string, token: string) => request<{ removed: string }>("POST", "/api/recovery/quarantine/discard", { body: { dir, token } }),
};

export const useProjectList = (view: ProjectView) => useQuery({ queryKey: ["projects", view], queryFn: () => projectsApi.list(view) });
export const useTrash = (enabled = true) => useQuery({ queryKey: ["trash"], queryFn: projectsApi.trash, enabled });
export const useRecovery = () => useQuery({ queryKey: ["recovery"], queryFn: projectsApi.recovery });

/** После любого изменения жизненного цикла: списки проектов (все виды) и корзина. */
export function useLifecycleInvalidate(): () => void {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ["projects"] });
    void client.invalidateQueries({ queryKey: ["trash"] });
  };
}

export function useRename(onDone?: () => void) {
  const inv = useLifecycleInvalidate();
  return useMutation({ mutationFn: (v: { id: string; title: string }) => projectsApi.rename(v.id, v.title), onSuccess: () => { inv(); onDone?.(); } });
}

export function useArchive() {
  const inv = useLifecycleInvalidate();
  return useMutation({ mutationFn: (v: { id: string; archived: boolean }) => (v.archived ? projectsApi.archive(v.id) : projectsApi.unarchive(v.id)), onSuccess: inv });
}

export function useRestore() {
  const inv = useLifecycleInvalidate();
  return useMutation({ mutationFn: (trashId: string) => projectsApi.restore(trashId), onSuccess: inv });
}

/** Дата и время по-русски коротко (как на Dashboard). */
export const dateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

/** Размер в понятных единицах (КБ/МБ/ГБ) — строка подставляется в словарь. */
export function sizeParts(bytes: number): { value: string; unit: "b" | "kb" | "mb" | "gb" } {
  if (bytes < 1024) return { value: String(bytes), unit: "b" };
  const units = [["kb", 1024], ["mb", 1024 ** 2], ["gb", 1024 ** 3]] as const;
  let pick: (typeof units)[number] = units[0];
  for (const u of units) if (bytes >= u[1]) pick = u;
  const v = bytes / pick[1];
  return { value: v.toLocaleString("ru-RU", { maximumFractionDigits: v < 10 ? 1 : 0 }), unit: pick[0] };
}
