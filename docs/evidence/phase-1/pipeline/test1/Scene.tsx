import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Camera,
  Emphasis,
  Enter,
  LineChart,
  Parallax,
  Particles,
  SafeArea,
  StyleProvider,
  lineChartHead,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type Point = { label: string; value: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };

type Content = {
  title: { text: string; layout: Layout };
  hero: {
    from: number;
    to: number;
    locale: "ru" | "en";
    spread: number;
    layout: Layout;
  };
  chart: {
    points: Point[];
    locale: "ru" | "en";
    yTicks: number;
    accentIndex: number;
    layout: Layout;
  };
  particles: { count: number; seed: string };
  camera: CameraKey[];
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((it) => it.id === id);
  if (!b) throw new Error(`Нет бита ${id}`);
  return b;
};

const Title: React.FC<{ text: string; layout: Layout; beat: Beat }> = ({ text, layout, beat }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const { height } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left: layout.x * rect.w, top: layout.y * rect.h, width: layout.w * rect.w }}>
      <Enter kind="mask" beat={beat}>
        <div
          style={{
            fontFamily: s.typography.display.family,
            fontWeight: 800,
            fontSize: typeSize(s, "h2", height),
            letterSpacing: `${s.typography.tracking.display}em`,
            lineHeight: 1.15,
            color: s.palette.text,
            textAlign: "left",
          }}
        >
          {text}
        </div>
      </Enter>
    </div>
  );
};

const Chart: React.FC<{ chart: Content["chart"]; beat: Beat }> = ({ chart, beat }) => {
  const rect = useSafeArea();
  const { layout } = chart;
  return (
    <div style={{ position: "absolute", left: layout.x * rect.w, top: layout.y * rect.h }}>
      <LineChart
        points={chart.points}
        beat={beat}
        area
        callout={false}
        endpointEmphasis={false}
        locale={chart.locale}
        compact
        yTicks={chart.yTicks}
        accentIndex={chart.accentIndex}
        width={Math.round(layout.w * rect.w)}
        height={Math.round(layout.h * rect.h)}
      />
    </div>
  );
};

const Hero: React.FC<{
  hero: Content["hero"];
  chart: Content["chart"];
  chartBeat: Beat;
  enterBeat: Beat;
  emphasisBeat: Beat;
}> = ({ hero, chart, chartBeat, enterBeat, emphasisBeat }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const rect = useSafeArea();
  // Число — значение под головой линии: один прогресс на график и счётчик.
  const head = lineChartHead(chart.points, chartBeat, frame, {
    width: Math.round(chart.layout.w * rect.w),
    height: Math.round(chart.layout.h * rect.h),
    yTicks: chart.yTicks,
    frameHeight: height,
  });
  const { layout } = hero;
  return (
    <div
      style={{
        position: "absolute",
        left: layout.x * rect.w,
        top: layout.y * rect.h,
        width: layout.w * rect.w,
        height: layout.h * rect.h,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
      }}
    >
      <Emphasis beat={emphasisBeat} loop shape="pill" accentIndex={0} spread={hero.spread}>
        <AnimatedNumber
          from={hero.from}
          to={hero.to}
          value={head.value}
          beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
          enterAt={enterBeat.start_frame}
          locale={hero.locale}
          size="display"
          font="display"
          align="right"
          reserveWidth
        />
      </Emphasis>
    </div>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const bTitle = beatOf(timing.beats, "b-title");
  const bNumberIn = beatOf(timing.beats, "b-number-in");
  const bChart = beatOf(timing.beats, "b-chart");
  const bEmphasis = beatOf(timing.beats, "b-emphasis");

  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        <Parallax layer={0}>
          {style.transparent ? null : <Background beat={bTitle} />}
          <AbsoluteFill>
            <Particles count={content.particles.count} seed={content.particles.seed} beat={bChart} layer={0} />
          </AbsoluteFill>
        </Parallax>
        <Parallax layer={1}>
          <SafeArea>
            <Title text={content.title.text} layout={content.title.layout} beat={bTitle} />
            <Chart chart={content.chart} beat={bChart} />
          </SafeArea>
        </Parallax>
        <Parallax layer={2}>
          <SafeArea>
            <Hero
              hero={content.hero}
              chart={content.chart}
              chartBeat={bChart}
              enterBeat={bNumberIn}
              emphasisBeat={bEmphasis}
            />
          </SafeArea>
        </Parallax>
      </Camera>
    </StyleProvider>
  );
};
