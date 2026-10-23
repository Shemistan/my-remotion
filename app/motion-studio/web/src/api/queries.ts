// Запросы TanStack Query: ключи совпадают с инвалидацией в `sse.ts` (`job`, `jobs`, `scene`,
// `messages`, `project`). Активные задачи дополнительно опрашиваются — на случай, если
// поток событий оборвался.
import type { JobStatus } from "@ms/contracts";
import { useQuery } from "@tanstack/react-query";
import { type KbSearchParams, api } from "./client.js";

const ACTIVE: ReadonlySet<JobStatus> = new Set(["pending", "running", "awaiting_input", "awaiting_approval", "blocked"]);
export const isActive = (s: JobStatus): boolean => ACTIVE.has(s);
const POLL_MS = 5_000;

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 10_000 });
export const useProjects = () => useQuery({ queryKey: ["projects"], queryFn: api.projects });
export const useProject = (id: string) => useQuery({ queryKey: ["project", id], queryFn: () => api.project(id) });
export const useScene = (id: string) =>
  useQuery({
    queryKey: ["scene", id],
    queryFn: () => api.scene(id),
    refetchInterval: (q) => (q.state.data?.active_job ? POLL_MS : false),
  });
export const useMessages = (sceneId: string) => useQuery({ queryKey: ["messages", sceneId], queryFn: () => api.messages(sceneId) });
export const useVersion = (id: string | undefined) =>
  useQuery({ queryKey: ["version", id], queryFn: () => api.version(id!), enabled: Boolean(id), staleTime: Infinity });
export const useDiff = (a: string, b: string) => useQuery({ queryKey: ["diff", a, b], queryFn: () => api.diff(a, b), staleTime: Infinity });
export const useJobs = (filter: { status?: JobStatus; sceneId?: string } = {}) =>
  useQuery({
    queryKey: ["jobs", filter],
    queryFn: () => api.jobs(filter),
    refetchInterval: (q) => (q.state.data?.some((j) => isActive(j.status)) ? POLL_MS : false),
  });
export const useJob = (id: string | undefined) =>
  useQuery({
    queryKey: ["job", id],
    queryFn: () => api.job(id!),
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data && isActive(q.state.data.job.status) ? POLL_MS : false),
  });
export const useExport = (id: string | undefined) =>
  useQuery({ queryKey: ["export", id], queryFn: () => api.exportInfo(id!), enabled: Boolean(id), staleTime: Infinity });
export const useKbSearch = (p: KbSearchParams) => useQuery({ queryKey: ["kb", p], queryFn: () => api.kbSearch(p) });
export const useKbCard = (id: string | undefined) => useQuery({ queryKey: ["kbCard", id], queryFn: () => api.kbCard(id!), enabled: Boolean(id) });
export const useAppSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings });
