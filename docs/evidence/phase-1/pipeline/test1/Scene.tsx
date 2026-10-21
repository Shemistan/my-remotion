import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Card,
  Emphasis,
  Enter,
  LineChart,
  SafeArea,
  StyleProvider,
  lineChartHead,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type BeatRef = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type Point = { label: string; value: number };

type Content = {
  title: { text: string; layout: Layout };
  number: { from: number; to: number; locale: "ru" | "en"; layout: Layout };
  chart: { points: Point[]; yTicks: number; accentIndex: number; layout: Layout };
  badge: { text: string; elevation: 0 | 1 | 2 | 3; layout: Layout };
};

type Props = {
  timing: { duration_frames: number; beats: BeatRef[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: Content;
};

const beatOf = (beats: BeatRef[], id: string) => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const Body: React.FC<Omit<Props, "style">> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();

  const titleBeat = beatOf(timing.beats, "title-in");
  const numberIn = beatOf(timing.beats, "number-in");
  const chartBeat = beatOf(timing.beats, "chart-draw");
  const finalBeat = beatOf(timing.beats, "final-emphasis");
  const badgeBeat = beatOf(timing.beats, "badge-in");

  const box = (l: Layout) => ({
    position: "absolute" as const,
    left: l.x * rect.w,
    top: l.y * rect.h,
    width: l.w * rect.w,
  });

  const { title, number, chart, badge } = content;
  const chartW = chart.layout.w * rect.w;
  const chartH = chart.layout.h * rect.h;

  // Число — одно движение с головой линии
  const head = lineChartHead(chart.points, chartBeat, frame, {
    width: chartW,
    height: chartH,
    yTicks: chart.yTicks,
    frameHeight: height,
  });

  return (
    <>
      <div style={{ ...box(title.layout), height: title.layout.h * rect.h }}>
        <Enter kind="mask" beat={titleBeat}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: 700,
              fontSize: typeSize(s, "h2", height),
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.muted,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            {title.text}
          </div>
        </Enter>
      </div>

      <div style={{ ...box(number.layout), height: number.layout.h * rect.h }}>
        <Emphasis beat={finalBeat} loop shape="pill" spread={28}>
          <AnimatedNumber
            from={number.from}
            to={number.to}
            value={head.value}
            beat={{ start_frame: head.startFrame, end_frame: head.endFrame }}
            enterAt={numberIn.start_frame}
            locale={number.locale}
            size="display"
            font="display"
            reserveWidth
            align="left"
          />
        </Emphasis>
      </div>

      <div style={{ ...box(chart.layout), height: chartH }}>
        <LineChart
          points={chart.points}
          beat={chartBeat}
          area
          callout={false}
          endpointEmphasis={false}
          locale={number.locale}
          compact
          yTicks={chart.yTicks}
          width={chartW}
          height={chartH}
          accentIndex={chart.accentIndex}
        />
      </div>

      <div style={box(badge.layout)}>
        <Card
          elevation={badge.elevation}
          enter="scale"
          beat={badgeBeat}
          width={badge.layout.w * rect.w}
          height={badge.layout.h * rect.h}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: 700,
              fontSize: typeSize(s, "body", height),
              letterSpacing: `${s.typography.tracking.body}em`,
              color: s.palette.text,
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            {badge.text}
          </div>
        </Card>
      </div>
    </>
  );
};

// Background сам не рисуется при style.transparent = true
export const Scene: React.FC<Props> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Background beat={beatOf(timing.beats, "title-in")} />
    <SafeArea>
      <Body timing={timing} content={content} />
    </SafeArea>
  </StyleProvider>
);
