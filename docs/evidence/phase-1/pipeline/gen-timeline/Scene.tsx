import React from "react";
import { useVideoConfig } from "remotion";
import {
  Background,
  Enter,
  SafeArea,
  StyleProvider,
  Timeline,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type TimedBeat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type TypeLevel = "display" | "h1" | "h2" | "body" | "caption";

type TimelineItem = { date: string; label: string; note?: string };

type Content = {
  background: { variant: "aurora" | "grid" | "paper" | "solid"; seed: string; beat_end_frame: number };
  title: { text: string; size: TypeLevel; weight: number; layout: Layout };
  timeline: {
    orientation: "h" | "v";
    width: number;
    height: number;
    accentIndex: number;
    highlightLast: boolean;
    layout: Layout;
    items: TimelineItem[];
  };
};

// Тип props.style берём у StyleProvider: preset — union id пресетов kit, не произвольная строка.
type SceneStyle = React.ComponentProps<typeof StyleProvider>["style"];

export type SceneProps = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: TimedBeat[], id: string): { start_frame: number; end_frame: number } => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const Body: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  const sa = useSafeArea();

  const titleBeat = beatOf(timing.beats, "title-in");
  const timelineBeat = beatOf(timing.beats, "timeline-draw");

  const { title, timeline } = content;
  const titleSize = typeSize(s, title.size, height);

  const areaW = timeline.layout.w * sa.w;
  const tlWidth = Math.min(timeline.width, areaW);
  const tlHeight = Math.min(timeline.height, timeline.layout.h * sa.h);
  const tlLeft = timeline.layout.x * sa.w + (areaW - tlWidth) / 2;
  const tlTop = timeline.layout.y * sa.h;

  return (
    <SafeArea>
      <div
        style={{
          position: "absolute",
          left: title.layout.x * sa.w,
          top: title.layout.y * sa.h,
          width: title.layout.w * sa.w,
        }}
      >
        <Enter kind="mask" beat={titleBeat}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: title.weight,
              fontSize: titleSize,
              lineHeight: 1.2,
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.text,
              textAlign: "left",
              whiteSpace: "nowrap",
            }}
          >
            {title.text}
          </div>
        </Enter>
      </div>
      <div style={{ position: "absolute", left: tlLeft, top: tlTop, width: tlWidth, height: tlHeight }}>
        <Timeline
          items={timeline.items}
          beat={timelineBeat}
          orientation={timeline.orientation}
          width={tlWidth}
          height={tlHeight}
          accentIndex={timeline.accentIndex}
          highlightLast={timeline.highlightLast}
        />
      </div>
    </SafeArea>
  );
};

const Backdrop: React.FC<{ content: Content }> = ({ content }) => {
  const s = useStyle();
  if (s.transparent) return null;
  return (
    <Background
      beat={{ start_frame: 0, end_frame: content.background.beat_end_frame }}
      variant={content.background.variant}
      seed={content.background.seed}
    />
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Backdrop content={content} />
    <Body timing={timing} content={content} />
  </StyleProvider>
);
