import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Emphasis,
  Enter,
  KineticText,
  LineChart,
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
type Locale = "ru" | "en";

type Content = {
  title: string;
  points: Point[];
  locale: Locale;
  kicker: { text: string; layout: Layout };
  headline: { text: string; layout: Layout };
  chart: { width: number; height: number; yTicks: number; accentIndex: number; compact: boolean; layout: Layout };
  hero: { from: number; to: number; spread: number; accentIndex: number; layout: Layout };
  start_mark: { text: string; layout: Layout };
  particles: { count: number; seed: string };
  background_seed: string;
  background_beat: { start_frame: number; end_frame: number };
};

// Тип стиля берём у StyleProvider: preset — id пресета из kit, а не произвольная строка.
type SceneStyle = React.ComponentProps<typeof StyleProvider>["style"];

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Нет бита ${id} в props.timing.beats`);
  return b;
};

const Body: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const safe = useSafeArea();

  const bKicker = beatOf(timing.beats, "b-kicker-in");
  const bHeadline = beatOf(timing.beats, "b-headline-in");
  const bHeroIn = beatOf(timing.beats, "b-hero-in");
  const bChart = beatOf(timing.beats, "b-chart");
  const bStartMark = beatOf(timing.beats, "b-start-mark-in");
  const bFinal = beatOf(timing.beats, "b-final-emphasis");

  const { chart, hero, kicker, headline, start_mark: startMark } = content;
  const head = lineChartHead(content.points, bChart, frame, {
    width: chart.width,
    height: chart.height,
    yTicks: chart.yTicks,
    frameHeight: height,
  });

  const box = (l: Layout): React.CSSProperties => ({
    position: "absolute",
    left: l.x * safe.w,
    top: l.y * safe.h,
    width: l.w * safe.w,
  });

  return (
    <>
      <div style={box(kicker.layout)}>
        <KineticText
          text={kicker.text}
          beat={bKicker}
          mode="letters"
          enter="type"
          size="caption"
          font="mono"
          caps
          color={s.palette.muted}
          maxWidth={kicker.layout.w * safe.w}
        />
      </div>

      <div style={box(headline.layout)}>
        <Enter kind="mask" beat={bHeadline}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: s.typography.display.weight,
              fontSize: typeSize(s, "h2", height),
              lineHeight: 1.1,
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.text,
              textAlign: "left",
              paddingBottom: "0.08em",
            }}
          >
            {headline.text}
          </div>
        </Enter>
      </div>

      <div style={{ ...box(chart.layout), height: chart.layout.h * safe.h }}>
        <LineChart
          points={content.points}
          beat={bChart}
          area
          callout={false}
          endpointEmphasis={false}
          width={chart.width}
          height={chart.height}
          locale={content.locale}
          compact={chart.compact}
          yTicks={chart.yTicks}
          accentIndex={chart.accentIndex}
        />
      </div>

      <div style={{ ...box(hero.layout), height: hero.layout.h * safe.h, display: "flex", justifyContent: "flex-end", alignItems: "flex-start" }}>
        <Emphasis beat={bFinal} loop shape="pill" ring spread={hero.spread} accentIndex={hero.accentIndex}>
          <AnimatedNumber
            from={hero.from}
            to={hero.to}
            value={head.value}
            beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
            enterAt={bHeroIn.start_frame}
            locale={content.locale}
            size="display"
            font="display"
            align="right"
            reserveWidth
          />
        </Emphasis>
      </div>

      <div style={box(startMark.layout)}>
        <Enter kind="blur" beat={bStartMark}>
          <div
            style={{
              fontFamily: s.typography.body.family,
              fontWeight: s.typography.body.weight,
              fontSize: typeSize(s, "body", height),
              lineHeight: 1.2,
              color: s.palette.muted,
              textAlign: "right",
            }}
          >
            {startMark.text}
          </div>
        </Enter>
      </div>
    </>
  );
};

const Frame: React.FC<SceneProps> = ({ timing, content }) => {
  const s = useStyle();
  const atmosphere = content.background_beat;
  return (
    <AbsoluteFill>
      {s.transparent ? null : <Background beat={atmosphere} seed={content.background_seed} />}
      <Particles count={content.particles.count} seed={content.particles.seed} beat={atmosphere} layer={0} />
      <SafeArea>
        <Body timing={timing} content={content} />
      </SafeArea>
    </AbsoluteFill>
  );
};

export const Scene: React.FC<SceneProps> = (props) => (
  <StyleProvider style={props.style}>
    <Frame {...props} />
  </StyleProvider>
);
