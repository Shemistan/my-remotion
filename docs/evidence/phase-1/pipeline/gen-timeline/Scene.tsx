import React from "react";
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
import { useVideoConfig } from "remotion";

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
    highlightLast: boolean;
    layout: Layout;
    items: TimelineItem[];
  };
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

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" missing in props.timing.beats`);
  return b;
};

const SceneBody: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const style = useStyle();
  const rect = useSafeArea();
  const { height } = useVideoConfig();

  const kickerBeat = beatOf(beats, "kicker-in");
  const titleBeat = beatOf(beats, "title-in");
  const drawBeat = beatOf(beats, "timeline-draw");

  const { kicker, title, timeline } = content;
  const place = (l: Layout): React.CSSProperties => ({
    position: "absolute",
    left: l.x * rect.w,
    top: l.y * rect.h,
    width: l.w * rect.w,
  });

  const tlWidth = Math.min(timeline.width, timeline.layout.w * rect.w);
  const tlHeight = Math.min(timeline.height, timeline.layout.h * rect.h);
  const display = style.typography.display;

  return (
    <SafeArea>
      {/* Опора: кикер над заголовком — раскладка карточки раздела (chapter-title) */}
      <div style={place(kicker.layout)}>
        <KineticText
          text={kicker.text}
          beat={kickerBeat}
          mode="letters"
          enter="type"
          size="caption"
          font="mono"
          caps
          color={style.palette.muted}
        />
      </div>
      <div style={place(title.layout)}>
        <Enter kind="mask" beat={titleBeat}>
          <div
            style={{
              fontFamily: display.family,
              fontWeight: 800,
              fontSize: typeSize(style, "h2", height),
              letterSpacing: `${style.typography.tracking.display}em`,
              lineHeight: 1.15,
              color: style.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {title.text}
          </div>
        </Enter>
      </div>
      {/* Герой: ось прорисовывается головой, веха «сейчас» дышит сама (highlightLast) */}
      <div style={{ ...place(timeline.layout), height: tlHeight }}>
        <Timeline
          items={timeline.items}
          beat={drawBeat}
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

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => {
  const atmosphere = beatOf(timing.beats, "kicker-in");
  return (
    <StyleProvider style={style}>
      <Camera keys={content.camera}>
        {!style.transparent && (
          <Parallax layer={0}>
            <Background beat={atmosphere} variant="aurora" seed="company-path" />
            <Particles count={56} seed="path-dust" beat={atmosphere} layer={0} />
          </Parallax>
        )}
        <Parallax layer={1}>
          <SceneBody beats={timing.beats} content={content} />
        </Parallax>
      </Camera>
    </StyleProvider>
  );
};
