import { randomUUID } from "node:crypto";
import type { Fps, ProbeResult } from "@ms/contracts";
import type { Db } from "../open.js";
import { toJson } from "./util.js";

export interface RenderJobInsert {
  id?: string;
  job_id: string;
  version_id?: string | null;
  kind: "still" | "preview" | "export";
  codec?: string;
  width?: number;
  height?: number;
  fps?: Fps;
  frames?: number;
  output_path?: string;
  ffprobe?: ProbeResult;
  duration_ms?: number;
}

export function insert(db: Db, r: RenderJobInsert): string {
  const id = r.id ?? `rnd_${randomUUID()}`;
  db.prepare(`INSERT INTO render_jobs (id, job_id, version_id, kind, codec, width, height, fps_num, fps_den, frames, output_path,
      ffprobe_json, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, r.job_id, r.version_id ?? null, r.kind, r.codec ?? null, r.width ?? null, r.height ?? null, r.fps?.num ?? null,
      r.fps?.den ?? null, r.frames ?? null, r.output_path ?? null, toJson(r.ffprobe), r.duration_ms ?? null);
  return id;
}
