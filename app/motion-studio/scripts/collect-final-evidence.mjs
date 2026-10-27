#!/usr/bin/env node
// Evidence финала видеопроекта для приёмки Phase 5 (Task 46): выписки из хранилища MS_DATA_DIR (только
// чтение; studio.db открывается readonly). Видео в git нет — только sha256, размер и итог проверки.
//   MS_DATA_DIR=… node scripts/collect-final-evidence.mjs <projectId> <каталог>
// exports.json — экспорты финала (настройки, статус, sha256, вердикт и провалы проверки, compare);
// timelines.json — ревизии таймлайна (сцены: версия, кадры, режим; исключённые; замечания; ops);
// jobs.json — задачи проекта (тип, статус, попытки, время, ошибка, стоимость agent_runs);
// approvals.json — решения A/B/C/final; costs.json — стоимость по типам задач (справочно).
/* global process, console, URL */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const Database = require("better-sqlite3");

const [projectId, outDir] = process.argv.slice(2);
const root = process.env.MS_DATA_DIR;
if (!projectId || !outDir || !root) {
  console.error("usage: MS_DATA_DIR=… node scripts/collect-final-evidence.mjs <projectId> <out-dir>");
  process.exit(64);
}
const d = new Database(join(root, "studio.db"), { readonly: true, fileMustExist: true });
const json = (s) => (s ? JSON.parse(s) : null);
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const write = (name, data) => writeFileSync(join(outDir, name), JSON.stringify(data, null, 2) + "\n");
mkdirSync(outDir, { recursive: true });

const exports = d.prepare("SELECT * FROM final_exports WHERE project_id = ? ORDER BY created_at").all(projectId).map((e) => {
  const dir = e.rel_path.endsWith(".mp4") ? join(root, e.rel_path, "..") : join(root, e.rel_path);
  const verify = readJson(join(dir, "verify.json"));
  const manifest = readJson(join(dir, "final-manifest.json"));
  const compare = readJson(join(dir, "compare.json"));
  const mp4 = join(dir, "final.mp4");
  return {
    id: e.id, created_at: e.created_at, timeline: `${e.timeline_id}@r${e.timeline_revision}`, request: json(e.request_json), status: e.status, job_id: e.job_id,
    file: { rel: `${e.rel_path}/final.mp4`, sha256: e.sha256, bytes: existsSync(mp4) ? statSync(mp4).size : null },
    output: manifest?.output ?? null, inputs_hash: e.inputs_hash,
    verify: verify && { verdict: verify.verdict, failures: verify.failures, duration: verify.duration, sync_max_abs_us: Math.max(...verify.sync.map((s) => Math.abs(s.offset_us))), sync_n: verify.sync.length,
      frames_n: verify.frames.length, frames_min_psnr: Math.min(...verify.frames.map((f) => f.psnr_db)), loudness: verify.loudness },
    compare,
  };
});
write("exports.json", exports);

const tl = d.prepare("SELECT * FROM video_timelines WHERE project_id = ?").get(projectId);
const timelines = tl ? d.prepare("SELECT * FROM video_timeline_revisions WHERE timeline_id = ? ORDER BY revision").all(tl.id).map((r) => {
  const doc = readJson(join(root, r.rel_path));
  return {
    revision: r.revision, parent: r.parent_revision, created_at: r.created_at, inputs: doc?.inputs, duration_frames: doc?.duration_frames, ops: doc?.ops ?? [],
    scenes: (doc?.scenes ?? []).map((s) => ({ item: s.item_id, version: s.version_number, start: s.start_frame, len: s.duration_frames, mode: s.placement.mode, anchors: s.anchors.map((a) => `${a.text}@${a.frame}`) })),
    excluded: doc?.excluded ?? [], issues: doc?.issues ?? [],
  };
}) : [];
write("timelines.json", timelines);

const jobs = d.prepare("SELECT id, type, status, stage, attempt, interrupts, created_at, started_at, finished_at, error_json FROM jobs WHERE project_id = ? ORDER BY created_at").all(projectId).map((j) => {
  const cost = d.prepare("SELECT COALESCE(SUM(cost_usd), 0) FROM agent_runs WHERE job_id = ?").pluck().get(j.id);
  const wall = j.started_at && j.finished_at ? Math.round((Date.parse(j.finished_at) - Date.parse(j.started_at)) / 1000) : null;
  return { ...j, error: json(j.error_json), error_json: undefined, wall_s: wall, cost_usd: Math.round(cost * 1e4) / 1e4 };
});
write("jobs.json", jobs);
write("approvals.json", d.prepare("SELECT id, kind, subject_ref, status, stale_reason, decided_at FROM approvals WHERE project_id = ? ORDER BY decided_at").all(projectId));
const costs = {};
for (const j of jobs) {
  const k = costs[j.type] ?? { jobs: 0, cost_usd: 0, wall_s: 0 };
  costs[j.type] = { jobs: k.jobs + 1, cost_usd: Math.round((k.cost_usd + j.cost_usd) * 1e4) / 1e4, wall_s: k.wall_s + (j.wall_s ?? 0) };
}
write("costs.json", { by_type: costs, total_usd: Math.round(jobs.reduce((s, j) => s + j.cost_usd, 0) * 1e4) / 1e4 });
d.close();
console.log(JSON.stringify({ exports: exports.length, timelines: timelines.length, jobs: jobs.length }));
