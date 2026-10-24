#!/usr/bin/env node
// Просмотр глазами визуального плана (Task 32): сцены плана поверх кадра исходника в момент сцены
// (середина source-диапазона). Рамка зоны сцены — голубая (толще — `overlay`/`callout`/`pip`), внутри —
// ключевые слова сцены; занятость кадра по окну времени анализа видеоряда — синяя заливка, рамка
// лица шота (`face.union`, уже с полем) — оранжевая линия (не красные: у talking-head часто тёплый фон); внизу — время (edited и source), режим,
// паттерн, доля лица под зоной, свободная доля зоны в окне и назначение сцены. PNG ≤ 480 px.
//   node scripts/draw-plan.mjs <plan.json> <каталог анализа видеоряда> <каталог вывода> [сцен=3] [--video <исходник>]
// С `--video` кадр берётся из исходника точно в момент сцены (ffmpeg -ss), без него — ближайший
// ключевой кадр анализа. Сцены — по полезности (при равенстве — по времени). Только ffmpeg
// (drawbox, drawtext); вход — `file:` с белым списком протоколов.
/* global process, console */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const vi = args.indexOf("--video");
const video = vi >= 0 ? args[vi + 1] : undefined;
const pos = vi >= 0 ? args.filter((_, i) => i !== vi && i !== vi + 1) : args;
const [planPath, footageDir, outDir, countArg] = pos;
if (!planPath || !footageDir || !outDir) {
  console.error("usage: draw-plan.mjs <plan.json> <analysis/footage/<id>> <out-dir> [count=3] [--video <source>]");
  process.exit(64);
}
const count = Math.max(1, Number(countArg ?? 3));
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const footage = JSON.parse(readFileSync(join(footageDir, "footage.json"), "utf8"));
const FONT = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/SFNS.ttf"].find((f) => existsSync(f));
const LONG = 480;

const esc = (t) => t.replace(/\\/g, "\\\\").replace(/'/g, "\u2019").replace(/:/g, "\\:").replace(/%/g, "\\%").replace(/,/g, "\\,");
const box = (r, color, t) => `drawbox=x=iw*${r.x}:y=ih*${r.y}:w=iw*${r.w}:h=ih*${r.h}:color=${color}:t=${t}`;
const label = (x, y, s, size, color) => (FONT ? `drawtext=fontfile=${FONT}:text='${esc(s)}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}:box=1:boxcolor=black@0.6:boxborderw=2` : undefined);
const s1 = (us) => (us / 1e6).toFixed(1);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const items = [...plan.items].filter((x) => x.status !== "rejected")
  .sort((a, b) => b.usefulness - a.usefulness || a.edited.start_us - b.edited.start_us).slice(0, count)
  .sort((a, b) => a.edited.start_us - b.edited.start_us);
if (items.length === 0) {
  console.error(`в плане ${plan.plan_id} нет сцен (пропусков ${plan.skipped.length}) — рисовать нечего`);
  process.exit(0);
}

/** Шот и окно занятости на момент `us` исходника. */
function at(us) {
  const shot = footage.shots.find((s) => s.source_start_us <= us && us < s.source_end_us) ?? footage.shots.at(-1);
  const win = (shot.windows ?? []).find((w) => w.start_us <= us && us < w.end_us);
  return { shot, view: win ?? shot, win };
}

/** Свободная доля прямоугольника при занятых областях (сетка 60×60 — для подписи, не для проверок). */
function freeShare(rect, occupied) {
  const N = 60;
  let free = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = rect.x + ((i + 0.5) / N) * rect.w;
      const y = rect.y + ((j + 0.5) / N) * rect.h;
      if (!occupied.some((o) => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h)) free++;
    }
  }
  return free / (N * N);
}

mkdirSync(outDir, { recursive: true });
const written = [];
for (const it of items) {
  const mid = Math.round((it.source.start_us + it.source.end_us) / 2);
  const { shot, view, win } = at(mid);
  const out = join(outDir, `${plan.plan_id}-r${plan.revision}-${it.id}.png`);
  const filters = [`scale='if(gte(iw,ih),${LONG},-2)':'if(gte(iw,ih),-2,${LONG})'`];
  for (const o of view.occupied) filters.push(box(o, "blue@0.35", "fill"));
  if (shot.face.union) filters.push(box(shot.face.union, "orange@0.95", 2));
  const thick = ["overlay", "callout", "pip"].includes(it.composition_mode) ? 3 : 2;
  filters.push(box(it.rect, "cyan@0.95", thick));
  const head = label(`w*${it.rect.x}+4`, `h*${it.rect.y}+4`, `${it.id} ${it.composition_mode}/${it.zone}`, 11, "cyan");
  if (head) filters.push(head);
  it.key_terms.slice(0, 3).forEach((k, i) => {
    const t = label(`w*${it.rect.x}+6`, `h*${it.rect.y}+${22 + i * 18}`, clip(k.text, 22), 14, "white");
    if (t) filters.push(t);
  });
  const free = freeShare(it.rect, view.occupied);
  const lines = [
    `edited ${s1(it.edited.start_us)}-${s1(it.edited.end_us)}s  source ${s1(it.source.start_us)}-${s1(it.source.end_us)}s  frames ${it.frames.start}-${it.frames.end}`,
    `${it.visual_type}  face ${it.face_overlap.ratio.toFixed(2)}  zone free ${free.toFixed(2)}${win ? ` (window ${s1(win.start_us)}-${s1(win.end_us)}s)` : " (shot)"}`,
    clip(it.purpose, 70),
  ];
  lines.forEach((s, i) => {
    const t = label(4, `h-${16 * (lines.length - i) + 2}`, s, 10, "white");
    if (t) filters.push(t);
  });
  const input = video
    ? ["-ss", (mid / 1e6).toFixed(3), "-protocol_whitelist", "file", "-i", `file:${video}`]
    : (() => {
      const kfs = footage.shots.flatMap((s) => s.keyframes);
      const kf = kfs.reduce((b, k) => (Math.abs(k.us - mid) < Math.abs(b.us - mid) ? k : b));
      return ["-protocol_whitelist", "file", "-i", `file:${join(footageDir, kf.path)}`];
    })();
  execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...input, "-vf", filters.join(","), "-frames:v", "1", out]);
  written.push(out);
}
for (const f of written) console.log(f);
