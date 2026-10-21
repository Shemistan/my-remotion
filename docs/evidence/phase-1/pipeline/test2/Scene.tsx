import React from "react";
import { useVideoConfig } from "remotion";
import {
  Background,
  Card,
  Emphasis,
  FlowGraph,
  KineticText,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  pulseArrival,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Frac = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

type NodeSpec = {
  id: string;
  label: string;
  caption: string;
  enter: NodeEnter;
  enter_beat: string;
  elevation: 0 | 1 | 2 | 3;
  layout: Frac;
};
type EdgeSpec = { id: string; from: string; to: string };
type FlowSpec = {
  edge: string;
  direction: "forward" | "back";
  beat: string;
  accent: number;
  count: number;
  repeat: boolean;
  travel: number;
};
type Arrival = { edge: string; beat: string; travel: number; count: number; repeat: boolean };

type Content = {
  title: { text: string; layout: Frac };
  graph: { layout: Frac; beat: string; enter: NodeEnter };
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  flows: FlowSpec[];
  pulse: { size: number; tail: number };
  badge: {
    text: string;
    elevation: 0 | 1 | 2 | 3;
    accentIndex: number;
    enter_beat: string;
    emphasis_beat: string;
    arrival: Arrival;
    layout: Frac;
  };
  atmosphere: { particles: number; seed: string };
};

type StyleProps = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
  font?: string;
};

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: StyleProps;
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) {
    throw new Error(`Beat not found: ${id}`);
  }
  return b;
};

const AnswerBadge: React.FC<{ content: Content; beats: Beat[]; top: number; left: number; w: number; h: number }> = ({
  content,
  beats,
  top,
  left,
  w,
  h,
}) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  const geo = useFlowGeometry();
  const { badge } = content;
  const a = badge.arrival;
  const fallback = beatOf(beats, badge.enter_beat);
  const arrivalFrames = geo
    ? geo.arrivals(pulseArrival(a.edge, beatOf(beats, a.beat), a.travel, { count: a.count, repeat: a.repeat }))
    : [];
  const start = arrivalFrames.length > 0 ? arrivalFrames[0]! : fallback.start_frame;
  const enterBeat = { start_frame: start, end_frame: start + (fallback.end_frame - fallback.start_frame) };
  const fontSize = typeSize(s, "body", height);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Emphasis beat={beatOf(beats, badge.emphasis_beat)} loop shape="pill" accentIndex={badge.accentIndex}>
        <Card
          elevation={badge.elevation}
          beat={enterBeat}
          enter="pop"
          accentIndex={badge.accentIndex}
          height={h}
          style={{
            borderRadius: h / 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: `0 ${Math.round(h * 0.6)}px`,
          }}
        >
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: s.typography.display.weight,
              fontSize,
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {badge.text}
          </div>
        </Card>
      </Emphasis>
    </div>
  );
};

const SceneBody: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const beats = timing.beats;

  const t = content.title.layout;
  const g = content.graph.layout;
  const graphTop = g.y * rect.h;
  // область графа тянется до низа safe area: плашка ответа живёт в её слое
  const graphH = rect.h - graphTop;

  const enterIndex: Record<string, number> = {};
  const nodes = content.nodes.map((n) => {
    const idx = enterIndex[n.enter_beat] ?? 0;
    enterIndex[n.enter_beat] = idx + 1;
    return {
      id: n.id,
      label: n.label,
      caption: n.caption,
      enter: n.enter,
      enterAt: beatOf(beats, n.enter_beat).start_frame + idx * s.motion.stagger_frames,
      elevation: n.elevation,
      x: n.layout.x * rect.w,
      y: n.layout.y * rect.h - graphTop,
      w: n.layout.w * rect.w,
      h: n.layout.h * rect.h,
    };
  });

  const bl = content.badge.layout;

  return (
    <>
      <div style={{ position: "absolute", left: t.x * rect.w, top: t.y * rect.h, width: t.w * rect.w }}>
        <KineticText
          text={content.title.text}
          beat={beatOf(beats, "b-title-in")}
          mode="letters"
          enter="type"
          size="body"
          font="display"
          align="center"
          color={s.palette.muted}
          maxWidth={t.w * rect.w}
        />
      </div>
      <div style={{ position: "absolute", left: g.x * rect.w, top: graphTop, width: g.w * rect.w, height: graphH }}>
        <FlowGraph
          nodes={nodes}
          edges={content.edges}
          beat={beatOf(beats, content.graph.beat)}
          enter={content.graph.enter}
          width={g.w * rect.w}
          height={graphH}
        >
          {content.flows.map((f, i) => (
            <PulseAlongPath
              key={`${f.edge}-${f.direction}-${i}`}
              edgeId={f.edge}
              beat={beatOf(beats, f.beat)}
              color={accent(s, f.accent)}
              size={content.pulse.size}
              tail={content.pulse.tail}
              count={f.count}
              travel={f.travel}
              repeat={f.repeat}
              reverse={f.direction === "back"}
            />
          ))}
          <AnswerBadge
            content={content}
            beats={beats}
            left={bl.x * rect.w}
            top={bl.y * rect.h - graphTop}
            w={bl.w * rect.w}
            h={bl.h * rect.h}
          />
        </FlowGraph>
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const s = useStyle();
  if (s.transparent) {
    return null;
  }
  return (
    <>
      <Background beat={beatOf(beats, "b-title-in")} variant="aurora" seed="agent" />
      <Particles
        count={content.atmosphere.particles}
        seed={content.atmosphere.seed}
        beat={beatOf(beats, "b-graph-in")}
        layer={0}
        accentShare={0.25}
      />
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Atmosphere beats={timing.beats} content={content} />
    <SafeArea>
      <SceneBody timing={timing} content={content} />
    </SafeArea>
  </StyleProvider>
);
