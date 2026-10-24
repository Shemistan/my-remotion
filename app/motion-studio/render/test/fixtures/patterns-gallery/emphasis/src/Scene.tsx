// Галерея паттернов: акцент на главной мысли — Highlight трёх видов (marker, underline,
// glow) в крупной фразе, частицы двух слоёв глубины за текстом. Вариант `third: "emphasis"`
// — третья строка с <Emphasis> на словах (свечение за текстом не размывает слово).
import { Background, Emphasis, Enter, Highlight, KineticText, Particles, SafeArea, StyleProvider, fontFamily, typeSize, useStyle, type ResolveStyleInput } from "@ms/motion-kit";
import { useVideoConfig } from "remotion";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  content?: { third?: "highlight" | "emphasis" };
}

function Statement({ b, third }: { b: Record<string, Window>; third: "highlight" | "emphasis" }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  const big = { fontFamily: fontFamily(s.typography.display), fontWeight: s.typography.display.weight, fontSize: typeSize(s, "display", height), lineHeight: 1.08, letterSpacing: "-0.035em", color: s.palette.text } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Enter kind="mask" pre="silhouette" beat={b.line1!}>
        <div style={big}>Анимация должна</div>
      </Enter>
      <Enter kind="mask" pre="silhouette" beat={b.line2!}>
        <div style={big}>
          <Highlight beat={b.marker!} mode="marker" seed="explain">объяснять</Highlight>, а не{" "}
          <Highlight beat={b.underline!} mode="underline" accentIndex={1} seed="decorate">украшать</Highlight>
        </div>
      </Enter>
      <Enter kind="rise" pre="silhouette" beat={b.line3!} style={{ marginTop: 36 }}>
        <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 500, fontSize: typeSize(s, "h2", height), color: s.palette.muted }}>
          {third === "emphasis" ? (
            <Emphasis beat={b.glow!} accentIndex={2}>
              <span style={{ color: s.palette.text }}>Одна мысль</span>
            </Emphasis>
          ) : (
            <Highlight beat={b.glow!} mode="glow" accentIndex={2}>Одна мысль</Highlight>
          )}{" "}
          — один кадр
        </div>
      </Enter>
    </div>
  );
}

export const Scene = ({ timing, style, content }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="emphasis" />
      <Particles count={70} seed="dust" beat={b.particles!} layer={0} />
      <Particles count={10} seed="bokeh" beat={b.particles!} layer={2} accentShare={0.6} />
      <SafeArea style={{ justifyContent: "center", gap: 40 }}>
        <KineticText text="Главная мысль" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
        <Statement b={b} third={content?.third ?? "highlight"} />
      </SafeArea>
    </StyleProvider>
  );
};
