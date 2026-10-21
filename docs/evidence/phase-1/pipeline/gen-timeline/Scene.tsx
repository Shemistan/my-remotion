import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import {
  Background,
  Camera,
  Enter,
  KineticText,
  Parallax,
  Particles,
  SafeArea,
  StyleProvider,
  Timeline,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };
type TimelineItem = { date: string; label: string; note?: string };

type Content = {
  kicker: { text: string; layout: Layout };
  title: { text: string; layout: Layout };
  timeline: {
    orientation: "h" | "v";
    width: number;
    height: number;
    accentIndex: number;
    layout: Layout;
    items: TimelineItem[];
  };
  particles: { count: number; seed: string };
  camera: CameraKey[];
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
  font?: string;
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: Beat[], id: string) => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Нет бита ${id} в props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  const rect = useSafeArea();

  const kickerBeat = beatOf(timing.beats, "kicker-in");
  const titleBeat = beatOf(timing.beats, "title-in");
  const timelineBeat = beatOf(timing.beats, "timeline-draw");

  const { kicker, title, timeline } = content;
  const timelineW = Math.min(timeline.width, timeline.layout.w * rect.w);
  const timelineH = Math.min(timeline.height, timeline.layout.h * rect.h);

  return (
    <Camera keys={content.camera}>
      {s.transparent ? null : (
        <Parallax layer={0}>
          <Background beat={{ start_frame: 0, end_frame: titleBeat.end_frame }} />
          <Particles
            count={content.particles.count}
            seed={content.particles.seed}
            beat={{ start_frame: 0, end_frame: timelineBeat.start_frame + s.motion.enter_frames }}
            layer={0}
          />
        </Parallax>
      )}
      <Parallax layer={1}>
        <SafeArea>
          <AbsoluteFill>
            <div
              style={{
                position: "absolute",
                left: kicker.layout.x * rect.w,
                top: kicker.layout.y * rect.h,
                width: kicker.layout.w * rect.w,
              }}
            >
              <KineticText
                text={kicker.text}
                beat={kickerBeat}
                mode="letters"
                enter="type"
                size="caption"
                font="mono"
                color={s.palette.muted}
                align="left"
              />
            </div>

            <div
              style={{
                position: "absolute",
                left: title.layout.x * rect.w,
                top: title.layout.y * rect.h,
                width: title.layout.w * rect.w,
              }}
            >
              <Enter kind="mask" beat={titleBeat}>
                <div
                  style={{
                    fontFamily: s.typography.display.family,
                    fontWeight: 800,
                    fontSize: typeSize(s, "h2", height),
                    letterSpacing: `${s.typography.tracking.display}em`,
                    lineHeight: 1.1,
                    color: s.palette.text,
                    textAlign: "left",
                    paddingBottom: "0.08em",
                  }}
                >
                  {title.text}
                </div>
              </Enter>
            </div>

            <div
              style={{
                position: "absolute",
                left: timeline.layout.x * rect.w,
                top: timeline.layout.y * rect.h,
                width: timelineW,
                height: timelineH,
              }}
            >
              <Timeline
                items={timeline.items}
                beat={timelineBeat}
                orientation={timeline.orientation}
                width={timelineW}
                height={timelineH}
                accentIndex={timeline.accentIndex}
                highlightLast
              />
            </div>
          </AbsoluteFill>
        </SafeArea>
      </Parallax>
    </Camera>
  );
};

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    <SceneBody {...props} />
  </StyleProvider>
);
