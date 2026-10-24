import React from "react";
import {
  Background,
  Camera,
  Enter,
  Parallax,
  SafeArea,
  SceneTitle,
  StyleProvider,
  Timeline,
  useSafeArea,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Frac = { x: number; y: number; w: number; h: number };
type CameraKey = { frame: number; scale: number; x: number; y: number };
type Milestone = { date: string; label: string; note?: string };

type Content = {
  title_mode: "none" | "kicker" | "statement" | "integrated" | "strip";
  background: {
    variant?: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";
    seed: string;
    focus?: { x: number; y: number };
  };
  timeline: {
    orientation: "h" | "v";
    highlightLast: boolean;
    accentIndex: number;
    width: number;
    height: number;
    layout: Frac;
    items: Milestone[];
  };
  conclusion: {
    text: string;
    size: "display" | "h1" | "h2" | "body" | "caption";
    align: "left" | "center" | "right";
    layout: Frac;
  };
  camera: CameraKey[];
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

const beatOf = (beats: Beat[], id: string) => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" missing in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const Layout: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const rect = useSafeArea();
  const tl = content.timeline;
  const cc = content.conclusion;
  const tlWidth = Math.min(tl.width, tl.layout.w * rect.w);
  const tlHeight = Math.min(tl.height, tl.layout.h * rect.h);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: tl.layout.x * rect.w,
          top: tl.layout.y * rect.h,
          width: tlWidth,
          height: tlHeight,
        }}
      >
        <Timeline
          items={tl.items}
          beat={beatOf(beats, "timeline-in")}
          orientation={tl.orientation}
          width={tlWidth}
          height={tlHeight}
          accentIndex={tl.accentIndex}
          highlightLast={tl.highlightLast}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: cc.layout.x * rect.w,
          top: cc.layout.y * rect.h,
          width: cc.layout.w * rect.w,
          height: cc.layout.h * rect.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Enter kind="mask" beat={beatOf(beats, "conclusion-in")}>
          <SceneTitle
            mode={content.title_mode}
            text={cc.text}
            beat={beatOf(beats, "conclusion-in")}
            size={cc.size}
            align={cc.align}
            maxWidth={cc.layout.w * rect.w}
          />
        </Enter>
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const bgBeat = beatOf(timing.beats, "timeline-in");
  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        {style.transparent ? null : (
          <Parallax layer={0}>
            <Background
              beat={{ start_frame: bgBeat.start_frame, end_frame: Math.round(bgBeat.end_frame / 3) }}
              variant={content.background.variant}
              seed={content.background.seed}
              focus={content.background.focus}
            />
          </Parallax>
        )}
        <Parallax layer={1}>
          <SafeArea>
            <Layout beats={timing.beats} content={content} />
          </SafeArea>
        </Parallax>
      </Camera>
    </StyleProvider>
  );
};
