// Выноска: кольцо вокруг цели прорисовывается по контуру со вспышкой внутри, от кольца
// прорастает линия-указатель с изломом, в её конце из маски выезжает подпись. Затем
// кольцо мягко дышит. Координаты — px родителя (как у target), слой поверх родителя.
import type { Beat } from "@ms/contracts";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Rect } from "../choreo/safe-area.js";
import { EASE, frames, springAt } from "../easing.js";
import { clamp01, drawDash, ramp, useSvgId } from "../internal.js";
import { typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix, radius, shadow, surfaceAt } from "../tokens.js";

export interface CalloutProps {
  /** Цель в px родителя. */
  target: Rect;
  label: string;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Сторона подписи; auto — где больше места в `bounds`. */
  side?: "left" | "right" | "auto";
  /** Область для выбора стороны, px родителя (по умолчанию кадр). */
  bounds?: Rect;
  /** Форма кольца: ring — эллипс, box — скруглённая рамка; auto — box для вытянутых целей. */
  shape?: "ring" | "box" | "auto";
  /** Длина горизонтальной части линии-указателя, px (по умолчанию 90). */
  reach?: number;
  accentIndex?: number;
}

/** Окна: кольцо 0–34 %, линия 26–52 %, подпись 46–72 % бита. */
function windows(beat: Pick<Beat, "start_frame" | "end_frame">) {
  const b0 = beat.start_frame;
  const L = Math.max(1, beat.end_frame - b0);
  return { ring: [b0, b0 + L * 0.34], line: [b0 + L * 0.26, b0 + L * 0.52], label: b0 + L * 0.46 } as const;
}

export function Callout({ target, label, beat, side = "auto", bounds, shape = "auto", reach = 90, accentIndex = 0 }: CalloutProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const id = useSvgId("ms-callout");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const area = bounds ?? { x: 0, y: 0, w: width, h: height };
  const w = windows(beat);

  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const box = shape === "box" || (shape === "auto" && target.w / Math.max(1, target.h) > 1.6);
  const pad = Math.max(10, Math.min(target.w, target.h) * 0.12);
  const rx = target.w / 2 + pad;
  const ry = target.h / 2 + pad;
  const right = side === "right" || (side === "auto" && area.x + area.w - (target.x + target.w) >= target.x - area.x);
  const up = cy - area.y > (area.y + area.h - cy) * 0.6;
  const dx = right ? 1 : -1;
  const dy = up ? -1 : 1;

  // старт линии: у рамки — середина боковой стороны, у эллипса — точка под 45° к подписи
  const start = box ? { x: cx + dx * rx, y: cy } : { x: cx + dx * rx * Math.SQRT1_2, y: cy + dy * ry * Math.SQRT1_2 };
  const rise = box ? 40 : 56;
  const elbow = { x: start.x + dx * rise, y: start.y + dy * rise };
  const end = { x: elbow.x + dx * reach, y: elbow.y };
  const leg1 = Math.hypot(elbow.x - start.x, elbow.y - start.y);
  const leg2 = Math.abs(end.x - elbow.x);
  const total = leg1 + leg2;

  const ringP = ramp(frame, w.ring[0], w.ring[1], EASE.inOutCubic);
  const flash = ramp(frame, w.ring[0] + (w.ring[1] - w.ring[0]) * 0.6, w.ring[1] + frames(s, 16), EASE.outQuart);
  const lineP = ramp(frame, w.line[0], w.line[1], EASE.outQuart);
  const dot = springAt(frame, fps, s, w.line[0], "pop");
  const lab = springAt(frame, fps, s, w.label, "snappy");
  const reveal = ramp(frame, w.label, w.label + frames(s, 14), EASE.outExpo);
  const settled = w.label + frames(s, 20);
  const breath = frame > settled ? 0.5 - 0.5 * Math.cos(((frame - settled) / fps) * Math.PI * 1.4) : 0;
  const ringPath = box
    ? undefined
    : `M${cx + dx * rx * Math.SQRT1_2} ${cy + dy * ry * Math.SQRT1_2} A${rx} ${ry} 0 1 ${dx * dy > 0 ? 0 : 1} ${cx + dx * rx * Math.SQRT1_2 - 0.01} ${cy + dy * ry * Math.SQRT1_2 + 0.01}`;
  const px = Math.round(typeSize(s, "caption", height) * 0.95);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <filter id={`${id}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={6} />
          </filter>
        </defs>
        {/* вспышка внутри цели */}
        {box ? (
          <rect x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} rx={radius(s, 1)} fill={color} opacity={(0.16 * (1 - flash) + 0.05) * clamp01(ringP * 3)} />
        ) : (
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} opacity={(0.16 * (1 - flash) + 0.05) * clamp01(ringP * 3)} />
        )}
        {/* кольцо прорисовывается по контуру; до старта его нет совсем (без остатков штриха) */}
        {ringP > 0
          ? (dark ? [true, false] : [false]).map((glow) => {
              const common = {
                fill: "none",
                stroke: color,
                strokeWidth: glow ? 7 : 2.5 + breath,
                opacity: glow ? 0.5 : 1,
                filter: glow ? `url(#${id}-glow)` : undefined,
                pathLength: 1,
                strokeDasharray: drawDash(ringP),
                strokeLinecap: "round" as const,
              };
              return box ? (
                <rect key={String(glow)} x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} rx={radius(s, 1)} {...common} />
              ) : (
                <path key={String(glow)} d={ringPath} {...common} />
              );
            })
          : null}
        {/* ореол-дыхание после появления */}
        {breath > 0 ? (
          box ? (
            <rect x={cx - rx - 6 * breath} y={cy - ry - 6 * breath} width={rx * 2 + 12 * breath} height={ry * 2 + 12 * breath} rx={radius(s, 1) + 6} fill="none" stroke={color} strokeWidth={1.5} opacity={0.35 * (1 - breath * 0.5)} />
          ) : (
            <ellipse cx={cx} cy={cy} rx={rx + 8 * breath} ry={ry + 8 * breath} fill="none" stroke={color} strokeWidth={1.5} opacity={0.35 * (1 - breath * 0.5)} />
          )
        ) : null}
        {/* линия-указатель с изломом */}
        {lineP > 0 ? (
          <polyline
            points={`${start.x},${start.y} ${elbow.x},${elbow.y} ${end.x},${end.y}`}
            fill="none"
            stroke={mix(color, s.palette.text, 0.15)}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${total} ${total}`}
            strokeDashoffset={total * (1 - lineP)}
          />
        ) : null}
        <circle cx={start.x} cy={start.y} r={Math.max(0, 5.5 * dot)} fill={color} />
        <circle cx={start.x} cy={start.y} r={Math.max(0, 2.2 * dot)} fill={mix(color, "#ffffff", 0.75)} />
      </svg>
      {/* подпись выезжает из маски от конца линии; до старта её нет, после — без клипа (тень цела) */}
      {reveal <= 0 ? null : (
      <div
        style={{
          position: "absolute",
          top: end.y,
          ...(right ? { left: end.x + 10 } : { right: `calc(100% - ${end.x - 10}px)` }),
          transform: "translateY(-50%)",
          clipPath: reveal >= 1 ? undefined : right ? `inset(-40% ${((1 - reveal) * 100).toFixed(2)}% -40% 0%)` : `inset(-40% 0% -40% ${((1 - reveal) * 100).toFixed(2)}%)`,
        }}
      >
        <div
          style={{
            padding: `${Math.round(px * 0.42)}px ${Math.round(px * 0.8)}px`,
            borderRadius: radius(s, 1),
            background: surfaceAt(s, 3),
            boxShadow: `${shadow(s, 2)}, inset 0 0 0 1.5px ${alpha(color, 0.55)}`,
            color: s.palette.text,
            fontFamily: fontFamily(s.typography.body),
            fontWeight: 600,
            fontSize: px,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            transform: `translateX(${(dx * (1 - lab) * -24).toFixed(2)}px)`,
          }}
        >
          {label}
        </div>
      </div>
      )}
    </div>
  );
}
