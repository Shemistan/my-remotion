import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Emphasis,
  FlowGraph,
  KineticText,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  cardEnterStyle,
  cardSurface,
  pulseArrival,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type StyleInput = React.ComponentProps<typeof StyleProvider>["style"];
type GraphNode = React.ComponentProps<typeof FlowGraph>["nodes"][number];
type NodeEnter = NonNullable<GraphNode["enter"]>;

type Beat = { id: string; start_frame: number; end_frame: number };
type Frame = { start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type Direction = "forward" | "back";

type FlowRef = { edge: string; direction: Direction; beat: string };
type Flow = FlowRef & { accent: number; delay: number };

type NodeContent = {
  id: string;
  label: string;
  caption: string;
  enter: NodeEnter;
  enterAt: number;
  elevation: 0 | 1 | 2 | 3;
  layout: Layout;
};

type Content = {
  kicker: { text: string; layout: Layout };
  graph: {
    layout: Layout;
    travel: number;
    pulse_options: { count: number; repeat: boolean; tail: number; size: number };
    nodes: NodeContent[];
    edges: { id: string; from: string; to: string }[];
    flows: Flow[];
    flash: Record<string, FlowRef[]>;
  };
  answer: { text: string; arrival: FlowRef; layout: Layout };
};

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: StyleInput;
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Frame => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

// Окно конкретного прохода: бит потока, сдвинутый на delay из spec.
const flowBeat = (beats: Beat[], flows: Flow[], ref: FlowRef): Frame => {
  const b = beatOf(beats, ref.beat);
  const f = flows.find((x) => x.edge === ref.edge && x.direction === ref.direction && x.beat === ref.beat);
  const delay = f ? f.delay : 0;
  return { start_frame: Math.min(b.start_frame + delay, b.end_frame), end_frame: b.end_frame };
};

const AnswerBadge: React.FC<{
  text: string;
  arrival: ReturnType<typeof pulseArrival>;
  answerBeat: Frame;
  left: number;
  top: number;
  width: number;
  height: number;
}> = ({ text, arrival, answerBeat, left, top, width, height }) => {
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const s = useStyle();
  const geo = useFlowGeometry();
  const arrivals = geo ? geo.arrivals(arrival) : [];
  const enterAt = arrivals.length > 0 ? arrivals[0]! : answerBeat.start_frame;
  // Акцент передаётся: сначала вспышка узла «Пользователь», затем удар и дыхание плашки.
  const emphStart = Math.max(enterAt + s.motion.stagger_frames, answerBeat.end_frame);

  if (frame < enterAt) return null;

  const surface = cardSurface(s, 2);
  const enterStyle = cardEnterStyle(s, frame, fps, enterAt, "pop");
  const fontSize = typeSize(s, "body", frameH);

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={enterStyle}>
        <Emphasis beat={{ start_frame: emphStart, end_frame: emphStart + s.motion.enter_frames }} loop shape="pill">
          <div
            style={{
              ...surface,
              borderRadius: 999,
              padding: "0.35em 1em",
              fontSize,
              fontFamily: s.typography.body.family,
              fontWeight: 600,
              color: s.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        </Emphasis>
      </div>
    </div>
  );
};

const SceneBody: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const { beats } = timing;
  const g = content.graph;

  const graphBeat = beatOf(beats, "graph-build");
  const kickerBeat = beatOf(beats, "kicker-in");
  const answerBeat = beatOf(beats, "answer-in");

  const gx = g.layout.x * rect.w;
  const gy = g.layout.y * rect.h;
  const gw = g.layout.w * rect.w;
  const gh = g.layout.h * rect.h;

  const opts = { count: g.pulse_options.count, repeat: g.pulse_options.repeat };
  const arrivalOf = (ref: FlowRef) => pulseArrival(ref.edge, flowBeat(beats, g.flows, ref), g.travel, opts);

  const nodes: GraphNode[] = g.nodes.map((n) => {
    const refs = g.flash[n.id] ?? [];
    return {
      id: n.id,
      label: n.label,
      caption: n.caption,
      x: n.layout.x * rect.w - gx,
      y: n.layout.y * rect.h - gy,
      w: n.layout.w * rect.w,
      h: n.layout.h * rect.h,
      elevation: n.elevation,
      enter: n.enter,
      enterAt: n.enterAt,
      ...(refs.length > 0 ? { flash: refs.map(arrivalOf) } : {}),
    };
  });

  const k = content.kicker.layout;
  const a = content.answer.layout;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: k.x * rect.w,
          top: k.y * rect.h,
          width: k.w * rect.w,
          height: k.h * rect.h,
          display: "flex",
          alignItems: "center",
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
          color={s.palette.muted}
          align="center"
          maxWidth={k.w * rect.w}
        />
      </div>

      <div style={{ position: "absolute", left: gx, top: gy, width: gw, height: gh }}>
        <FlowGraph nodes={nodes} edges={g.edges} beat={graphBeat} width={gw} height={gh}>
          {g.flows.map((f, i) => (
            <PulseAlongPath
              key={`${f.edge}-${f.direction}-${i}`}
              edgeId={f.edge}
              beat={flowBeat(beats, g.flows, f)}
              travel={g.travel}
              count={g.pulse_options.count}
              repeat={g.pulse_options.repeat}
              tail={g.pulse_options.tail}
              size={g.pulse_options.size}
              color={accent(s, f.accent)}
              reverse={f.direction === "back"}
            />
          ))}
          <AnswerBadge
            text={content.answer.text}
            arrival={arrivalOf(content.answer.arrival)}
            answerBeat={answerBeat}
            left={a.x * rect.w - gx}
            top={a.y * rect.h - gy}
            width={a.w * rect.w}
            height={a.h * rect.h}
          />
        </FlowGraph>
      </div>
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => {
  const transparent = typeof style === "object" && style !== null && "transparent" in style && style.transparent === true;
  return (
    <StyleProvider style={style}>
      {transparent ? null : <Background beat={beatOf(timing.beats, "graph-build")} variant="aurora" />}
      <SafeArea>
        <SceneBody timing={timing} content={content} />
      </SafeArea>
    </StyleProvider>
  );
};
