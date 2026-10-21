import React from "react";
import { useVideoConfig } from "remotion";
import {
  Background,
  Camera,
  Emphasis,
  Enter,
  KineticText,
  Parallax,
  Particles,
  SafeArea,
  StyleProvider,
  Timeline,
  timelineLayout,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Frac = { x: number; y: number; w: number; h: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };
type Milestone = { date: string; label: string; note: string };

type Content = {
  kicker: string;
  title: string;
  timeline: { width: number; height: number; accentIndex: number; items: Milestone[] };
  layout: { kicker: Frac; title: Frac; timeline: Frac; emphasis: Frac };
  camera: CameraKey[];
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: {
    preset: "dark-premium" | "light-clean" | "tech-neon";
    intensity: "calm" | "balanced" | "energetic";
    depth?: 0 | 1 | 2 | 3;
    transparent?: boolean;
    safe_area?: { x: number; y: number };
  };
  content: Content;
};

const beatOf = (beats: Beat[], id: string) => {
  const b = beats.find((x) => x.id === id);
  return { start_frame: b ? b.start_frame : 0, end_frame: b ? b.end_frame : 0 };
};

const SceneBody: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  const rect = useSafeArea();
  const { layout, timeline } = content;

  const kickerBeat = beatOf(beats, "b-kicker-in");
  const titleBeat = beatOf(beats, "b-title-in");
  const drawBeat = beatOf(beats, "b-timeline-draw");
  const emphasisBeat = beatOf(beats, "b-final-emphasis");

  // Цель Emphasis — область последней вехи, по тем же позициям, что у Timeline
  const n = timeline.items.length;
  const points = timelineLayout(n, { x: 0, y: 0, w: timeline.width, h: timeline.height }, "h");
  const last = points[n - 1];
  const targetW = layout.emphasis.w * rect.w;
  const targetH = layout.emphasis.h * rect.h;
  const lastX = last ? last.x : timeline.width;
  const lastY = last ? last.y : timeline.height / 2;
  const targetLeft = Math.min(Math.max(lastX - targetW / 2, 0), timeline.width - targetW);
  const targetTop = Math.min(Math.max(lastY - targetH / 2, 0), timeline.height - targetH);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: layout.kicker.x * rect.w,
          top: layout.kicker.y * rect.h,
          width: layout.kicker.w * rect.w,
        }}
      >
        <KineticText
          text={content.kicker}
          beat={kickerBeat}
          mode="letters"
          enter="type"
          size="caption"
          font="mono"
          caps
          color={s.palette.muted}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: layout.title.x * rect.w,
          top: layout.title.y * rect.h,
          width: layout.title.w * rect.w,
        }}
      >
        <Enter kind="mask" beat={titleBeat}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: s.typography.display.weight,
              fontSize: typeSize(s, "h2", height),
              letterSpacing: `${s.typography.tracking.display}em`,
              lineHeight: 1.15,
              color: s.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {content.title}
          </div>
        </Enter>
      </div>

      <div
        style={{
          position: "absolute",
          left: layout.timeline.x * rect.w,
          top: layout.timeline.y * rect.h,
          width: timeline.width,
          height: timeline.height,
        }}
      >
        {/* Акцент итога — под таймлайном: ореол и кольцо ложатся за веху 2025 */}
        <div
          style={{
            position: "absolute",
            left: targetLeft,
            top: targetTop,
            width: targetW,
            height: targetH,
          }}
        >
          <Emphasis
            beat={emphasisBeat}
            loop
            accentIndex={timeline.accentIndex}
            shape="rounded"
            ring
            halo
            display="block"
          >
            <div style={{ width: targetW, height: targetH }} />
          </Emphasis>
        </div>
        <div style={{ position: "absolute", inset: 0 }}>
          <Timeline
            items={timeline.items}
            beat={drawBeat}
            orientation="h"
            width={timeline.width}
            height={timeline.height}
            accentIndex={timeline.accentIndex}
            highlightLast
          />
        </div>
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const atmosphere = beatOf(timing.beats, "b-title-in");
  const bgBeat = { start_frame: 0, end_frame: atmosphere.end_frame };
  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        {style.transparent ? null : (
          <Parallax layer={0}>
            <Background beat={bgBeat} seed="company-path" />
          </Parallax>
        )}
        <Parallax layer={0}>
          <Particles count={60} seed="company-dust" beat={bgBeat} layer={0} />
        </Parallax>
        <Parallax layer={1}>
          <SafeArea>
            <SceneBody beats={timing.beats} content={content} />
          </SafeArea>
        </Parallax>
      </Camera>
    </StyleProvider>
  );
};
