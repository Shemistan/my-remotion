// Проверки кадров видеосцены (Task 37′, Р-V5): графика на лице автора — `face_ink` (blocking; есть
// причина в плане `face_overlap.override_reason` — warning), вне прямоугольника зоны плана с
// запасом 0,02 — `outside_zone` (blocking). Два источника: альфа QA-кадров (`transparent = true`,
// α > 0,1 — графика; точно, но 4–6 кадров) и рамки реестра раскладки каждого кадра временного
// прохода пробы (строки `data-ms-layout`, контейнеры kit, кандидаты героя; вся длина сцены, fix I2).
// `fullscreen` — без проверок.
import { readFile, readdir, rm } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { type NormRect, type QAIssue, type VideoSceneContext, isStoreRel } from "@ms/contracts";
import { safeMkdir } from "@ms/core";
import type { SweepFrame } from "@ms/render";
import type { ExtraQa } from "../pipeline/fix-loop.js";
import { errText } from "../pipeline/steps.js";
import { type Img, loadPng } from "../qa/image.js";
import { composeOverContext } from "./compose-frame.js";

/** Порог «графика»: α больше этой доли. */
export const INK_ALPHA = 0.1;
/** Доля площади лица под графикой, выше которой `face_ink`. */
export const FACE_INK_MAX = 0.01;
/** Запас вокруг прямоугольника зоны (доли кадра): ореол текста, тень, перелёт входа. */
export const ZONE_PAD = 0.02;
/** Доля площади вне зоны (с запасом) под графикой, выше которой `outside_zone`. */
export const OUTSIDE_MAX = 0.005;

export interface AlphaFrame {
  frame: number;
  /** PNG кадра с `transparent = true`. */
  path: string;
}

/** Пиксельные границы прямоугольника в кадре `w×h`: `[x0; x1) × [y0; y1)`. */
function box(r: NormRect, w: number, h: number) {
  const x0 = Math.max(0, Math.floor(r.x * w));
  const y0 = Math.max(0, Math.floor(r.y * h));
  return { x0, y0, x1: Math.min(w, Math.max(x0, Math.ceil((r.x + r.w) * w))), y1: Math.min(h, Math.max(y0, Math.ceil((r.y + r.h) * h))) };
}

const pad = (r: NormRect, p: number): NormRect => {
  const x = Math.max(0, r.x - p);
  const y = Math.max(0, r.y - p);
  return { x, y, w: Math.min(1, r.x + r.w + p) - x, h: Math.min(1, r.y + r.h + p) - y };
};

/** Доли графики (α > `INK_ALPHA`) внутри `face` и вне `zone`; площади нет — 0. */
export function alphaShares(img: Img, zone: NormRect, face?: NormRect): { face: number; outside: number } {
  const { width: w, height: h, data } = img;
  const cut = Math.round(INK_ALPHA * 255);
  const z = box(zone, w, h);
  const f = face ? box(face, w, h) : undefined;
  let inFace = 0;
  let out = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3]! <= cut) continue;
      if (f && x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1) inFace++;
      if (!(x >= z.x0 && x < z.x1 && y >= z.y0 && y < z.y1)) out++;
    }
  }
  const faceArea = f ? (f.x1 - f.x0) * (f.y1 - f.y0) : 0;
  const outArea = w * h - (z.x1 - z.x0) * (z.y1 - z.y0);
  return { face: faceArea > 0 ? inFace / faceArea : 0, outside: outArea > 0 ? out / outArea : 0 };
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

/** Ширина маски рамок кадра пробы, px (высота — в пропорции кадра). */
const MASK_W = 192;

/**
 * Маска рамок графики кадра временного прохода (α = 255 под рамкой): строки текста
 * (`data-ms-layout`), контейнеры kit, кандидаты героя — в долях кадра пробы.
 */
export function sweepMask(f: Pick<SweepFrame, "size" | "items" | "boxes" | "heroes">): Img {
  const width = MASK_W;
  const height = Math.max(1, Math.round((MASK_W * f.size.h) / Math.max(1, f.size.w)));
  const data = new Uint8Array(width * height * 4);
  const rects = [...f.items.map((x) => x.rect), ...f.boxes.map((x) => x.rect), ...f.heroes.map((x) => x.rect)];
  for (const r of rects) {
    const b = box({ x: r.x / f.size.w, y: r.y / f.size.h, w: r.w / f.size.w, h: r.h / f.size.h }, width, height);
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) data[(y * width + x) * 4 + 3] = 255;
  }
  return { width, height, data };
}

/**
 * `face_ink` и `outside_zone` по кадрам с альфой и по рамкам кадров временного прохода пробы:
 * одно замечание на код, кадр — худший. `overrideReason` — причина наложения на лицо из плана
 * (`face_overlap.override_reason`).
 */
export async function videoSceneChecks(i: { alphaFrames: readonly AlphaFrame[]; sweep?: readonly SweepFrame[]; ctx: VideoSceneContext; overrideReason?: string }): Promise<QAIssue[]> {
  const { placement, face } = i.ctx;
  if (!placement.transparent) return [];
  const zone = pad(placement.rect, ZONE_PAD);
  type Worst = { frame: number; share: number; probe: boolean };
  let worstFace: Worst | undefined;
  let worstOut: Worst | undefined;
  const take = (frame: number, s: { face: number; outside: number }, probe: boolean) => {
    if (face && s.face > FACE_INK_MAX && (!worstFace || s.face > worstFace.share)) worstFace = { frame, share: s.face, probe };
    if (s.outside > OUTSIDE_MAX && (!worstOut || s.outside > worstOut.share)) worstOut = { frame, share: s.outside, probe };
  };
  for (const f of i.alphaFrames) take(f.frame, alphaShares(await loadPng(f.path), zone, face), false);
  for (const f of i.sweep ?? []) take(f.frame, alphaShares(sweepMask(f), zone, face), true);
  const by = (w: Worst) => (w.probe ? " (рамки раскладки, проба кадров)" : "");
  const out: QAIssue[] = [];
  if (worstFace) {
    const allowed = i.overrideReason !== undefined;
    out.push({
      source: "programmatic", code: "face_ink", severity: allowed ? "warning" : "blocking", frame: worstFace.frame, area: "лицо автора",
      description: `графика закрывает лицо автора: ${pct(worstFace.share)} рамки лица на кадре ${worstFace.frame}${by(worstFace)}${allowed ? ` (в плане разрешено: ${i.overrideReason})` : ""}`,
      fix_hint: `держи графику внутри LayoutRect (props.layout.rect) и не заходи на рамку лица ${JSON.stringify(face)} ни на одном кадре (вход и уход — тоже): уменьши или сдвинь элементы`,
    });
  }
  if (worstOut) {
    out.push({
      source: "programmatic", code: "outside_zone", severity: "blocking", frame: worstOut.frame, area: `вне зоны ${placement.zone}`,
      description: `графика вне зоны ${placement.zone}: ${pct(worstOut.share)} кадра вне прямоугольника ${JSON.stringify(placement.rect)} на кадре ${worstOut.frame}${by(worstOut)}`,
      fix_hint: "всю графику — внутрь <LayoutRect rect={props.layout?.rect}>, координаты детей — от его края (useLayoutRect), на всех кадрах (входы и перелёты — тоже); фон — только <Background>",
    });
  }
  return out;
}

/** Путь из входа задачи внутри корня хранилища (fix I4); иначе — ошибка. */
export function storePath(root: string, rel: string): string {
  if (!isStoreRel(rel)) throw new Error(`путь кадра исходника не в хранилище: ${JSON.stringify(rel)}`);
  const base = resolve(root);
  const p = resolve(base, rel);
  if (!p.startsWith(base + sep)) throw new Error(`путь кадра исходника вне хранилища: ${JSON.stringify(rel)}`);
  return p;
}

/** Кадр исходника под кадром сцены `frame`: ближайший из `context_frames`, иначе `context_frame_rel`. */
export function contextFrameFor(ctx: VideoSceneContext, frame: number): string | undefined {
  const near = (ctx.context_frames ?? []).reduce<{ frame: number; rel: string } | undefined>((a, x) => (!a || Math.abs(x.frame - frame) < Math.abs(a.frame - frame) ? x : a), undefined);
  return near?.rel ?? ctx.context_frame_rel;
}

/** Кадров-композитов на попытку не больше (Visual QA читает каждый). */
export const CONTEXT_FRAMES_MAX = 3;
/** Кадр с графикой: доля кадра с α > `INK_ALPHA` больше этой. */
const INKED = 0.001;

/** Доля кадра с графикой (α > `INK_ALPHA`). */
function inkShare(img: Img): number {
  const cut = Math.round(INK_ALPHA * 255);
  let n = 0;
  for (let k = 3; k < img.data.length; k += 4) if (img.data[k]! > cut) n++;
  return n / (img.width * img.height);
}

const failed = (code: string, why: string): QAIssue => ({
  source: "programmatic", code, severity: "warning",
  description: `проверка кадров видеосцены не выполнена: ${why}`,
  fix_hint: "проверка повторится на следующей попытке; при повторе — смотри журнал задачи",
});

const sameRect = (a: NormRect | undefined, b: NormRect) =>
  a !== undefined && (["x", "y", "w", "h"] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-6);

/** До `max` элементов равномерно: первый, середина, последний. */
function spread<T>(xs: readonly T[], max: number): T[] {
  if (xs.length <= max) return [...xs];
  return Array.from({ length: max }, (_, k) => xs[Math.round((k * (xs.length - 1)) / (max - 1))]!);
}

/**
 * Хук `extraQa` видеосцены с прозрачным размещением (Task 37′): `props.layout.rect` — зона плана
 * (иначе blocking `layout_rect`); QA-кадры попытки (`frames/`) — один рендер с `transparent = true`
 * → `videoSceneChecks`; кадры с графикой (до 3) — композит поверх кадра исходника
 * `qa/ctx-<кадр>.png` в каталоге попытки (их видит Visual QA и публикует версия). Сбой рендера или
 * ffmpeg — предупреждение. `fullscreen` — пусто.
 */
export async function videoFrameQa(
  v: Omit<Parameters<ExtraQa>[0], "layout" | "rc">,
  i: { ctx: VideoSceneContext; overrideReason?: string; compose?: typeof composeOverContext },
): Promise<QAIssue[]> {
  const { placement } = i.ctx;
  if (!placement.transparent) return [];
  const root = v.run.root;
  const qaDir = join(v.versionDir, "qa");
  // композиты прошлой попытки в этом каталоге — не этой попытки
  for (const n of await readdir(qaDir).catch(() => [] as string[])) if (/^ctx-\d+\.png$/.test(n)) await rm(join(qaDir, n), { force: true });
  let props: Record<string, unknown>;
  try {
    props = JSON.parse(await readFile(join(v.versionDir, "props.json"), "utf8")) as Record<string, unknown>;
    if (typeof props.style !== "object" || props.style === null) throw new Error("нет props.style");
  } catch (e) {
    return [failed("video_check_failed", `props.json: ${errText(e)}`)];
  }
  const out: QAIssue[] = [];
  const layout = (props.layout as { rect?: NormRect } | undefined)?.rect;
  if (!sameRect(layout, placement.rect)) {
    out.push({
      source: "programmatic", code: "layout_rect", severity: "blocking", area: "props.json",
      description: `props.layout.rect ${JSON.stringify(layout ?? null)} ≠ прямоугольник зоны ${placement.zone} ${JSON.stringify(placement.rect)}`,
      fix_hint: `props.layout = { "rect": ${JSON.stringify(placement.rect)} }; графика — внутри <LayoutRect rect={props.layout?.rect}>`,
    });
  }
  const frames = (await readdir(join(v.versionDir, "frames")).catch(() => [] as string[]))
    .flatMap((n) => (/^\d+\.png$/.test(n) ? [Number(n.slice(0, -4))] : [])).sort((a, b) => a - b);
  const over = i.overrideReason !== undefined ? { overrideReason: i.overrideReason } : {};
  // рамки раскладки всей сцены (проба) проверяются, даже если рендер кадров с альфой не удался
  const sweepOnly = async (why: string) => [...out, ...(await videoSceneChecks({ alphaFrames: [], ...(v.sweep ? { sweep: v.sweep } : {}), ctx: i.ctx, ...over })), failed("video_check_failed", why)];
  if (frames.length === 0) return sweepOnly("QA-кадров попытки нет");
  const rr = await v.renderStills(frames, { ...props, style: { ...(props.style as object), transparent: true } });
  const alphaFrames = frames.flatMap((f, k) => (rr.stills[k] ? [{ frame: f, path: rr.stills[k]! }] : []));
  if (!rr.ok || alphaFrames.length === 0) {
    return sweepOnly(`рендер кадров с transparent: ${rr.error ? `${rr.error.stage}: ${rr.error.message}` : "кадров нет"}`);
  }
  try {
    out.push(...(await videoSceneChecks({ alphaFrames, ...(v.sweep ? { sweep: v.sweep } : {}), ctx: i.ctx, ...over })));
  } catch (e) {
    return [...out, failed("video_check_failed", `альфа кадров: ${errText(e)}`)];
  }
  if (!i.ctx.context_frame_rel && !i.ctx.context_frames?.length) return out;
  try {
    const inked: AlphaFrame[] = [];
    for (const f of alphaFrames) if (inkShare(await loadPng(f.path)) > INKED) inked.push(f);
    const dir = await safeMkdir(root, relative(root, qaDir).split(sep).join("/"));
    const compose = i.compose ?? composeOverContext;
    // композит — над кадром исходника, ближайшим ко времени кадра сцены (fix I2)
    for (const f of spread(inked, CONTEXT_FRAMES_MAX)) {
      const rel = contextFrameFor(i.ctx, f.frame);
      if (rel) await compose(f.path, storePath(root, rel), join(dir, `ctx-${f.frame}.png`), { run: v.run, signal: v.signal });
    }
  } catch (e) {
    out.push(failed("video_context_failed", `кадр поверх видео: ${errText(e)}`));
  }
  return out;
}
