import { JobSchema, type Job, type JobStatus } from "@ms/contracts";
import type { Db } from "../open.js";
import { fromJson, nowIso, toJson } from "./util.js";

interface Raw {
  id: string; type: string; project_id: string; scene_id: string | null; version_id: string | null; parent_job_id: string | null;
  status: string; progress: number; stage: string | null; attempt: number; max_attempts: number; interrupts: number;
  input_refs_json: string; input_hash: string | null; output_refs_json: string | null; error_json: string | null;
  idempotency_key: string | null; lease_owner: string | null; lease_until: string | null; cancel_requested: number;
  created_at: string; started_at: string | null; finished_at: string | null;
}

const COLUMNS = [
  "id", "type", "project_id", "scene_id", "version_id", "parent_job_id", "status", "progress", "stage", "attempt",
  "max_attempts", "interrupts", "input_refs_json", "input_hash", "output_refs_json", "error_json", "idempotency_key",
  "lease_owner", "lease_until", "cancel_requested", "created_at", "started_at", "finished_at",
] as const;

function toJob(r: Raw): Job {
  const { input_refs_json, output_refs_json, error_json, cancel_requested, ...rest } = r;
  return JobSchema.parse({
    ...rest,
    input: JSON.parse(input_refs_json),
    output_refs: fromJson(output_refs_json),
    error: fromJson(error_json),
    cancel_requested: cancel_requested === 1,
  });
}

function toRaw(j: Job): Raw {
  const { input, output_refs, error, cancel_requested, ...rest } = j;
  return { ...rest, input_refs_json: JSON.stringify(input ?? null), output_refs_json: toJson(output_refs), error_json: toJson(error), cancel_requested: cancel_requested ? 1 : 0 };
}

export type JobInsert = Pick<Job, "id" | "type" | "project_id" | "input"> & Partial<Omit<Job, "id" | "type" | "project_id" | "input">>;

/** Новая задача; незаданные поля — умолчания (`pending`, attempt 0, max_attempts 3). */
export function insert(db: Db, input: JobInsert): Job {
  const job = JobSchema.parse({
    scene_id: null, version_id: null, parent_job_id: null, status: "pending", progress: 0, stage: null, attempt: 0,
    max_attempts: 3, interrupts: 0, input_hash: null, output_refs: null, error: null, idempotency_key: null,
    lease_owner: null, lease_until: null, cancel_requested: false, created_at: nowIso(), started_at: null, finished_at: null,
    ...input,
  });
  const raw = toRaw(job);
  db.prepare(`INSERT INTO jobs (${COLUMNS.join(", ")}) VALUES (${COLUMNS.map((c) => `@${c}`).join(", ")})`).run(raw);
  return job;
}

export function get(db: Db, id: string): Job | undefined {
  const r = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Raw | undefined;
  return r && toJob(r);
}

/** Обновляет поля задачи; результат проверяется `JobSchema`. Нет задачи — ошибка. */
export function update(db: Db, id: string, patch: Partial<Omit<Job, "id">>): Job {
  const cur = get(db, id);
  if (!cur) throw new Error(`db: задачи нет: ${id}`);
  const next = JobSchema.parse({ ...cur, ...patch, id });
  const raw = toRaw(next);
  const cols = COLUMNS.filter((c) => c !== "id");
  db.prepare(`UPDATE jobs SET ${cols.map((c) => `${c} = @${c}`).join(", ")} WHERE id = @id`).run(raw);
  return next;
}

export function list(db: Db, filter: { status?: JobStatus; sceneId?: string; projectId?: string } = {}): Job[] {
  const where: string[] = [];
  const args: Record<string, string> = {};
  if (filter.status) { where.push("status = @status"); args.status = filter.status; }
  if (filter.projectId) { where.push("project_id = @projectId"); args.projectId = filter.projectId; }
  if (filter.sceneId) { where.push("scene_id = @sceneId"); args.sceneId = filter.sceneId; }
  const sql = `SELECT * FROM jobs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at, rowid`;
  return (db.prepare(sql).all(args) as Raw[]).map(toJob);
}

export interface JobListRow {
  job: Job;
  projectTitle: string | null;
  sceneTitle: string | null;
}

/** Порция для UI: новые первыми, курсор устойчив при одинаковом `created_at`. */
export function listPage(db: Db, filter: {
  status?: JobStatus;
  sceneId?: string;
  projectId?: string;
  limit: number;
  before?: { createdAt: string; id: string };
}): JobListRow[] {
  const where: string[] = [];
  const args: Record<string, string | number> = { limit: filter.limit };
  if (filter.status) { where.push("j.status = @status"); args.status = filter.status; }
  if (filter.projectId) { where.push("j.project_id = @projectId"); args.projectId = filter.projectId; }
  if (filter.sceneId) { where.push("j.scene_id = @sceneId"); args.sceneId = filter.sceneId; }
  if (filter.before) {
    where.push("(j.created_at < @beforeCreated OR (j.created_at = @beforeCreated AND j.id < @beforeId))");
    args.beforeCreated = filter.before.createdAt;
    args.beforeId = filter.before.id;
  }
  const sql = `SELECT j.*, p.title AS project_title, s.title AS scene_title
    FROM jobs j
    LEFT JOIN projects p ON p.id = j.project_id
    LEFT JOIN scenes s ON s.id = j.scene_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY j.created_at DESC, j.id DESC LIMIT @limit`;
  return (db.prepare(sql).all(args) as (Raw & { project_title: string | null; scene_title: string | null })[]).map((r) => {
    const { project_title, scene_title, ...raw } = r;
    return { job: toJob(raw), projectTitle: project_title, sceneTitle: scene_title };
  });
}

export function findByIdempotencyKey(db: Db, key: string): Job | undefined {
  const r = db.prepare("SELECT * FROM jobs WHERE idempotency_key = ?").get(key) as Raw | undefined;
  return r && toJob(r);
}
