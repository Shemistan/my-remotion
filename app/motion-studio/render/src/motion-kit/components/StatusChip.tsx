// Статус процесса в одной точке: плашки сменяют друг друга на месте («Промах» →
// «Запись» → «Попадание»), прошлый статус уходит вверх, новый поднимается снизу, ширина
// и цвет плашки перетекают. Якорь — узел или ребро ближайшего FlowGraph (слой overlay)
// либо точка x / y в px родителя.
import type { StyleBible } from "@ms/contracts";
import type { CSSProperties } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { cubicPoint } from "../geometry.js";
import { clamp01, kitWarn, ramp } from "../internal.js";
import { type TypeLevel, sizePx } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { type FontRef, accent, alpha, fontFamily, isDark, mix, surfaceAt } from "../tokens.js";
import { useFlowGeometry } from "./FlowGraph.js";

export type StatusTone = "neutral" | "accent" | "positive" | "negative" | "warning";

export interface StatusState {
  text: string;
  /** Кадр, с которого статус текущий. */
  at: number;
  /** Тон плашки (по умолчанию neutral): negative — промах/ошибка, positive — успех. */
  tone?: StatusTone;
  /** Индекс акцента для tone: "accent". */
  accentIndex?: number;
}

export type StatusAnchor =
  | { node: string; side?: "top" | "bottom" | "left" | "right" | "center"; gap?: number }
  | { edge: string; t?: number; side?: "top" | "bottom" | "center"; gap?: number };

export interface StatusChipProps {
  states: StatusState[];
  /** Якорь в FlowGraph (в `overlay` графа): узел со стороной или ребро в доле пути `t`. */
  anchor?: StatusAnchor;
  /** Точка без графа, px родителя (центр плашки). */
  x?: number;
  y?: number;
  /** Кегль: уровень шкалы, шаг или px (по умолчанию caption). */
  size?: TypeLevel | number;
  /** Кадр, после которого статус уходит (по умолчанию остаётся до конца). */
  until?: number;
  style?: CSSProperties;
}

export interface StatusFrame {
  /** Индекс текущего статуса (в порядке `at`). */
  current: number;
  /** Индекс уходящего статуса (null — первый статус входит из ничего). */
  previous: number | null;
  /** Доля смены 0 → 1 (прошлый уходит, текущий входит). */
  swap: number;
  /** Доля ухода всей плашки после `until` 0 → 1. */
  leave: number;
}

/** Статус в кадре (чистая функция): states по `at`; смена за ~10 кадров; null — ещё нет. */
export function statusAt(states: StatusState[], frame: number, s: StyleBible, until?: number): StatusFrame | null {
  const order = [...states].sort((a, b) => a.at - b.at);
  let current = -1;
  for (let i = 0; i < order.length; i++) if (order[i]!.at <= frame) current = i;
  if (current < 0) return null;
  const at = order[current]!.at;
  const swap = ramp(frame, at, at + frames(s, 10), EASE.inOutCubic);
  const leave = until === undefined ? 0 : ramp(frame, until, until + frames(s, 10), EASE.inOutCubic);
  return { current, previous: current > 0 ? current - 1 : null, swap, leave };
}

/** Цвет тона статуса. */
export function toneColor(s: StyleBible, tone: StatusTone | undefined, accentIndex = 0): string {
  if (tone === "positive") return s.palette.positive;
  if (tone === "negative") return s.palette.negative;
  if (tone === "warning") return accent(s, 2);
  if (tone === "accent") return accent(s, accentIndex);
  return s.palette.muted;
}

/**
 * Почему якорь StatusChip не сработает (чистая функция): якорь вне <FlowGraph> или узла /
 * ребра с таким id нет — плашка встала бы в точку x / y (0, 0 по умолчанию). null — в порядке.
 */
export function statusAnchorIssue(a: StatusAnchor | undefined, flow: Pick<NonNullable<ReturnType<typeof useFlowGeometry>>, "edges" | "nodes"> | null): string | null {
  if (!a) return null;
  const what = "node" in a ? `узел "${a.node}"` : `ребро "${a.edge}"`;
  if (!flow) return `StatusChip: якорь ${what} вне <FlowGraph> — плашка встанет в x / y. Ставь StatusChip в overlay графа или задай x, y без anchor.`;
  if ("node" in a ? !flow.nodes.has(a.node) : !flow.edges.has(a.edge)) return `StatusChip: в графе нет id — ${what}; плашка встанет в x / y.`;
  return null;
}

/**
 * Грамматика статуса: капсула, капс с разрядкой, точка-индикатор, тонированный фон —
 * «состояние», а не объект (у DataToken — прямоугольник, моно, полоса-ярлык; dataTokenLook).
 */
export function statusChipLook(s: StyleBible, px: number): { radius: number; font: FontRef; caps: boolean; marker: "bar" | "dot"; tracking: number; dot: number } {
  return { radius: 999, font: s.typography.body, caps: true, marker: "dot", tracking: 0.08, dot: px * 0.42 };
}

/** Точка якоря в системе координат графа и сдвиг плашки от неё (CSS translate). */
function anchorPoint(flow: ReturnType<typeof useFlowGeometry>, a: StatusAnchor | undefined, x = 0, y = 0): { x: number; y: number; tr: string } {
  const gap = a?.gap ?? 12;
  if (a && flow && "node" in a) {
    const n = flow.nodes.get(a.node);
    if (n) {
      // без стороны — место статуса узла (0.4.0): снаружи карточки, со стороны без рёбер
      const slot = a.side === undefined ? flow.status.get(a.node) : undefined;
      const side = a.side ?? slot?.side ?? "top";
      if (slot && a.gap === undefined) {
        if (slot.side === "right") return { x: slot.x, y: slot.y, tr: "translate(0, -50%)" };
        return { x: slot.x, y: slot.y, tr: slot.side === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)" };
      }
      if (side === "top") return { x: n.x + n.w / 2, y: n.y - gap, tr: "translate(-50%, -100%)" };
      if (side === "bottom") return { x: n.x + n.w / 2, y: n.y + n.h + gap, tr: "translate(-50%, 0)" };
      if (side === "left") return { x: n.x - gap, y: n.y + n.h / 2, tr: "translate(-100%, -50%)" };
      if (side === "right") return { x: n.x + n.w + gap, y: n.y + n.h / 2, tr: "translate(0, -50%)" };
      return { x: n.x + n.w / 2, y: n.y + n.h / 2, tr: "translate(-50%, -50%)" };
    }
  }
  if (a && flow && "edge" in a) {
    const seg = flow.edges.get(a.edge);
    if (seg) {
      const p = cubicPoint(seg[0], seg[1], seg[2], seg[3], clamp01(a.t ?? 0.5));
      const side = a.side ?? "top";
      if (side === "top") return { x: p.x, y: p.y - gap, tr: "translate(-50%, -100%)" };
      if (side === "bottom") return { x: p.x, y: p.y + gap, tr: "translate(-50%, 0)" };
      return { x: p.x, y: p.y, tr: "translate(-50%, -50%)" };
    }
  }
  return { x, y, tr: "translate(-50%, -50%)" };
}

export function StatusChip({ states, anchor, x, y, size = "caption", until, style }: StatusChipProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const flow = useFlowGeometry();
  const issue = statusAnchorIssue(anchor, flow);
  if (issue) kitWarn(`status:${issue}`, issue);
  const st = statusAt(states, frame, s, until);
  if (!st || st.leave >= 1) return null;
  const order = [...states].sort((a, b) => a.at - b.at);
  const cur = order[st.current]!;
  const prev = st.previous === null ? null : order[st.previous]!;
  const dark = isDark(s);
  const px = sizePx(s, size, height);
  const pt = anchorPoint(flow, anchor, x, y);

  // первый вход — пружина pop; смена — перетекание ширины, цвета и короткий толчок масштаба
  const enter = springAt(frame, fps, s, order[0]!.at, "pop");
  const k = prev ? st.swap : 1;
  const colCur = toneColor(s, cur.tone, cur.accentIndex);
  const col = prev ? mix(toneColor(s, prev.tone, prev.accentIndex), colCur, k) : colCur;
  const look = statusChipLook(s, px);
  // капс с разрядкой шире строчных: ~0.72 em на знак + разрядка
  const textW = (t: string) => Array.from(t).length * (0.72 + look.tracking) * px;
  const w = prev ? textW(prev.text) + (textW(cur.text) - textW(prev.text)) * k : textW(cur.text);
  const bump = prev ? Math.sin(Math.PI * st.swap) * 0.06 : 0;
  const scale = (prev ? 1 : Math.max(0, 0.6 + 0.4 * enter)) * (1 + bump) * (1 - 0.15 * st.leave);
  const opacity = (prev ? 1 : clamp01(enter * 2)) * (1 - st.leave);
  const textCol = cur.tone === undefined || cur.tone === "neutral" ? s.palette.text : mix(col, dark ? "#ffffff" : "#000000", dark ? 0.35 : 0.25);
  const line: CSSProperties = { position: "absolute", left: 0, right: 0, top: 0, textAlign: "center", whiteSpace: "nowrap" };

  return (
    <div data-ms-layout="status" style={{ position: "absolute", left: pt.x, top: pt.y, transform: `${pt.tr} scale(${scale.toFixed(4)})`, opacity, ...style }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: px * 0.45,
          padding: `${(px * 0.38).toFixed(1)}px ${(px * 0.7).toFixed(1)}px`,
          borderRadius: look.radius,
          // состояние: тонированная капсула без ореола — светится только точка-индикатор
          background: `linear-gradient(${alpha(col, dark ? 0.22 : 0.14)}, ${alpha(col, dark ? 0.22 : 0.14)}), ${surfaceAt(s, 2)}`,
          boxShadow: `inset 0 0 0 1.5px ${alpha(col, 0.6 + 0.3 * bump * 4)}`,
          fontFamily: fontFamily(look.font),
          fontWeight: 700,
          fontSize: px,
          lineHeight: 1.2,
          textTransform: "uppercase",
          letterSpacing: `${look.tracking}em`,
        }}
      >
        <span style={{ width: look.dot, height: look.dot, borderRadius: 999, background: col, boxShadow: `0 0 0 ${(px * 0.12).toFixed(1)}px ${alpha(col, 0.25)}, 0 0 ${(px * 0.6).toFixed(1)}px ${alpha(col, 0.9)}`, flex: "0 0 auto" }} />
        {/* ширина перетекает; уходящий текст поднимается и гаснет, новый — поднимается снизу */}
        <span style={{ position: "relative", display: "block", width: w, height: px * 1.2, clipPath: "inset(0 -100% 0 -100%)" }}>
          {prev && k < 1 ? (
            <span style={{ ...line, color: textCol, opacity: 1 - k, transform: `translateY(${(-0.7 * k * px).toFixed(2)}px)` }}>{prev.text}</span>
          ) : null}
          <span style={{ ...line, color: textCol, opacity: k, transform: `translateY(${(0.7 * (1 - k) * px).toFixed(2)}px)` }}>{cur.text}</span>
        </span>
      </div>
    </div>
  );
}
