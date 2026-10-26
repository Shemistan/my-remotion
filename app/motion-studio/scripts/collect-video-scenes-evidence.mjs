#!/usr/bin/env node
// Evidence сцен видеопроекта для приёмки Phase 4 (Task 41): копии из хранилища MS_DATA_DIR (только
// чтение; studio.db открывается readonly).
//   MS_DATA_DIR=… node scripts/collect-video-scenes-evidence.mjs <projectId> <каталог>
// scenes/<item>.json — строка video_scenes, сцена, версии (настройки, родитель, задача, QA-вердикты и
// замечания, sha256 manifest.json; видео версии — только sha256 и ffprobe); batches.json — пакеты и их
// задачи; jobs.json — задачи сцен (журнал без progress, agent_runs: модель, токены, стоимость,
// процессы); approvals.json (B и C); packages.json — папки клипов (манифест, sha256 и ffprobe файлов).
// Видео в git не копируется (V4). Домашний каталог → `~`. Итог — строка JSON в stdout.
/* global process, URL, console */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const Database = require("better-sqlite3");

const [projectId, dest] = process.argv.slice(2);
const root = process.env.MS_DATA_DIR;
if (!projectId || !dest || !root) {
  console.error("usage: MS_DATA_DIR=… node scripts/collect-video-scenes-evidence.mjs <projectId> <dest>");
  process.exit(64);
}
const HOME = homedir();
const redact = (s) => s.split(HOME).join("~").replace(/(\\*)"hostname\1":\1"[^"\\]*\1",?/g, "");
const put = (rel, data) => {
  const p = join(dest, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, redact(typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n"));
};
const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const probe = (p) => {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", `file:${p}`], { encoding: "utf8", maxBuffer: 64 << 20 }));
  const v = j.streams.find((s) => s.codec_type === "video");
  const a = j.streams.find((s) => s.codec_type === "audio");
  return { codec: v?.codec_name, profile: v?.profile, pix_fmt: v?.pix_fmt, width: v?.width, height: v?.height, r_frame_rate: v?.r_frame_rate, nb_frames: v?.nb_frames, duration: v?.duration ?? j.format.duration, audio: a?.codec_name ?? null };
};
const media = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.(mp4|mov)$/i.test(f)).map((f) => ({ file: f, sha256: sha256(join(dir, f)), ffprobe: probe(join(dir, f)) })) : []);
const json = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

const d = new Database(join(root, "studio.db"), { readonly: true, fileMustExist: true });
const all = (sql, ...p) => d.prepare(sql).all(...p);
const one = (sql, ...p) => d.prepare(sql).get(...p);
const project = one("SELECT id, kind, title, settings_json FROM projects WHERE id = ?", projectId);
if (!project) throw new Error(`нет проекта ${projectId}`);
put("project.json", project);

const vscenes = all("SELECT * FROM video_scenes WHERE project_id = ? ORDER BY item_id", projectId);
const summary = { project_id: projectId, scenes: [], batches: 0, jobs: 0, packages: 0, cost_usd: 0 };
const jobIds = new Set();
for (const vs of vscenes) {
  const scene = one("SELECT * FROM scenes WHERE id = ?", vs.scene_id);
  const versions = all("SELECT id, number, status, parent_version_id, prompt, settings_json, path, manifest_sha256, created_by_job_id, created_at, broken_reason FROM scene_versions WHERE scene_id = ? ORDER BY number", vs.scene_id)
    .map((v) => {
      if (v.created_by_job_id) jobIds.add(v.created_by_job_id);
      const qa = all("SELECT attempt, technical, visual, semantic, style, report_path FROM qa_reports WHERE version_id = ? ORDER BY attempt", v.id).map((q) => {
        const rep = json(q.report_path.startsWith("/") ? q.report_path : join(root, q.report_path));
        return { ...q, issues: (rep?.issues ?? []).map((i) => ({ code: i.code, severity: i.severity, source: i.source, message: i.message })) };
      });
      const dir = join(root, v.path);
      return { ...v, settings: JSON.parse(v.settings_json), settings_json: undefined, edit_plan: undefined, qa, files: media(dir) };
    });
  for (const j of all("SELECT id FROM jobs WHERE scene_id = ?", vs.scene_id)) jobIds.add(j.id);
  put(`scenes/${vs.item_id}.json`, { video_scene: vs, scene, versions });
  summary.scenes.push({ item_id: vs.item_id, scene_id: vs.scene_id, versions: versions.length, current: scene?.current_version_id ?? null, approved: scene?.approved_version_id ?? null });
}
const batches = all("SELECT * FROM video_batches WHERE project_id = ? ORDER BY created_at", projectId);
put("batches.json", batches);
summary.batches = batches.length;
const jobs = [...jobIds].map((id) => {
  const j = one("SELECT id, type, status, stage, attempt, interrupts, scene_id, idempotency_key, error_json, created_at, started_at, finished_at FROM jobs WHERE id = ?", id);
  const runs = all("SELECT role, model, status, input_tokens, output_tokens, cost_usd, started_at, finished_at FROM agent_runs WHERE job_id = ? ORDER BY started_at", id);
  const events = all("SELECT ts, level, kind, message FROM job_events WHERE job_id = ? AND kind != 'progress' ORDER BY id", id);
  // cmd агента несёт весь системный промпт — только начало
  const processes = all("SELECT attempt, pid, substr(cmd, 1, 120) AS cmd, started_at, ended_at, exit_code FROM job_processes WHERE job_id = ? ORDER BY started_at", id);
  const cost = runs.reduce((a, r) => a + (r.cost_usd ?? 0), 0);
  summary.cost_usd += cost;
  return { ...j, cost_usd: Number(cost.toFixed(4)), agent_runs: runs, events, processes };
}).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
put("jobs.json", jobs);
summary.jobs = jobs.length;
summary.cost_usd = Number(summary.cost_usd.toFixed(3));
put("approvals.json", all("SELECT kind, subject_ref, subject_hash, status, stale_reason, decided_at FROM approvals WHERE project_id = ? ORDER BY decided_at", projectId));
const packages = all("SELECT * FROM video_packages WHERE project_id = ? ORDER BY created_at", projectId).map((p) => {
  const dir = join(root, p.rel_path);
  return { ...p, manifest: json(join(dir, "package-manifest.json")), files: media(dir) };
});
put("packages.json", packages);
summary.packages = packages.length;
d.close();
console.log(JSON.stringify(summary));
