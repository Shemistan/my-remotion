import React from "react";
import {
  Background,
  KineticText,
  Particles,
  SafeArea,
  StyleProvider,
  Timeline,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Rect = { x: number; y: number; w: number; h: number };

type TimelineItem = { date: string; label: string; note?: string };

type Content = {
  kicker: { text: string; layout: Rect };
  timeline: {
    items: TimelineItem[];
    accentIndex: number;
    highlightLast: boolean;
    layout: Rect;
  };
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: {
    preset: "dark-premium" | "light-clean" | "tech-neon";
    intensity: "calm" | "balanced" | "energetic";
    depth: 0 | 1 | 2 | 3;
    transparent: boolean;
    safe_area?: { x: number; y: number };
  };
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} not found`);
  return b;
};

const SceneBody: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const s = useStyle();
  const area = useSafeArea();
  const kickerBeat = beatOf(beats, "b-kicker-in");
  const timelineBeat = beatOf(beats, "b-timeline-draw");
  const k = content.kicker.layout;
  const t = content.timeline.layout;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: k.x * area.w,
          top: k.y * area.h,
          width: k.w * area.w,
          height: k.h * area.h,
          display: "flex",
          alignItems: "center",
        }}
      >
        <KineticText
          text={content.kicker.text}
          beat={kickerBeat}
          mode="letters"
          enter="type"
          size="body"
          font="mono"
          color={s.palette.muted}
          align="left"
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: t.x * area.w,
          top: t.y * area.h,
          width: t.w * area.w,
          height: t.h * area.h,
        }}
      >
        <Timeline
          items={content.timeline.items}
          beat={timelineBeat}
          orientation="h"
          width={t.w * area.w}
          height={t.h * area.h}
          accentIndex={content.timeline.accentIndex}
          highlightLast={content.timeline.highlightLast}
        />
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const kickerBeat = beatOf(timing.beats, "b-kicker-in");
  return (
    <StyleProvider style={style}>
      {style.transparent ? null : (
        <>
          <Background beat={kickerBeat} variant="aurora" seed="company-path" />
          <Particles count={40} seed="path-dust" beat={kickerBeat} layer={0} />
        </>
      )}
      <SafeArea>
        <SceneBody beats={timing.beats} content={content} />
      </SafeArea>
    </StyleProvider>
  );
};
