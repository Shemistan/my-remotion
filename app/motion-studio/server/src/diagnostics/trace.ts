// Трассировка задачи (Task 48, ТЗ §12): проект → сцена → версия → задача и дочерние →
// запуски агентов (роль, модель, статус, токены, стоимость, время) → рендеры → события.
// Стоимость — `jobCost` по задаче и дочерним (все попытки, в т. ч. неудачные — S17b).
import type { AgentRunDto, JobTraceDto, RenderJobDto } from "@ms/contracts/diagnostics";
import type { Db } from "../db/open.js";
import { jobCost } from "../db/repos/agent-runs.js";
import * as jobEvents from "../db/repos/job-events.js";
import * as jobs from "../db/repos/jobs.js";

/** Событий задачи в трассировке — последние столько. */
export const TRACE_EVENTS = 2_000;

interface AgentRaw {
  id: string; job_id: string; role: string; model: string; status: string; input_tokens: number | null;
  output_tokens: number | null; cost_usd: number | null; started_at: string; finished_at: string | null;
}

const durationMs = (a: string, b: string | null): number | null => {
  if (!b) return null;
  const d = Date.parse(b) - Date.parse(a);
  return Number.isFinite(d) ? d : null;
};

export function jobTrace(db: Db, jobId: string): JobTraceDto | undefined {
  const job = jobs.get(db, jobId);
  if (!job) return undefined;
  const project = db.prepare("SELECT id, kind, title FROM projects WHERE id = ?").get(job.project_id) as JobTraceDto["project"] | undefined;
  const scene = job.scene_id ? (db.prepare("SELECT id, title FROM scenes WHERE id = ?").get(job.scene_id) as JobTraceDto["scene"]) : undefined;
  const version = job.version_id
    ? (db.prepare("SELECT id, number, status FROM scene_versions WHERE id = ?").get(job.version_id) as JobTraceDto["version"])
    : undefined;
  const childIds = (db.prepare("SELECT id FROM jobs WHERE parent_job_id = ? ORDER BY created_at, id").pluck().all(jobId) as string[]);
  const children = childIds.map((id) => jobs.get(db, id)!).filter(Boolean);
  const ids = [jobId, ...childIds];
  const marks = ids.map(() => "?").join(", ");
  const agentRuns: AgentRunDto[] = (db.prepare(`SELECT id, job_id, role, model, status, input_tokens, output_tokens, cost_usd, started_at, finished_at
      FROM agent_runs WHERE job_id IN (${marks}) ORDER BY started_at, rowid`).all(...ids) as AgentRaw[])
    .map((r) => ({ ...r, duration_ms: durationMs(r.started_at, r.finished_at) }));
  const renderJobs = db.prepare(`SELECT id, job_id, version_id, kind, codec, width, height, frames, duration_ms
      FROM render_jobs WHERE job_id IN (${marks}) ORDER BY rowid`).all(...ids) as RenderJobDto[];
  const total = ids.map((id) => jobCost(db, id)).reduce((a, c) => ({ usd: a.usd + c.usd, runs: a.runs + c.runs, unknown: a.unknown + c.unknown }), { usd: 0, runs: 0, unknown: 0 });
  // последние TRACE_EVENTS событий задачи по возрастанию id
  const firstId = (db.prepare("SELECT id FROM job_events WHERE job_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?").pluck().get(jobId, TRACE_EVENTS) as number | undefined) ?? 0;
  const events = jobEvents.listSince(db, firstId, { jobId, limit: TRACE_EVENTS });
  return {
    project: project ?? { id: job.project_id, kind: "?", title: job.project_id },
    ...(scene ? { scene } : {}),
    ...(version ? { version } : {}),
    job,
    children,
    agentRuns,
    renderJobs,
    events,
    cost: { ...total, usd: Math.round(total.usd * 1e6) / 1e6 },
  };
}
