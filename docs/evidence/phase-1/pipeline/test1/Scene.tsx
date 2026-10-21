import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Camera,
  Emphasis,
  KineticText,
  LineChart,
  Parallax,
  Particles,
  SafeArea,
  StyleProvider,
  lineChartHead,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type Level = "display" | "h1" | "h2" | "body" | "caption";
type Point = { label: string; value: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };

type Content = {
  headline: { text: string; size: Level; layout: Layout };
  hero: {
    from: number;
    to: number;
    locale: "ru" | "en";
    size: Level;
    emphasis: {
      accentIndex: number;
      loop: boolean;
      shape: "pill" | "rounded" | "circle";
      ring: boolean;
      halo: boolean;
      spread: number;
    };
    layout: Layout;
  };
  ratio_note: { text: string; size: Level; layout: Layout };
  chart: {
    points: Point[];
    width: number;
    height: number;
    area: boolean;
    locale: "ru" | "en";
    compact: boolean;
    yTicks: number;
    accentIndex: number;
    layout: Layout;
  };
  background: { particles: number; seed: string };
  camera: CameraKey[];
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: {
    preset: "dark-premium" | "light-clean" | "tech-neon";
    intensity: "calm" | "balanced" | "energetic";
    depth?: 0 | 1 | 2 | 3;
    transparent?: boolean;
    safe_area?: { x: number; y: number };
    font?: string;
  };
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Beat "${id}" not found in props.timing.beats`);
  return b;
};

const SceneContent: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const frame = useCurrentFrame();
  const s = useStyle();
  const { height } = useVideoConfig();
  const rect = useSafeArea();

  const bHeadline = beatOf(beats, "b-headline-in");
  const bNumberIn = beatOf(beats, "b-number-in");
  const bChart = beatOf(beats, "b-chart-draw");
  const bRatio = beatOf(beats, "b-ratio-in");
  const bFinal = beatOf(beats, "b-final-emphasis");

  const { headline, hero, ratio_note: ratio, chart } = content;
  const chartW = Math.min(chart.width, chart.layout.w * rect.w);
  const chartH = Math.min(chart.height, chart.layout.h * rect.h);

  // Герой-число ведёт ту же величину, что и голова линии.
  const head = lineChartHead(chart.points, bChart, frame, {
    width: chartW,
    height: chartH,
    yTicks: chart.yTicks,
    frameHeight: height,
  });

  const place = (l: Layout): React.CSSProperties => ({
    position: "absolute",
    left: l.x * rect.w,
    top: l.y * rect.h,
    width: l.w * rect.w,
  });

  return (
    <>
      <div style={place(headline.layout)}>
        <KineticText
          text={headline.text}
          beat={bHeadline}
          mode="words"
          enter="rise"
          size={headline.size}
          align="left"
        />
      </div>

      <div style={{ ...place(hero.layout), height: hero.layout.h * rect.h, display: "flex", alignItems: "center" }}>
        <Emphasis
          beat={bFinal}
          loop={hero.emphasis.loop}
          accentIndex={hero.emphasis.accentIndex}
          shape={hero.emphasis.shape}
          ring={hero.emphasis.ring}
          halo={hero.emphasis.halo}
          spread={hero.emphasis.spread}
        >
          <AnimatedNumber
            from={hero.from}
            to={hero.to}
            value={head.value}
            beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
            enterAt={bNumberIn.start_frame}
            locale={hero.locale}
            size={hero.size}
            font="display"
            align="left"
            reserveWidth
          />
        </Emphasis>
      </div>

      <div style={place(ratio.layout)}>
        <KineticText
          text={ratio.text}
          beat={bRatio}
          mode="words"
          enter="fade"
          size={ratio.size}
          font="body"
          align="right"
          color={s.palette.muted}
          maxWidth={ratio.layout.w * rect.w}
        />
      </div>

      <div style={place(chart.layout)}>
        <LineChart
          points={chart.points}
          beat={bChart}
          area={chart.area}
          callout={false}
          endpointEmphasis={false}
          width={chartW}
          height={chartH}
          locale={chart.locale}
          compact={chart.compact}
          yTicks={chart.yTicks}
          accentIndex={chart.accentIndex}
        />
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const bHeadline = beatOf(timing.beats, "b-headline-in");
  const bChart = beatOf(timing.beats, "b-chart-draw");
  return (
    <StyleProvider style={style}>
      <AbsoluteFill>
        <Camera keys={content.camera}>
          {style.transparent ? null : (
            <Parallax layer={0}>
              <Background beat={{ start_frame: 0, end_frame: bHeadline.end_frame }} seed={content.background.seed} />
              <Particles
                count={content.background.particles}
                seed={content.background.seed}
                beat={{ start_frame: 0, end_frame: bChart.start_frame }}
                layer={0}
                accentShare={0.2}
              />
            </Parallax>
          )}
          <Parallax layer={1}>
            <SafeArea>
              <SceneContent beats={timing.beats} content={content} />
            </SafeArea>
          </Parallax>
        </Camera>
      </AbsoluteFill>
    </StyleProvider>
  );
};
