// Задачи наружу (ревью Task 29): без абсолютных путей пользователя и хранилища. Вход
// `media.import` по пути — только имя файла; в сообщениях ошибок, командах, `output_refs`,
// сообщениях и `data` событий, командах процессов путь хранилища (`MS_DATA_DIR`) заменяется на
// «хранилище», домашний каталог — на «~» (только целым сегментом пути). В БД задача не меняется.
import { homedir } from "node:os";
import { basename } from "node:path";
import type { Job, JobEventDto } from "@ms/contracts";
import type { Db } from "../db/open.js";
import { jobCost } from "../db/repos/agent-runs.js";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Маскирует абсолютные пути: хранилище → «хранилище», домашний каталог → «~». Замена — только
 * по границе пути (дальше `/` или не символ имени): `/Users/x2/…` при доме `/Users/x` не трогается.
 */
export function maskPaths(text: string, root: string, home: string = homedir()): string {
  let out = text;
  for (const [from, to] of [[root.replace(/\/+$/, ""), "хранилище"], [home.replace(/\/+$/, ""), "~"]] as const) {
    if (from.length > 1) out = out.replace(new RegExp(`${escapeRe(from)}(?=/|$|[^\\p{L}\\p{N}._~-])`, "gu"), to);
  }
  return out;
}

/** Рекурсивно маскирует все строки значения (объекты, массивы); прочее — как есть. */
export function maskDeep<T>(value: T, root: string, home: string = homedir()): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return maskPaths(v, root, home);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Задача для ответа API. */
export function publicJob(job: Job, root: string): Job {
  let input = job.input;
  if (job.type === "media.import" && input && typeof input === "object") {
    const i = input as Record<string, unknown>;
    if (typeof i.path === "string") input = { ...i, path: basename(i.path) };
  }
  return { ...job, input: maskDeep(input, root), output_refs: maskDeep(job.output_refs, root), error: maskDeep(job.error, root) };
}

/**
 * Задачи со стоимостью (Task 48): `cost_usd` — `jobCost` (сумма `agent_runs.cost_usd` всех
 * попыток, в т. ч. неудачных — S17b); вызовы без цены не учитываются (сумма — нижняя граница).
 * Список — одним запросом с группировкой.
 */
export function withCost<J extends Job>(db: Db, list: J[]): (J & { cost_usd: number })[] {
  if (list.length === 0) return [];
  if (list.length === 1) return [{ ...list[0]!, cost_usd: jobCost(db, list[0]!.id).usd }];
  const sums = new Map((db.prepare("SELECT job_id, COALESCE(SUM(cost_usd), 0) AS usd FROM agent_runs GROUP BY job_id").all() as { job_id: string; usd: number }[])
    .map((r) => [r.job_id, Math.round(r.usd * 1e6) / 1e6]));
  return list.map((j) => ({ ...j, cost_usd: sums.get(j.id) ?? 0 }));
}

/** Событие задачи для ответа API и SSE: сообщение и данные без абсолютных путей. */
export function publicEvent(ev: JobEventDto, root: string): JobEventDto {
  return maskDeep(ev, root);
}
