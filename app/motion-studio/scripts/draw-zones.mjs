#!/usr/bin/env node
// Просмотр глазами анализа видеоряда (Task 30, Step 5): на ключевые кадры из опубликованного
// `analysis/footage/<id>/` накладываются рамки детектора (лица — красные, руки — оранжевые,
// люди — фиолетовые, тонко — по кадру), занятые области шота (красная заливка) и свободные зоны
// (зелёные — free_ratio ≥ 0,9, жёлтые — меньше) с подписями. PNG ≤ 480 px по длинной стороне.
//   node scripts/draw-zones.mjs <каталог анализа> <каталог вывода> [кадров=3]
// Кадры берутся из разных шотов (по одному с середины шота, по кругу). Только ffmpeg (drawbox,
// drawtext); вход — `file:` с белым списком протоколов.
/* global process, console */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const [dir, outDir, countArg] = process.argv.slice(2);
if (!dir || !outDir) {
  console.error("usage: draw-zones.mjs <analysis/footage/<id>> <out-dir> [count=3]");
  process.exit(64);
}
const count = Math.max(1, Number(countArg ?? 3));
const doc = JSON.parse(readFileSync(join(dir, "footage.json"), "utf8"));
const det = existsSync(join(dir, "detections.json")) ? JSON.parse(readFileSync(join(dir, "detections.json"), "utf8")).shots : undefined;
const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/SFNS.ttf"].find((f) => existsSync(f));
const LONG = 480;

// кадры: сначала середина каждого шота, недостающие — равномерно из остальных кадров ролика
const shots = doc.shots.filter((s) => s.keyframes.length > 0);
const all = shots.flatMap((s) => s.keyframes.map((_, index) => ({ shot: s, index })));
const picks = shots.slice(0, count).map((s) => ({ shot: s, index: Math.floor(s.keyframes.length / 2) }));
const rest = all.filter((a) => !picks.some((p) => p.shot === a.shot && p.index === a.index));
for (let j = 0; picks.length < count && j < rest.length; j++) {
  const need = count - picks.length;
  const step = rest.length / need;
  picks.push(rest[Math.min(rest.length - 1, Math.floor(step / 2))]);
  rest.splice(Math.min(rest.length - 1, Math.floor(step / 2)), 1);
}
picks.sort((a, b) => a.shot.keyframes[a.index].us - b.shot.keyframes[b.index].us);

const esc = (t) => t.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%");
const box = (r, color, t) => `drawbox=x=iw*${r.x}:y=ih*${r.y}:w=iw*${r.w}:h=ih*${r.h}:color=${color}:t=${t}`;
const text = (r, label, color) => (FONT ? `drawtext=fontfile=${FONT}:text='${esc(label)}':x=w*${r.x}+3:y=h*${r.y}+3:fontsize=11:fontcolor=${color}:box=1:boxcolor=black@0.55:boxborderw=2` : undefined);

mkdirSync(outDir, { recursive: true });
const written = [];
for (const { shot, index } of picks) {
  const kf = shot.keyframes[index];
  const src = join(dir, kf.path);
  const filters = [`scale='if(gte(iw,ih),${LONG},-2)':'if(gte(iw,ih),-2,${LONG})'`];
  for (const z of shot.free_zones) {
    const c = z.free_ratio >= 0.9 ? "lime" : "yellow";
    filters.push(box(z.rect, `${c}@0.9`, 2));
    const t = text(z.rect, `${z.zone} ${z.free_ratio.toFixed(2)}`, c);
    if (t) filters.push(t);
  }
  for (const o of shot.occupied) filters.push(box(o, "red@0.25", "fill"), box(o, "red@0.9", 2));
  const frame = det?.[shot.id]?.[index];
  if (frame) {
    for (const f of frame.faces) filters.push(box(f, "red", 1));
    for (const h of frame.hands) filters.push(box(h, "orange", 1));
    for (const h of frame.humans) filters.push(box(h, "violet", 1));
  }
  const head = `${shot.id} ${(kf.us / 1e6).toFixed(2)}s ${doc.mode} face ${shot.face.detected_ratio.toFixed(2)} ${shot.author_position}`;
  if (FONT) filters.push(`drawtext=fontfile=${FONT}:text='${esc(head)}':x=4:y=h-18:fontsize=12:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=3`);
  const out = join(outDir, `${doc.id}-${shot.id}-${basename(kf.path)}`);
  execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-protocol_whitelist", "file", "-i", `file:${src}`, "-vf", filters.join(","), "-frames:v", "1", out]);
  written.push(out);
}
console.log(written.join("\n"));
