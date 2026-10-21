import React from "react";
import {
  Background,
  Camera,
  KineticText,
  Parallax,
  Particles,
  SafeArea,
  StyleProvider,
  Timeline,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };

type SceneContent = {
  kicker: { text: string; layout: Layout };
  timeline: {
    orientation: "h" | "v";
    width: number;
    height: number;
    accentIndex: number;
    highlightLast: boolean;
    layout: Layout;
    items: React.ComponentProps<typeof Timeline>["items"];
  };
  camera: React.ComponentProps<typeof Camera>["keys"];
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: SceneContent;
};

const beatOf = (beats: Beat[], id: string) => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" missing in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const Content: React.FC<{ timing: Props["timing"]; content: SceneContent }> = ({ timing, content }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const kickerBeat = beatOf(timing.beats, "kicker-in");
  const timelineBeat = beatOf(timing.beats, "timeline-draw");
  const k = content.kicker.layout;
  const t = content.timeline.layout;
  const tlWidth = Math.min(content.timeline.width, t.w * rect.w);
  const tlHeight = Math.min(content.timeline.height, t.h * rect.h);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: k.x * rect.w,
          top: k.y * rect.h,
          width: k.w * rect.w,
          height: k.h * rect.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <KineticText
          text={content.kicker.text}
          beat={kickerBeat}
          mode="letters"
          enter="type"
          size="body"
          font="display"
          weight={700}
          color={s.palette.muted}
          align="center"
          maxWidth={k.w * rect.w}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: t.x * rect.w,
          top: t.y * rect.h,
          width: tlWidth,
          height: tlHeight,
        }}
      >
        <Timeline
          items={content.timeline.items}
          beat={timelineBeat}
          orientation={content.timeline.orientation}
          width={tlWidth}
          height={tlHeight}
          accentIndex={content.timeline.accentIndex}
          highlightLast={content.timeline.highlightLast}
        />
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ timing: Props["timing"] }> = ({ timing }) => {
  const s = useStyle();
  const kickerBeat = beatOf(timing.beats, "kicker-in");
  if (s.transparent) return null;
  return (
    <>
      <Background beat={kickerBeat} variant="aurora" seed="company-path" />
      <Particles
        count={40}
        seed="company-dust"
        beat={{ start_frame: 0, end_frame: timing.duration_frames / 3 }}
        layer={0}
        accentShare={0.25}
      />
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Camera keys={content.camera}>
      <Parallax layer={0}>
        <Atmosphere timing={timing} />
      </Parallax>
      <Parallax layer={1}>
        <SafeArea>
          <Content timing={timing} content={content} />
        </SafeArea>
      </Parallax>
    </Camera>
  </StyleProvider>
);
