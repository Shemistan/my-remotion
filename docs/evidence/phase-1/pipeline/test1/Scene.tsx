import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Camera,
  Enter,
  LineChart,
  Parallax,
  Particles,
  SafeArea,
  StyleProvider,
  alpha,
  accent,
  beatProgress,
  easingOf,
  fpsFrames,
  lineChartHead,
  resolveStyle,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Point = { label: string; value: number };
type Box = { x: number; y: number; w: number; h: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };

type SceneContent = {
  title: string;
  subtitle: string;
  subtitle_dim_to_opacity: number;
  hero: { from: number; to: number; locale: "ru" | "en" };
  chart: { yTicks: number; compact: boolean; accentIndex: number };
  points: Point[];
  layout: { title: Box; subtitle: Box; hero: Box; chart: Box };
  camera: CameraKey[];
};

// Тип props.style — ровно вход resolveStyle (без fps: его подставляет StyleProvider).
type SceneStyle = Omit<Parameters<typeof resolveStyle>[0], "fps">;

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: SceneContent;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Нет бита «${id}» в props.timing.beats`);
  return b;
};

const Content: React.FC<{ beats: Beat[]; content: SceneContent }> = ({ beats, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const style = useStyle();
  const rect = useSafeArea();

  const titleIn = beatOf(beats, "title-in");
  const numberIn = beatOf(beats, "number-in");
  const subtitleIn = beatOf(beats, "subtitle-in");
  const chartDraw = beatOf(beats, "chart-draw");
  const emphasis = beatOf(beats, "final-emphasis");
  const hold = beatOf(beats, "hold");

  const { layout } = content;
  const chartW = Math.round(layout.chart.w * rect.w);
  const chartH = Math.round(layout.chart.h * rect.h);

  // Счётчик — от головы линии: один источник движения.
  const head = lineChartHead(content.points, chartDraw, frame, {
    width: chartW,
    height: chartH,
    yTicks: content.chart.yTicks,
    frameHeight: height,
  });

  // После удара подзаголовок уходит в приглушённый тон.
  const dim = beatProgress(
    frame,
    { start_frame: emphasis.start_frame + style.motion.stagger_frames, end_frame: emphasis.end_frame },
    easingOf(style, "exit"),
  );
  const subtitleOpacity = 1 - (1 - content.subtitle_dim_to_opacity) * dim;

  // Hold: число дышит масштабом и свечением accent[0].
  const ramp = beatProgress(
    frame,
    { start_frame: hold.start_frame, end_frame: hold.start_frame + style.motion.enter_frames },
    easingOf(style, "enter"),
  );
  const period = fpsFrames(style, 36);
  const wave = frame >= hold.start_frame ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (frame - hold.start_frame)) / period) : 0;
  const breathScale = 1 + 0.03 * wave * ramp;
  const glow = (0.4 + 0.4 * wave) * ramp;

  const titleSize = typeSize(style, "h2", height);
  const subtitleSize = typeSize(style, "body", height);
  const glowPad = Math.round(subtitleSize * 0.8);

  const place = (b: Box): React.CSSProperties => ({
    position: "absolute",
    left: b.x * rect.w,
    top: b.y * rect.h,
    width: b.w * rect.w,
    height: b.h * rect.h,
  });

  return (
    <>
      <div style={{ ...place(layout.title), display: "flex", alignItems: "center" }}>
        <Enter kind="mask" beat={titleIn}>
          <div
            style={{
              fontFamily: style.typography.display.family,
              fontWeight: style.typography.display.weight,
              fontSize: titleSize,
              letterSpacing: `${style.typography.tracking.display}em`,
              lineHeight: 1.1,
              color: style.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {content.title}
          </div>
        </Enter>
      </div>

      <div style={{ ...place(layout.subtitle), display: "flex", alignItems: "center", opacity: subtitleOpacity }}>
        <Enter kind="blur" beat={subtitleIn}>
          <div
            style={{
              fontFamily: style.typography.body.family,
              fontWeight: style.typography.body.weight,
              fontSize: subtitleSize,
              letterSpacing: `${style.typography.tracking.body}em`,
              color: style.palette.muted,
              whiteSpace: "nowrap",
            }}
          >
            {content.subtitle}
          </div>
        </Enter>
      </div>

      <div style={{ ...place(layout.chart) }}>
        <LineChart
          points={content.points}
          beat={chartDraw}
          area
          highlightLast={false}
          width={chartW}
          height={chartH}
          locale={content.hero.locale}
          compact={content.chart.compact}
          accentIndex={content.chart.accentIndex}
          yTicks={content.chart.yTicks}
        />
      </div>

      <div style={{ ...place(layout.hero), display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <div
          style={{
            position: "relative",
            display: "inline-block",
            transform: `scale(${breathScale})`,
            transformOrigin: "50% 50%",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: -glowPad,
              borderRadius: style.surfaces.radius[3],
              background: `radial-gradient(closest-side, ${alpha(accent(style, 0), 0.32 * glow)} 0%, transparent 100%)`,
            }}
          />
          <div style={{ position: "relative" }}>
            <AnimatedNumber
              from={content.hero.from}
              to={content.hero.to}
              value={head.value}
              beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
              enterAt={numberIn.start_frame}
              locale={content.hero.locale}
              size={7}
              font="display"
              align="right"
              reserveWidth
            />
          </div>
        </div>
      </div>
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => {
  const titleIn = beatOf(timing.beats, "title-in");
  const chartDraw = beatOf(timing.beats, "chart-draw");
  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        {style.transparent ? null : (
          <Parallax layer={0}>
            <Background beat={titleIn} variant="aurora" seed="growth" />
          </Parallax>
        )}
        <Parallax layer={0}>
          <Particles count={60} seed="growth-dust" beat={chartDraw} layer={0} />
        </Parallax>
        <Parallax layer={1}>
          <SafeArea>
            <Content beats={timing.beats} content={content} />
          </SafeArea>
        </Parallax>
      </Camera>
    </StyleProvider>
  );
};
