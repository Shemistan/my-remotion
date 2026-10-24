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
  lineChartHead,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type Point = { label: string; value: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };

type Content = {
  background: {
    variant: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";
    seed: string;
    focus: { x: number; y: number };
  };
  camera: CameraKey[];
  kicker: { text: string; layout: Layout };
  chart: {
    points: Point[];
    area: boolean;
    callout: boolean;
    locale: "ru" | "en";
    compact: boolean;
    yTicks: number;
    width: number;
    height: number;
    accentIndex: number;
    layout: Layout;
  };
  unit: { text: string; layout: Layout };
  hero: { from: number; to: number; locale: "ru" | "en"; enterAt: number; layout: Layout };
  statement: { lines: string[]; layout: Layout };
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

const place = (l: Layout, w: number, h: number): React.CSSProperties => ({
  position: "absolute",
  left: l.x * w,
  top: l.y * h,
  width: l.w * w,
});

// Контент слоя 1: рубрика, подпись, график, вывод.
const ContentLayer: React.FC<{ content: Content; beats: TimedBeat[] }> = ({ content, beats }) => {
  const style = useStyle();
  const { height } = useVideoConfig();
  const rect = useSafeArea();
  const chartBeat = beatOf(beats, "b-chart-draw");
  const { chart, unit, statement } = content;

  return (
    <SafeArea>
      <SceneTitle mode="kicker" kicker={content.kicker.text} beat={beatOf(beats, "b-kicker-in")} />

      <div style={place(unit.layout, rect.w, rect.h)}>
        <Enter kind="blur" beat={beatOf(beats, "b-unit-in")}>
          <div
            style={{
              fontFamily: style.typography.body.family,
              fontWeight: 600,
              fontSize: typeSize(style, "body", height),
              color: style.palette.muted,
              textAlign: "left",
            }}
          >
            {unit.text}
          </div>
        </Enter>
      </div>

      <div style={place(chart.layout, rect.w, rect.h)}>
        <LineChart
          points={chart.points}
          beat={chartBeat}
          area={chart.area}
          callout={chart.callout}
          endpointEmphasis={{ beat: beatOf(beats, "b-final-emphasis"), loop: true }}
          locale={chart.locale}
          compact={chart.compact}
          yTicks={chart.yTicks}
          width={chart.width}
          height={chart.height}
          accentIndex={chart.accentIndex}
        />
      </div>

      <div style={place(statement.layout, rect.w, rect.h)}>
        <Enter kind="mask" beat={beatOf(beats, "b-statement-in")}>
          <div
            style={{
              fontFamily: style.typography.display.family,
              fontWeight: 800,
              fontSize: typeSize(style, "h2", height),
              lineHeight: 1.12,
              letterSpacing: `${style.typography.tracking.display}em`,
              color: style.palette.text,
              textAlign: "left",
            }}
          >
            {statement.lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </Enter>
      </div>
    </SafeArea>
  );
};

// Герой (слой 2): число, привязанное к голове линии графика.
const HeroLayer: React.FC<{ content: Content; beats: TimedBeat[] }> = ({ content, beats }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const rect = useSafeArea();
  const { chart, hero } = content;
  const head = lineChartHead(chart.points, beatOf(beats, "b-chart-draw"), frame, {
    width: chart.width,
    height: chart.height,
    yTicks: chart.yTicks,
    frameHeight: height,
  });

  return (
    <SafeArea>
      <div style={place(hero.layout, rect.w, rect.h)}>
        <AnimatedNumber
          from={hero.from}
          to={hero.to}
          value={head.value}
          beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
          enterAt={hero.enterAt}
          locale={hero.locale}
          size="display"
          align="left"
          reserveWidth
        />
      </div>
    </SafeArea>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const beats = timing.beats;
  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        {style.transparent ? null : (
          <Parallax layer={0}>
            <Background
              beat={beatOf(beats, "b-kicker-in")}
              variant={content.background.variant}
              seed={content.background.seed}
              focus={content.background.focus}
            />
          </Parallax>
        )}
        <Parallax layer={1}>
          <ContentLayer content={content} beats={beats} />
        </Parallax>
        <Parallax layer={2}>
          <HeroLayer content={content} beats={beats} />
        </Parallax>
      </Camera>
    </StyleProvider>
  );
};
