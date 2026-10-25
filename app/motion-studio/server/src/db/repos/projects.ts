import { SettingsSchema, type ProjectDto, type Settings } from "@ms/contracts";
import { newId } from "../../scenes/ids.js";
import type { Db } from "../open.js";
import { fromJson, nowIso, toJson } from "./util.js";

export type ProjectRow = ProjectDto;
interface Raw { id: string; kind: ProjectRow["kind"]; title: string; settings_json: string | null; created_at: string; updated_at: string; deleted_at?: string | null }

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
    .run(id, input.kind ?? "playground", input.title, toJson(settings), at, at);
  return get(db, id)!;
}

export function get(db: Db, id: string): ProjectRow | undefined {
  const r = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Raw | undefined;
  return r && row(r);
}

/** Настройки проекта (первый импорт видео задаёт fps и формат кадра). */
export function setSettings(db: Db, id: string, settings: Settings): void {
  const s = SettingsSchema.parse(settings);
  const r = db.prepare("UPDATE projects SET settings_json = ?, updated_at = ? WHERE id = ?").run(toJson(s), nowIso(), id);
  if (r.changes !== 1) throw new Error(`projects: проекта ${id} нет`);
}

/**
 * Служебные проекты харнесса качества (`scripts/bench-set.mts`): `bench-<run>`, у прогонов до
 * переименования харнесса (2026-10-23) — старый префикс. UI (Task 21) их не показывает.
 */
export const BENCH_PROJECT_PREFIXES = ["bench-", "eval-"] as const;

export const isBenchProject = (id: string): boolean => BENCH_PROJECT_PREFIXES.some((p) => id.startsWith(p));

/** Playground первым, затем по времени создания; удалённые в корзину (Task 47) — нет. */
export function list(db: Db): ProjectRow[] {
  // `deleted_at` — колонка 006: на базе до неё строк-удалённых нет (поле отсутствует)
  return (db.prepare("SELECT * FROM projects ORDER BY kind = 'playground' DESC, created_at, rowid").all() as Raw[]).filter((r) => !r.deleted_at).map(row);
}
