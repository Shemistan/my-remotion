import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Emphasis,
  Enter,
  FlowGraph,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  flowTiming,
  fpsFrames,
  pathD,
  pulseArrival,
  radius,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

type NodeContent = {
  id: string;
  label: string;
  caption?: string;
  enter: NodeEnter;
  enter_beat: string;
  cascade_index: number;
  elevation: 0 | 1 | 2 | 3;
  accentIndex: number;
  flash: { edge: string; beat: string };
  breathe: boolean;
  layout: Layout;
};

type EdgeContent = { id: string; from: string; to: string };
type FlowContent = { edge: string; direction: "forward" | "back"; beat: string };

type SceneContent = {
  title: string;
  title_layout: Layout;
  graph_layout: Layout;
  nodes: NodeContent[];
  edges: EdgeContent[];
  graph_beats: [string, string];
  flows: FlowContent[];
  pulse: { travel: number; count: number; repeat: boolean; tail: number; size: number };
  pulse_colors: { forward: number; back: number };
  edge_idle: { accentIndex: number; alpha: number };
  background_beat: string;
  particles: { count: number; seed: string; beat: string };
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
};

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: SceneStyle;
  content: SceneContent;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Нет бита «${id}» в props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

// Рёбра после прорисовки тихо светятся акцентом и мягко мерцают до конца сцены.
const EdgeIdleGlow: React.FC<{ width: number; height: number; idle: SceneContent["edge_idle"] }> = ({
  width,
  height,
  idle,
}) => {
  const frame = useCurrentFrame();
  const s = useStyle();
  const geo = useFlowGeometry();
  if (!geo) return null;
  const period = fpsFrames(s, 72);
  const color = accent(s, idle.accentIndex);
  return (
    <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      {[...geo.edges.entries()].map(([id, seg], i) => {
        const ready = geo.ready.get(id) ?? Number.POSITIVE_INFINITY;
        const on = interpolate(frame, [ready, ready + s.motion.enter_frames], [0, 1], CLAMP);
        const shimmer = 0.75 + 0.25 * Math.sin(((frame - ready) / period) * Math.PI * 2 + i * 1.3);
        return (
          <path
            key={id}
            d={pathD([seg])}
            fill="none"
            stroke={alpha(color, idle.alpha * shimmer)}
            strokeWidth={4}
            strokeLinecap="round"
            opacity={on}
          />
        );
      })}
    </svg>
  );
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const s = useStyle();
  const { height, fps } = useVideoConfig();
  const rect = useSafeArea();
  const beats = timing.beats;
  const { pulse } = content;

  const titleBeat = beatOf(beats, "title-in");
  const graphBeat: Beat = {
    start_frame: beatOf(beats, content.graph_beats[0]).start_frame,
    end_frame: beatOf(beats, content.graph_beats[1]).end_frame,
  };

  const gx = content.graph_layout.x * rect.w;
  const gy = content.graph_layout.y * rect.h;
  const gw = content.graph_layout.w * rect.w;
  const gh = content.graph_layout.h * rect.h;

  const arrivalOf = (n: NodeContent) =>
    pulseArrival(n.flash.edge, beatOf(beats, n.flash.beat), pulse.travel, {
      count: pulse.count,
      repeat: pulse.repeat,
    });

  const nodes = content.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    caption: n.caption,
    x: n.layout.x * rect.w - gx,
    y: n.layout.y * rect.h - gy,
    w: n.layout.w * rect.w,
    h: n.layout.h * rect.h,
    elevation: n.elevation,
    accentIndex: n.accentIndex,
    enter: n.enter,
    enterAt: beatOf(beats, n.enter_beat).start_frame + n.cascade_index * s.motion.stagger_frames,
    flash: arrivalOf(n),
  }));

  // Узел-получатель ответа после удара вспышки продолжает дышать до конца сцены.
  const ft = flowTiming(nodes, content.edges, graphBeat, s, fps);
  const breathing = content.nodes
    .filter((n) => n.breathe)
    .map((n) => {
      const node = nodes.find((x) => x.id === n.id)!;
      const arrivals = ft.arrivals(arrivalOf(n));
      const hit = arrivals.length > 0 ? arrivals[0]! : beatOf(beats, n.flash.beat).end_frame;
      return { node, beat: { start_frame: hit + s.motion.exit_frames, end_frame: timing.duration_frames } };
    });

  const nodeRadius = radius(s, 2);

  return (
    <SafeArea>
      <div
        style={{
          position: "absolute",
          left: content.title_layout.x * rect.w,
          top: content.title_layout.y * rect.h,
          width: content.title_layout.w * rect.w,
          height: content.title_layout.h * rect.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Enter kind="mask" beat={titleBeat}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: s.typography.display.weight,
              fontSize: typeSize(s, "h2", height),
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.text,
              textAlign: "center",
              whiteSpace: "nowrap",
              lineHeight: 1.15,
            }}
          >
            {content.title}
          </div>
        </Enter>
      </div>

      <div style={{ position: "absolute", left: gx, top: gy, width: gw, height: gh }}>
        <FlowGraph nodes={nodes} edges={content.edges} beat={graphBeat} width={gw} height={gh}>
          <EdgeIdleGlow width={gw} height={gh} idle={content.edge_idle} />
          {content.flows.map((f) => (
            <PulseAlongPath
              key={`${f.edge}-${f.beat}`}
              edgeId={f.edge}
              beat={beatOf(beats, f.beat)}
              travel={pulse.travel}
              count={pulse.count}
              repeat={pulse.repeat}
              tail={pulse.tail}
              size={pulse.size}
              color={accent(s, f.direction === "back" ? content.pulse_colors.back : content.pulse_colors.forward)}
              reverse={f.direction === "back"}
            />
          ))}
        </FlowGraph>
        {breathing.map(({ node, beat }) => (
          <div key={node.id} style={{ position: "absolute", left: node.x, top: node.y, pointerEvents: "none" }}>
            <Emphasis beat={beat} loop shape="rounded" radius={nodeRadius} halo={false} display="block">
              <div style={{ width: node.w, height: node.h, borderRadius: nodeRadius }} />
            </Emphasis>
          </div>
        ))}
      </div>
    </SafeArea>
  );
};

export const Scene: React.FC<Props> = (props) => {
  const { timing, style, content } = props;
  return (
    <StyleProvider style={style}>
      {style.transparent ? null : (
        <>
          <Background beat={beatOf(timing.beats, content.background_beat)} variant="aurora" seed="agent" />
          <Particles
            count={content.particles.count}
            seed={content.particles.seed}
            beat={beatOf(timing.beats, content.particles.beat)}
            layer={0}
          />
        </>
      )}
      <SceneBody {...props} />
    </StyleProvider>
  );
};
