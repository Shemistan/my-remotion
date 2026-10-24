import type { SceneDto } from "@ms/contracts";
import { newId } from "../../scenes/ids.js";
import type { Db } from "../open.js";
import { nowIso } from "./util.js";

export type SceneRow = SceneDto;

export function create(db: Db, input: { id?: string; project_id: string; title: string; created_at?: string }): SceneRow {
  const id = input.id ?? newId("scn");
  db.prepare("INSERT INTO scenes (id, project_id, title, current_version_id, approved_version_id, created_at) VALUES (?, ?, ?, NULL, NULL, ?)")
    .run(id, input.project_id, input.title, input.created_at ?? nowIso());
  return get(db, id)!;
}

export function get(db: Db, id: string): SceneRow | undefined {
  return db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as SceneRow | undefined;
}

export function listByProject(db: Db, projectId: string): SceneRow[] {
  return db.prepare("SELECT * FROM scenes WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as SceneRow[];
}

export function setCurrent(db: Db, sceneId: string, versionId: string): void {
  const r = db.prepare("UPDATE scenes SET current_version_id = ? WHERE id = ?").run(versionId, sceneId);
  if (r.changes !== 1) throw new Error(`db: сцены нет: ${sceneId}`);
}

/** Название сцены (S5 fix M7: «NN · цитата» сцены сценария при новой ревизии плана). */
export function setTitle(db: Db, sceneId: string, title: string): void {
  const r = db.prepare("UPDATE scenes SET title = ? WHERE id = ?").run(title, sceneId);
  if (r.changes !== 1) throw new Error(`db: сцены нет: ${sceneId}`);
}
