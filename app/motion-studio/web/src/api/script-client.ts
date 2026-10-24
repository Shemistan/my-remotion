// Клиент API сценарного проекта (спека §7): функции по маршрутам, запросы и мутации TanStack
// Query. Создающие POST несут `Idempotency-Key` (повтор того же действия — тот же ключ); мутации
// обновляют состояние сценария (`["script", projectId]`).
import type {
  Aspect,
  CheatsheetQuery,
  GenerateBody,
  Job,
  PackageBody,
  PlanOpsBody,
  PutScriptBody,
  ReframeBody,
  ScriptBatchDto,
  ScriptDto,
  ScriptPackageDto,
  ScriptPlanBody,
  ScriptPlanDto,
  ScriptStateDto,
} from "@ms/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { newKey, request } from "./client.js";
import { isActive } from "./queries.js";

const enc = encodeURIComponent;
const POLL_MS = 5_000;

export const scriptApi = {
  state: (projectId: string) => request<ScriptStateDto>("GET", `/api/projects/${enc(projectId)}/script`),
  saveText: (projectId: string, body: PutScriptBody) => request<ScriptDto>("PUT", `/api/projects/${enc(projectId)}/script`, { body }),
  buildPlan: (projectId: string, body: ScriptPlanBody, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/script/plan`, { body, idempotency: key }),
  planOps: (projectId: string, body: PlanOpsBody) => request<ScriptPlanDto>("POST", `/api/projects/${enc(projectId)}/script/plan/ops`, { body }),
  generate: (projectId: string, body: GenerateBody, key: string = newKey()) =>
    request<ScriptBatchDto>("POST", `/api/projects/${enc(projectId)}/script/generate`, { body, idempotency: key }),
  batch: (batchId: string) => request<ScriptBatchDto>("GET", `/api/script-batches/${enc(batchId)}`),
  cancelBatch: (batchId: string) => request<ScriptBatchDto>("POST", `/api/script-batches/${enc(batchId)}/cancel`),
  reframe: (projectId: string, body: ReframeBody, key: string = newKey()) =>
    request<ScriptBatchDto>("POST", `/api/projects/${enc(projectId)}/script/reframe`, { body, idempotency: key }),
  buildPackage: (projectId: string, body: PackageBody, key: string = newKey()) =>
    request<{ job: Job }>("POST", `/api/projects/${enc(projectId)}/script/package`, { body, idempotency: key }),
  package: (packageId: string) => request<ScriptPackageDto>("GET", `/api/script-packages/${enc(packageId)}`),
  reveal: (packageId: string) => request<null>("POST", `/api/script-packages/${enc(packageId)}/reveal`),
};

export const scriptUrls = {
  /** Шпаргалка пакета: md — просмотр, csv/txt — скачать. */
  cheatsheet: (packageId: string, format: CheatsheetQuery["format"]) => `/api/script-packages/${enc(packageId)}/cheatsheet?format=${format}`,
};

/** Задача или пакет проекта ещё идут — состояние опрашивается. */
function stateActive(s: ScriptStateDto | undefined): boolean {
  if (!s) return false;
  return s.scenes.some((x) => x.job !== null && isActive(x.job.status)) || s.batches.some((b) => b.counts.pending + b.counts.running > 0);
}

export const scriptStateKey = (projectId: string) => ["script", projectId] as const;

export const useScriptState = (projectId: string) =>
  useQuery({
    queryKey: scriptStateKey(projectId),
    queryFn: () => scriptApi.state(projectId),
    refetchInterval: (q) => (stateActive(q.state.data) ? POLL_MS : false),
  });

export const useScriptBatch = (batchId: string | undefined) =>
  useQuery({
    queryKey: ["scriptBatch", batchId],
    queryFn: () => scriptApi.batch(batchId!),
    enabled: Boolean(batchId),
    refetchInterval: (q) => (q.state.data && q.state.data.counts.pending + q.state.data.counts.running > 0 ? POLL_MS : false),
  });

export const useScriptPackage = (packageId: string | undefined) =>
  useQuery({ queryKey: ["scriptPackage", packageId], queryFn: () => scriptApi.package(packageId!), enabled: Boolean(packageId) });

/** Мутация с обновлением состояния сценария после ответа (успех или ошибка). */
function useScriptMutation<V, R>(projectId: string, fn: (v: V) => Promise<R>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => client.invalidateQueries({ queryKey: scriptStateKey(projectId) }) });
}

export const useSaveText = (projectId: string) => useScriptMutation(projectId, (body: PutScriptBody) => scriptApi.saveText(projectId, body));
export const useBuildPlan = (projectId: string) =>
  useScriptMutation(projectId, ({ body, key }: { body: ScriptPlanBody; key: string }) => scriptApi.buildPlan(projectId, body, key));
export const usePlanOps = (projectId: string) => useScriptMutation(projectId, (body: PlanOpsBody) => scriptApi.planOps(projectId, body));
export const useGenerate = (projectId: string) =>
  useScriptMutation(projectId, ({ body, key }: { body: GenerateBody; key: string }) => scriptApi.generate(projectId, body, key));
export const useCancelBatch = (projectId: string) => useScriptMutation(projectId, (batchId: string) => scriptApi.cancelBatch(batchId));
export const useReframe = (projectId: string) =>
  useScriptMutation(projectId, ({ body, key }: { body: ReframeBody; key: string }) => scriptApi.reframe(projectId, body, key));
export const useBuildPackage = (projectId: string) =>
  useScriptMutation(projectId, ({ aspect, key }: { aspect: Aspect; key: string }) => scriptApi.buildPackage(projectId, { aspect }, key));
export const useReveal = () => useMutation({ mutationFn: (packageId: string) => scriptApi.reveal(packageId) });
