import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import {
  Background,
  Enter,
  FlowGraph,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  pulseArrival,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type TypeLevel = "display" | "h1" | "h2" | "body" | "caption";

type FlowSpec = {
  edge: string;
  direction: "forward" | "back";
  beat: string;
  repeat: boolean;
  count: number;
  accent: number;
};

type FlashSpec = { edge: string; beat: string; repeat: boolean; count: number };

type NodeSpec = {
  id: string;
  label: string;
  caption?: string;
  enter: NodeEnter;
  enter_beat: string;
  stagger_index: number;
  elevation: 0 | 1 | 2 | 3;
  accentIndex?: number;
  emphasis_beat?: string;
  flash_on?: FlashSpec[];
  layout: Layout;
};

type Content = {
  title: { text: string; size: TypeLevel; beat: string; layout: Layout };
  graph: {
    beat: string;
    enter: NodeEnter;
    travel: number;
    pulse_size: number;
    pulse_tail: number;
    layout: Layout;
    edges: { id: string; from: string; to: string }[];
    flows: FlowSpec[];
  };
  nodes: NodeSpec[];
  atmosphere: { particles: number; seed: string; beat: string };
};

type StyleProps = React.ComponentProps<typeof StyleProvider>["style"];

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: StyleProps;
  content: Content;
};

const useBeats = (beats: Beat[]) => {
  const map = new Map(beats.map((b) => [b.id, b]));
  return (id: string): Beat => {
    const b = map.get(id);
    if (!b) throw new Error(`Нет бита ${id} в props.timing.beats`);
    return b;
  };
};

const Title: React.FC<{ content: Content["title"]; beat: Beat }> = ({ content, beat }) => {
  const style = useStyle();
  const rect = useSafeArea();
  const { height } = useVideoConfig();
  const { layout } = content;
  return (
    <div
      style={{
        position: "absolute",
        left: layout.x * rect.w,
        top: layout.y * rect.h,
        width: layout.w * rect.w,
        height: layout.h * rect.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Enter kind="mask" beat={beat}>
        <div
          style={{
            fontFamily: style.typography.display.family,
            fontWeight: style.typography.display.weight,
            fontSize: typeSize(style, content.size, height),
            letterSpacing: `${style.typography.tracking.display}em`,
            lineHeight: 1.15,
            color: style.palette.text,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {content.text}
        </div>
      </Enter>
    </div>
  );
};

const AgentGraph: React.FC<{ content: Content; beatOf: (id: string) => Beat }> = ({
  content,
  beatOf,
}) => {
  const style = useStyle();
  const rect = useSafeArea();
  const { graph } = content;
  const top = graph.layout.y * rect.h;
  const left = graph.layout.x * rect.w;
  const width = graph.layout.w * rect.w;
  const height = graph.layout.h * rect.h;
  const stagger = style.motion.stagger_frames;

  const nodes = content.nodes.map((n) => {
    const emphasisBeat = n.emphasis_beat ? beatOf(n.emphasis_beat) : null;
    return {
      id: n.id,
      label: n.label,
      caption: n.caption,
      // Доли safe area → px внутри области графа
      x: n.layout.x * rect.w - left,
      y: n.layout.y * rect.h - top,
      w: n.layout.w * rect.w,
      h: n.layout.h * rect.h,
      elevation: n.elevation,
      accentIndex: n.accentIndex,
      enter: n.enter,
      enterAt: beatOf(n.enter_beat).start_frame + n.stagger_index * stagger,
      flash: n.flash_on?.map((f) =>
        pulseArrival(f.edge, beatOf(f.beat), graph.travel, { count: f.count, repeat: f.repeat }),
      ),
      emphasis: emphasisBeat
        ? { start_frame: emphasisBeat.start_frame, end_frame: emphasisBeat.end_frame, loop: true }
        : undefined,
    };
  });

  return (
    <div style={{ position: "absolute", left, top, width, height }}>
      <FlowGraph
        nodes={nodes}
        edges={graph.edges}
        beat={beatOf(graph.beat)}
        width={width}
        height={height}
        enter={graph.enter}
      >
        {graph.flows.map((f) => (
          <PulseAlongPath
            key={`${f.edge}-${f.direction}-${f.beat}`}
            edgeId={f.edge}
            beat={beatOf(f.beat)}
            travel={graph.travel}
            count={f.count}
            repeat={f.repeat}
            reverse={f.direction === "back"}
            color={accent(style, f.accent)}
            size={graph.pulse_size}
            tail={graph.pulse_tail}
          />
        ))}
      </FlowGraph>
    </div>
  );
};

const SceneBody: React.FC<SceneProps> = ({ timing, content }) => {
  const style = useStyle();
  const beatOf = useBeats(timing.beats);
  return (
    <AbsoluteFill>
      {!style.transparent && (
        <>
          <Background beat={beatOf(content.title.beat)} variant="aurora" seed="agent" />
          <Particles
            count={content.atmosphere.particles}
            seed={content.atmosphere.seed}
            beat={beatOf(content.atmosphere.beat)}
            layer={0}
          />
        </>
      )}
      <SafeArea>
        <Title content={content.title} beat={beatOf(content.title.beat)} />
        <AgentGraph content={content} beatOf={beatOf} />
      </SafeArea>
    </AbsoluteFill>
  );
};

export const Scene: React.FC<SceneProps> = (props) => (
  <StyleProvider style={props.style}>
    <SceneBody {...props} />
  </StyleProvider>
);
