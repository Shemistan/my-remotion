import { SettingsSchema, type ProjectDto, type Settings } from "@ms/contracts";
import { newId } from "../../scenes/ids.js";
import type { Db } from "../open.js";
import { fromJson, nowIso, toJson } from "./util.js";

export type ProjectRow = ProjectDto;
interface Raw { id: string; kind: ProjectRow["kind"]; title: string; settings_json: string | null; created_at: string; updated_at: string }

const row = (r: Raw): ProjectRow => ({
  id: r.id, kind: r.kind, title: r.title,
  settings: r.settings_json === null ? null : SettingsSchema.parse(fromJson(r.settings_json)),
  created_at: r.created_at, updated_at: r.updated_at,
});

export function create(db: Db, input: { id?: string; kind?: ProjectRow["kind"]; title: string; settings?: Settings }): ProjectRow {
  const at = nowIso();
  const settings = input.settings === undefined ? null : SettingsSchema.parse(input.settings);
  const id = input.id ?? newId("prj");
  db.prepare("INSERT INTO projects (id, kind, title, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, input.kind ?? "video", input.title, toJson(settings), at, at);
  return get(db, id)!;
}

export function get(db: Db, id: string): ProjectRow | undefined {
  const r = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Raw | undefined;
  return r && row(r);
}

/** Playground первым, затем по времени создания. */
export function list(db: Db): ProjectRow[] {
  return (db.prepare("SELECT * FROM projects ORDER BY kind = 'playground' DESC, created_at, rowid").all() as Raw[]).map(row);
}
