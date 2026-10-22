// Данные — объект: карточка-запись («user:42», «GET /user/42», «84 000 ₽») едет по ребру
// FlowGraph или своему пути — центром на линии, со шлейфом-штрихом без текста, — и встаёт
// перед карточкой цели, не заходя на подпись. Дальше по смыслу: ложится в полосу данных узла
// (сначала «вдавливается» в порт, потом проявляется в слоте — текст в кадре всегда один),
// поглощается узлом (consume) или остаётся у порта (stay). Внутри графа — в слое `overlay`.
// Грамматика — объект, не статус: прямоугольник с малым скруглением, моноширинный текст,
// цветная полоса-ярлык слева, нейтральная поверхность; у StatusChip — капсула и точка.
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_PASS, pulsePass } from "../choreo/pulse.js";
import { EASE, frames } from "../easing.js";
import { type CubicSegment, type PathLUT, type Point, lutLength, pathLUT, pointAtLength } from "../geometry.js";
import { clamp01, kitError, kitWarn, ramp } from "../internal.js";
import { type TypeLevel, sizePx } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { type FontRef, accent, alpha, fontFamily, hueDistance, isDark, surfaceAt } from "../tokens.js";
import { useFlowGeometry } from "./FlowGraph.js";
import { queueCellCenter, queueCellIssue, queueCells, tokenHeight } from "./flow-layout.js";
import { type StatusTone, toneColor } from "./StatusChip.js";

export interface DataTokenProps {
  /** Текст токена: ключ, значение, запрос («GET /user/42», «user:42», «84 000 ₽»). */
  label: string;
  /** Ребро FlowGraph (токен внутри `overlay` графа). */
  edgeId?: string;
  /** Путь вне графа: сегменты в px родителя. */
  segments?: CubicSegment[];
  /**
   * Бит токена из spec как есть: старт полёта — `start_frame`. Ребро должно быть дорисовано к
   * нему (вход узлов раньше); позже, чем на 2 кадра, — ошибка kit (blocking в QA).
   */
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Кадров полёта (по умолчанию — как у импульса по этому пути). */
  travel?: number;
  /** Обратное направление (ответ возвращается). */
  reverse?: boolean;
  /**
   * После прихода. По умолчанию: у цели есть полоса данных (`slot`, queue / store / cache) —
   * ложится в неё и остаётся; нет — поглощается узлом (consume); вне графа — остаётся у
   * конца пути. `stay: true` без полосы — остаётся перед портом (не на карточке);
   * `stay: false` — поглощается.
   */
  stay?: boolean;
  /** Поглотиться узлом на приходе (0.4.0): «вдавливается» в порт и исчезает — без хвостов после итога. */
  consume?: boolean;
  /**
   * Куда лечь после прихода. По умолчанию — в полосу данных узла-цели, если она есть.
   * `"slot"` — полоса обязательна (нет — токен ляжет под карточку и в консоли рендера будет
   * сообщение). `{ dx, dy }` — смещение от конца пути, px (0.3.0).
   */
  dock?: { dx: number; dy: number } | "slot";
  /** Ячейка буфера `queue` (0 — у выхода): сообщения встают в очередь по порядку. */
  cell?: number;
  /** Шлейф полёта: `streak` (по умолчанию) — один размытый штрих цвета данных, без текста; `none`. */
  trail?: "streak" | "none";
  /** Кадр, после которого токен уходит. */
  until?: number;
  /** Тон: по умолчанию — акцент данных (dataColor), не статусный цвет. */
  tone?: StatusTone;
  /** Индекс акцента (по умолчанию 0); тон, совпадающий с positive / negative, заменяется. */
  accentIndex?: number;
  /** Кегль: уровень шкалы, шаг или px (по умолчанию caption — под слот узла). */
  size?: TypeLevel | number;
  /** Моноширинный текст (по умолчанию да: ключи и значения). */
  mono?: boolean;
  style?: CSSProperties;
}

export interface TokenFrame {
  visible: boolean;
  /** Доля пути 0..1 (по кривой прохода импульса). */
  progress: number;
  /** Доля «укладки» после прихода 0..1 (сдвиг в dock). */
  dock: number;
  /** Толчок на приходе 0..1. */
  pop: number;
  opacity: number;
}

/** Токен в кадре (чистая функция): полёт start → start + travel, укладка, уход по until. */
export function tokenAt(frame: number, start: number, travel: number, s: StyleBible, o: { stay?: boolean; until?: number } = {}): TokenFrame {
  const t = frame - start;
  if (t < 0) return { visible: false, progress: 0, dock: 0, pop: 0, opacity: 0 };
  const ph = clamp01(t / Math.max(1, travel));
  const progress = ph >= 1 ? 1 : EASE_PASS(ph);
  const arrive = start + travel;
  const dock = ramp(frame, arrive, arrive + frames(s, 10), EASE.outQuart);
  const since = frame - arrive;
  const popLen = frames(s, 12);
  const pop = since >= 0 && since < popLen ? Math.sin(Math.PI * (since / popLen)) : 0;
  const appear = clamp01(t / frames(s, 4));
  const gone = o.stay === false ? ramp(frame, arrive, arrive + frames(s, 8)) : 0;
  const leave = o.until === undefined ? 0 : ramp(frame, o.until, o.until + frames(s, 10));
  const opacity = appear * (1 - gone) * (1 - leave);
  return { visible: opacity > 0.001, progress, dock, pop, opacity };
}

/** Минимальная разница тона данных и статусных цветов (positive / negative), градусы. */
const STATUS_HUE_GAP = 40;

/**
 * Цвет данных (чистая функция): акцент `accentIndex` (по умолчанию 0), но не тон статуса —
 * если он ближе 40° к positive или negative (teal-акцент рядом с зелёным «Попаданием»),
 * берётся акцент палитры, самый далёкий от обоих. Явный tone (кроме accent) — как есть.
 */
export function dataColor(s: StyleBible, tone?: StatusTone, accentIndex?: number): string {
  if (tone && tone !== "accent") return toneColor(s, tone, accentIndex);
  const status = [s.palette.positive, s.palette.negative];
  const gap = (c: string) => Math.min(...status.map((x) => hueDistance(c, x)));
  const want = accent(s, accentIndex ?? 0);
  if (gap(want) >= STATUS_HUE_GAP) return want;
  return s.palette.accent.reduce((best, c) => (gap(c) > gap(best) ? c : best), want);
}

/** Грамматика токена данных: форма, шрифт, регистр, маркер (сравни statusChipLook). */
export function dataTokenLook(s: StyleBible, px: number): { radius: number; font: FontRef; caps: boolean; marker: "bar" | "dot"; bar: number } {
  return { radius: Math.round(px * 0.22), font: s.typography.mono, caps: false, marker: "bar", bar: Math.max(3, Math.round(px * 0.2)) };
}

type DockFlow = Pick<NonNullable<ReturnType<typeof useFlowGeometry>>, "edges" | "nodes" | "links" | "slots">;

/**
 * Куда ложится токен по ребру (чистая функция): `{ dx, dy }` — от конца пути; иначе полоса
 * данных узла-цели (`to`, при reverse — `from`), если она есть (у queue — ячейка `cell`);
 * `"slot"` без полосы — под карточку узла (не на подпись) с сообщением; без полосы и dock —
 * конец пути (`slot: false`).
 */
export function dockPoint(flow: DockFlow, edgeId: string, reverse: boolean, dock: DataTokenProps["dock"], s: StyleBible, frameH: number, cell?: number): { at: Point | null; issue: string | null; slot?: boolean; width?: number; blocking?: boolean } {
  const seg = flow.edges.get(edgeId);
  if (!seg) return { at: null, issue: `DataToken: в графе нет ребра "${edgeId}" — токена нет.` };
  const end = reverse ? seg[0] : seg[3];
  if (dock && dock !== "slot") return { at: { x: end.x + dock.dx, y: end.y + dock.dy }, issue: null };
  const link = flow.links.get(edgeId);
  const target = link ? (reverse ? link.from : link.to) : undefined;
  const slot = target ? flow.slots.get(target) : undefined;
  const n = target ? flow.nodes.get(target) : undefined;
  if (slot) {
    if (n?.kind === "queue") {
      const issue = queueCellIssue(n.id, slot, cell ?? 0);
      return { at: queueCellCenter(slot, cell ?? 0), issue, slot: true, width: queueCells(slot).w, ...(issue ? { blocking: true } : {}) };
    }
    return { at: { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 }, issue: null, slot: true, width: slot.w };
  }
  if (dock !== "slot") return { at: end, issue: null, slot: false };
  if (!n) return { at: end, issue: `DataToken: у ребра "${edgeId}" нет узла-цели — токен лёг на конец пути.` };
  const h = tokenHeight(sizePx(s, "caption", frameH));
  return {
    at: { x: n.x + n.w / 2, y: n.y + n.h + (12 * frameH) / 1080 + h / 2 },
    issue: `DataToken: у узла "${n.id}" нет слота данных (FlowNode.slot) — токен лёг под карточку.`,
    slot: true,
  };
}

/** Сколько кадров токен может ждать ребро после начала своего бита без ошибки. */
export const TOKEN_LATE_FRAMES = 2;

/**
 * Токен ждёт ребро дольше допуска (чистая функция, S2-fix I2): сообщение ошибки kit или null.
 * Токен стартует не раньше, чем ребро дорисовано (`ready`); если это позже начала его бита,
 * он летит после кадров, где его ждёт spec (и QA), и поверх следующего токена. Править —
 * вход узлов ребра раньше, а не бит.
 */
export function tokenLateIssue(label: string, edgeId: string, beatStart: number, ready: number | undefined): string | null {
  if (ready === undefined || ready <= beatStart + TOKEN_LATE_FRAMES) return null;
  const late = ready - beatStart;
  return `DataToken «${label}»: бит начинается в кадре ${beatStart}, а ребро "${edgeId}" дорисовано только к кадру ${ready} — токен опоздал бы на ${late} кадров. Начни вход узлов ребра раньше (enterAt узлов на ≥ ${late} кадров раньше), чтобы ребро было готово к началу бита; бит токена не сдвигай и не считай старт сам (max с ready).`;
}

/** Что делает токен после прихода: ложится в полосу, поглощается, остаётся у порта, сдвигается на dock. */
export type TokenMode = "slot" | "consume" | "rest" | "offset";

/** Режим токена по его props и наличию полосы у цели (чистая функция). */
export function tokenMode(o: { inGraph: boolean; hasSlot: boolean; stay?: boolean; consume?: boolean; dock?: DataTokenProps["dock"] }): TokenMode {
  if (o.consume || o.stay === false) return "consume";
  if (o.dock && o.dock !== "slot") return "offset";
  if (o.hasSlot) return "slot";
  if (o.stay === true || !o.inGraph) return "rest";
  return "consume";
}

/** Размер карточки токена (оценка: моно 0.6 em на знак, поля 0.55 em, полоса-ярлык). */
export function tokenBox(label: string, px: number): { w: number; h: number } {
  return { w: Array.from(label).length * px * 0.6 + px * 1.1 + Math.max(3, Math.round(px * 0.2)), h: tokenHeight(px) };
}

/** Половина карточки токена вдоль направления (ux, uy) плюс зазор. */
function extentAlong(ux: number, uy: number, box: { w: number; h: number }, gap: number): number {
  const d = Math.hypot(ux, uy) || 1;
  // запас 15 %: S-кривая у порта изгибается, по дуге проходится чуть больше, чем по прямой
  return ((Math.abs(ux) / d) * (box.w / 2) + (Math.abs(uy) / d) * (box.h / 2)) * 1.15 + gap;
}

/**
 * Отрезок пути, по которому едет центр токена (длины по ходу движения, чистая функция):
 * карточка стартует целиком снаружи узла-источника и встаёт передним краем у порта цели с
 * зазором `gap` — не центром на порту (половина токена легла бы на карточку узла и закрыла
 * подпись). Короткое ребро: старт не дальше 45 % пути, остановка не раньше 55 %.
 */
export function tokenSpan(lut: PathLUT, reverse: boolean, box: { w: number; h: number }, gap: number): { from: number; to: number } {
  const len = lutLength(lut);
  const at = (d: number) => pointAtLength(lut, reverse ? len - d : d);
  const k = Math.min(8, len / 4);
  const [s0, s1, e0, e1] = [at(0), at(k), at(len - k), at(len)];
  const from = Math.min(len * 0.45, extentAlong(s1.x - s0.x, s1.y - s0.y, box, gap));
  const to = Math.max(len * 0.55, len - extentAlong(e1.x - e0.x, e1.y - e0.y, box, gap));
  return { from: Math.min(from, to), to };
}

/** Где токен останавливается (длина по ходу движения) — конец `tokenSpan`. */
export const tokenStop = (lut: PathLUT, reverse: boolean, box: { w: number; h: number }, gap: number) => tokenSpan(lut, reverse, box, gap).to;

/** Кадр токена: где его единственная карточка, масштаб, прозрачность, шлейф. */
export interface TokenShot {
  visible: boolean;
  /** `path` — на пути (доля `progress` до точки остановки), `dock` — в полосе / на dock. */
  at: "path" | "dock";
  progress: number;
  /** offset: доля сдвига от точки остановки к dock 0..1. */
  dock: number;
  /** Вдавливание в порт 0..1 (поглощение или перед записью в полосу). */
  absorb: number;
  /** Проявление в полосе 0..1. */
  write: number;
  scale: number;
  opacity: number;
  pop: number;
  /** Доля пути 4 кадра назад (хвост шлейфа) — только в полёте, иначе null. */
  tail: number | null;
}

/**
 * Токен в кадре (чистая функция): полёт start → start + travel по кривой прохода, затем по
 * режиму. Карточка в любом кадре одна: в полёте — на пути, при записи — сначала вдавливается
 * в порт и гаснет, потом проявляется в полосе (не две копии текста одновременно).
 */
export function tokenShot(frame: number, start: number, travel: number, s: StyleBible, o: { mode: TokenMode; until?: number }): TokenShot {
  const none: TokenShot = { visible: false, at: "path", progress: 0, dock: 0, absorb: 0, write: 0, scale: 1, opacity: 0, pop: 0, tail: null };
  const t = frame - start;
  if (t < 0) return none;
  const pass = Math.max(1, travel);
  const leave = o.until === undefined ? 0 : ramp(frame, o.until, o.until + frames(s, 10));
  const appear = clamp01(t / frames(s, 4));
  if (t < pass) {
    const ph = clamp01(t / pass);
    const tail = clamp01((t - frames(s, 4)) / pass);
    const shot = { ...none, visible: true, progress: EASE_PASS(ph), opacity: appear * (1 - leave), tail: EASE_PASS(tail) };
    return { ...shot, visible: shot.opacity > 0.001 };
  }
  const a = t - pass;
  const popLen = frames(s, 12);
  const absorbLen = frames(s, o.mode === "consume" ? 7 : 5);
  const absorb = ramp(a, 0, absorbLen, EASE.inOutCubic);
  let shot: TokenShot;
  if (o.mode === "rest" || o.mode === "offset") {
    const pop = a < popLen ? Math.sin(Math.PI * (a / popLen)) : 0;
    shot = { ...none, progress: 1, dock: o.mode === "offset" ? ramp(a, 0, frames(s, 10), EASE.outQuart) : 0, pop, scale: 1 + 0.08 * pop, opacity: 1 };
  } else if (o.mode === "consume") {
    shot = { ...none, progress: 1, absorb, scale: 1 - 0.45 * absorb, opacity: 1 - absorb };
  } else if (a < absorbLen) {
    shot = { ...none, progress: 1, absorb, scale: 1 - 0.3 * absorb, opacity: 1 - absorb };
  } else {
    const w = a - absorbLen;
    const write = ramp(w, 0, frames(s, 10), EASE.outQuart);
    const pop = w < popLen ? Math.sin(Math.PI * (w / popLen)) : 0;
    shot = { ...none, at: "dock", progress: 1, absorb: 1, write, pop, scale: (0.88 + 0.12 * write) * (1 + 0.06 * pop), opacity: write };
  }
  shot.opacity *= 1 - leave;
  shot.visible = shot.opacity > 0.001;
  return shot;
}

export function DataToken({ label, edgeId, segments, beat, travel, reverse = false, stay, consume, dock, cell, trail = "streak", until, tone, accentIndex, size = "caption", mono = true, style }: DataTokenProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const flow = useFlowGeometry();
  const seg = edgeId ? flow?.edges.get(edgeId) : undefined;
  const path = seg ? [seg] : (segments ?? []);
  // точка укладки: полоса узла / смещение / конец пути; неверное использование — сообщение
  let rest: Point | null = null;
  let hasSlot = false;
  let slotW: number | undefined;
  if (edgeId && flow) {
    const d = dockPoint(flow, edgeId, reverse, dock, s, height, cell);
    if (d.issue) (d.blocking ? kitError : kitWarn)(`token:${d.issue}`, d.issue);
    rest = d.at;
    hasSlot = d.slot === true;
    slotW = d.width;
  } else if (edgeId && !segments) {
    const m = `DataToken: edgeId "${edgeId}" вне <FlowGraph> — токена нет. Ставь в overlay графа или передай segments.`;
    kitWarn(`token:${m}`, m);
  } else if (dock === "slot") {
    const m = "DataToken: dock \"slot\" без графа — слота нет, токен лёг на конец пути.";
    kitWarn(`token:${m}`, m);
  }
  if (path.length === 0) return null;
  const mode = tokenMode({ inGraph: !!(edgeId && flow), hasSlot, stay, consume, dock });
  const lut = pathLUT(path, 40);
  const len = lutLength(lut);
  const pass = pulsePass(len, travel, fps, s);
  const ready = edgeId && flow ? flow.ready.get(edgeId) : undefined;
  const late = edgeId ? tokenLateIssue(label, edgeId, beat.start_frame, ready) : null;
  if (late) kitError(`late:${edgeId}:${label}`, late);
  const start = Math.max(beat.start_frame, ready ?? 0);
  const tk = tokenShot(frame, start, pass, s, { mode, until });
  if (!tk.visible) return null;

  const dark = isDark(s);
  const px = sizePx(s, size, height);
  const col = dataColor(s, tone, accentIndex);
  const look = dataTokenLook(s, px);
  const full = tokenBox(label, px);
  // короткое ребро: карточка с текстом не помещается между узлами — в полёте только капсула
  // цвета данных без текста (не ложится на подписи), текст проявляется в полосе узла
  const roomy = tokenSpan(lut, reverse, full, (6 * height) / 1080);
  const compact = mode !== "offset" && roomy.to - roomy.from < full.w * 0.6;
  const box = compact ? { w: full.h * 1.1, h: full.h } : full;
  // едет центром по линии и встаёт перед портом: карточка цели и её подпись не перекрыты
  const span = tokenSpan(lut, reverse, box, (6 * height) / 1080);
  const stop = mode === "offset" ? len : span.to;
  const d = (p: number) => span.from + p * (stop - span.from);
  const at = (p: number) => pointAtLength(lut, reverse ? len - d(p) : d(p));
  const portPt = pointAtLength(lut, reverse ? 0 : len);
  let head = at(tk.progress);
  if (mode === "offset" && dock && dock !== "slot") head = { x: head.x + dock.dx * tk.dock, y: head.y + dock.dy * tk.dock };
  // вдавливание: карточка смещается к порту и сжимается
  if (tk.absorb > 0 && tk.at === "path") head = { x: head.x + (portPt.x - head.x) * tk.absorb * 0.6, y: head.y + (portPt.y - head.y) * tk.absorb * 0.6 };
  if (tk.at === "dock" && rest) head = rest;
  // запись в полосу: проявление со стороны входа (шторка по ширине)
  const fromLeft = portPt.x >= at(0.9).x;
  const clip = tk.at === "dock" && tk.write < 1 ? (fromLeft ? `inset(0 ${((1 - tk.write) * 100).toFixed(2)}% 0 0)` : `inset(0 0 0 ${((1 - tk.write) * 100).toFixed(2)}%)`) : undefined;
  const fit = tk.at === "dock" && slotW !== undefined ? slotW : undefined;

  let streak: CSSProperties | null = null;
  if (trail === "streak" && tk.tail !== null && tk.at === "path") {
    const t0 = at(tk.tail);
    const dx = head.x - t0.x;
    const dy = head.y - t0.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) {
      const thick = box.h * 0.42;
      streak = {
        position: "absolute",
        left: t0.x,
        top: t0.y - thick / 2,
        width: d,
        height: thick,
        transformOrigin: `0 ${thick / 2}px`,
        transform: `rotate(${Math.atan2(dy, dx).toFixed(4)}rad)`,
        borderRadius: thick,
        background: `linear-gradient(90deg, ${alpha(col, 0)}, ${alpha(col, dark ? 0.55 : 0.4)})`,
        filter: `blur(${(thick * 0.35).toFixed(1)}px)`,
        opacity: tk.opacity,
        pointerEvents: "none",
      };
    }
  }
  return (
    <>
      {streak ? <div style={streak} /> : null}
      <div
        data-ms-layout="token"
        style={{
          position: "absolute",
          left: head.x,
          top: head.y,
          transform: `translate(-50%, -50%) scale(${tk.scale.toFixed(4)})`,
          opacity: tk.opacity,
          display: "flex",
          alignItems: "stretch",
          overflow: "hidden",
          maxWidth: fit,
          width: compact && tk.at === "path" ? box.w : undefined,
          height: compact && tk.at === "path" ? box.h : undefined,
          clipPath: clip,
          borderRadius: look.radius,
          // объект: нейтральная поверхность, кромка цветом данных, тень «лежит на карточке»
          background: surfaceAt(s, 3),
          boxShadow: `inset 0 0 0 1.5px ${alpha(col, 0.9)}, 0 ${(px * 0.12).toFixed(1)}px ${(px * 0.4).toFixed(1)}px ${alpha("#000000", dark ? 0.45 : 0.18)}, 0 0 ${(px * 1.4 * tk.pop).toFixed(1)}px ${alpha(col, (dark ? 0.6 : 0.3) * tk.pop)}`,
          color: s.palette.text,
          fontFamily: fontFamily(mono ? look.font : s.typography.body),
          fontWeight: 600,
          fontSize: px,
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          ...style,
        }}
      >
        <span style={{ flex: "0 0 auto", width: look.bar, background: col }} />
        {compact && tk.at === "path" ? null : <span style={{ padding: `${(px * 0.3).toFixed(1)}px ${(px * 0.55).toFixed(1)}px`, overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{label}</span>}
      </div>
    </>
  );
}
