import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Emphasis,
  Enter,
  FlowGraph,
  KineticText,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  beatProgress,
  cardSurface,
  easingOf,
  flowTiming,
  mix,
  pulseArrival,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type CardEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

type NodeContent = {
  id: string;
  label: string;
  caption?: string;
  elevation: 0 | 1 | 2 | 3;
  enter: CardEnter;
  enter_offset: number;
};
type EdgeContent = { id: string; from: string; to: string };
type FlowContent = { edge: string; direction: "forward" | "back"; beat: string; accent: number };

type Content = {
  title: string;
  kicker: string;
  nodes: NodeContent[];
  edges: EdgeContent[];
  flows: FlowContent[];
  pulse: { travel: number; repeat: boolean; count: number; size: number; tail: number };
  cell: {
    empty_text: string;
    filled_text: string;
    enter_offset: number;
    flash_edge: string;
    flash_beat: string;
  };
  miss_badge: { text: string };
  hit_badge: { text: string };
  track: { text: string; beat: string }[];
  particles: { count: number; seed: string };
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent: boolean;
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
  if (!b) throw new Error(`beat ${id} missing`);
  return b;
};

// Раскладка схемы в долях safe area (spec layout; узел кэша — подпись сверху, ячейка под ней).
const GRAPH = { y: 0.14, h: 0.62 };
const NODE_W: Record<string, number> = { "node-client": 0.2, "node-cache": 0.28, "node-db": 0.22 };
const NODE_X: Record<string, number> = { "node-client": 0.02, "node-cache": 0.36, "node-db": 0.76 };
const CACHE_Y = 0.145;
const CACHE_H = 0.175;
const SIDE_H = 0.155;
const CELL = { w: 0.22, h: 0.16, gap: 0.025 };
const BADGE = { x: 0.4, y: 0.12, w: 0.2, h: 0.09 };
const KICKER = { x: 0.05, y: 0.02, w: 0.4 };
const TRACK = { x: 0.1, y: 0.83, w: 0.8, h: 0.1 };

const Badge: React.FC<{ text: string; tone: string; width: number; height: number }> = ({
  text,
  tone,
  width,
  height,
}) => {
  const s = useStyle();
  const { height: frameH } = useVideoConfig();
  return (
    <div
      style={{
        width,
        height,
        boxSizing: "border-box",
        borderRadius: 999,
        background: s.palette.surface,
        border: `3px solid ${tone}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: tone,
        fontFamily: s.typography.display.family,
        fontWeight: 700,
        fontSize: typeSize(s, "body", frameH),
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};

const CacheCell: React.FC<{
  content: Content["cell"];
  appearAt: number;
  fillAt: number;
  width: number;
  height: number;
}> = ({ content, appearAt, fillAt, width, height }) => {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { height: frameH } = useVideoConfig();
  const enter = easingOf(s, "enter");
  const appear = beatProgress(
    frame,
    { start_frame: appearAt, end_frame: appearAt + s.motion.enter_frames },
    enter,
  );
  const fill = beatProgress(
    frame,
    { start_frame: fillAt, end_frame: fillAt + s.motion.enter_frames },
    enter,
  );
  const textIn = beatProgress(
    frame,
    {
      start_frame: fillAt + s.motion.stagger_frames,
      end_frame: fillAt + s.motion.stagger_frames + s.motion.enter_frames,
    },
    enter,
  );
  const r = s.surfaces.radius[2] ?? 26;
  const font = typeSize(s, "body", frameH);
  return (
    <div style={{ position: "relative", width, height, opacity: appear }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxSizing: "border-box",
          borderRadius: r,
          border: `3px dashed ${alpha(s.palette.muted, 0.75)}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: s.palette.muted,
          fontFamily: s.typography.body.family,
          fontWeight: 500,
          fontSize: font,
          opacity: 1 - fill,
        }}
      >
        {content.empty_text}
      </div>
      <div
        style={{
          ...cardSurface(s, 2),
          position: "absolute",
          inset: 0,
          borderRadius: r,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: fill,
        }}
      >
        <span
          style={{
            color: s.palette.text,
            fontFamily: s.typography.display.family,
            fontWeight: 700,
            fontSize: font,
            whiteSpace: "nowrap",
            opacity: textIn,
            filter: `blur(${(1 - textIn) * 12 * s.amplitude}px)`,
          }}
        >
          {content.filled_text}
        </span>
      </div>
    </div>
  );
};

const TrackWord: React.FC<{ text: string; beat: Beat; next: Beat | null }> = ({ text, beat, next }) => {
  const s = useStyle();
  const frame = useCurrentFrame();
  const dim = next
    ? beatProgress(
        frame,
        { start_frame: next.start_frame, end_frame: next.start_frame + s.motion.enter_frames },
        easingOf(s, "enter"),
      )
    : 0;
  return (
    <KineticText
      text={text}
      beat={beat}
      mode="words"
      enter="slide"
      size="body"
      font="body"
      color={mix(s.palette.text, s.palette.muted, dim)}
    />
  );
};

const SceneBody: React.FC<SceneProps> = ({ timing, content }) => {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const rect = useSafeArea();
  const beats = timing.beats;
  const b = (id: string) => beatOf(beats, id);

  const graphIn = b("graph-in");
  const graphTop = GRAPH.y * rect.h;
  const graphH = GRAPH.h * rect.h;

  const cacheY = CACHE_Y * rect.h;
  const cacheH = CACHE_H * rect.h;
  const centerY = cacheY + cacheH / 2;
  const sideH = SIDE_H * rect.h;

  const nodes = content.nodes.map((n) => {
    const isCache = n.id === "node-cache";
    const h = isCache ? cacheH : sideH;
    return {
      id: n.id,
      label: n.label,
      caption: n.caption,
      elevation: n.elevation,
      enter: n.enter,
      enterAt: graphIn.start_frame + n.enter_offset,
      x: (NODE_X[n.id] ?? 0) * rect.w,
      y: centerY - h / 2,
      w: (NODE_W[n.id] ?? 0.2) * rect.w,
      h,
    };
  });
  const edges = content.edges;
  const pulse = content.pulse;

  // Кадр прихода обратного импульса к ячейке — тот же расчёт, что у графа.
  const flashBeat = b(content.cell.flash_beat);
  const timingInfo = flowTiming(nodes, edges, graphIn, s, fps);
  const arrivalFrames = timingInfo.arrivals(
    pulseArrival(content.cell.flash_edge, flashBeat, pulse.travel, {
      count: pulse.count,
      repeat: pulse.repeat,
    }),
  );
  const writeBeat = b("write");
  const arrival = Math.min(arrivalFrames[0] ?? writeBeat.start_frame, writeBeat.start_frame);

  const cellW = CELL.w * rect.w;
  const cellH = CELL.h * rect.h;
  const cellX = rect.w / 2 - cellW / 2;
  const cellY = graphTop + cacheY + cacheH + CELL.gap * rect.h;

  const missBeat = b("miss-emphasis");
  const hitBeat = b("hit-emphasis");
  const finalBeat = b("final-emphasis");
  const missOut = beatProgress(
    frame,
    { start_frame: writeBeat.start_frame, end_frame: writeBeat.start_frame + s.motion.exit_frames },
    easingOf(s, "exit"),
  );

  const badgeW = BADGE.w * rect.w;
  const badgeH = BADGE.h * rect.h;
  const badgePos: React.CSSProperties = {
    position: "absolute",
    left: BADGE.x * rect.w,
    top: BADGE.y * rect.h,
    width: badgeW,
    height: badgeH,
  };

  return (
    <>
      <div style={{ position: "absolute", left: KICKER.x * rect.w, top: KICKER.y * rect.h, width: KICKER.w * rect.w }}>
        <KineticText
          text={content.kicker}
          beat={b("kicker-in")}
          mode="letters"
          enter="type"
          size="body"
          font="body"
          color={s.palette.muted}
        />
      </div>

      <div style={{ position: "absolute", left: 0, top: graphTop, width: rect.w, height: graphH }}>
        <FlowGraph nodes={nodes} edges={edges} beat={graphIn} width={rect.w} height={graphH}>
          {content.flows.map((f) => (
            <PulseAlongPath
              key={`${f.edge}-${f.beat}`}
              edgeId={f.edge}
              beat={b(f.beat)}
              travel={pulse.travel}
              repeat={pulse.repeat}
              count={pulse.count}
              size={pulse.size}
              tail={pulse.tail}
              color={accent(s, f.accent)}
              reverse={f.direction === "back"}
            />
          ))}
        </FlowGraph>
      </div>

      <div style={{ position: "absolute", left: cellX, top: cellY, width: cellW, height: cellH }}>
        <Emphasis beat={finalBeat} loop shape="rounded" radius={s.surfaces.radius[2]} spread={28}>
          <Emphasis
            beat={{ start_frame: arrival, end_frame: writeBeat.end_frame }}
            loop={false}
            shape="rounded"
            radius={s.surfaces.radius[2]}
            spread={28}
          >
            <CacheCell
              content={content.cell}
              appearAt={graphIn.start_frame + content.cell.enter_offset}
              fillAt={arrival}
              width={cellW}
              height={cellH}
            />
          </Emphasis>
        </Emphasis>
      </div>

      <div style={{ ...badgePos, opacity: 1 - missOut }}>
        <Enter kind="pop" beat={missBeat}>
          <Emphasis beat={missBeat} loop={false} accentIndex={0} spread={20}>
            <Badge text={content.miss_badge.text} tone={s.palette.negative} width={badgeW} height={badgeH} />
          </Emphasis>
        </Enter>
      </div>

      <div style={badgePos}>
        <Enter kind="scale" beat={hitBeat}>
          <Emphasis beat={hitBeat} loop={false} accentIndex={0} spread={20}>
            <Badge text={content.hit_badge.text} tone={s.palette.positive} width={badgeW} height={badgeH} />
          </Emphasis>
        </Enter>
      </div>

      <div
        style={{
          position: "absolute",
          left: TRACK.x * rect.w,
          top: TRACK.y * rect.h,
          width: TRACK.w * rect.w,
          height: TRACK.h * rect.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.45em",
          fontSize: typeSize(s, "body", frameH),
          whiteSpace: "nowrap",
        }}
      >
        {content.track.map((w, i) => {
          const nextWord = content.track[i + 1];
          return (
            <TrackWord
              key={w.beat}
              text={w.text}
              beat={b(w.beat)}
              next={nextWord ? b(nextWord.beat) : null}
            />
          );
        })}
      </div>
    </>
  );
};

export const Scene: React.FC<SceneProps> = (props) => {
  const { style, content, timing } = props;
  const graphIn = beatOf(timing.beats, "graph-in");
  return (
    <StyleProvider style={style}>
      <AbsoluteFill>
        {style.transparent ? null : (
          <>
            <Background beat={{ start_frame: 0, end_frame: graphIn.end_frame }} seed="cache" />
            <Particles
              count={content.particles.count}
              seed={content.particles.seed}
              beat={{ start_frame: 0, end_frame: graphIn.end_frame }}
              layer={0}
            />
          </>
        )}
        <SafeArea>
          <SceneBody {...props} />
        </SafeArea>
      </AbsoluteFill>
    </StyleProvider>
  );
};
