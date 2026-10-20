import { SettingsSchema, type Settings, type VersionManifest } from "@ms/contracts";
import type { Db } from "../open.js";
import { fromJson, toJson } from "./util.js";

/** Строка `scene_versions`; `path` — каталог версии относительно корня хранилища. */
export interface VersionRow {
  id: string;
  scene_id: string;
  parent_version_id: string | null;
  number: number;
  status: "ready" | "failed";
  prompt: string;
  edit_plan: VersionManifest["edit_plan"];
  settings: Settings;
  path: string;
  manifest_sha256: string;
  created_by_job_id: string | null;
  created_at: string;
}
type Raw = Omit<VersionRow, "edit_plan" | "settings"> & { edit_plan_json: string | null; settings_json: string };

const row = (r: Raw): VersionRow => {
  const { edit_plan_json, settings_json, ...rest } = r;
  return { ...rest, edit_plan: fromJson(edit_plan_json), settings: SettingsSchema.parse(JSON.parse(settings_json)) };
};

export function insert(db: Db, v: VersionRow): void {
  db.prepare(`INSERT INTO scene_versions (id, scene_id, parent_version_id, number, status, prompt, edit_plan_json, settings_json,
      path, manifest_sha256, created_by_job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(v.id, v.scene_id, v.parent_version_id, v.number, v.status, v.prompt, toJson(v.edit_plan), JSON.stringify(v.settings),
      v.path, v.manifest_sha256, v.created_by_job_id, v.created_at);
}

export function get(db: Db, id: string): VersionRow | undefined {
  const r = db.prepare("SELECT * FROM scene_versions WHERE id = ?").get(id) as Raw | undefined;
  return r && row(r);
}

export function listByScene(db: Db, sceneId: string): VersionRow[] {
  return (db.prepare("SELECT * FROM scene_versions WHERE scene_id = ? ORDER BY number").all(sceneId) as Raw[]).map(row);
}

/** Следующий номер версии сцены: ready и failed считаются одинаково (`05` §5). */
export function nextNumber(db: Db, sceneId: string): number {
  return (db.prepare("SELECT coalesce(max(number), 0) + 1 AS n FROM scene_versions WHERE scene_id = ?").get(sceneId) as { n: number }).n;
}
