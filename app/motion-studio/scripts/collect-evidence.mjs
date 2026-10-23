// Evidence версии или экспорта для приёмки (Task 22, `09` — общие правила): копии из
// хранилища MS_DATA_DIR (только чтение; studio.db открывается readonly).
//   node scripts/collect-evidence.mjs <ver_…|exp_…> <каталог>
// Версия: manifest, spec, props, settings, style, qa, knowledge-refs, selection, warnings,
// pipeline-log, src/Scene.tsx, frames/*.png (уменьшены до 960 px по ширине — sips),
// preview.mp4 (≤ 10 МБ, иначе только sha256) + preview.ffprobe.json; job.json — задача,
// журнал (без progress), agent_runs (модель, токены, стоимость), render_jobs, сообщения чата.
// Экспорт: файл (≤ 10 МБ, иначе sha256), export-manifest.json, ffprobe, job.json.
// Итог — строка JSON в stdout (что скопировано, стоимость).
/* global process, URL, console */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const Database = require("better-sqlite3");

const MAX_MEDIA = 10 * 1024 * 1024;
const FRAME_WIDTH = "960";
const VERSION_FILES = ["manifest.json", "spec.json", "props.json", "settings.json", "style.json", "qa.json", "knowledge-refs.json", "selection.json", "warnings.json", "pipeline-log.json"];

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const json = (v) => JSON.stringify(v, null, 2) + "\n";
const parse = (s) => (s == null ? null : JSON.parse(s));

function ffprobe(path) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", path], { encoding: "utf8" }));
}

/** Медиа: копия, если ≤ 10 МБ; всегда sha256 и ffprobe рядом. */
function media(src, dest, name) {
  const size = statSync(src).size;
  const copied = size <= MAX_MEDIA;
  if (copied) copyFileSync(src, join(dest, name));
  const stem = name.replace(/\.[^.]+$/, "");
  writeFileSync(join(dest, `${stem}.ffprobe.json`), json(ffprobe(src)));
  writeFileSync(join(dest, `${stem}.sha256`), `${sha(src)}  ${src}\n`);
  return { name, size, copied };
}

function jobInfo(db, jobId) {
  if (!jobId) return null;
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
  if (!job) return null;
  const runs = db.prepare("SELECT role, model, status, input_tokens, output_tokens, cost_usd, started_at, finished_at FROM agent_runs WHERE job_id = ? ORDER BY started_at").all(jobId);
  const events = db.prepare("SELECT ts, level, kind, message FROM job_events WHERE job_id = ? AND kind <> 'progress' ORDER BY id").all(jobId);
  return {
    job: { ...job, input_refs_json: parse(job.input_refs_json), output_refs_json: parse(job.output_refs_json), error_json: parse(job.error_json) },
    cost_usd: runs.reduce((a, r) => a + (r.cost_usd ?? 0), 0),
    wall_ms: job.started_at && job.finished_at ? Date.parse(job.finished_at) - Date.parse(job.created_at) : null,
    agent_runs: runs,
    render_jobs: db.prepare("SELECT kind, codec, width, height, fps_num, fps_den, frames, duration_ms FROM render_jobs WHERE job_id = ?").all(jobId),
    chat: job.scene_id ? db.prepare("SELECT role, text, version_id, job_id, created_at FROM chat_messages WHERE scene_id = ? AND (job_id = ? OR role = 'user') ORDER BY created_at").all(job.scene_id, jobId) : [],
    events,
  };
}

function collectVersion(db, root, id, dest) {
  const v = db.prepare("SELECT * FROM scene_versions WHERE id = ?").get(id);
  if (!v) throw new Error(`версии ${id} нет в studio.db`);
  const dir = join(root, v.path);
  const files = [];
  for (const f of VERSION_FILES) {
    if (existsSync(join(dir, f))) {
      copyFileSync(join(dir, f), join(dest, f));
      files.push(f);
    }
  }
  if (existsSync(join(dir, "src/Scene.tsx"))) copyFileSync(join(dir, "src/Scene.tsx"), join(dest, "Scene.tsx"));
  const frames = existsSync(join(dir, "frames")) ? readdirSync(join(dir, "frames")).filter((f) => f.endsWith(".png")) : [];
  if (frames.length > 0) mkdirSync(join(dest, "frames"), { recursive: true });
  for (const f of frames) execFileSync("/usr/bin/sips", ["-Z", FRAME_WIDTH, join(dir, "frames", f), "--out", join(dest, "frames", f)], { stdio: "ignore" });
  const preview = existsSync(join(dir, "preview.mp4")) ? media(join(dir, "preview.mp4"), dest, "preview.mp4") : null;
  const job = jobInfo(db, v.created_by_job_id);
  if (job) writeFileSync(join(dest, "job.json"), json(job));
  writeFileSync(join(dest, "version.json"), json({ ...v, edit_plan_json: parse(v.edit_plan_json), settings_json: parse(v.settings_json), dir }));
  return { kind: "version", id, number: v.number, status: v.status, files, frames: frames.length, preview, cost_usd: job?.cost_usd ?? null, wall_ms: job?.wall_ms ?? null };
}

function collectExport(db, root, id, dest) {
  const e = db.prepare("SELECT * FROM exports WHERE id = ?").get(id);
  if (!e) throw new Error(`экспорта ${id} нет в studio.db`);
  const file = join(root, e.path);
  const out = media(file, dest, basename(file));
  const manifest = join(file, "..", "export-manifest.json");
  if (existsSync(manifest)) copyFileSync(manifest, join(dest, "export-manifest.json"));
  const job = jobInfo(db, e.job_id);
  if (job) writeFileSync(join(dest, "job.json"), json(job));
  writeFileSync(join(dest, "export.json"), json(e));
  return { kind: "export", id, format: e.format, file: out, wall_ms: job?.wall_ms ?? null };
}

function main() {
  const [id, dest] = process.argv.slice(2);
  const root = process.env.MS_DATA_DIR;
  if (!id || !dest || !root) {
    console.error("usage: MS_DATA_DIR=… collect-evidence.mjs <ver_…|exp_…> <каталог>");
    process.exitCode = 2;
    return;
  }
  mkdirSync(dest, { recursive: true });
  const db = new Database(join(root, "studio.db"), { readonly: true, fileMustExist: true });
  try {
    const r = id.startsWith("exp_") ? collectExport(db, root, id, dest) : collectVersion(db, root, id, dest);
    console.log(JSON.stringify(r));
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
