// Данные — объект: карточка-запись («user:42», «GET /user/42», «84 000 ₽») летит по ребру
// FlowGraph или своему пути, оставляя короткий след, касается цели, коротко «вдавливается»
// и ложится в слот узла (FlowNode.slot), где остаётся до конца сцены. Внутри графа — в слое
// `overlay` (над карточками). Грамматика — объект, не статус: прямоугольник с малым
// скруглением, моноширинный текст, цветная полоса-ярлык слева, нейтральная поверхность;
// у StatusChip — капсула, капс, точка-индикатор, тонированный фон.
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties, ReactElement } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_PASS, pulsePass } from "../choreo/pulse.js";
import { EASE, frames } from "../easing.js";
import { type CubicSegment, type Point, lutLength, pathLUT, pointAtLength } from "../geometry.js";
import { clamp01, kitWarn, ramp } from "../internal.js";
import { type TypeLevel, sizePx } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { type FontRef, accent, alpha, fontFamily, hueDistance, isDark, surfaceAt } from "../tokens.js";
import { tokenHeight, useFlowGeometry } from "./FlowGraph.js";
import { type StatusTone, toneColor } from "./StatusChip.js";

export interface DataTokenProps {
  /** Текст токена: ключ, значение, запрос («GET /user/42», «user:42», «84 000 ₽»). */
  label: string;
  /** Ребро FlowGraph (токен внутри `overlay` графа). */
  edgeId?: string;
  /** Путь вне графа: сегменты в px родителя. */
  segments?: CubicSegment[];
  /** Старт полёта — `start_frame` (внутри графа не раньше, чем ребро дорисовано). */
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Кадров полёта (по умолчанию — как у импульса по этому пути). */
  travel?: number;
  /** Обратное направление (ответ возвращается). */
  reverse?: boolean;
  /** Остаться у цели после прихода (по умолчанию да): данные легли в узел. */
  stay?: boolean;
  /**
   * Куда лечь после прихода. По умолчанию — в слот узла-цели (FlowNode.slot), если он есть,
   * иначе — конец пути. `"slot"` — слот обязателен (нет — токен ляжет под карточку и
   * в консоли рендера будет сообщение). `{ dx, dy }` — смещение от конца пути, px (0.3.0).
   */
  dock?: { dx: number; dy: number } | "slot";
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
 * Куда ложится токен по ребру (чистая функция): `{ dx, dy }` — от конца пути; иначе слот
 * узла-цели (`to`, при reverse — `from`), если он есть; `"slot"` без слота — под карточку
 * узла (не на подпись) с сообщением; без слота и dock — конец пути.
 */
export function dockPoint(flow: DockFlow, edgeId: string, reverse: boolean, dock: DataTokenProps["dock"], s: StyleBible, frameH: number): { at: Point | null; issue: string | null } {
  const seg = flow.edges.get(edgeId);
  if (!seg) return { at: null, issue: `DataToken: в графе нет ребра "${edgeId}" — токена нет.` };
  const end = reverse ? seg[0] : seg[3];
  if (dock && dock !== "slot") return { at: { x: end.x + dock.dx, y: end.y + dock.dy }, issue: null };
  const link = flow.links.get(edgeId);
  const target = link ? (reverse ? link.from : link.to) : undefined;
  const slot = target ? flow.slots.get(target) : undefined;
  if (slot) return { at: { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 }, issue: null };
  if (dock !== "slot") return { at: end, issue: null };
  const n = target ? flow.nodes.get(target) : undefined;
  if (!n) return { at: end, issue: `DataToken: у ребра "${edgeId}" нет узла-цели — токен лёг на конец пути.` };
  const h = tokenHeight(sizePx(s, "caption", frameH));
  return {
    at: { x: n.x + n.w / 2, y: n.y + n.h + (12 * frameH) / 1080 + h / 2 },
    issue: `DataToken: у узла "${n.id}" нет слота данных (FlowNode.slot) — токен лёг под карточку.`,
  };
}

export function DataToken({ label, edgeId, segments, beat, travel, reverse = false, stay = true, dock, until, tone, accentIndex, size = "caption", mono = true, style }: DataTokenProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const flow = useFlowGeometry();
  const seg = edgeId ? flow?.edges.get(edgeId) : undefined;
  const path = seg ? [seg] : (segments ?? []);
  // точка укладки: слот узла / смещение / конец пути; неверное использование — сообщение
  let rest: Point | null = null;
  if (edgeId && flow) {
    const d = dockPoint(flow, edgeId, reverse, dock, s, height);
    if (d.issue) kitWarn(`token:${d.issue}`, d.issue);
    rest = d.at;
  } else if (edgeId && !segments) {
    const m = `DataToken: edgeId "${edgeId}" вне <FlowGraph> — токена нет. Ставь в overlay графа или передай segments.`;
    kitWarn(`token:${m}`, m);
  } else if (dock === "slot") {
    const m = "DataToken: dock \"slot\" без графа — слота нет, токен лёг на конец пути.";
    kitWarn(`token:${m}`, m);
  }
  if (path.length === 0) return null;
  const lut = pathLUT(path, 40);
  const len = lutLength(lut);
  const pass = pulsePass(len, travel, fps, s);
  const start = Math.max(beat.start_frame, (edgeId && flow?.ready.get(edgeId)) || 0);
  const tk = tokenAt(frame, start, pass, s, { stay, until });
  if (!tk.visible) return null;

  const dark = isDark(s);
  const px = sizePx(s, size, height);
  const col = dataColor(s, tone, accentIndex);
  const look = dataTokenLook(s, px);
  const at = (p: number) => pointAtLength(lut, (reverse ? 1 - p : p) * len);
  const end = at(1);
  const target = rest ?? (dock && dock !== "slot" ? { x: end.x + dock.dx, y: end.y + dock.dy } : end);
  // в слот токен «ныряет» ещё в полёте (последние 45 % пути): у карточки он уже на высоте
  // слота и не проходит по подписи узла; смещение { dx, dy } — после прихода, как в 0.3.0
  const into = rest !== null && !(dock && dock !== "slot");
  const place = (f: TokenFrame): Point => {
    const p = at(f.progress);
    const w = into ? Math.max(f.dock, EASE.inOutCubic(clamp01((f.progress - 0.55) / 0.45))) : f.dock;
    return { x: p.x + (target.x - end.x) * w, y: p.y + (target.y - end.y) * w };
  };
  const head = place(tk);
  // след: три «призрака» на прошлых кадрах полёта — длина следа = скорость
  const ghosts = tk.progress < 1
    ? [2, 4, 6].map((d, i) => {
        const g = tokenAt(frame - d, start, pass, s, { stay, until });
        return g.visible ? { p: place(g), o: 0.28 - i * 0.08 } : null;
      })
    : [];
  const chip = (o: number, key: string, x: number, y: number, extra = 1): ReactElement => (
    <div
      key={key}
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${extra.toFixed(4)})`,
        opacity: o,
        display: "flex",
        alignItems: "stretch",
        overflow: "hidden",
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
      <span style={{ padding: `${(px * 0.3).toFixed(1)}px ${(px * 0.55).toFixed(1)}px` }}>{label}</span>
    </div>
  );
  return (
    <>
      {ghosts.map((g, i) => (g ? chip(g.o * tk.opacity, `g${i}`, g.p.x, g.p.y, 0.92) : null))}
      {chip(tk.opacity, "head", head.x, head.y, 1 + 0.08 * tk.pop)}
    </>
  );
}
