import React, { type ComponentProps } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  AnimatedNumber,
  Background,
  Camera,
  Emphasis,
  Enter,
  KineticText,
  LineChart,
  Parallax,
  Particles,
  SafeArea,
  StyleProvider,
  easingOf,
  lineChartHead,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type Locale = "ru" | "en";
type Point = { label: string; value: number };

type SceneContent = {
  kicker: { text: string; layout: Layout };
  hero: {
    from: number;
    to: number;
    locale: Locale;
    enterAt: number;
    layout: Layout;
    emphasis: { accentIndex: number; loop: boolean; spread: number };
  };
  subtitle: { text: string; layout: Layout };
  chart: {
    points: Point[];
    locale: Locale;
    compact: boolean;
    yTicks: number;
    accentIndex: number;
    width: number;
    height: number;
    dim_opacity: number;
    layout: Layout;
  };
  camera: ComponentProps<typeof Camera>["keys"];
};

type SceneProps = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: ComponentProps<typeof StyleProvider>["style"];
  content: SceneContent;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) {
    throw new Error(`Нет бита ${id} в props.timing.beats`);
  }
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const Content: React.FC<{ timing: SceneProps["timing"]; content: SceneContent }> = ({
  timing,
  content,
}) => {
  const frame = useCurrentFrame();
  const s = useStyle();
  const rect = useSafeArea();

  const bKicker = beatOf(timing.beats, "b-kicker-in");
  const bChart = beatOf(timing.beats, "b-chart");
  const bSubtitle = beatOf(timing.beats, "b-subtitle-in");
  const bDim = beatOf(timing.beats, "b-chart-dim");
  const bEmphasis = beatOf(timing.beats, "b-final-emphasis");

  const { kicker, hero, subtitle, chart } = content;

  // Число и голова линии — одно движение: счёт берёт значение под головой.
  const head = lineChartHead(chart.points, bChart, frame, {
    width: chart.width,
    height: chart.height,
    yTicks: chart.yTicks,
    frameHeight: 1080,
  });

  const dim = interpolate(frame, [bDim.start_frame, bDim.end_frame], [1, chart.dim_opacity], {
    ...CLAMP,
    easing: easingOf(s, "exit"),
  });

  const place = (l: Layout): React.CSSProperties => ({
    position: "absolute",
    left: l.x * rect.w,
    top: l.y * rect.h,
    width: l.w * rect.w,
  });

  return (
    <>
      <div style={place(kicker.layout)}>
        <KineticText
          text={kicker.text}
          beat={bKicker}
          mode="letters"
          enter="type"
          size="body"
          color={s.palette.muted}
          align="left"
        />
      </div>

      <div style={place(hero.layout)}>
        <Emphasis
          beat={bEmphasis}
          loop={hero.emphasis.loop}
          accentIndex={hero.emphasis.accentIndex}
          shape="pill"
          spread={hero.emphasis.spread}
        >
          <AnimatedNumber
            from={hero.from}
            to={hero.to}
            value={head.value}
            beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
            enterAt={hero.enterAt}
            locale={hero.locale}
            size="display"
            font="display"
            align="left"
            reserveWidth
          />
        </Emphasis>
      </div>

      <div style={place(subtitle.layout)}>
        <Enter kind="blur" beat={bSubtitle}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: s.typography.display.weight,
              fontSize: typeSize(s, "h2", 1080),
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.text,
              lineHeight: 1.1,
            }}
          >
            {subtitle.text}
          </div>
        </Enter>
      </div>

      <div style={{ ...place(chart.layout), opacity: dim }}>
        <LineChart
          points={chart.points}
          beat={bChart}
          area
          callout={false}
          endpointEmphasis={false}
          locale={chart.locale}
          compact={chart.compact}
          yTicks={chart.yTicks}
          accentIndex={chart.accentIndex}
          width={chart.width}
          height={chart.height}
        />
      </div>
    </>
  );
};

const Stage: React.FC<{ timing: SceneProps["timing"]; content: SceneContent }> = ({
  timing,
  content,
}) => {
  const s = useStyle();
  const bKicker = beatOf(timing.beats, "b-kicker-in");

  return (
    <AbsoluteFill>
      <Camera keys={content.camera}>
        <Parallax layer={0}>
          {s.transparent ? null : <Background seed="million" />}
          <Particles
            count={60}
            seed="dust"
            beat={{ start_frame: 0, end_frame: bKicker.end_frame }}
            layer={0}
          />
        </Parallax>
        <Parallax layer={1}>
          <SafeArea>
            <Content timing={timing} content={content} />
          </SafeArea>
        </Parallax>
      </Camera>
    </AbsoluteFill>
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Stage timing={timing} content={content} />
  </StyleProvider>
);
