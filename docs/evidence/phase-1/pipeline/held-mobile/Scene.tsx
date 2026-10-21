import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Camera,
  Enter,
  LineChart,
  Parallax,
  SafeArea,
  SceneTitle,
  StyleProvider,
  accent,
  lineChartHead,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };
type ChartPoint = { label: string; value: number };

type Content = {
  background: {
    variant?: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";
    seed: string;
    focus?: { x: number; y: number };
  };
  camera: CameraKey[];
  title: { text: string; layout: Layout };
  chart: {
    points: ChartPoint[];
    valueSuffix: string;
    yTicks: number;
    locale: "ru" | "en";
    accentIndex: number;
    width: number;
    height: number;
    layout: Layout;
  };
  hero: {
    from: number;
    to: number;
    suffix: string;
    decimals: number;
    locale: "ru" | "en";
    layout: Layout;
  };
  conclusion: { text: string; highlight: string; layout: Layout };
};

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const SceneBody: React.FC<{ beats: TimedBeat[]; content: Content }> = ({ beats, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();

  const chartBeat = beatOf(beats, "chart-draw");
  const heroIn = beatOf(beats, "hero-in");
  const titleIn = beatOf(beats, "title-in");
  const finalEmphasis = beatOf(beats, "final-emphasis");
  const conclusionIn = beatOf(beats, "conclusion-in");

  const { chart, hero, title, conclusion } = content;
  const head = lineChartHead(chart.points, chartBeat, frame, {
    width: chart.width,
    height: chart.height,
    yTicks: chart.yTicks,
    frameHeight: height,
  });

  const place = (l: Layout): React.CSSProperties => ({
    position: "absolute",
    left: l.x * rect.w,
    top: l.y * rect.h,
    width: l.w * rect.w,
  });

  const [before, after] = conclusion.text.split(conclusion.highlight);

  return (
    <>
      <div style={place(chart.layout)}>
        <LineChart
          points={chart.points}
          beat={chartBeat}
          area
          callout={false}
          endpointEmphasis={{ beat: finalEmphasis, loop: true }}
          width={chart.width}
          height={chart.height}
          locale={chart.locale}
          accentIndex={chart.accentIndex}
          yTicks={chart.yTicks}
          valueSuffix={chart.valueSuffix}
        />
      </div>

      <div style={place(title.layout)}>
        <SceneTitle mode="integrated" text={title.text} beat={titleIn} align="left" />
      </div>

      <div style={place(conclusion.layout)}>
        <Enter kind="mask" beat={conclusionIn}>
          <div
            style={{
              fontFamily: s.typography.body.family,
              fontWeight: s.typography.body.weight,
              fontSize: typeSize(s, "body", height),
              letterSpacing: `${s.typography.tracking.body}em`,
              color: s.palette.text,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            {before}
            {after !== undefined ? (
              <span style={{ color: accent(s, 0) }}>{conclusion.highlight}</span>
            ) : null}
            {after}
          </div>
        </Enter>
      </div>

      <div style={{ ...place(hero.layout), display: "flex", justifyContent: "flex-end" }}>
        <Enter kind="pop" beat={heroIn}>
          <AnimatedNumber
            from={hero.from}
            to={hero.to}
            value={head.value}
            enterAt={heroIn.start_frame}
            beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
            locale={hero.locale}
            suffix={hero.suffix}
            decimals={hero.decimals}
            size="display"
            align="right"
            reserveWidth
          />
        </Enter>
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const bgBeat = beatOf(timing.beats, "title-in");
  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        {style.transparent ? null : (
          <Parallax layer={0}>
            <Background
              beat={{ start_frame: 0, end_frame: bgBeat.end_frame }}
              variant={content.background.variant}
              seed={content.background.seed}
              focus={content.background.focus}
            />
          </Parallax>
        )}
        <Parallax layer={1}>
          <SafeArea>
            <SceneBody beats={timing.beats} content={content} />
          </SafeArea>
        </Parallax>
      </Camera>
    </StyleProvider>
  );
};
