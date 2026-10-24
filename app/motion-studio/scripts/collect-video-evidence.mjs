#!/usr/bin/env node
// Evidence видеопроекта для приёмки Phase 2–3 (Task 34): копии из хранилища MS_DATA_DIR (только
// чтение; studio.db открывается readonly).
//   MS_DATA_DIR=… node scripts/collect-video-evidence.mjs <projectId> <каталог> [--max-frames N]
// media/: JSON каталогов source и proxy (медиа-манифест), ffprobe исходника и прокси, files.json —
// видео только sha256, размер и путь в хранилище (в git видео не копируется, V4);
// transcript/: ревизии r1…rN (JSON) и diff-r1-rN.json (вставлены, удалены, изменён текст или время);
// edl/: ревизии и таймлайн каждой ревизии, превью — sha256 + ffprobe; analysis/: footage.json,
// semantic.json и прочие JSON анализа, кадры анализа ≤ 480 px (sips, не больше N);
// style/, plan/: JSON ревизий (StyleBible, план, issues); approvals.json; jobs.json — задачи
// проекта, журнал (без progress), agent_runs (модель, токены, стоимость), процессы.
// Домашний каталог → `~`, поле `hostname` журналов вырезается. Итог — строка JSON в stdout.
/* global process, URL, console */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(new URL("../server/package.json", import.meta.url));
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const [projectId, dest] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--max-frames");
const maxFrames = args.includes("--max-frames") ? Number(args[args.indexOf("--max-frames") + 1]) : 12;
const root = process.env.MS_DATA_DIR;
if (!projectId || !dest || !root) {
  console.error("usage: MS_DATA_DIR=… node scripts/collect-video-evidence.mjs <projectId> <dest> [--max-frames N]");
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
const ffprobe = (p) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", `file:${p}`], { encoding: "utf8", maxBuffer: 64 << 20 }));
const fileInfo = (rel) => {
  const p = join(root, rel);
  return existsSync(p) ? { path: rel, size_bytes: statSync(p).size, sha256: sha256(p) } : { path: rel, missing: true };
};
/** JSON-файлы каталога хранилища → `<to>/` (без изменений, кроме redact). */
const jsonDir = (rel, to) => {
  const dir = join(root, rel);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  for (const f of files) put(join(to, f), readFileSync(join(dir, f), "utf8"));
  return files;
};

const d = new Database(join(root, "studio.db"), { readonly: true, fileMustExist: true });
const all = (sql, ...p) => d.prepare(sql).all(...p);
const one = (sql, ...p) => d.prepare(sql).get(...p);
const summary = { project_id: projectId, copied: {} };
const project = one("SELECT * FROM projects WHERE id = ?", projectId);
if (!project) throw new Error(`нет проекта ${projectId}`);
put("project.json", project);

// медиа
const asset = one("SELECT * FROM media_assets WHERE project_id = ?", projectId);
if (asset) {
  const pdir = `workspace/projects/${projectId}`;
  summary.copied.media = [...jsonDir(`${pdir}/source/${asset.id}`, "media/source"), ...jsonDir(`${pdir}/proxy/${asset.id}`, "media/proxy")];
  const deriv = all("SELECT kind, rel_path, sha256, params_json FROM media_derivatives WHERE media_id = ?", asset.id);
  put("media/asset.json", { ...asset, probe_json: JSON.parse(asset.probe_json), import_json: JSON.parse(asset.import_json) });
  put("media/files.json", { source: fileInfo(asset.rel_path), derivatives: deriv.map((x) => ({ kind: x.kind, recorded_sha256: x.sha256, params: JSON.parse(x.params_json), ...fileInfo(x.rel_path) })) });
  put("media/source.ffprobe.json", ffprobe(join(root, asset.rel_path)));
  const proxy = deriv.find((x) => x.kind === "proxy");
  if (proxy) put("media/proxy.ffprobe.json", ffprobe(join(root, proxy.rel_path)));
}

// транскрипт: ревизии и diff первой с последней
const tr = one("SELECT * FROM transcripts WHERE project_id = ? ORDER BY created_at DESC", projectId);
if (tr) {
  const revs = all("SELECT * FROM transcript_revisions WHERE transcript_id = ? ORDER BY revision", tr.id);
  const docs = revs.map((r) => JSON.parse(readFileSync(join(root, r.rel_path), "utf8")));
  docs.forEach((doc, i) => put(`transcript/r${revs[i].revision}.json`, doc));
  if (docs.length > 1) {
    const [a, b] = [docs[0], docs.at(-1)];
    const am = new Map(a.words.map((w) => [w.id, w]));
    const bm = new Map(b.words.map((w) => [w.id, w]));
    put(`transcript/diff-r1-r${b.revision}.json`, {
      inserted: b.words.filter((w) => !am.has(w.id)),
      removed: a.words.filter((w) => !bm.has(w.id)).map((w) => w.id),
      text_changed: b.words.filter((w) => am.has(w.id) && am.get(w.id).text !== w.text).map((w) => ({ id: w.id, from: am.get(w.id).text, to: w.text })),
      time_changed: b.words.filter((w) => am.has(w.id) && (am.get(w.id).start_us !== w.start_us || am.get(w.id).end_us !== w.end_us)).map((w) => ({ id: w.id, from: [am.get(w.id).start_us, am.get(w.id).end_us], to: [w.start_us, w.end_us] })),
    });
  }
  summary.copied.transcript = revs.length;
}

// EDL: ревизии, таймлайн, превью
const edl = one("SELECT * FROM edls WHERE project_id = ?", projectId);
if (edl) {
  const revs = all("SELECT * FROM edl_revisions WHERE edl_id = ? ORDER BY revision", edl.id);
  const previews = [];
  for (const r of revs) {
    put(`edl/r${r.revision}.json`, readFileSync(join(root, r.rel_path), "utf8"));
    const tl = one("SELECT * FROM timelines WHERE edl_id = ? AND revision = ?", edl.id, r.revision);
    const clips = all("SELECT idx, source_start_us, source_end_us, edited_start_us FROM timeline_clips WHERE edl_id = ? AND revision = ? ORDER BY idx", edl.id, r.revision);
    if (tl) put(`edl/timeline-r${r.revision}.json`, { fps: { num: tl.fps_num, den: tl.fps_den }, source_duration_us: tl.source_duration_us, duration_us: tl.duration_us, clips });
    const prel = `workspace/projects/${projectId}/preview/${edl.id}/r${r.revision}`;
    if (one("SELECT 1 FROM artifact_publications WHERE dest_rel = ?", prel)) {
      const f = `${prel}/preview.mp4`;
      previews.push({ revision: r.revision, ...fileInfo(f), ffprobe: existsSync(join(root, f)) ? ffprobe(join(root, f)) : null });
    }
  }
  put("edl/previews.json", previews);
  summary.copied.edl = revs.length;
  summary.copied.previews = previews.length;
}

// анализ видеоряда и смысловая разметка
let frames = 0;
for (const f of all("SELECT * FROM footage_analyses WHERE project_id = ? ORDER BY created_at", projectId)) {
  const dir = f.rel_path.endsWith(".json") ? f.rel_path.slice(0, f.rel_path.lastIndexOf("/")) : f.rel_path;
  jsonDir(dir, `analysis/footage/${f.id}`);
  const fdir = join(root, dir, "frames");
  if (existsSync(fdir)) {
    const imgs = readdirSync(fdir).filter((x) => /\.(png|jpe?g)$/i.test(x)).sort();
    const step = Math.max(1, Math.ceil(imgs.length / maxFrames));
    for (let i = 0; i < imgs.length && frames < maxFrames; i += step, frames++) {
      const out = join(dest, `analysis/footage/${f.id}/frames`, imgs[i]);
      mkdirSync(join(out, ".."), { recursive: true });
      execFileSync("sips", ["-Z", "480", join(fdir, imgs[i]), "--out", out], { stdio: "ignore" });
    }
  }
}
for (const s of all("SELECT * FROM semantic_analyses WHERE project_id = ? ORDER BY created_at", projectId)) {
  const dir = s.rel_path.endsWith(".json") ? s.rel_path.slice(0, s.rel_path.lastIndexOf("/")) : s.rel_path;
  jsonDir(dir, `analysis/semantic/${s.id}`);
}
summary.copied.frames = frames;

// стиль и план — ревизии каталогами
for (const [table, revTable, key, to] of [["style_bibles", "style_revisions", "style_id", "style"], ["visual_plans", "visual_plan_revisions", "plan_id", "plan"]]) {
  for (const x of all(`SELECT id FROM ${table} WHERE project_id = ?`, projectId)) {
    for (const r of all(`SELECT * FROM ${revTable} WHERE ${key} = ? ORDER BY revision`, x.id)) {
      const dir = r.rel_path.endsWith(".json") ? r.rel_path.slice(0, r.rel_path.lastIndexOf("/")) : r.rel_path;
      jsonDir(dir, `${to}/${x.id}/r${r.revision}`);
    }
  }
}

put("approvals.json", all("SELECT * FROM approvals WHERE project_id = ? ORDER BY decided_at", projectId));

// задачи: журнал, агенты, процессы
let cost = 0;
const jobs = all("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at", projectId).map((j) => {
  const runs = all("SELECT id, role, model, status, input_tokens, output_tokens, cost_usd, started_at, finished_at FROM agent_runs WHERE job_id = ? ORDER BY started_at", j.id);
  // задачи Phase 2–3 пишут стоимость агента в output_refs.agent (в agent_runs — нет, см. REPORT F1)
  const out = j.output_refs_json ? JSON.parse(j.output_refs_json) : null;
  cost += runs.length > 0 ? runs.reduce((a, r) => a + (r.cost_usd ?? 0), 0) : (out?.agent?.cost_usd ?? 0);
  return {
    ...j,
    events: all("SELECT ts, level, kind, message, data_json FROM job_events WHERE job_id = ? AND kind != 'progress' ORDER BY id", j.id),
    agent_runs: runs,
    processes: all("SELECT attempt, pid, pgid, cmd, started_at, ended_at, exit_code FROM job_processes WHERE job_id = ?", j.id),
  };
});
put("jobs.json", jobs);
d.close();
summary.jobs = jobs.length;
summary.cost_usd = Math.round(cost * 10000) / 10000;
console.log(JSON.stringify(summary));
