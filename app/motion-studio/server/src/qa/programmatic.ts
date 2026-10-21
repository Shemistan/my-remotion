// Программные проверки по реальным кадрам, логам браузера и размеру превью (06 §6) —
// без LLM: пустой кадр, застывшая анимация, обрезка, safe area, контраст, сеть.
import type { MotionSpec, QAIssue, Settings } from "@ms/contracts";
import { type Rect, type RenderResult, type ResolvedStyle, contrastRatio, safeRect } from "@ms/render";
import { blankCheckFrom } from "../pipeline/qa-frames.js";
import { type Img, backgroundModel, inkCount, loadPng, lumaStats, objectDelta } from "./image.js";

export interface ProgrammaticInput {
  frames: { frame: number; path: string }[];
  spec: MotionSpec;
  settings: Settings;
  style: ResolvedStyle;
  render: RenderResult;
  previewBytes: number;
}

/** Однотонный кадр: std относительной яркости ниже. */
export const BLANK_STD = 0.01;
/** Кадры совпадают: изменение объектов ниже. */
export const FROZEN_DELTA = 0.002;
/** Полоса по краю кадра, px, и допустимая доля «чернил» в ней. */
const EDGE_PX = 2;
const CLIP_INK = 0.01;
const SAFE_INK = 0.005;
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

  const beatsAt = (f: number) => input.spec.beats.filter((b) => f >= b.start_frame && f < b.end_frame).map((b) => b.id).sort().join(",");
  const from = blankCheckFrom(input.spec);
  frames.forEach((f, i) => {
    const img = imgs[i]!;
    // пустой кадр: только внутри битов и после входа первого бита (кадр 0 может быть пустым фоном)
    if (f.frame >= from && beatsAt(f.frame) !== "") {
      const { std } = lumaStats(img);
      if (std < BLANK_STD) {
        out.push({
          code: "blank", severity: "blocking", frame: f.frame,
          description: `кадр ${f.frame} однотонный (std яркости ${std.toFixed(4)} < ${BLANK_STD}): элементы не видны`,
          fix_hint: "проверь, что элементы бита отрисованы и видимы в этом кадре (opacity, позиция, цвет на фоне, тайминги из props.timing)",
        });
      }
    }
    out.push(...edgeIssues(img, f.frame, input.settings));
  });

  out.push(...frozenIssues(frames.map((f) => f.frame), imgs, beatsAt));
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
 * Обрезка (полоса 2 px по краю) и выход за безопасную зону; поля масштабируются к размеру
 * кадра. Фон — модель с плавными градиентами (`backgroundModel`), а не цвет углов: свет
 * aurora и виньетка у края кадра — не объект.
 */
function edgeIssues(img: Img, frame: number, settings: Settings): Issue[] {
  const out: Issue[] = [];
  const bg = backgroundModel(img);
  const { width: w, height: h } = img;
  const edges: [string, Rect][] = [
    ["top", { x: 0, y: 0, w, h: EDGE_PX }],
    ["right", { x: w - EDGE_PX, y: 0, w: EDGE_PX, h }],
    ["bottom", { x: 0, y: h - EDGE_PX, w, h: EDGE_PX }],
    ["left", { x: 0, y: 0, w: EDGE_PX, h }],
  ];
  const clipped = edges.filter(([, r]) => {
    const c = inkCount(img, r, bg);
    return c.ink / c.total > CLIP_INK;
  }).map(([name]) => name);
  for (const area of clipped) {
    out.push({
      code: "clipping", severity: "blocking", frame, area,
      description: `кадр ${frame}: объект касается края кадра (${area}) — вероятно, обрезан`,
      fix_hint: `уменьши размер или сдвинь элемент внутрь безопасной зоны (${area}); длинный текст — перенос или меньший кегль`,
    });
  }

  const safe = safeRect({ width: w, height: h, safe_area: settings.safe_area });
  const margins: Rect[] = [
    { x: 0, y: 0, w, h: safe.y },
    { x: 0, y: safe.y + safe.h, w, h: h - safe.y - safe.h },
    { x: 0, y: safe.y, w: safe.x, h: safe.h },
    { x: safe.x + safe.w, y: safe.y, w: w - safe.x - safe.w, h: safe.h },
  ];
  let ink = 0;
  let total = 0;
  for (const m of margins) {
    const c = inkCount(img, m, bg);
    ink += c.ink;
    total += c.total;
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
