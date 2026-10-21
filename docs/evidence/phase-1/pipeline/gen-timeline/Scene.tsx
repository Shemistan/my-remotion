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

type BeatWindow = { start_frame: number; end_frame: number };
type TimingBeat = BeatWindow & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type Layer = 0 | 1 | 2;

type SceneContent = {
  kicker: { text: string; layout: Layout; depth_layer: Layer };
  timeline: {
    orientation: "h" | "v";
    width: number;
    height: number;
    accentIndex: number;
    highlightLast: boolean;
    layout: Layout;
    depth_layer: Layer;
    items: React.ComponentProps<typeof Timeline>["items"];
  };
  camera: React.ComponentProps<typeof Camera>["keys"];
};

type Props = {
  timing: { duration_frames: number; beats: TimingBeat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: SceneContent;
};

const beatOf = (beats: TimingBeat[], id: string): BeatWindow => {
  const b = beats.find((x) => x.id === id);
  if (!b) {
    throw new Error(`Нет бита «${id}» в props.timing.beats`);
  }
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const Content: React.FC<{ beats: TimingBeat[]; content: SceneContent }> = ({ beats, content }) => {
  const style = useStyle();
  const rect = useSafeArea();
  const kickerBeat = beatOf(beats, "kicker-in");
  const timelineBeat = beatOf(beats, "timeline-draw");
  const { kicker, timeline } = content;

  return (
    <>
      <Parallax layer={kicker.depth_layer}>
        <SafeArea>
          <div
            style={{
              position: "absolute",
              left: kicker.layout.x * rect.w,
              top: kicker.layout.y * rect.h,
              width: kicker.layout.w * rect.w,
              height: kicker.layout.h * rect.h,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <KineticText
              text={kicker.text}
              beat={kickerBeat}
              mode="letters"
              enter="type"
              size="body"
              font="mono"
              color={style.palette.muted}
              align="center"
              maxWidth={kicker.layout.w * rect.w}
            />
          </div>
        </SafeArea>
      </Parallax>
      <Parallax layer={timeline.depth_layer}>
        <SafeArea>
          <div
            style={{
              position: "absolute",
              left: timeline.layout.x * rect.w,
              top: timeline.layout.y * rect.h,
              width: timeline.width,
              height: timeline.height,
            }}
          >
            {/* акцент — только встроенный highlightLast у последней вехи */}
            <Timeline
              items={timeline.items}
              beat={timelineBeat}
              orientation={timeline.orientation}
              width={timeline.width}
              height={timeline.height}
              accentIndex={timeline.accentIndex}
              highlightLast={timeline.highlightLast}
            />
          </div>
        </SafeArea>
      </Parallax>
    </>
  );
};

const Atmosphere: React.FC<{ beats: TimingBeat[] }> = ({ beats }) => {
  const style = useStyle();
  if (style.transparent) {
    return null;
  }
  const bgBeat = beatOf(beats, "kicker-in");
  return (
    <Parallax layer={0}>
      <Background beat={bgBeat} variant="aurora" seed="company-path" />
      <Particles count={45} seed="company-dust" beat={bgBeat} layer={0} accentShare={0.25} />
    </Parallax>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        <Atmosphere beats={timing.beats} />
        <Content beats={timing.beats} content={content} />
      </Camera>
    </StyleProvider>
  );
};
