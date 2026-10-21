import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Emphasis,
  Enter,
  LineChart,
  Particles,
  SafeArea,
  StyleProvider,
  accent,
  easingOf,
  lineChartHead,
  mix,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimingBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type Point = { label: string; value: number };

type SceneContent = {
  title: string;
  headline: { text: string; weight: number; layout: Layout };
  number: {
    from: number;
    to: number;
    locale: "ru" | "en";
    emphasis: { accentIndex: number; spread: number; loop: boolean };
    layout: Layout;
  };
  chart: {
    points: Point[];
    locale: "ru" | "en";
    compact: boolean;
    yTicks: number;
    accentIndex: number;
    dimmed_opacity: number;
    layout: Layout;
  };
  particles: { count: number; seed: string; accentShare: number };
};

type SceneProps = {
  timing: { duration_frames: number; beats: TimingBeat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: SceneContent;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const beatOf = (beats: TimingBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) {
    throw new Error(`Нет бита ${id} в props.timing.beats`);
  }
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const SceneBody: React.FC<{ beats: TimingBeat[]; content: SceneContent }> = ({ beats, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();

  const headlineIn = beatOf(beats, "b-headline-in");
  const numberIn = beatOf(beats, "b-number-in");
  const chartDraw = beatOf(beats, "b-chart-draw");
  const finalEmphasis = beatOf(beats, "b-final-emphasis");

  const { headline, number, chart } = content;

  const chartW = chart.layout.w * rect.w;
  const chartH = chart.layout.h * rect.h;
  const head = lineChartHead(chart.points, chartDraw, frame, {
    width: chartW,
    height: chartH,
    yTicks: chart.yTicks,
    frameHeight: height,
  });

  // Финал: заголовок и график уступают герою за exit_frames от начала бита акцента.
  const recede = interpolate(
    frame,
    [finalEmphasis.start_frame, finalEmphasis.start_frame + s.motion.exit_frames],
    [0, 1],
    { ...CLAMP, easing: easingOf(s, "exit") },
  );
  // Число перекрашивается в акцент вместе с ударом Emphasis.
  const ignite = interpolate(
    frame,
    [finalEmphasis.start_frame, finalEmphasis.start_frame + s.motion.enter_frames],
    [0, 1],
    { ...CLAMP, easing: easingOf(s, "enter") },
  );

  const headlineColor = mix(s.palette.text, s.palette.muted, recede);
  const numberColor = mix(s.palette.text, accent(s, number.emphasis.accentIndex), ignite);
  const chartOpacity = interpolate(recede, [0, 1], [1, chart.dimmed_opacity], CLAMP);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: chart.layout.x * rect.w,
          top: chart.layout.y * rect.h,
          width: chartW,
          height: chartH,
          opacity: chartOpacity,
        }}
      >
        <LineChart
          points={chart.points}
          beat={chartDraw}
          width={chartW}
          height={chartH}
          area
          callout={false}
          endpointEmphasis={false}
          locale={chart.locale}
          compact={chart.compact}
          yTicks={chart.yTicks}
          accentIndex={chart.accentIndex}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: headline.layout.x * rect.w,
          top: headline.layout.y * rect.h,
          width: headline.layout.w * rect.w,
        }}
      >
        <Enter kind="mask" beat={headlineIn}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: headline.weight,
              fontSize: typeSize(s, "h2", height),
              letterSpacing: `${s.typography.tracking.display}em`,
              lineHeight: 1.15,
              color: headlineColor,
              textAlign: "left",
            }}
          >
            {headline.text}
          </div>
        </Enter>
      </div>

      <div
        style={{
          position: "absolute",
          left: number.layout.x * rect.w,
          top: number.layout.y * rect.h,
          width: number.layout.w * rect.w,
          height: number.layout.h * rect.h,
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <Emphasis
          beat={finalEmphasis}
          loop={number.emphasis.loop}
          accentIndex={number.emphasis.accentIndex}
          shape="pill"
          spread={number.emphasis.spread}
        >
          <AnimatedNumber
            from={number.from}
            to={number.to}
            value={head.value}
            beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
            enterAt={numberIn.start_frame}
            locale={number.locale}
            size="display"
            font="display"
            align="right"
            reserveWidth
            color={numberColor}
          />
        </Emphasis>
      </div>
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => {
  const headlineIn = beatOf(timing.beats, "b-headline-in");

  return (
    <StyleProvider style={style}>
      {/* при style.transparent Background не рисуется (kit) */}
      <Background beat={headlineIn} variant="aurora" seed="growth" />
      <Particles
        count={content.particles.count}
        seed={content.particles.seed}
        beat={headlineIn}
        layer={0}
        accentShare={content.particles.accentShare}
      />
      <SafeArea>
        <SceneBody beats={timing.beats} content={content} />
      </SafeArea>
    </StyleProvider>
  );
};
