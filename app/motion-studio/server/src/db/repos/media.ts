import { MediaAssetSchema, ProbeSummarySchema, type DerivativeKind, type MediaAsset } from "@ms/contracts";
import type { Db } from "../open.js";

interface Raw {
  id: string; project_id: string; original_name: string; rel_path: string; sha256: string; size_bytes: number;
  probe_json: string; import_json: string; status: MediaAsset["status"]; created_at: string;
}

const row = (r: Raw): MediaAsset => MediaAssetSchema.parse({
  id: r.id, project_id: r.project_id, original_name: r.original_name, rel_path: r.rel_path, sha256: r.sha256,
  size_bytes: r.size_bytes, probe: JSON.parse(r.probe_json), status: r.status, import: JSON.parse(r.import_json), created_at: r.created_at,
});

/**
 * Исходник проекта. Второй исходник в тот же проект — `UNIQUE` (ТЗ §1.2: один на проект).
 * Колонки `timeline_fps_*`, `vfr`, `rotation`, `duration_us`, `has_audio` — из `probe` для запросов.
 */
export function insert(db: Db, asset: MediaAsset, opts: { createdByJobId?: string } = {}): void {
  const a = MediaAssetSchema.parse(asset);
  const p = ProbeSummarySchema.parse(a.probe);
  db.prepare(`INSERT INTO media_assets (id, project_id, original_name, rel_path, sha256, size_bytes, probe_json, import_json,
      timeline_fps_num, timeline_fps_den, vfr, rotation, duration_us, has_audio, status, created_by_job_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(a.id, a.project_id, a.original_name, a.rel_path, a.sha256, a.size_bytes, JSON.stringify(p), JSON.stringify(a.import),
      p.timeline_fps.num, p.timeline_fps.den, p.vfr ? 1 : 0, p.video.rotation, p.duration_us, p.audio ? 1 : 0, a.status,
      opts.createdByJobId ?? null, a.created_at);
}

export function get(db: Db, id: string): MediaAsset | undefined {
  const r = db.prepare("SELECT * FROM media_assets WHERE id = ?").get(id) as Raw | undefined;
  return r && row(r);
}

/** Исходник проекта (не больше одного). */
export function byProject(db: Db, projectId: string): MediaAsset | undefined {
  const r = db.prepare("SELECT * FROM media_assets WHERE project_id = ?").get(projectId) as Raw | undefined;
  return r && row(r);
}

export interface DerivativeRow {
  kind: DerivativeKind;
  rel_path: string;
  sha256: string;
  params: Record<string, unknown>;
}

/** Производная (прокси, waveform, миниатюры, audio16k): одна на вид, повтор заменяет. */
export function setDerivative(db: Db, mediaId: string, d: DerivativeRow): void {
  db.prepare(`INSERT INTO media_derivatives (media_id, kind, rel_path, sha256, params_json) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (media_id, kind) DO UPDATE SET rel_path = excluded.rel_path, sha256 = excluded.sha256, params_json = excluded.params_json`)
    .run(mediaId, d.kind, d.rel_path, d.sha256, JSON.stringify(d.params));
}

export function derivatives(db: Db, mediaId: string): DerivativeRow[] {
  const rows = db.prepare("SELECT kind, rel_path, sha256, params_json FROM media_derivatives WHERE media_id = ? ORDER BY kind").all(mediaId) as
    { kind: DerivativeKind; rel_path: string; sha256: string; params_json: string }[];
  return rows.map(({ params_json, ...r }) => ({ ...r, params: JSON.parse(params_json) as Record<string, unknown> }));
}
