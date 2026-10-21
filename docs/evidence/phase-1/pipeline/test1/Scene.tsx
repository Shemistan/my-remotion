import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
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
  easingOf,
  lineChartHead,
  mix,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Box = { x: number; y: number; w: number; h: number };
type Point = { label: string; value: number };

type Content = {
  title: string;
  hero: { from: number; to: number; locale: "ru" | "en" };
  sub: string;
  chart: { width: number; height: number; yTicks: number; points: Point[] };
  layout: { title: Box; hero: Box; sub: Box; chart: Box };
  emphasis_spread: number;
  particles: { count: number; seed: string };
  background_beat: Beat;
  camera: React.ComponentProps<typeof Camera>["keys"];
};

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: Content;
};

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} missing`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const SceneBody: React.FC<{ beats: TimedBeat[]; content: Content }> = ({ beats, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const style = useStyle();
  const rect = useSafeArea();

  const bTitle = beatOf(beats, "b-title-in");
  const bNumberIn = beatOf(beats, "b-number-in");
  const bChart = beatOf(beats, "b-chart");
  const bEndpoint = beatOf(beats, "b-endpoint");
  const bFinal = beatOf(beats, "b-final-emphasis");
  const bSub = beatOf(beats, "b-sub-in");

  const { chart, layout } = content;
  const head = lineChartHead(chart.points, bChart, frame, {
    width: chart.width,
    height: chart.height,
    yTicks: chart.yTicks,
    frameHeight: height,
  });

  // Заголовок уступает герою: уходит в muted за exit_frames с началом финального акцента.
  const dim = interpolate(
    frame,
    [bFinal.start_frame, bFinal.start_frame + style.motion.exit_frames],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easingOf(style, "exit") },
  );
  const titleColor = mix(style.palette.text, style.palette.muted, dim);

  const place = (b: Box): React.CSSProperties => ({
    position: "absolute",
    left: b.x * rect.w,
    top: b.y * rect.h,
    width: b.w * rect.w,
  });

  return (
    <>
      <div style={place(layout.title)}>
        <KineticText
          text={content.title}
          beat={bTitle}
          mode="words"
          enter="rise"
          size="h2"
          font="display"
          weight={800}
          color={titleColor}
          maxWidth={layout.title.w * rect.w}
        />
      </div>

      <div style={{ ...place(layout.hero), display: "flex", justifyContent: "flex-end" }}>
        <Emphasis beat={bFinal} loop accentIndex={0} shape="pill" ring halo spread={content.emphasis_spread}>
          <AnimatedNumber
            from={content.hero.from}
            to={content.hero.to}
            value={head.value}
            beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
            enterAt={bNumberIn.start_frame}
            locale={content.hero.locale}
            size="display"
            font="display"
            align="right"
            reserveWidth
          />
        </Emphasis>
      </div>

      <div style={{ ...place(layout.sub), display: "flex", justifyContent: "flex-end" }}>
        <KineticText
          text={content.sub}
          beat={bSub}
          mode="words"
          enter="fade"
          size="body"
          color={style.palette.muted}
          align="right"
        />
      </div>

      <div style={place(layout.chart)}>
        <LineChart
          points={chart.points}
          beat={bChart}
          area
          callout={false}
          endpointEmphasis={{ beat: bEndpoint, loop: false }}
          width={chart.width}
          height={chart.height}
          locale={content.hero.locale}
          compact
          yTicks={chart.yTicks}
          accentIndex={0}
        />
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ content: Content }> = ({ content }) => {
  const style = useStyle();
  if (style.transparent) return null;
  return (
    <Parallax layer={0}>
      <Background beat={content.background_beat} variant="aurora" seed="growth" />
      <Particles
        count={content.particles.count}
        seed={content.particles.seed}
        beat={content.background_beat}
        layer={0}
      />
    </Parallax>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Camera keys={content.camera}>
      <Atmosphere content={content} />
      <Parallax layer={1}>
        <SafeArea>
          <SceneBody beats={timing.beats} content={content} />
        </SafeArea>
      </Parallax>
    </Camera>
  </StyleProvider>
);
