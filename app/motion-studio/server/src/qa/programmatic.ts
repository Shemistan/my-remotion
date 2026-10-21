// Программные проверки по реальным кадрам, логам браузера и размеру превью (06 §6) —
// без LLM: пустой кадр, застывшая анимация, обрезка, открытый край сцены, safe area,
// контраст, сеть.
import type { MotionSpec, QAIssue, Settings } from "@ms/contracts";
import { type RenderResult, type ResolvedStyle, contrastRatio, safeRect } from "@ms/render";
import { accentBeat, blankCheckFrom, inBeat, isEmphasisRole } from "../pipeline/qa-frames.js";
import { EDGES, type Edge, type Img, INK_THRESHOLD, backgroundEstimate, edgeBackground, edgeClip, loadPng, lumaStats, objectDelta } from "./image.js";

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
}

/** Однотонный кадр: std яркости Y' ниже. */
export const BLANK_STD = 0.01;
/**
 * Финальный акцент застыл: средняя |ΔY'| региона акцента между N−20 и N−1 ниже. Калибровка
 * Fix C по 5 реальным сценам (перерендер N−20/N−1): дрейф фона (зерно, аврора, частицы)
 * даёт неподвижным регионам 0.005–0.0068, живые акценты — 0.0088–0.053. Порог между ними:
 * ниже него регион меняется не больше, чем просто фон.
 */
export const ACCENT_ALIVE_DELTA = 0.0075;
/** Кадр отступа от конца для проверки «акцент жив». */
export const ACCENT_HOLD_GAP = 20;
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
  if (input.accentFrames && input.accentFrames.length === 2) {
    const [a, b] = [...input.accentFrames].sort((x, y) => x.frame - y.frame) as [{ frame: number; path: string }, { frame: number; path: string }];
    out.push(...accentAliveIssues(input.spec, input.settings, [a.frame, await loadPng(a.path)], [b.frame, await loadPng(b.path)]));
  }
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
 * кадре; средняя |ΔY'| их региона между N−20 и N−1 ниже порога у всех — warning.
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
  const deltas = visible.map((e) => {
    const l = e.layout!;
    const x0 = Math.max(0, Math.floor(safe.x + l.x * safe.w));
    const y0 = Math.max(0, Math.floor(safe.y + l.y * safe.h));
    const x1 = Math.min(a.width, Math.ceil(safe.x + (l.x + l.w) * safe.w));
    const y1 = Math.min(a.height, Math.ceil(safe.y + (l.y + l.h) * safe.h));
    return { id: e.id, d: regionLumaDelta(a, b, x0, y0, x1, y1) };
  });
  if (deltas.some((x) => x.d >= ACCENT_ALIVE_DELTA)) return [];
  return [{
    code: "accent_static", severity: "warning", frame: fb, area: visible.map((e) => e.id).join(", "),
    description: `финальный акцент застыл: регион ${visible.map((e) => e.id).join(", ")} на кадрах ${fa} и ${fb} почти не меняется (|ΔY'| ${Math.max(...deltas.map((x) => x.d)).toFixed(4)} < ${ACCENT_ALIVE_DELTA})`,
    fix_hint: "финальное состояние живёт до последнего кадра: дыхание свечения, пульс или блик на акценте — движение, подтверждающее итог",
  }];
}

/** Средняя |ΔY'| пикселей прямоугольника [x0, x1) × [y0, y1) двух кадров, 0..1. */
function regionLumaDelta(a: Img, b: Img, x0: number, y0: number, x1: number, y1: number): number {
  const luma = (d: Uint8Array, i: number) => ((0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255) * (d[i + 3]! / 255);
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(luma(a.data, i) - luma(b.data, i));
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
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
