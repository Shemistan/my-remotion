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
  beatProgress,
  easingOf,
  pulseArrival,
  shadow,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimingBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type Elevation = 0 | 1 | 2 | 3;

type NodeContent = {
  id: string;
  label: string;
  caption?: string;
  enter: NodeEnter;
  elevation: Elevation;
  layout: Layout;
};

type FlowContent = { edge: string; direction: "forward" | "back"; beat: string };

type StatusContent = {
  text: string;
  color: "negative" | "text";
  entrance: "pop" | "rise";
  beat: string;
  layout: Layout;
};

type Content = {
  title: { text: string; beat: string; layout: Layout };
  graph: {
    beat: string;
    layout: Layout;
    nodes: NodeContent[];
    edges: { id: string; from: string; to: string }[];
    flows: FlowContent[];
    pulse: { travel: number; repeat: boolean; count: number; size: number; tail: number };
    pulse_colors: { forward: number; back: number };
    flash: { node: string; edge: string; beat: string };
    dim: { node: string; beat: string; opacity: number };
  };
  status: {
    miss: StatusContent;
    write: StatusContent;
    dim: { beat: string; opacity: number };
  };
  hit: { text: string; beat: string; emphasis_beat: string; layout: Layout };
  atmosphere: { particles: number };
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
};

export type SceneProps = {
  timing: { duration_frames: number; beats: TimingBeat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: TimingBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat not found: ${id}`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

// Один и тот же граф, обрезанный по вертикали splitX: левая часть (клиент, кэш)
// всегда полной яркости, правая (ребро к источнику и источник) тускнеет на попадании.
const GraphLayer: React.FC<{
  content: Content["graph"];
  beats: TimingBeat[];
  rect: { w: number; h: number };
  side: "left" | "right";
  splitX: number;
  opacity: number;
}> = ({ content, beats, rect, side, splitX, opacity }) => {
  const style = useStyle();
  const { travel, repeat, count, size, tail } = content.pulse;
  const graphW = content.layout.w * rect.w;
  const graphH = content.layout.h * rect.h;
  const top = content.layout.y * rect.h;
  const left = content.layout.x * rect.w;
  const flashBeat = beatOf(beats, content.flash.beat);

  const nodes = content.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    caption: n.caption,
    enter: n.enter,
    elevation: n.elevation,
    accentIndex: 0,
    x: n.layout.x * rect.w - left,
    y: n.layout.y * rect.h - top,
    w: n.layout.w * rect.w,
    h: n.layout.h * rect.h,
    ...(n.id === content.flash.node
      ? { flash: pulseArrival(content.flash.edge, flashBeat, travel, { count, repeat }) }
      : {}),
  }));

  const far = 2000;
  const clip =
    side === "left"
      ? `polygon(${-far}px ${-far}px, ${splitX}px ${-far}px, ${splitX}px ${graphH + far}px, ${-far}px ${graphH + far}px)`
      : `polygon(${splitX}px ${-far}px, ${graphW + far}px ${-far}px, ${graphW + far}px ${graphH + far}px, ${splitX}px ${graphH + far}px)`;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: graphW,
        height: graphH,
        clipPath: clip,
        opacity,
      }}
    >
      <FlowGraph
        nodes={nodes}
        edges={content.edges}
        beat={beatOf(beats, content.beat)}
        width={graphW}
        height={graphH}
      >
        {content.flows.map((f) => (
          <PulseAlongPath
            key={`${f.edge}-${f.beat}`}
            edgeId={f.edge}
            beat={beatOf(beats, f.beat)}
            travel={travel}
            repeat={repeat}
            count={count}
            size={size}
            tail={tail}
            reverse={f.direction === "back"}
            color={accent(style, f.direction === "back" ? content.pulse_colors.back : content.pulse_colors.forward)}
          />
        ))}
      </FlowGraph>
    </div>
  );
};

const StatusPill: React.FC<{
  status: StatusContent;
  beat: Beat;
  rect: { w: number; h: number };
  opacity: number;
}> = ({ status, beat, rect, opacity }) => {
  const style = useStyle();
  const { height } = useVideoConfig();
  const { palette } = style;
  return (
    <div
      style={{
        position: "absolute",
        left: status.layout.x * rect.w,
        top: status.layout.y * rect.h,
        width: status.layout.w * rect.w,
        height: status.layout.h * rect.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <Enter kind={status.entrance} beat={beat}>
        <div
          style={{
            padding: "0.22em 0.9em",
            borderRadius: 999,
            background: palette.surface,
            boxShadow: shadow(style, 1),
            color: palette[status.color],
            fontFamily: style.typography.body.family,
            fontWeight: 600,
            fontSize: typeSize(style, "body", height),
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
        >
          {status.text}
        </div>
      </Enter>
    </div>
  );
};

const SceneBody: React.FC<SceneProps> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const style = useStyle();
  const rect = useSafeArea();
  const { beats } = timing;
  const { palette, typography } = style;

  const graph = content.graph;
  const graphLeft = graph.layout.x * rect.w;
  const cache = graph.nodes.find((n) => n.id === "node-cache") ?? graph.nodes[1]!;
  const splitX = (cache.layout.x + cache.layout.w) * rect.w - graphLeft + 8;

  const graphDimP = beatProgress(frame, beatOf(beats, graph.dim.beat), easingOf(style, "enter"));
  const graphDim = interpolate(graphDimP, [0, 1], [1, graph.dim.opacity], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const statusDimP = beatProgress(frame, beatOf(beats, content.status.dim.beat), easingOf(style, "enter"));
  const statusDim = interpolate(statusDimP, [0, 1], [1, content.status.dim.opacity], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const title = content.title;
  const hit = content.hit;

  return (
    <>
      {/* заголовок — шторка снизу */}
      <div
        style={{
          position: "absolute",
          left: title.layout.x * rect.w,
          top: title.layout.y * rect.h,
          width: title.layout.w * rect.w,
          height: title.layout.h * rect.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Enter kind="mask" beat={beatOf(beats, title.beat)}>
          <div
            style={{
              fontFamily: typography.display.family,
              fontWeight: typography.display.weight,
              fontSize: typeSize(style, "h2", height),
              letterSpacing: `${typography.tracking.display}em`,
              color: palette.text,
              lineHeight: 1.15,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {title.text}
          </div>
        </Enter>
      </div>

      {/* схема: клиент → кэш → источник */}
      <GraphLayer content={graph} beats={beats} rect={rect} side="left" splitX={splitX} opacity={1} />
      <GraphLayer content={graph} beats={beats} rect={rect} side="right" splitX={splitX} opacity={graphDim} />

      {/* статусы промаха и записи — без свечения */}
      <StatusPill
        status={content.status.miss}
        beat={beatOf(beats, content.status.miss.beat)}
        rect={rect}
        opacity={statusDim}
      />
      <StatusPill
        status={content.status.write}
        beat={beatOf(beats, content.status.write.beat)}
        rect={rect}
        opacity={statusDim}
      />

      {/* герой — «Попадание» */}
      <div
        style={{
          position: "absolute",
          left: hit.layout.x * rect.w,
          top: hit.layout.y * rect.h,
          width: hit.layout.w * rect.w,
          height: hit.layout.h * rect.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Enter kind="scale" beat={beatOf(beats, hit.beat)}>
          <Emphasis
            beat={beatOf(beats, hit.emphasis_beat)}
            loop
            accentIndex={0}
            shape="pill"
            ring
            spread={48}
          >
            <div
              style={{
                fontFamily: typography.display.family,
                fontWeight: typography.display.weight,
                fontSize: typeSize(style, "display", height),
                letterSpacing: `${typography.tracking.display}em`,
                color: palette.text,
                lineHeight: 1,
                padding: "0.04em 0.3em 0.1em",
                whiteSpace: "nowrap",
              }}
            >
              {hit.text}
            </div>
          </Emphasis>
        </Enter>
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ transparent: boolean; count: number; beats: TimingBeat[] }> = ({
  transparent,
  count,
  beats,
}) => {
  if (transparent) return null;
  return (
    <>
      <Background variant="aurora" beat={beatOf(beats, "b-title-in")} seed="cache-flow" />
      <Particles count={count} seed="cache-dust" beat={beatOf(beats, "b-graph-in")} layer={0} accentShare={0.2} />
    </>
  );
};

export const Scene: React.FC<SceneProps> = (props) => {
  return (
    <StyleProvider style={props.style}>
      <Atmosphere
        transparent={props.style.transparent === true}
        count={props.content.atmosphere.particles}
        beats={props.timing.beats}
      />
      <SafeArea>
        <SceneBody {...props} />
      </SafeArea>
    </StyleProvider>
  );
};
