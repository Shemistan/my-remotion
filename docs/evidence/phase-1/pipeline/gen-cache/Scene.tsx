import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  DataToken,
  Emphasis,
  Enter,
  FlowGraph,
  PulseAlongPath,
  SafeArea,
  StatusChip,
  StyleProvider,
  accent,
  alpha,
  beatProgress,
  easingOf,
  pulseArrival,
  radius,
  shadow,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimingBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type Tone = "neutral" | "accent" | "positive" | "negative" | "warning";

type NodeSpec = {
  id: string;
  label: string;
  caption: string;
  size: "h2" | "body" | "caption";
  elevation: 0 | 1 | 2 | 3;
  enter: NodeEnter;
  slot: boolean;
  flash_on: string[];
  dim_on?: string;
  dim_opacity?: number;
  layout: Layout;
};
type FlowSpec = {
  beat: string;
  edge: string;
  direction: "forward" | "back";
  repeat: boolean;
  travel: number;
  span: [number, number];
};
// until — бит потока, с приходом которого токен уходит из слота (его сменяет новый токен).
type TokenSpec = { id: string; label: string; flow: string; dock?: "slot"; stay: boolean; until?: string };
type TimerSpec = {
  id: string;
  prefix: string;
  from: number;
  to: number;
  suffix: string;
  size: "h2" | "body";
  number_size: "h1" | "h2" | "body";
  from_flow: string;
  to_flow: string;
  enter_after: string;
  layout: Layout;
};

type Content = {
  locale: "ru" | "en";
  background: {
    variant: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";
    seed: string;
    focus: { x: number; y: number };
  };
  graph: {
    layout: Layout;
    nodes: NodeSpec[];
    edges: { id: string; from: string; to: string }[];
    flows: FlowSpec[];
    tokens: TokenSpec[];
    status: {
      anchor: { node: string; side: "top" | "bottom" | "left" | "right" | "center" };
      states: { text: string; tone: Tone; on: string }[];
    };
  };
  // Установившийся тихий поток финала: кэш продолжает отвечать.
  hold_flow: { edge: string; direction: "forward" | "back"; repeat: boolean; travel: number };
  timers: TimerSpec[];
  verdict: { text: string; highlight: string[]; at: number; layout: Layout };
};

type Props = {
  timing: { duration_frames: number; beats: TimingBeat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

type Flow = FlowSpec & { window: Beat };

const findBeat = (beats: TimingBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  return b ? { start_frame: b.start_frame, end_frame: b.end_frame } : { start_frame: 0, end_frame: 0 };
};

// Биты потоков — доли окна между сборкой схемы и финалом (растягиваются вместе с timing.beats).
const resolveFlows = (flows: FlowSpec[], from: number, to: number): Flow[] => {
  const span = to - from;
  return flows.map((f) => ({
    ...f,
    window: {
      start_frame: from + Math.round(f.span[0] * span),
      end_frame: from + Math.round(f.span[1] * span),
    },
  }));
};

const arrivalOf = (f: Flow) => pulseArrival(f.edge, f.window, f.travel, { repeat: f.repeat });

const GraphOverlay: React.FC<{
  flows: Flow[];
  content: Content;
  statusStart: number;
  statusUntil: number;
  nodeRects: Record<string, Layout>;
}> = ({ flows, content, statusStart, statusUntil, nodeRects }) => {
  const frame = useCurrentFrame();
  const s = useStyle();
  const geo = useFlowGeometry();
  const byBeat = (id: string) => flows.find((f) => f.beat === id);
  const firstArrival = (f: Flow): number => {
    const frames = geo ? geo.arrivals(arrivalOf(f)) : [];
    return frames.length > 0 ? frames[0]! : f.window.start_frame + f.travel;
  };

  const states = content.graph.status.states.map((st) => {
    const f = byBeat(st.on);
    return { text: st.text, tone: st.tone, at: f ? firstArrival(f) : statusStart };
  });

  const dimNode = content.graph.nodes.find((n) => n.dim_on !== undefined);
  const dimFlow = dimNode?.dim_on ? byBeat(dimNode.dim_on) : undefined;
  const dimRect = dimNode ? nodeRects[dimNode.id] : undefined;
  const dimP = dimFlow
    ? beatProgress(
        frame,
        { start_frame: dimFlow.window.start_frame, end_frame: dimFlow.window.start_frame + s.motion.exit_frames },
        easingOf(s, "enter"),
      )
    : 0;

  return (
    <>
      {dimNode && dimRect ? (
        <div
          style={{
            position: "absolute",
            left: dimRect.x,
            top: dimRect.y,
            width: dimRect.w,
            height: dimRect.h,
            borderRadius: radius(s, 2),
            background: alpha(s.palette.bg, (1 - (dimNode.dim_opacity ?? 1)) * dimP),
          }}
        />
      ) : null}
      {content.graph.tokens.map((t) => {
        const f = byBeat(t.flow);
        if (!f) return null;
        const untilFlow = t.until ? byBeat(t.until) : undefined;
        return (
          <DataToken
            key={t.id}
            label={t.label}
            edgeId={f.edge}
            beat={f.window}
            travel={f.travel}
            reverse={f.direction === "back"}
            stay={untilFlow ? true : t.stay}
            until={untilFlow ? firstArrival(untilFlow) : undefined}
            dock={t.dock}
          />
        );
      })}
      {/* К финалу статус уходит: акцент остаётся только у вывода */}
      <StatusChip anchor={content.graph.status.anchor} states={states} until={statusUntil} />
    </>
  );
};

const Verdict: React.FC<{ content: Content; beat: Beat; hold: Beat }> = ({ content, beat, hold }) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  const v = content.verdict;
  const words = v.text.split(" ");
  return (
    <Enter kind="mask" beat={beat}>
      <div
        style={{
          fontFamily: s.typography.display.family,
          fontWeight: s.typography.display.weight,
          fontSize: typeSize(s, "display", height),
          letterSpacing: `${s.typography.tracking.display}em`,
          lineHeight: 1.1,
          color: s.palette.text,
          textAlign: "center",
          whiteSpace: "nowrap",
          padding: "0.12em 0",
        }}
      >
        {words.map((w, i) => (
          <React.Fragment key={`${w}-${i}`}>
            {i > 0 ? " " : null}
            {v.highlight.includes(w) ? (
              <Emphasis beat={hold} ring={false}>
                <span style={{ color: accent(s, 0) }}>{w}</span>
              </Emphasis>
            ) : (
              <span>{w}</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </Enter>
  );
};

const Body: React.FC<Props> = ({ timing, content }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const { height } = useVideoConfig();
  const nodesIn = findBeat(timing.beats, "nodes-in");
  const hold = findBeat(timing.beats, "hold");
  const flows = resolveFlows(content.graph.flows, nodesIn.end_frame, hold.start_frame);
  const flowByBeat = (id: string) => flows.find((f) => f.beat === id);
  const windowStart = nodesIn.end_frame;
  const windowLen = hold.start_frame - windowStart;
  const verdictStart = windowStart + Math.round(content.verdict.at * windowLen);

  const g = content.graph.layout;
  const gx = g.x * rect.w;
  const gy = g.y * rect.h;
  const gw = g.w * rect.w;
  const gh = g.h * rect.h;

  const nodeRects: Record<string, Layout> = {};
  for (const n of content.graph.nodes) {
    nodeRects[n.id] = {
      x: n.layout.x * rect.w - gx,
      y: n.layout.y * rect.h - gy,
      w: n.layout.w * rect.w,
      h: n.layout.h * rect.h,
    };
  }

  const nodes = content.graph.nodes.map((n) => {
    const r = nodeRects[n.id]!;
    const flashFlows = n.flash_on
      .map((id) => flowByBeat(id))
      .filter((f): f is Flow => f !== undefined);
    return {
      id: n.id,
      label: n.label,
      caption: n.caption,
      size: n.size,
      elevation: n.elevation,
      enter: n.enter,
      slot: n.slot,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      flash: flashFlows.map(arrivalOf),
    };
  });

  const resolvePoint = (id: string): number => {
    const f = flowByBeat(id);
    if (f) return f.window.end_frame;
    return findBeat(timing.beats, id).end_frame;
  };

  const v = content.verdict.layout;

  return (
    <SafeArea>
      <div style={{ position: "absolute", left: gx, top: gy, width: gw, height: gh }}>
        <FlowGraph
          nodes={nodes}
          edges={content.graph.edges}
          beat={nodesIn}
          width={gw}
          height={gh}
          overlay={
            <GraphOverlay
              flows={flows}
              content={content}
              statusStart={nodesIn.end_frame}
              statusUntil={hold.start_frame}
              nodeRects={nodeRects}
            />
          }
        >
          <PulseAlongPath
            edgeId={content.hold_flow.edge}
            beat={hold}
            travel={content.hold_flow.travel}
            repeat={content.hold_flow.repeat}
            reverse={content.hold_flow.direction === "back"}
            size={10}
            tail={160}
            color={content.hold_flow.direction === "back" ? accent(s, 1) : accent(s, 0)}
          />
          {flows.map((f) => (
            <PulseAlongPath
              key={f.beat}
              edgeId={f.edge}
              beat={f.window}
              travel={f.travel}
              repeat={f.repeat}
              reverse={f.direction === "back"}
              size={10}
              tail={160}
              color={f.direction === "back" ? accent(s, 1) : accent(s, 0)}
            />
          ))}
        </FlowGraph>
      </div>

      {content.timers.map((t) => {
        const from = flowByBeat(t.from_flow);
        const to = flowByBeat(t.to_flow);
        if (!from || !to) return null;
        const enterAt = resolvePoint(t.enter_after);
        return (
          <div
            key={t.id}
            style={{
              position: "absolute",
              left: t.layout.x * rect.w,
              top: t.layout.y * rect.h,
              width: t.layout.w * rect.w,
              height: t.layout.h * rect.h,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Enter kind="rise" beat={{ start_frame: enterAt, end_frame: enterAt + s.motion.enter_frames }}>
              {/* Плашка-подложка отделяет текст от сетки чертежа */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.3em",
                  padding: "0.12em 0.55em",
                  borderRadius: radius(s, 1),
                  background: alpha(s.palette.surface, 0.82),
                  boxShadow: shadow(s, 1),
                }}
              >
                <span
                  style={{
                    fontFamily: s.typography.body.family,
                    fontWeight: s.typography.body.weight,
                    fontSize: typeSize(s, t.size, height),
                    color: s.palette.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.prefix.trim()}
                </span>
                <AnimatedNumber
                  from={t.from}
                  to={t.to}
                  beat={{ start_frame: from.window.start_frame, end_frame: to.window.start_frame + to.travel }}
                  enterAt={enterAt}
                  locale={content.locale}
                  suffix={t.suffix}
                  size={t.number_size}
                  reserveWidth
                  align="left"
                />
              </div>
            </Enter>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: v.x * rect.w,
          top: v.y * rect.h,
          width: v.w * rect.w,
          height: v.h * rect.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Verdict
          content={content}
          beat={{ start_frame: verdictStart, end_frame: verdictStart + s.motion.enter_frames }}
          hold={hold}
        />
      </div>
    </SafeArea>
  );
};

const Root: React.FC<Props> = (props) => {
  const s = useStyle();
  const nodesIn = findBeat(props.timing.beats, "nodes-in");
  const bg = props.content.background;
  return (
    <>
      {s.transparent ? null : (
        <Background beat={nodesIn} variant={bg.variant} seed={bg.seed} focus={bg.focus} />
      )}
      <Body {...props} />
    </>
  );
};

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    <Root {...props} />
  </StyleProvider>
);
