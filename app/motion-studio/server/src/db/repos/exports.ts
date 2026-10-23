import type { ExportFormat } from "@ms/contracts";
import { newId } from "../../scenes/ids.js";
import type { Db } from "../open.js";
import { nowIso } from "./util.js";

export interface ExportRow {
  id: string;
  version_id: string;
  job_id: string | null;
  format: ExportFormat;
  path: string;
  sha256: string;
  created_at: string;
}

export function insert(db: Db, e: Omit<ExportRow, "id" | "created_at" | "job_id"> & { id?: string; job_id?: string | null }): ExportRow {
  const id = e.id ?? newId("exp");
  db.prepare("INSERT INTO exports (id, version_id, job_id, format, path, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, e.version_id, e.job_id ?? null, e.format, e.path, e.sha256, nowIso());
  return get(db, id)!;
}

export function get(db: Db, id: string): ExportRow | undefined {
  return db.prepare("SELECT * FROM exports WHERE id = ?").get(id) as ExportRow | undefined;
}

/** Экспорты версии, старые первыми. */
export function listByVersion(db: Db, versionId: string): ExportRow[] {
  return db.prepare("SELECT * FROM exports WHERE version_id = ? ORDER BY created_at, rowid").all(versionId) as ExportRow[];
}
