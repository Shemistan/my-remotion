// Заголовок сцены по режиму (composition.title_mode): полоса h2 сверху — только один из
// вариантов. `none` — без заголовка (смысл несёт сцена), `kicker` — тихая рубрика в углу,
// `statement` — утверждение крупно в потоке раскладки («В 24 раза чаще»), `integrated` —
// заголовок у героя (в потоке, где его поставит сцена), `strip` — классическая полоса h2.
import type { Beat } from "@ms/contracts";
import type { CSSProperties } from "react";
import { useVideoConfig } from "remotion";
import { frames } from "../easing.js";
import { type TypeLevel, sizePx } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { accent, fontFamily, tracking } from "../tokens.js";
import { Enter } from "./Enter.js";
import { KineticText } from "./KineticText.js";

export type TitleMode = "none" | "kicker" | "statement" | "integrated" | "strip";

export interface SceneTitleProps {
  mode: TitleMode;
  /** Заголовок или утверждение. */
  text?: string;
  /** Рубрика над заголовком (капсом, моноширинно): «КЭШ · 2 ЗАПРОСА». */
  kicker?: string;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Слова, выделенные акцентом (statement / integrated). */
  highlight?: string[];
  align?: "left" | "center" | "right";
  /** Кегль заголовка (по умолчанию: statement — h1, integrated и strip — h2). */
  size?: TypeLevel | number;
  maxWidth?: number | string;
  style?: CSSProperties;
}

/** Позиционирование режима: strip и kicker — в углу безопасной зоны, остальные — в потоке. */
export const TITLE_IN_FLOW: Readonly<Record<TitleMode, boolean>> = { none: false, kicker: false, strip: false, statement: true, integrated: true };

export function SceneTitle({ mode, text, kicker, beat, highlight, align = "left", size, maxWidth, style }: SceneTitleProps) {
  const s = useStyle();
  const { height } = useVideoConfig();
  if (mode === "none") return null;
  const kick = kicker ? (
    <KineticText text={kicker} beat={{ start_frame: beat.start_frame, end_frame: beat.start_frame + frames(s, 18) }} mode="letters" enter="type" size="caption" font="mono" caps color={accent(s, 0)} align={align} pre="dim" />
  ) : null;
  // заголовок входит после рубрики (если она есть): сначала контекст, потом мысль
  const t0 = kicker ? beat.start_frame + frames(s, 8) : beat.start_frame;
  const head = { start_frame: t0, end_frame: Math.max(t0 + 1, beat.end_frame) };
  const corner: CSSProperties = { position: "absolute", top: 0, left: align === "right" ? undefined : 0, right: align === "right" ? 0 : undefined, display: "flex", flexDirection: "column", gap: 10, alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start", ...style };

  if (mode === "kicker") {
    return (
      <div style={corner}>
        {kick ?? (text ? <KineticText text={text} beat={beat} mode="letters" enter="type" size="caption" font="mono" caps color={accent(s, 0)} align={align} pre="dim" /> : null)}
        {kick && text ? <KineticText text={text} beat={head} mode="words" enter="fade" size="body" color={s.palette.muted} align={align} maxWidth={maxWidth} /> : null}
      </div>
    );
  }
  if (mode === "strip") {
    return (
      <div style={corner}>
        {kick}
        {text ? (
          <Enter kind="mask" beat={head}>
            <div style={{ fontFamily: fontFamily(s.typography.display), fontWeight: s.typography.display.weight ?? 700, fontSize: sizePx(s, size ?? "h2", height), lineHeight: 1.1, letterSpacing: `${tracking(s, "display")}em`, color: s.palette.text, textAlign: align, maxWidth }}>
              {text}
            </div>
          </Enter>
        ) : null}
      </div>
    );
  }
  // statement / integrated — в потоке раскладки: сцена ставит их, где нужно (у героя)
  // зазор рубрика → утверждение: подъём слов с перелётом не заходит на рубрику
  const flow: CSSProperties = { display: "flex", flexDirection: "column", gap: Math.round((40 * height) / 1080), alignItems: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start", ...style };
  return (
    <div style={flow}>
      {kick}
      {text ? <KineticText text={text} beat={head} mode="words" enter="rise" size={size ?? (mode === "statement" ? "h1" : "h2")} highlight={highlight} align={align} maxWidth={maxWidth} /> : null}
    </div>
  );
}
