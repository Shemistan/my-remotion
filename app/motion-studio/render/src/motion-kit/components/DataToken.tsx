// Данные — объект: плашка-токен («user:42 → {…}») летит по ребру FlowGraph или своему
// пути, оставляя короткий след, касается цели, коротко «вдавливается» и ложится в узел
// (`dock`), где остаётся до конца сцены. Внутри графа — в слое `overlay` (над карточками).
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties, ReactElement } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_PASS, pulsePass } from "../choreo/pulse.js";
import { EASE, frames } from "../easing.js";
import { type CubicSegment, lutLength, pathLUT, pointAtLength } from "../geometry.js";
import { clamp01, ramp } from "../internal.js";
import { type TypeLevel, sizePx } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { alpha, fontFamily, isDark, mix, surfaceAt } from "../tokens.js";
import { useFlowGeometry } from "./FlowGraph.js";
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
  /** Куда лечь после прихода: смещение от конца пути, px (например внутрь карточки узла). */
  dock?: { dx: number; dy: number };
  /** Кадр, после которого токен уходит. */
  until?: number;
  tone?: StatusTone;
  accentIndex?: number;
  /** Кегль: уровень шкалы, шаг или px (по умолчанию caption). */
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

export function DataToken({ label, edgeId, segments, beat, travel, reverse = false, stay = true, dock, until, tone = "accent", accentIndex = 1, size = "caption", mono = true, style }: DataTokenProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const flow = useFlowGeometry();
  const seg = edgeId ? flow?.edges.get(edgeId) : undefined;
  const path = seg ? [seg] : (segments ?? []);
  if (path.length === 0) return null;
  const lut = pathLUT(path, 40);
  const len = lutLength(lut);
  const pass = pulsePass(len, travel, fps, s);
  const start = Math.max(beat.start_frame, (edgeId && flow?.ready.get(edgeId)) || 0);
  const tk = tokenAt(frame, start, pass, s, { stay, until });
  if (!tk.visible) return null;

  const dark = isDark(s);
  const px = sizePx(s, size, height);
  const col = toneColor(s, tone, accentIndex);
  const at = (p: number) => pointAtLength(lut, (reverse ? 1 - p : p) * len);
  const head = at(tk.progress);
  const dx = (dock?.dx ?? 0) * tk.dock;
  const dy = (dock?.dy ?? 0) * tk.dock;
  // след: три «призрака» на прошлых кадрах полёта — длина следа = скорость
  const ghosts = tk.progress < 1
    ? [2, 4, 6].map((d, i) => {
        const g = tokenAt(frame - d, start, pass, s, { stay, until });
        return g.visible ? { p: at(g.progress), o: 0.28 - i * 0.08 } : null;
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
        padding: `${(px * 0.3).toFixed(1)}px ${(px * 0.6).toFixed(1)}px`,
        borderRadius: Math.round(px * 0.45),
        background: `linear-gradient(${alpha(col, dark ? 0.28 : 0.16)}, ${alpha(col, dark ? 0.28 : 0.16)}), ${surfaceAt(s, 3)}`,
        boxShadow: `inset 0 0 0 1.5px ${alpha(col, 0.85)}, 0 0 ${(px * (0.8 + 1.2 * tk.pop)).toFixed(1)}px ${alpha(col, dark ? 0.5 : 0.25)}`,
        color: mix(col, dark ? "#ffffff" : "#000000", dark ? 0.55 : 0.35),
        fontFamily: fontFamily(mono ? s.typography.mono : s.typography.body),
        fontWeight: 600,
        fontSize: px,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </div>
  );
  return (
    <>
      {ghosts.map((g, i) => (g ? chip(g.o * tk.opacity, `g${i}`, g.p.x, g.p.y, 0.92) : null))}
      {chip(tk.opacity, "head", head.x + dx, head.y + dy, 1 + 0.1 * tk.pop)}
    </>
  );
}
