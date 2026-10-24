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

// видеопроект (Task 29): сводка опрашивается, пока идёт задача проекта
export const useVideoProject = (id: string) =>
  useQuery({
    queryKey: ["video", id],
    queryFn: () => api.videoProject(id),
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => isActive(j.status)) ? POLL_MS : false),
  });
export const useTranscript = (id: string | undefined, revision?: number) =>
  useQuery({ queryKey: ["transcript", id, revision ?? "current"], queryFn: () => api.transcript(id!, revision), enabled: Boolean(id) });
export const useTranscriptRevisions = (id: string | undefined) =>
  useQuery({ queryKey: ["transcriptRevisions", id], queryFn: () => api.transcriptRevisions(id!), enabled: Boolean(id) });
export const useEdl = (id: string | undefined, revision?: number) =>
  useQuery({ queryKey: ["edl", id, revision ?? "current"], queryFn: () => api.edl(id!, revision), enabled: Boolean(id) });
export const useAsrCapability = () => useQuery({ queryKey: ["asrCapability"], queryFn: api.asrCapability, staleTime: 60_000 });

// анализ и визуальный план (Task 33): документы иммутабельны по id; план и стиль — по текущей ревизии
export const useFootage = (id: string | undefined) =>
  useQuery({ queryKey: ["footage", id], queryFn: () => api.footage(id!), enabled: Boolean(id), staleTime: Infinity });
export const useSemantic = (id: string | undefined) =>
  useQuery({ queryKey: ["semantic", id], queryFn: () => api.semantic(id!), enabled: Boolean(id), staleTime: Infinity });
export const usePlan = (id: string | undefined) => useQuery({ queryKey: ["plan", id], queryFn: () => api.plan(id!), enabled: Boolean(id) });
export const useProjectStyle = (projectId: string, enabled: boolean) =>
  useQuery({ queryKey: ["style", projectId], queryFn: () => api.projectStyle(projectId), enabled });
