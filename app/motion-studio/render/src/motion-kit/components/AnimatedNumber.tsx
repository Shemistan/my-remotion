// Счётчик: значение идёт from → to по биту с торможением к концу (кривая enter стиля),
// цифры моноширинные, ширина блока зарезервирована под итоговое значение (ничего не
// «прыгает»). Вход — подъём из размытия, на финише — короткий акцентный «удар».
import type { Beat } from "@ms/contracts";
import type { CSSProperties } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { type PluralForms, formatNumber, pluralForm } from "../format.js";
import { CLAMP, clamp01, ramp } from "../internal.js";
import { useStyle } from "../style.js";
import { type TypeLevel, sizePx } from "../style/type-scale.js";
import { accent, alpha, fontFamily, mix, tracking } from "../tokens.js";

export interface AnimatedNumberProps {
  from: number;
  to: number;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  locale: "ru" | "en";
  prefix?: string;
  /** Подпись после числа; массив — формы по числу (ru: «релиз», «релиза», «релизов»; en: one, other), см. pluralForm. */
  suffix?: string | PluralForms;
  compact?: boolean;
  decimals?: number;
  /**
   * Уровень шкалы от высоты кадра (`display` | `h1` | `h2` | `body` | `caption`, как у
   * KineticText), шаг шкалы v0.1 (0..8) или кегль в px (> 8). По умолчанию 7 (120 px).
   */
  size?: TypeLevel | number;
  font?: "display" | "mono";
  /**
   * Держать ширину под итоговое значение (число не сдвигает соседей). По умолчанию —
   * да без prefix/suffix; с ними — нет, иначе между числом и подписью зияет пустота.
   */
  reserveWidth?: boolean;
  /** Цвет цифр; по умолчанию текст, на финише — вспышка акцента. */
  color?: string;
  align?: "left" | "center" | "right";
  style?: CSSProperties;
  /**
   * Внешнее значение вместо собственного счёта — привязка к другому источнику движения
   * (например `lineChartHead(...).value`). Удар на финише остаётся в `end_frame`.
   */
  value?: number;
  /**
   * Кадр входа числа, если он раньше бита счёта: число появляется со значением `from` и
   * держит его до начала счёта (зритель читает «от»). По умолчанию — начало `beat`.
   */
  enterAt?: number;
  /**
   * Микро-удар 0..1 на шаге счётчика событий (`useArrivalCount(...).pop`): число
   * подпрыгивает масштабом и вспыхивает акцентом на каждом приходе импульса.
   */
  pop?: number;
}

export function AnimatedNumber({ from, to, beat, locale, prefix, suffix, compact, decimals, size = 7, font = "display", color, align = "left", reserveWidth, style, value: bound, enterAt, pop = 0 }: AnimatedNumberProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const ref = s.typography[font];
  const px = sizePx(s, size, height);
  const { start_frame: b0, end_frame: b1 } = beat;
  const ease = EASE.count;

  // счёт идёт до конца бита; вход занимает его начало и идёт параллельно
  const countStart = b0 + Math.max(0, Math.min(6, (b1 - b0) * 0.1));
  // ramp: бит нулевой длины — ступенька, а не исключение interpolate
  const span = to - from || 1;
  const p = bound !== undefined ? clamp01((bound - from) / span) : ramp(frame, countStart, b1, ease);
  // при внешнем значении скорость не знаем — смаз цифр не рисуем
  const pPrev = bound !== undefined ? p : ramp(frame - 1, countStart, b1, ease);
  const value = bound ?? from + (to - from) * p;
  const fmt = { locale, compact, decimals };
  const text = formatNumber(value, fmt);
  const suf = suffix === undefined || typeof suffix === "string" ? suffix : pluralForm(value, suffix, fmt);
  const ghost = formatNumber(Math.abs(to) >= Math.abs(from) ? to : from, fmt);

  const enter = springAt(frame, fps, s, Math.min(enterAt ?? b0, b0), "snappy");
  // «смаз» цифр при быстром счёте (не больше 1.5 px, к финишу исчезает) и размытие входа
  const speedBlur = Math.min(1.5, Math.abs(p - pPrev) * 60);
  const enterBlur = (1 - clamp01(enter)) * 12;
  const reserve = reserveWidth ?? (!prefix && !suffix);
  const digitBlur = speedBlur > 0.05 ? `blur(${speedBlur.toFixed(2)}px)` : undefined;
  // удар на финише: короткий всплеск масштаба и свечения
  const hit = frame >= b1 ? interpolate(frame, [b1, b1 + frames(s, 10), b1 + frames(s, 26)], [0, 1, 0], CLAMP) : 0;
  // удар на шаге события (pop) и на финише — сильнейший из двух
  const kick = Math.max(hit, clamp01(pop));
  const glow = alpha(accent(s, 0), 0.55 * kick);
  const affix: CSSProperties = { fontSize: "0.5em", fontWeight: s.typography.body.weight ?? 500, color: s.palette.muted, letterSpacing: 0 };

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "0.12em",
        fontFamily: fontFamily(ref),
        fontWeight: ref.weight ?? 800,
        fontSize: px,
        lineHeight: 1,
        letterSpacing: `${tracking(s, "display")}em`,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        color: pop > 0.01 ? mix(color ?? s.palette.text, accent(s, 0), 0.5 * clamp01(pop)) : (color ?? s.palette.text),
        opacity: clamp01(enter * 1.6),
        transform: `translateY(${((1 - enter) * 0.35 * px).toFixed(2)}px) scale(${(1 + 0.045 * hit + 0.06 * clamp01(pop) * s.amplitude).toFixed(4)})`,
        transformOrigin: align === "right" ? "100% 70%" : align === "center" ? "50% 70%" : "0% 70%",
        filter: enterBlur > 0.05 ? `blur(${enterBlur.toFixed(2)}px)` : undefined,
        textShadow: kick > 0 ? `0 0 ${(0.3 * px).toFixed(1)}px ${glow}` : undefined,
        ...style,
      }}
    >
      {prefix ? <span style={affix}>{prefix}</span> : null}
      {reserve ? (
        // призрак итогового значения держит ширину; видимое число — в той же ячейке
        <span style={{ display: "inline-grid" }}>
          <span style={{ gridArea: "1 / 1", visibility: "hidden" }}>{ghost}</span>
          <span style={{ gridArea: "1 / 1", justifySelf: align === "left" ? "start" : align === "right" ? "end" : "center", filter: digitBlur }}>{text}</span>
        </span>
      ) : (
        <span style={{ filter: digitBlur }}>{text}</span>
      )}
      {suf ? <span style={affix}>{suf}</span> : null}
    </div>
  );
}
