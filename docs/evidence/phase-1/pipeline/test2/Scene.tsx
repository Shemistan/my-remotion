import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
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
  cardSurface,
  pulseArrival,
  resolveStyle,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type CardEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type Elevation = 0 | 1 | 2 | 3;

type NodeSpec = {
  id: string;
  label: string;
  caption?: string;
  enter: CardEnter;
  enter_offset: number;
  elevation: Elevation;
  accentIndex?: number;
  layout: Layout;
};

type FlowSpec = {
  edge: string;
  direction: "forward" | "back";
  beat: string;
  accentIndex: number;
  flash?: string;
};

type Content = {
  kicker: { text: string; layout: Layout };
  graph: {
    layout: Layout;
    enter: CardEnter;
    nodes: NodeSpec[];
    edges: { id: string; from: string; to: string }[];
    flows: FlowSpec[];
    pulses: { travel: number; repeat: boolean; count: number; size: number; tail: number };
  };
  answer: {
    text: string;
    accentIndex: number;
    flow_edge: string;
    flow_beat: string;
    emphasis_beat: string;
    layout: Layout;
  };
  atmosphere: { particles: number; seed: string };
};

// Тип props.style — ровно вход resolveStyle (без fps): preset — id пресета или StyleBible.
type SceneStyle = Omit<Parameters<typeof resolveStyle>[0], "fps">;

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Нет бита ${id} в props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

// Окно каждого импульса: внутри бита фазы импульсы стартуют со сдвигом stagger_frames.
const flowBeats = (flows: FlowSpec[], beats: TimedBeat[], stagger: number): Beat[] => {
  const seen: Record<string, number> = {};
  return flows.map((f) => {
    const idx = seen[f.beat] ?? 0;
    seen[f.beat] = idx + 1;
    const base = beatOf(beats, f.beat);
    return { start_frame: Math.min(base.start_frame + idx * stagger, base.end_frame), end_frame: base.end_frame };
  });
};

const AnswerBadge: React.FC<{
  answer: Content["answer"];
  arrivalArg: ReturnType<typeof pulseArrival>;
  fallback: number;
  emphasisEnd: number;
  rect: { left: number; top: number; width: number; height: number };
}> = ({ answer, arrivalArg, fallback, emphasisEnd, rect }) => {
  const style = useStyle();
  const { height } = useVideoConfig();
  const geo = useFlowGeometry();
  const arrival = geo?.arrivals(arrivalArg)[0] ?? fallback;
  const beat: Beat = { start_frame: arrival, end_frame: Math.max(arrival, emphasisEnd) };
  const fontSize = typeSize(style, "body", height);

  return (
    <div
      style={{
        position: "absolute",
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Enter kind="pop" beat={beat}>
        <Emphasis beat={beat} loop accentIndex={answer.accentIndex} shape="pill" spread={40}>
          <div
            style={{
              ...cardSurface(style, 2),
              width: rect.width,
              height: rect.height,
              borderRadius: rect.height / 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: style.typography.body.family,
              fontWeight: 600,
              fontSize,
              color: style.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {answer.text}
          </div>
        </Emphasis>
      </Enter>
    </div>
  );
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const style = useStyle();
  const safe = useSafeArea();
  const { beats } = timing;
  const { graph, kicker, answer, atmosphere } = content;

  const kickerBeat = beatOf(beats, "kicker-in");
  const graphBeat = beatOf(beats, "graph-in");
  const stagger = style.motion.stagger_frames;
  const { travel, repeat, count, size, tail } = graph.pulses;

  const pulseBeats = flowBeats(graph.flows, beats, stagger);
  const arrivalOf = (i: number) => pulseArrival(graph.flows[i]!.edge, pulseBeats[i]!, travel, { count, repeat });

  const graphLeft = graph.layout.x * safe.w;
  const graphTop = graph.layout.y * safe.h;
  const graphW = graph.layout.w * safe.w;
  const graphH = graph.layout.h * safe.h;

  const nodes = graph.nodes.map((n) => {
    const flash = graph.flows
      .map((f, i) => (f.flash === n.id ? arrivalOf(i) : null))
      .filter((a): a is ReturnType<typeof pulseArrival> => a !== null);
    return {
      id: n.id,
      label: n.label,
      x: n.layout.x * safe.w - graphLeft,
      y: n.layout.y * safe.h - graphTop,
      w: n.layout.w * safe.w,
      h: n.layout.h * safe.h,
      elevation: n.elevation,
      enter: n.enter,
      ...(n.caption !== undefined ? { caption: n.caption } : {}),
      ...(n.accentIndex !== undefined ? { accentIndex: n.accentIndex } : {}),
      enterAt: graphBeat.start_frame + n.enter_offset,
      ...(flash.length > 0 ? { flash } : {}),
    };
  });

  const replyIdx = graph.flows.findIndex(
    (f) => f.edge === answer.flow_edge && f.beat === answer.flow_beat,
  );
  const replyBeat = beatOf(beats, answer.flow_beat);
  const emphasisBeat = beatOf(beats, answer.emphasis_beat);

  return (
    <>
      <AbsoluteFill>
        <Particles count={atmosphere.particles} seed={atmosphere.seed} beat={{ start_frame: 0, end_frame: graphBeat.end_frame }} layer={0} />
      </AbsoluteFill>
      <SafeArea>
        <div
          style={{
            position: "absolute",
            left: kicker.layout.x * safe.w,
            top: kicker.layout.y * safe.h,
            width: kicker.layout.w * safe.w,
            height: kicker.layout.h * safe.h,
            display: "flex",
            alignItems: "center",
          }}
        >
          <KineticText
            text={kicker.text}
            beat={kickerBeat}
            mode="letters"
            enter="type"
            size="body"
            font="display"
            color={style.palette.muted}
          />
        </div>
        <div style={{ position: "absolute", left: graphLeft, top: graphTop, width: graphW, height: graphH }}>
          <FlowGraph nodes={nodes} edges={graph.edges} beat={graphBeat} width={graphW} height={graphH} enter={graph.enter}>
            {graph.flows.map((f, i) => (
              <PulseAlongPath
                key={`${f.edge}-${f.direction}-${f.beat}`}
                edgeId={f.edge}
                beat={pulseBeats[i]!}
                travel={travel}
                repeat={repeat}
                count={count}
                size={size}
                tail={tail}
                color={accent(style, f.accentIndex)}
                reverse={f.direction === "back"}
              />
            ))}
            {replyIdx >= 0 ? (
              <AnswerBadge
                answer={answer}
                arrivalArg={arrivalOf(replyIdx)}
                fallback={replyBeat.end_frame}
                emphasisEnd={emphasisBeat.end_frame}
                rect={{
                  left: answer.layout.x * safe.w - graphLeft,
                  top: answer.layout.y * safe.h - graphTop,
                  width: answer.layout.w * safe.w,
                  height: answer.layout.h * safe.h,
                }}
              />
            ) : null}
          </FlowGraph>
        </div>
      </SafeArea>
    </>
  );
};

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    {props.style.transparent ? null : <Background beat={{ start_frame: 0, end_frame: beatOf(props.timing.beats, "graph-in").end_frame }} variant="aurora" seed="agent" />}
    <SceneBody {...props} />
  </StyleProvider>
);
