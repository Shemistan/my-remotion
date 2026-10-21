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
type Span = { start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type CardEnterKind = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

type NodeContent = {
  id: string;
  label: string;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
  elevation: 0 | 1 | 2 | 3;
  enter: CardEnterKind;
  enter_offset: number;
  accent_index?: number;
};

type EdgeContent = { id: string; from: string; to: string };

type Content = {
  title: string;
  points: unknown[];
  kicker: { text: string; layout: Layout };
  graph: { width: number; height: number; enter: CardEnterKind; layout: Layout };
  nodes: NodeContent[];
  edges: EdgeContent[];
  pulses: {
    travel: number;
    count: number;
    repeat: boolean;
    size: number;
    tail: number;
    accent_index: Record<string, number>;
  };
  flows: { request: string; tool_calls: string[]; tool_returns: string[]; answer: string };
  badge: { text: string; layout: Layout; elevation: 0 | 1 | 2 | 3; accent_index: number };
  particles: { count: number; seed: string };
  background_seed: string;
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: Content;
};

type Arrival = ReturnType<typeof pulseArrival>;

const findBeat = (beats: Beat[], id: string): Span => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Beat "${id}" not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

// Веер импульсов: старт каждого сдвинут на stagger, все проходы укладываются в бит.
const fanBeats = (beat: Span, n: number, stagger: number): Span[] =>
  Array.from({ length: n }, (_, i) => ({
    start_frame: beat.start_frame + i * stagger,
    end_frame: beat.end_frame,
  }));

const fanTravel = (beat: Span, n: number, stagger: number, travel: number): number =>
  Math.max(1, Math.min(travel, beat.end_frame - beat.start_frame - (n - 1) * stagger));

const AnswerBadge: React.FC<{
  content: Content["badge"];
  arrival: Arrival;
  fallbackStart: number;
  enterBeat: Span;
  holdEnd: number;
  graphTop: number;
}> = ({ content, arrival, fallbackStart, enterBeat, holdEnd, graphTop }) => {
  const style = useStyle();
  const { height } = useVideoConfig();
  const rect = useSafeArea();
  const geo = useFlowGeometry();
  const at = geo?.arrivals(arrival)[0] ?? fallbackStart;
  const enterLen = enterBeat.end_frame - enterBeat.start_frame;
  const emphasisStart = Math.max(enterBeat.end_frame, at + enterLen);

  return (
    <div
      style={{
        position: "absolute",
        left: content.layout.x * rect.w,
        top: content.layout.y * rect.h - graphTop,
        display: "inline-block",
      }}
    >
      <Emphasis
        beat={{ start_frame: emphasisStart, end_frame: holdEnd }}
        loop
        shape="pill"
        accentIndex={content.accent_index}
      >
        <Card
          elevation={content.elevation}
          beat={{ start_frame: at, end_frame: at + enterLen }}
          enter="pop"
          padding={0}
          style={{ borderRadius: style.surfaces.radius[3] }}
        >
          <div
            style={{
              padding: "0.3em 0.75em",
              fontSize: typeSize(style, "body", height),
              fontFamily: style.typography.body.family,
              fontWeight: 600,
              color: style.palette.text,
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            }}
          >
            {content.text}
          </div>
        </Card>
      </Emphasis>
    </div>
  );
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const style = useStyle();
  const rect = useSafeArea();
  const beats = timing.beats;

  const kickerBeat = findBeat(beats, "kicker-in");
  const graphBeat = findBeat(beats, "graph-build");
  const requestBeat = findBeat(beats, "request-pulse");
  const callsBeat = findBeat(beats, "tool-calls");
  const returnsBeat = findBeat(beats, "tool-returns");
  const answerBeat = findBeat(beats, "answer-return");
  const answerInBeat = findBeat(beats, "answer-in");
  const holdBeat = findBeat(beats, "final-hold");

  const { pulses, flows } = content;
  const stagger = style.motion.stagger_frames;
  const opts = { count: pulses.count, repeat: pulses.repeat };

  const callBeats = fanBeats(callsBeat, flows.tool_calls.length, stagger);
  const callTravel = fanTravel(callsBeat, flows.tool_calls.length, stagger, pulses.travel);
  const returnBeats = fanBeats(returnsBeat, flows.tool_returns.length, stagger);
  const returnTravel = fanTravel(returnsBeat, flows.tool_returns.length, stagger, pulses.travel);

  const lastReturn = flows.tool_returns.length - 1;
  const requestArrival = pulseArrival(flows.request, requestBeat, pulses.travel, opts);
  const answerArrival = pulseArrival(flows.answer, answerBeat, pulses.travel, opts);
  const lastReturnArrival = pulseArrival(
    flows.tool_returns[lastReturn]!,
    returnBeats[lastReturn]!,
    returnTravel,
    opts,
  );

  const edgeTarget = (edgeId: string): string | undefined =>
    content.edges.find((e) => e.id === edgeId)?.to;
  const userId = content.edges.find((e) => e.id === flows.answer)?.from;
  const orcId = edgeTarget(flows.request);

  const flashOf = (nodeId: string): Arrival[] => {
    if (nodeId === userId) return [answerArrival];
    if (nodeId === orcId) return [requestArrival, lastReturnArrival];
    const i = flows.tool_calls.findIndex((edgeId) => edgeTarget(edgeId) === nodeId);
    return i >= 0 ? [pulseArrival(flows.tool_calls[i]!, callBeats[i]!, callTravel, opts)] : [];
  };

  const nodes = content.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    caption: n.caption,
    x: n.x,
    y: n.y,
    w: n.w,
    h: n.h,
    elevation: n.elevation,
    enter: n.enter,
    enterAt: graphBeat.start_frame + n.enter_offset,
    flash: flashOf(n.id),
    ...(n.accent_index !== undefined ? { accentIndex: n.accent_index } : {}),
  }));

  const pulseColor = (edgeId: string): string => accent(style, pulses.accent_index[edgeId] ?? 0);
  const graphTop = content.graph.layout.y * rect.h;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: content.kicker.layout.x * rect.w,
          top: content.kicker.layout.y * rect.h,
          width: content.kicker.layout.w * rect.w,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <KineticText
          text={content.kicker.text}
          beat={kickerBeat}
          mode="letters"
          enter="type"
          size="body"
          font="mono"
          color={style.palette.muted}
          align="center"
          maxWidth={content.kicker.layout.w * rect.w}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: content.graph.layout.x * rect.w,
          top: graphTop,
          width: content.graph.width,
          height: content.graph.height,
        }}
      >
        <FlowGraph
          nodes={nodes}
          edges={content.edges}
          beat={graphBeat}
          width={content.graph.width}
          height={content.graph.height}
          enter={content.graph.enter}
        >
          <PulseAlongPath
            edgeId={flows.request}
            beat={requestBeat}
            travel={pulses.travel}
            count={pulses.count}
            repeat={pulses.repeat}
            size={pulses.size}
            tail={pulses.tail}
            color={pulseColor(flows.request)}
          />
          {flows.tool_calls.map((edgeId, i) => (
            <PulseAlongPath
              key={`call-${edgeId}`}
              edgeId={edgeId}
              beat={callBeats[i]!}
              travel={callTravel}
              count={pulses.count}
              repeat={pulses.repeat}
              size={pulses.size}
              tail={pulses.tail}
              color={pulseColor(edgeId)}
            />
          ))}
          {flows.tool_returns.map((edgeId, i) => (
            <PulseAlongPath
              key={`return-${edgeId}`}
              edgeId={edgeId}
              beat={returnBeats[i]!}
              travel={returnTravel}
              count={pulses.count}
              repeat={pulses.repeat}
              size={pulses.size}
              tail={pulses.tail}
              color={pulseColor(edgeId)}
              reverse
            />
          ))}
          <PulseAlongPath
            edgeId={flows.answer}
            beat={answerBeat}
            travel={pulses.travel}
            count={pulses.count}
            repeat={pulses.repeat}
            size={pulses.size}
            tail={pulses.tail}
            color={pulseColor(flows.answer)}
            reverse
          />
          <AnswerBadge
            content={content.badge}
            arrival={answerArrival}
            fallbackStart={answerInBeat.start_frame}
            enterBeat={answerInBeat}
            holdEnd={holdBeat.end_frame}
            graphTop={graphTop}
          />
        </FlowGraph>
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ timing: Props["timing"]; content: Content }> = ({ timing, content }) => {
  const style = useStyle();
  const intro = findBeat(timing.beats, "kicker-in");
  const build = findBeat(timing.beats, "graph-build");
  const dust = { start_frame: intro.start_frame, end_frame: build.end_frame };
  return (
    <>
      {style.transparent ? null : (
        <Background beat={intro} variant="aurora" seed={content.background_seed} />
      )}
      <Particles
        count={content.particles.count}
        seed={content.particles.seed}
        beat={dust}
        layer={0}
        accentShare={0.2}
      />
    </>
  );
};

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    <Atmosphere timing={props.timing} content={props.content} />
    <SafeArea>
      <SceneBody {...props} />
    </SafeArea>
  </StyleProvider>
);
