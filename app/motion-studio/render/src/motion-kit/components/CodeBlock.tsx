// Блок кода: окно редактора поднимается, код набирается по токенам (не по буквам) —
// свежий токен вспыхивает, за ним идёт каретка. Номер строки проявляется, когда на ней
// появляется первый токен. После набора выделенные строки (`highlightLines`) получают
// полосу-подсветку, остальные приглушаются. Шрифт — mono из StyleBible, цвета подсветки —
// из палитры стиля.
import type { Beat } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Rect } from "../choreo/safe-area.js";
import { enterStyle } from "../choreo/enter.js";
import { typeRhythm } from "../choreo/rhythm.js";
import { type CodeLang, type TokenKind, caretLine as caretLineOf, codeLines, tokenizeCode, typedTokens } from "../code-tokens.js";
import { easingOf, frames, springAt } from "../easing.js";
import { ramp } from "../internal.js";
import { dimText } from "../style/halo.js";
import { floorText } from "../style/type-scale.js";
import { PosterGate } from "./Poster.js";
import { useStyle } from "../style.js";
import type { ResolvedStyle } from "../style/resolve.js";
import { accent, alpha, fontFamily, isDark, mix, radius, surfaceAt, tracking } from "../tokens.js";
import { cardSurface } from "./Card.js";

export interface CodeBlockProps {
  /** До входа (0.4.0): `silhouette` (по умолчанию) — каркас итогового вида (формы без текста, 30 %) с кадра 0 (кадр-постер); `hidden` — пусто. */
  pre?: "silhouette" | "hidden";
  code: string;
  lang: CodeLang;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Номера строк (с 1), которые подсвечиваются после набора. */
  highlightLines?: number[];
  /** Имя файла во вкладке окна. */
  title?: string;
  /** Ширина окна, px (по умолчанию 1100). */
  width?: number;
  /** Кегль кода, px (по умолчанию 30). */
  fontSize?: number;
  style?: CSSProperties;
}

/** Геометрия окна кода: общая для CodeBlock и codeLineRect. */
function codeMetrics(fontSize: number) {
  const lineH = Math.round(fontSize * 1.62);
  const header = Math.round(fontSize * 2.1);
  const padY = Math.round(fontSize * 0.9);
  const gutter = Math.round(fontSize * 2.6);
  return { lineH, header, padY, gutter, padX: Math.round(fontSize * 0.9) };
}

/** Ширина знака кода: у моноширинных шрифтов kit (JetBrains Mono) — 0.6 кегля, без трекинга. */
export const codeCharWidth = (fontSize: number) => fontSize * 0.6;

/**
 * Прямоугольник строки `line` (с 1) внутри CodeBlock, px от его левого верхнего угла —
 * цель для `Callout` или своей подсветки. `width`/`fontSize` — те же, что у блока.
 * `cols: [from, to)` — только знаки строки с from по to − 1 (с 0, отступ считается).
 */
export function codeLineRect(line: number, opts: { width?: number; fontSize?: number; cols?: [number, number] } = {}): Rect {
  const fs = opts.fontSize ?? 30;
  const m = codeMetrics(fs);
  const y = m.header + m.padY + (line - 1) * m.lineH;
  if (opts.cols) {
    const ch = codeCharWidth(fs);
    return { x: m.gutter + opts.cols[0] * ch, y, w: Math.max(0, opts.cols[1] - opts.cols[0]) * ch, h: m.lineH };
  }
  return { x: m.gutter, y, w: (opts.width ?? 1100) - m.gutter - m.padX, h: m.lineH };
}

function tokenColor(s: ResolvedStyle, kind: TokenKind): string {
  const dark = isDark(s);
  switch (kind) {
    case "kw":
      return accent(s, 0);
    case "str":
      return accent(s, 1);
    case "num":
      return accent(s, 2);
    case "com":
      return mix(s.palette.muted, s.palette.bg, dark ? 0.15 : 0.1);
    case "punct":
      return mix(s.palette.text, s.palette.muted, 0.55);
    default:
      return s.palette.text;
  }
}

/** Окна: окно 0–12 %, набор 10–70 %, подсветка строк с 74 % бита. */
function windows(beat: Pick<Beat, "start_frame" | "end_frame">) {
  const b0 = beat.start_frame;
  const L = Math.max(1, beat.end_frame - b0);
  return { b0, typeStart: b0 + L * 0.1, typeEnd: b0 + L * 0.7, focus: b0 + L * 0.74 };
}

/** CodeBlock с кадром-постером до бита (PosterGate). */
export function CodeBlock(props: CodeBlockProps) {
  return <PosterGate pre={props.pre} beat={props.beat} render={(css, underlay) => <CodeBlockBody {...props} posterCss={css} underlay={underlay} />} />;
}

function CodeBlockBody({ code, lang, beat, highlightLines = [], title, width = 1100, fontSize = 30, style, posterCss, underlay }: CodeBlockProps & { posterCss?: CSSProperties; underlay?: ReactNode }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const dark = isDark(s);
  const m = codeMetrics(fontSize);
  const w = windows(beat);
  const tokens = tokenizeCode(code.replace(/\n+$/, ""), lang);
  const lineCount = code.replace(/\n+$/, "").split("\n").length;
  const height = m.header + m.padY * 2 + lineCount * m.lineH;

  // набор по токенам: ровный темп, как поток; вспышка свежих токенов — по их кадру появления
  const typedAt = (f: number) => typedTokens(tokens, ramp(f, w.typeStart, w.typeEnd)).length;
  const count = typedAt(frame);
  const age = new Map<number, number>();
  for (let k = 1; k <= 4; k++) {
    const before = typedAt(frame - k);
    for (let i = before; i < count; i++) if (!age.has(i)) age.set(i, k - 1);
  }
  const done = frame >= w.typeEnd;
  const { blink } = typeRhythm(s, { chars: 1, len: 1 });
  const caretOn = frame >= w.typeStart && frame < beat.end_frame && (!done || Math.floor((frame - w.typeEnd) / blink) % 2 === 0);

  const enter = springAt(frame, fps, s, w.b0, "soft");
  const win = enterStyle("rise", enter, { amplitude: s.amplitude, distancePx: 60 });
  const focus = highlightLines.length > 0 ? ramp(frame, w.focus, w.focus + frames(s, 16), easingOf(s, "enter")) : 0;
  const hot = new Set(highlightLines);

  // токены по строкам: многострочные (docstring, JSDoc, шаблонные строки) режутся на куски
  // с тем же idx — номера строк, подсветка и каретка не съезжают
  const lines = codeLines(tokens);
  const caretLine = caretLineOf(tokens, count);

  const mono = fontFamily(s.typography.mono);
  const caret = (
    <span style={{ position: "relative", display: "inline-block", width: 0, height: "1em", verticalAlign: "-0.15em" }}>
      <span style={{ position: "absolute", left: 1, top: 0, width: "0.55em", height: "1.15em", background: alpha(accent(s, 0), 0.85), boxShadow: `0 0 14px ${alpha(accent(s, 0), 0.6)}`, opacity: caretOn ? 1 : 0, borderRadius: 2 }} />
    </span>
  );

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        ...cardSurface(s, 2),
        borderRadius: radius(s, 2),
        overflow: "hidden",
        ...win,
        ...style,
        ...posterCss,
      }}
    >
      {underlay}
      {/* шапка окна */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: m.header, padding: `0 ${m.padX}px`, boxSizing: "border-box", background: alpha(dark ? "#000000" : s.palette.text, dark ? 0.18 : 0.03), boxShadow: `inset 0 -1px 0 ${alpha(s.palette.text, 0.07)}` }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 13, height: 13, borderRadius: "50%", background: alpha(s.palette.text, [0.22, 0.14, 0.09][i]!) }} />
        ))}
        {title ? (
          <span
            style={{
              marginLeft: 18,
              padding: "6px 14px",
              borderRadius: radius(s, 0),
              background: surfaceAt(s, 3),
              boxShadow: `inset 0 -2px 0 ${accent(s, 0)}`,
              fontFamily: mono,
              fontSize: floorText(Math.round(fontSize * 0.62), frameH),
              color: s.palette.muted,
              letterSpacing: `${tracking(s, "mono")}em`,
            }}
          >
            {title}
          </span>
        ) : null}
      </div>

      {/* полосы подсветки строк: выезжают слева после набора */}
      {lines.map((_, li) =>
        hot.has(li + 1) && focus > 0 ? (
          <div
            key={`hl${li}`}
            style={{
              position: "absolute",
              left: 0,
              top: m.header + m.padY + li * m.lineH,
              height: m.lineH,
              width: `${(focus * 100).toFixed(2)}%`,
              background: `linear-gradient(90deg, ${alpha(accent(s, 0), dark ? 0.24 : 0.14)}, ${alpha(accent(s, 0), dark ? 0.08 : 0.05)})`,
              boxShadow: `inset 3px 0 0 ${accent(s, 0)}`,
            }}
          />
        ) : null,
      )}

      <div style={{ position: "relative", padding: `${m.padY}px ${m.padX}px ${m.padY}px 0`, fontFamily: mono, fontSize, lineHeight: `${m.lineH}px`, letterSpacing: 0, whiteSpace: "pre" }}>
        {lines.map((line, li) => {
          const started = line.some((t) => t.idx < count) || li <= caretLine;
          const dim = hot.size > 0 && !hot.has(li + 1) ? focus : 0;
          const numP = started ? 1 : 0;
          // приглушение строк вне фокуса: в transparent — цветом токенов (ореол не гаснет), иначе opacity строки
          const lineDim = (c: string) => dimText(s, c, dim * 0.6);
          return (
            <div key={li} style={{ display: "flex", height: m.lineH, opacity: lineDim(s.palette.text).opacity }}>
              <span style={{ width: m.gutter, flex: "none", paddingRight: Math.round(fontSize * 0.9), boxSizing: "border-box", textAlign: "right", color: hot.has(li + 1) && focus > 0 ? mix(s.palette.muted, accent(s, 0), focus) : alpha(lineDim(s.palette.muted).color, 0.55), opacity: numP, fontVariantNumeric: "tabular-nums" }}>
                {li + 1}
              </span>
              <span>
                {line.map(({ text, kind, idx }, fi) => {
                  if (idx >= count) return null;
                  const a = age.get(idx);
                  const flash = a === undefined ? 0 : 1 - a / 4;
                  const c = lineDim(tokenColor(s, kind)).color;
                  return (
                    <span key={`${idx}-${fi}`} style={{ color: flash > 0 ? mix(c, "#ffffff", 0.45 * flash) : c, textShadow: flash > 0 && kind !== "ws" ? `0 0 ${(12 * flash).toFixed(1)}px ${alpha(c, 0.8 * flash)}` : undefined }}>
                      {text}
                    </span>
                  );
                })}
                {li === caretLine && frame >= w.typeStart ? caret : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
