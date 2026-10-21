import type { ChatMessage } from "@ms/contracts";
import { newId } from "../../scenes/ids.js";
import type { Db } from "../open.js";
import { nowIso } from "./util.js";

interface Raw { id: string; scene_id: string; role: ChatMessage["role"]; text: string; version_id: string | null; job_id: string | null; created_at: string }

const row = (r: Raw): ChatMessage => ({
  id: r.id, scene_id: r.scene_id, role: r.role, text: r.text,
  ...(r.version_id === null ? {} : { version_id: r.version_id }),
  ...(r.job_id === null ? {} : { job_id: r.job_id }),
  created_at: r.created_at,
});

export function add(db: Db, m: Omit<ChatMessage, "id" | "created_at"> & { id?: string }): ChatMessage {
  const id = m.id ?? newId("msg");
  db.prepare("INSERT INTO chat_messages (id, scene_id, role, text, version_id, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, m.scene_id, m.role, m.text, m.version_id ?? null, m.job_id ?? null, nowIso());
  return row(db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as Raw);
}

export function list(db: Db, sceneId: string): ChatMessage[] {
  return (db.prepare("SELECT * FROM chat_messages WHERE scene_id = ? ORDER BY created_at, rowid").all(sceneId) as Raw[]).map(row);
}
