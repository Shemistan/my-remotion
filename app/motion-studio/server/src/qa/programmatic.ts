// Программные проверки по реальным кадрам, логам браузера и размеру превью (06 §6) —
// без LLM: пустой кадр, застывшая анимация, обрезка, открытый край сцены, safe area,
// контраст, сеть.
import type { MotionSpec, QAIssue, Settings } from "@ms/contracts";
import { type Rect, type RenderResult, type ResolvedStyle, contrastRatio, safeRect } from "@ms/render";
import { accentBeat, blankCheckFrom, inBeat, isEmphasisRole } from "../pipeline/qa-frames.js";
import { layoutIssues, parseLayout } from "./layout.js";
import { EDGES, type Edge, type Img, INK_THRESHOLD, backgroundEstimate, downsample, edgeBackground, edgeClip, loadPng, lumaStats, objectDelta } from "./image.js";

export interface ProgrammaticInput {
  frames: { frame: number; path: string }[];
  spec: MotionSpec;
  settings: Settings;
  style: ResolvedStyle;
  render: RenderResult;
  previewBytes: number;
  /**
   * Кадры N−20 и N−1 (рендерятся рядом с QA-кадрами): финальный акцент жив — яркость его
   * региона между ними меняется. Нет пары — проверки нет.
   */
  accentFrames?: { frame: number; path: string }[];
  /** Кадры 0 и 4 (рендерятся рядом с QA-кадрами): кадр-постер собран (frame0_coverage). */
  posterFrames?: { frame: number; path: string }[];
}

/**
 * Кадр-постер (S2-fix, I3): «чернила» кадров 0 и 4 (posterInk) не ниже POSTER_INK — планка
 * брифа шага 2 «ink ≥ 8 %», абсолютная, не доля финала (у финала чернила — в основном текст,
 * которого у силуэта нет). Ниже — warning.
 *
 * Чернила — доля пикселей, чья яркость Y' отличается от размытия окрестности больше
 * POSTER_CONTRAST, на кадре, уменьшенном до POSTER_WIDTH px (зерно и сжатие усредняются),
 * окрестность — бокс ±POSTER_RADIUS ширины. Средний масштаб считает и контуры, и заливку
 * силуэтов (карточка, кольцо, воронка на 30 %), а плавная аврора и виньетка почти не
 * считаются. Калибровка — кадры 0 прогона s2-807e41b (превью 960 px; кадр 1920 px даёт то же
 * до 0.5 п.п.): пустые по виду test1 6.1 %, eval-abtest 2.6 %, gen-timeline 2.0 %; силуэты —
 * held-mobile 12.1 %, gen-compare 13.7 %, eval-funnel 15.6 %, eval-oauth 16.6 %, остальные
 * 18–33 % (регрессия — test/qa/real-frames.test.ts, fixtures/poster).
 */
export const POSTER_INK = 0.08;
const POSTER_WIDTH = 240;
const POSTER_RADIUS = 0.06;
const POSTER_CONTRAST = 0.012;

/** Доля «чернил» кадра-постера 0..1 (см. POSTER_INK). */
export function posterInk(raw: Img): number {
  const img = downsample(raw, Math.max(1, Math.round(raw.width / POSTER_WIDTH)));
  const { width: w, height: h, data: d } = img;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = ((0.2126 * d[p * 4]! + 0.7152 * d[p * 4 + 1]! + 0.0722 * d[p * 4 + 2]!) / 255) * (d[p * 4 + 3]! / 255);
  const I = integral(L, w, h);
  const r = Math.max(2, Math.round(w * POSTER_RADIUS));
  let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(L[y * w + x]! - boxMean(I, w, h, x, y, r)) > POSTER_CONTRAST) n++;
  return n / Math.max(1, w * h);
}

/** Интегральное изображение (w+1)×(h+1): среднее по боксу за O(1). */
function integral(L: Float32Array, w: number, h: number): Float64Array {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) I[(y + 1) * (w + 1) + x + 1] = L[y * w + x]! + I[y * (w + 1) + x + 1]! + I[(y + 1) * (w + 1) + x]! - I[y * (w + 1) + x]!;
  return I;
}

/** Среднее бокса ±r вокруг (x, y), обрезанного по кадру. */
function boxMean(I: Float64Array, w: number, h: number, x: number, y: number, r: number): number {
  const [x0, y0, x1, y1] = [Math.max(0, x - r), Math.max(0, y - r), Math.min(w, x + r + 1), Math.min(h, y + r + 1)];
  return (I[y1 * (w + 1) + x1]! - I[y0 * (w + 1) + x1]! - I[y1 * (w + 1) + x0]! + I[y0 * (w + 1) + x0]!) / ((x1 - x0) * (y1 - y0));
}

/** Однотонный кадр: std яркости Y' ниже. */
export const BLANK_STD = 0.01;
/**
 * Финальный акцент застыл (тайловая мера, `accentTileStats`): самый живой тайл региона
 * акцента меняется между N−20 и N−1 меньше max(ACCENT_TILE_ABS, ACCENT_TILE_K × p95 тайлов
 * фона). Калибровка — Fix G (отчёт Task 17).
 */
export const ACCENT_TILE_ABS = 0.01;
export const ACCENT_TILE_K = 2;
/** Ширина, до которой уменьшаются кадры тайловой меры. */
const TILE_WIDTH = 960;
/** Тайл — 1/TILE_ROWS высоты кадра. */
const TILE_ROWS = 16;
/** Кадр отступа от конца для проверки «акцент жив». */
export const ACCENT_HOLD_GAP = 20;
/**
 * Застывшая схема в удержании (motion-kit 0.4.0, motion-review-2 §4.3): у сцены со схемой
 * (элемент kind graph) объекты между N−20 и N−1 не меняются — процесс встал, а финал схемы
 * должен показывать работающую систему. Blocking.
 */
function holdFrozenIssues(spec: MotionSpec, [fa, a]: [number, Img], [fb, b]: [number, Img]): Issue[] {
  if (!spec.elements.some((e) => e.kind === "graph")) return [];
  if (a.width !== b.width || a.height !== b.height) return [];
  const d = objectDelta(a, b);
  if (d >= FROZEN_DELTA) return [];
  return [{
    code: "frozen", severity: "blocking", frame: fb, area: "hold",
    description: `схема застыла в удержании: кадры ${fa} и ${fb} не отличаются (изменение объектов ${d.toFixed(4)} < ${FROZEN_DELTA})`,
    fix_hint: "в удержании система работает дальше в своём ритме: импульсы и токены по рёбрам (repeat), счётчик или статус на событиях — дыхание ореола на одном узле не hold",
  }];
}

/** Кадр-постер: кадры 0 и 4 почти пусты (posterInk < POSTER_INK) — warning по самому пустому. */
async function posterIssues(poster: { frame: number; path: string }[]): Promise<Issue[]> {
  const all: { frame: number; c: number }[] = [];
  for (const p of poster) all.push({ frame: p.frame, c: posterInk(await loadPng(p.path)) });
  const worst = all.sort((x, y) => x.c - y.c)[0]!;
  if (worst.c >= POSTER_INK) return [];
  return [{
      code: "frame0_coverage", severity: "warning", frame: worst.frame,
      description: `кадр ${worst.frame} почти пуст: чернил ${(worst.c * 100).toFixed(1)} % < ${POSTER_INK * 100} % — сцена открывается фоном`,
      fix_hint: "кадр 0 — постер сцены: опора видна сразу (силуэты kit до входа — pre у Enter, FlowGraph и графиков; кикер виден приглушённо), фон в полную силу",
  }];
}

/**
 * Пустой регион кадра удержания: доля содержимого ниже. Калибровка Fix G по кадрам N−1
 * пяти сцен прогона 4 и среза: пустые по ревью регионы (test1 — средняя полоса, gen-compare —
 * правая верхняя четверть) 1.0–1.2 %, самые пустые регионы прочих сцен — от 2.7 %.
 */
export const EMPTY_REGION_SHARE = 0.015;
/** Содержимое: |Y' − размытие окрестности| больше. */
const EMPTY_CONTRAST = 0.06;
/** Ширина, до которой уменьшается кадр для пустых регионов. */
const EMPTY_WIDTH = 480;
/** Кадры совпадают: изменение объектов ниже. */
export const FROZEN_DELTA = 0.002;
/** Доля длины края под «сплошными» чернилами, с которой объект считается обрезанным. */
const CLIP_INK = 0.01;
const SAFE_INK = 0.005;
/** Полоса допуска у границы safe area, доля кадра: тень и свечение элемента на границе. */
const SAFE_TOLERANCE = 0.01;
/** Пиксель края прозрачный: alpha ниже. */
const EXPOSED_ALPHA = 250;
/** Доля длины края, прозрачная по всей глубине полосы, с которой край считается открытым. */
const EXPOSED_SHARE = 0.02;
const EXPOSED_DEPTH = 2;
const MIN_TEXT_CONTRAST = 4.5;
const MIN_MUTED_CONTRAST = 3;
const PREVIEW_WARN_BYTES = 50 * 1024 * 1024;
const NETWORK = /net::|https?:\/\//;
const MAX_LOG_LINES = 5;

type Issue = Omit<QAIssue, "source">;
const programmatic = (i: Issue): QAIssue => ({ source: "programmatic", ...i });

export async function programmaticChecks(input: ProgrammaticInput): Promise<QAIssue[]> {
  const out: Issue[] = [];
  const frames = [...input.frames].sort((a, b) => a.frame - b.frame);
  const imgs: Img[] = [];
  for (const f of frames) imgs.push(await loadPng(f.path));

  const dur = input.spec.duration_frames;
  const beatsAt = (f: number) => input.spec.beats.filter((b) => inBeat(b, f, dur)).map((b) => b.id).sort().join(",");
  const from = blankCheckFrom(input.spec, input.style);
  frames.forEach((f, i) => {
    const img = imgs[i]!;
    // пустой кадр: только внутри битов и после входа первого бита (кадр 0 может быть пустым фоном)
    if (f.frame >= from && beatsAt(f.frame) !== "") {
      const { std } = lumaStats(img);
      if (std < BLANK_STD) {
        out.push({
          code: "blank", severity: "blocking", frame: f.frame,
          description: `кадр ${f.frame} однотонный (std яркости Y' ${std.toFixed(4)} < ${BLANK_STD}): элементы не видны`,
          fix_hint: "проверь, что элементы бита отрисованы и видимы в этом кадре (opacity, позиция, цвет на фоне, тайминги из props.timing)",
        });
      }
    }
    out.push(...edgeIssues(img, f.frame, input.settings));
    if (!input.settings.transparent_export && !input.style.transparent) out.push(...exposedIssues(img, f.frame));
  });

  out.push(...frozenIssues(frames.map((f) => f.frame), imgs, beatsAt));
  // пустой регион — по кадру удержания (последний QA-кадр в последней четверти сцены);
  // мера откалибрована на кадрах от 480 px, миниатюры не проверяются; прозрачный экспорт —
  // оверлей для монтажа, пустота в нём задумана
  const last = frames.length - 1;
  if (last >= 0 && frames[last]!.frame >= dur * 0.75 && imgs[last]!.width >= EMPTY_WIDTH && !input.settings.transparent_export && !input.style.transparent) out.push(...emptyRegionIssues(imgs[last]!, frames[last]!.frame));
  if (input.accentFrames && input.accentFrames.length === 2) {
    const [a, b] = [...input.accentFrames].sort((x, y) => x.frame - y.frame) as [{ frame: number; path: string }, { frame: number; path: string }];
    const [ia, ib] = [await loadPng(a.path), await loadPng(b.path)];
    out.push(...accentAliveIssues(input.spec, input.settings, [a.frame, ia], [b.frame, ib]));
    out.push(...holdFrozenIssues(input.spec, [a.frame, ia], [b.frame, ib]));
  }
  if (input.posterFrames && input.posterFrames.length > 0 && !input.style.transparent && !input.settings.transparent_export) {
    out.push(...(await posterIssues(input.posterFrames)));
  }
  out.push(...layoutIssues(parseLayout(input.render.browserLogs)));
  out.push(...contrastIssues(input.style));
  out.push(...logIssues(input.render.browserLogs));
  if (input.previewBytes === 0) {
    out.push({ code: "preview_size", severity: "blocking", description: "превью — 0 байт", fix_hint: "рендер превью не записал кадры: смотри ошибку рендера" });
  } else if (input.previewBytes > PREVIEW_WARN_BYTES) {
    out.push({
      code: "preview_size", severity: "warning",
      description: `превью ${(input.previewBytes / 1024 ** 2).toFixed(1)} МБ > 50 МБ`,
      fix_hint: "много мелкого шума или частиц на весь кадр: упрости фон или уменьши число частиц",
    });
  }
  return out.map(programmatic);
}

/**
 * Обрезка и выход за безопасную зону. Фон каждого края — по его полю за safe area
 * (`edgeBackground`: участки, связанные с углом кадра без скачков цвета), а не цвет углов:
 * свет aurora и виньетка у края — не объект, карточка у границы safe area — тоже, а
 * крупный объект у края (карточка 600 px, график) фоном не становится. Обрезка — «сплошные» чернила у края (`edgeClip`): тонкие
 * линии фона, пересекающие край, не считаются. Поля масштабируются к размеру кадра.
 */
function edgeIssues(img: Img, frame: number, settings: Settings): Issue[] {
  const out: Issue[] = [];
  const { width: w, height: h } = img;
  const safe = safeRect({ width: w, height: h, safe_area: settings.safe_area });
  const margin: Record<Edge, number> = { top: safe.y, bottom: h - safe.y - safe.h, left: safe.x, right: w - safe.x - safe.w };
  // поле 0 (safe_area 0) — фон по полосе 2 % кадра
  const band = (e: Edge) => Math.max(margin[e], Math.round((e === "top" || e === "bottom" ? h : w) * 0.02), 6);

  const t255 = INK_THRESHOLD * 255;
  const ref = backgroundEstimate(img);
  const clipped: Edge[] = [];
  let ink = 0;
  let total = 0;
  for (const e of EDGES) {
    const bg = edgeBackground(img, e, band(e), ref);
    const c = edgeClip(img, e, bg);
    if (c.fraction > CLIP_INK) clipped.push(e);
    // поле за safe area (у боковых краёв — без углов, их считают верх и низ), кроме
    // внутренней полосы допуска у границы safe area (тень и свечение карточки на границе);
    // пиксель — чернила, только если они есть и на ±2 px по обеим осям (тонкие линии фона —
    // сетка пола, разделители — не объект)
    const along = e === "left" || e === "right" ? [safe.y, safe.y + safe.h] : [0, w];
    const tol = Math.round((e === "top" || e === "bottom" ? h : w) * SAFE_TOLERANCE);
    for (let i = along[0]!; i < along[1]!; i++) {
      const b = bg[i]!;
      const inkXY = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return false;
        const p = (y * w + x) * 4;
        return Math.abs(img.data[p]! - b[0]) > t255 || Math.abs(img.data[p + 1]! - b[1]) > t255 || Math.abs(img.data[p + 2]! - b[2]) > t255;
      };
      for (let d = 0; d < margin[e] - tol; d++) {
        const [x, y] = e === "top" ? [i, d] : e === "bottom" ? [i, h - 1 - d] : e === "left" ? [d, i] : [w - 1 - d, i];
        total++;
        if (inkXY(x, y) && (inkXY(x - 2, y) || inkXY(x + 2, y)) && (inkXY(x, y - 2) || inkXY(x, y + 2))) ink++;
      }
    }
  }
  for (const area of clipped) {
    out.push({
      code: "clipping", severity: "blocking", frame, area,
      description: `кадр ${frame}: объект касается края кадра (${area}) — вероятно, обрезан`,
      fix_hint: `уменьши размер или сдвинь элемент внутрь безопасной зоны (${area}); длинный текст — перенос или меньший кегль`,
    });
  }
  if (total > 0 && ink / total > SAFE_INK && clipped.length === 0) {
    out.push({
      code: "safe_area", severity: "warning", frame, area: "safe_area",
      description: `кадр ${frame}: ${((ink / total) * 100).toFixed(1)} % полей за безопасной зоной заняты объектами`,
      fix_hint: "держи элементы внутри SafeArea (поля settings.safe_area); фон и атмосфера могут выходить, текст и данные — нет",
    });
  }
  return out;
}

/**
 * Открытый край сцены (Task 13: камера сдвинула сцену — сверху и справа полосы, в превью
 * чёрные): у непрозрачной сцены пиксели у края кадра прозрачны. Край открыт, если больше
 * EXPOSED_SHARE средних 60 % его длины прозрачно на всю глубину полосы EXPOSED_DEPTH px
 * (концы края не считаются: полоса соседнего края их тоже задевает).
 */
function exposedIssues(img: Img, frame: number): Issue[] {
  const { width: w, height: h, data } = img;
  const clear = (x: number, y: number) => data[(y * w + x) * 4 + 3]! < EXPOSED_ALPHA;
  const open: Edge[] = [];
  for (const e of EDGES) {
    const len = e === "top" || e === "bottom" ? w : h;
    const from = Math.floor(len * 0.2);
    const to = Math.ceil(len * 0.8);
    let n = 0;
    for (let i = from; i < to; i++) {
      let all = true;
      for (let d = 0; d < EXPOSED_DEPTH && all; d++) {
        const [x, y] = e === "top" ? [i, d] : e === "bottom" ? [i, h - 1 - d] : e === "left" ? [d, i] : [w - 1 - d, i];
        all = clear(x, y);
      }
      if (all) n++;
    }
    if (n / (to - from) > EXPOSED_SHARE) open.push(e);
  }
  if (open.length === 0) return [];
  return [{
    code: "exposed_edge", severity: "blocking", frame, area: open.join(", "),
    description: `кадр ${frame}: у края кадра (${open.join(", ")}) пусто — сцена сдвинута и открыла край (в превью — чёрные полосы)`,
    fix_hint: "фон должен покрывать весь кадр на каждом кадре: камера — только <Camera> kit (панорама в запасе наезда), без своих translate/scale корня; фон — <Background> во весь кадр",
  }];
}

/**
 * Финальный акцент жив (ТЗ: в конце — успокоение, но не стоп-кадр): элементы акцента (роль
 * emphasis/accent/акцент, иначе элементы бита акцента) с layout, видимые на последнем
 * кадре. Мера тайловая (`accentTileStats`): максимум по тайлам региона акцента против p95
 * тайлов фона вне раскладок; живой акцент меньше региона (точка «сейчас» на Timeline) не
 * разбавляется неподвижной частью региона, а дрейф фона сцены задаёт планку. Ниже —
 * warning.
 */
function accentAliveIssues(spec: MotionSpec, settings: Settings, [fa, a]: [number, Img], [fb, b]: [number, Img]): Issue[] {
  if (a.width !== b.width || a.height !== b.height) return [];
  const dur = spec.duration_frames;
  const byRole = spec.elements.filter((e) => isEmphasisRole(e.role));
  const accent = byRole.length > 0 ? byRole : spec.elements.filter((e) => accentBeat(spec)?.element_ids.includes(e.id));
  const visible = accent.filter((e) => e.layout && e.layout.w * e.layout.h < 0.9 && spec.beats.some((x) => x.element_ids.includes(e.id) && inBeat(x, fb, dur)));
  if (visible.length === 0) return [];
  // layout — доли safe area; в px кадра — через safeRect, как в kit и specChecks
  const safe = safeRect({ width: a.width, height: a.height, safe_area: settings.safe_area });
  const px = (l: NonNullable<MotionSpec["elements"][number]["layout"]>): Rect => ({ x: safe.x + l.x * safe.w, y: safe.y + l.y * safe.h, w: l.w * safe.w, h: l.h * safe.h });
  const layouts = spec.elements.filter((e) => e.layout && e.kind !== "group" && e.layout.w * e.layout.h < 0.9).map((e) => px(e.layout!));
  const t = accentTileStats(a, b, visible.map((e) => px(e.layout!)), layouts);
  const bar = Math.max(ACCENT_TILE_ABS, ACCENT_TILE_K * t.baseline);
  if (t.accent >= bar) return [];
  const ids = visible.map((e) => e.id).join(", ");
  return [{
    code: "accent_static", severity: "warning", frame: fb, area: ids,
    description: `финальный акцент застыл: самый живой тайл региона ${ids} между кадрами ${fa} и ${fb} меняется на |ΔY'| ${t.accent.toFixed(4)} — ниже планки ${bar.toFixed(4)} (max(${ACCENT_TILE_ABS}, ${ACCENT_TILE_K} × фон ${t.baseline.toFixed(4)}))`,
    fix_hint: "финальное состояние живёт до последнего кадра: дыхание свечения, пульс или блик на акценте — движение, подтверждающее итог",
  }];
}

/**
 * Тайловая мера «акцент жив» по паре кадров. Кадры уменьшаются до ~960 px (1080p QA-кадры
 * и фикстуры 960×540 — одна шкала, зерно усредняется), тайл — 1/16 высоты; значение
 * тайла — средняя |ΔY'| его пикселей. `accent` — максимум по тайлам регионов акцента,
 * `baseline` — p95 тайлов кадра, не задевающих ни одну раскладку (фон сцены: аврора,
 * частицы, зерно); тайлов фона меньше 8 — baseline 0.
 */
export function accentTileStats(a: Img, b: Img, accent: Rect[], layouts: Rect[]): { accent: number; baseline: number } {
  const k = Math.max(1, Math.round(a.width / TILE_WIDTH));
  const A = downsample(a, k);
  const B = downsample(b, k);
  const { width: w, height: h } = A;
  const luma = (d: Uint8Array, i: number) => ((0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255) * (d[i + 3]! / 255);
  const diff = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) diff[p] = Math.abs(luma(A.data, p * 4) - luma(B.data, p * 4));
  const t = Math.max(2, Math.round(h / TILE_ROWS));
  const mean = (x0: number, y0: number, x1: number, y1: number) => {
    let sum = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += diff[y * w + x]!;
    return sum / ((x1 - x0) * (y1 - y0));
  };
  const scaled = (r: Rect) => ({
    x0: Math.max(0, Math.floor(r.x / k)), y0: Math.max(0, Math.floor(r.y / k)),
    x1: Math.min(w, Math.ceil((r.x + r.w) / k)), y1: Math.min(h, Math.ceil((r.y + r.h) / k)),
  });
  let best = 0;
  for (const r of accent.map(scaled)) {
    for (let y = r.y0; y < r.y1; y += t) {
      for (let x = r.x0; x < r.x1; x += t) {
        const [x1, y1] = [Math.min(r.x1, x + t), Math.min(r.y1, y + t)];
        // обрезок у края региона меньше четверти тайла — шум, не тайл
        if ((x1 - x) * (y1 - y) * 4 < t * t && (r.x1 - r.x0) * (r.y1 - r.y0) * 4 >= t * t) continue;
        best = Math.max(best, mean(x, y, x1, y1));
      }
    }
  }
  const boxes = layouts.map(scaled);
  const bg: number[] = [];
  for (let y = 0; y + t <= h; y += t) {
    for (let x = 0; x + t <= w; x += t) {
      if (boxes.some((r) => x < r.x1 && x + t > r.x0 && y < r.y1 && y + t > r.y0)) continue;
      bg.push(mean(x, y, x + t, y + t));
    }
  }
  bg.sort((p, q) => p - q);
  const baseline = bg.length >= 8 ? bg[Math.ceil(bg.length * 0.95) - 1]! : 0;
  return { accent: best, baseline };
}

/**
 * Застывшая анимация по объектам (без дрейфа камеры и фона): соседние QA-кадры из разных
 * битов не меняются — warning; все кадры (не из одного бита) попарно одинаковы — один blocking.
 */
function frozenIssues(frames: number[], imgs: Img[], beatsAt: (f: number) => string): Issue[] {
  if (imgs.length < 2) return [];
  const sized = imgs.every((i) => i.width === imgs[0]!.width && i.height === imgs[0]!.height);
  if (!sized) return [];
  const near = imgs.slice(1).map((img, i) => objectDelta(imgs[i]!, img));
  // все попарно — только если кадры из разных битов и все соседние уже совпали
  if (new Set(frames.map(beatsAt)).size > 1 && near.every((d) => d < FROZEN_DELTA)) {
    let all = true;
    for (let i = 0; i < imgs.length && all; i++) {
      for (let j = i + 2; j < imgs.length && all; j++) all = objectDelta(imgs[i]!, imgs[j]!) < FROZEN_DELTA;
    }
    if (all) {
      return [{
        code: "frozen", severity: "blocking", frame: frames.at(-1),
        description: `все QA-кадры (${frames.join(", ")}) одинаковы: анимации нет`,
        fix_hint: "движение должно идти от useCurrentFrame() по битам из props.timing: входы, основное действие, акцент",
      }];
    }
  }
  const out: Issue[] = [];
  near.forEach((d, i) => {
    const [a, b] = [frames[i]!, frames[i + 1]!];
    if (d < FROZEN_DELTA && beatsAt(a) !== beatsAt(b)) {
      out.push({
        code: "frozen", severity: "warning", frame: b,
        description: `кадры ${a} и ${b} из разных битов не отличаются (изменение объектов ${d.toFixed(4)})`,
        fix_hint: `бит на кадре ${b} должен менять сцену: проверь его тайминг в props.timing и что анимация бита привязана к нему`,
      });
    }
  });
  return out;
}

/**
 * Пустой регион кадра удержания (motion-review-1 §10): доля «содержимого» в каждой четверти
 * 2×2 и трети по горизонтали и вертикали. Содержимое — пиксель, чья яркость отличается от
 * размытия окрестности (бокс ±1/40 ширины) больше EMPTY_CONTRAST: аврора и виньетка гладкие
 * и не считаются, текст, контуры, линии и точки — считаются. Кадр уменьшается до ~480 px
 * (зерно усредняется). Warning — по самому пустому региону: композицию правит Director, а
 * в цикл Engineer blocking не идёт.
 */
function emptyRegionIssues(img: Img, frame: number): Issue[] {
  const regions = emptyRegionShares(img);
  const [name, share] = Object.entries(regions).sort((a, b) => a[1] - b[1])[0]!;
  if (share >= EMPTY_REGION_SHARE) return [];
  return [{
    code: "empty_region", severity: "warning", frame, area: name,
    description: `кадр ${frame}: ${REGION_NAMES[name as keyof typeof REGION_NAMES]} почти пуст — содержимого ${(share * 100).toFixed(1)} % < ${EMPTY_REGION_SHARE * 100} %`,
    fix_hint: "композиция занимает кадр: разнеси элементы по сетке (layout spec), увеличь героя или поставь пару/подпись в пустую часть; не прижимай всё к одной стороне",
  }];
}

const REGION_NAMES = {
  "top-left": "левая верхняя четверть", "top-right": "правая верхняя четверть", "bottom-left": "левая нижняя четверть", "bottom-right": "правая нижняя четверть",
  top: "верхняя треть", middle: "средняя треть по высоте", bottom: "нижняя треть", left: "левая треть", center: "средняя треть по ширине", right: "правая треть",
} as const;

/** Доля пикселей-содержимого по регионам кадра (четверти 2×2, трети по осям), 0..1. */
export function emptyRegionShares(raw: Img): Record<keyof typeof REGION_NAMES, number> {
  const img = downsample(raw, Math.max(1, Math.round(raw.width / EMPTY_WIDTH)));
  const { width: w, height: h, data: d } = img;
  const L = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) L[p] = ((0.2126 * d[p * 4]! + 0.7152 * d[p * 4 + 1]! + 0.0722 * d[p * 4 + 2]!) / 255) * (d[p * 4 + 3]! / 255);
  // интегральное изображение — размытие боксом за O(1) на пиксель
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) I[(y + 1) * (w + 1) + x + 1] = L[y * w + x]! + I[y * (w + 1) + x + 1]! + I[(y + 1) * (w + 1) + x]! - I[y * (w + 1) + x]!;
  const r = Math.max(2, Math.round(w / 40));
  const content = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [x0, y0, x1, y1] = [Math.max(0, x - r), Math.max(0, y - r), Math.min(w, x + r + 1), Math.min(h, y + r + 1)];
      const blur = (I[y1 * (w + 1) + x1]! - I[y0 * (w + 1) + x1]! - I[y1 * (w + 1) + x0]! + I[y0 * (w + 1) + x0]!) / ((x1 - x0) * (y1 - y0));
      content[y * w + x] = Math.abs(L[y * w + x]! - blur) > EMPTY_CONTRAST ? 1 : 0;
    }
  }
  const share = (fx0: number, fy0: number, fx1: number, fy1: number) => {
    const [x0, y0, x1, y1] = [Math.floor(fx0 * w), Math.floor(fy0 * h), Math.floor(fx1 * w), Math.floor(fy1 * h)];
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += content[y * w + x]!;
    return n / Math.max(1, (x1 - x0) * (y1 - y0));
  };
  const t = 1 / 3;
  return {
    "top-left": share(0, 0, 0.5, 0.5), "top-right": share(0.5, 0, 1, 0.5), "bottom-left": share(0, 0.5, 0.5, 1), "bottom-right": share(0.5, 0.5, 1, 1),
    top: share(0, 0, 1, t), middle: share(0, t, 1, 2 * t), bottom: share(0, 2 * t, 1, 1),
    left: share(0, 0, t, 1), center: share(t, 0, 2 * t, 1), right: share(2 * t, 0, 1, 1),
  };
}

/** Контраст разрешённой палитры: text к bg ≥ 4.5, muted к bg ≥ 3. */
function contrastIssues(style: ResolvedStyle): Issue[] {
  const out: Issue[] = [];
  const p = style.palette;
  for (const [key, min] of [["text", MIN_TEXT_CONTRAST], ["muted", MIN_MUTED_CONTRAST]] as const) {
    let ratio: number;
    try {
      ratio = contrastRatio(p[key], p.bg);
    } catch (e) {
      out.push({
        code: "contrast", severity: "warning", area: `palette.${key}`,
        description: `контраст palette.${key} не посчитан: ${(e as Error).message}`,
        fix_hint: "цвета палитры — hex (#rrggbb)",
      });
      continue;
    }
    if (ratio < min) {
      out.push({
        code: "contrast", severity: "blocking", area: `palette.${key}`,
        description: `контраст palette.${key} ${p[key]} к фону ${p.bg} — ${ratio.toFixed(2)} < ${min}`,
        fix_hint: `выбери palette.${key} контрастнее к bg (не меньше ${min}:1) в palette_overrides`,
      });
    }
  }
  return out;
}

/** Сеть в логах браузера — blocking; прочие ошибки консоли — warning. */
function logIssues(logs: string[]): Issue[] {
  const out: Issue[] = [];
  const network = logs.filter((l) => NETWORK.test(l));
  const errors = logs.filter((l) => l.startsWith("[error]") && !NETWORK.test(l));
  const list = (l: string[]) => l.slice(0, MAX_LOG_LINES).join(" | ") + (l.length > MAX_LOG_LINES ? ` (+${l.length - MAX_LOG_LINES})` : "");
  if (network.length > 0) {
    out.push({
      code: "network", severity: "blocking",
      description: `сцена обращается к сети: ${list(network)}`,
      fix_hint: "все ассеты — локальные файлы из src/ (import) или из @ms/motion-kit; никаких URL",
    });
  }
  if (errors.length > 0) {
    out.push({
      code: "console_error", severity: "warning",
      description: `ошибки консоли браузера: ${list(errors)}`,
      fix_hint: "исправь причину ошибки в коде сцены (undefined в props, неверный ключ, битые данные)",
    });
  }
  return out;
}
