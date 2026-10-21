import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
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
  pulseArrival,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

type NodeSpec = {
  id: string;
  label: string;
  caption?: string;
  enter: NodeEnter;
  elevation: 0 | 1 | 2 | 3;
  accentIndex?: number;
  enterAt: number;
  flash_on?: string;
  flash_beat?: string;
  flash_repeat?: boolean;
  layout: Layout;
};

type EdgeSpec = { id: string; from: string; to: string };
type FlowSpec = { edge: string; direction: "forward" | "back"; beat: string };

type Content = {
  title: string;
  title_layout: Layout;
  graph_layout: Layout;
  travel: number;
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  flows: FlowSpec[];
  pulse_colors: { forward: number; back: number };
  answer: {
    text: string;
    elevation: 0 | 1 | 2 | 3;
    arrival_edge: string;
    arrival_beat: string;
    layout: Layout;
  };
};

type SceneStyle = React.ComponentProps<typeof StyleProvider>["style"];

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} not found`);
  return b;
};

const AnswerBadge: React.FC<{
  content: Content;
  beats: Beat[];
  graphTop: number;
}> = ({ content, beats, graphTop }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();
  const geo = useFlowGeometry();
  const { answer } = content;
  const arrivalBeat = beatOf(beats, answer.arrival_beat);
  const answerIn = beatOf(beats, "answer-in");
  const emphasisBeat = beatOf(beats, "answer-emphasis");
  const arrivals = geo
    ? geo.arrivals(pulseArrival(answer.arrival_edge, arrivalBeat, content.travel, { count: 1, repeat: false }))
    : [];
  const enterAt = arrivals[0] ?? answerIn.start_frame;
  if (frame < enterAt) return null;

  const w = answer.layout.w * rect.w;
  const h = answer.layout.h * rect.h;
  return (
    <div
      style={{
        position: "absolute",
        left: answer.layout.x * rect.w,
        top: answer.layout.y * rect.h - graphTop,
        width: w,
        height: h,
      }}
    >
      <Emphasis beat={emphasisBeat} loop shape="rounded" accentIndex={0} spread={48}>
        <Card
          elevation={answer.elevation}
          enter="pop"
          beat={{ start_frame: enterAt, end_frame: Math.max(enterAt, answerIn.end_frame) }}
          width={w}
          height={h}
          padding={0}
        >
          <div
            style={{
              width: "100%",
              height: h,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: s.typography.display.family,
              fontWeight: s.typography.display.weight,
              fontSize: typeSize(s, "body", height),
              color: s.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {answer.text}
          </div>
        </Card>
      </Emphasis>
    </div>
  );
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const { beats } = timing;
  const titleBeat = beatOf(beats, "title-in");
  const graphBeat = beatOf(beats, "graph-build");
  const hold = beatOf(beats, "hold");

  const g = content.graph_layout;
  const graphLeft = g.x * rect.w;
  const graphTop = g.y * rect.h;
  const graphW = g.w * rect.w;
  const graphH = g.h * rect.h;

  const nodes = content.nodes.map((n) => {
    const node = {
      id: n.id,
      label: n.label,
      caption: n.caption,
      enter: n.enter,
      enterAt: n.enterAt,
      elevation: n.elevation,
      accentIndex: n.accentIndex,
      x: n.layout.x * rect.w - graphLeft,
      y: n.layout.y * rect.h - graphTop,
      w: n.layout.w * rect.w,
      h: n.layout.h * rect.h,
    };
    if (n.flash_on && n.flash_beat) {
      return {
        ...node,
        flash: pulseArrival(n.flash_on, beatOf(beats, n.flash_beat), content.travel, {
          count: 1,
          repeat: n.flash_repeat ?? false,
        }),
      };
    }
    return node;
  });

  const t = content.title_layout;

  return (
    <>
      {s.transparent ? null : <Background beat={graphBeat} variant="aurora" seed="agent" />}
      <Particles count={60} seed="agent-dust" beat={{ start_frame: graphBeat.start_frame, end_frame: hold.end_frame }} layer={0} />
      <SafeArea>
        <div
          style={{
            position: "absolute",
            left: t.x * rect.w,
            top: t.y * rect.h,
            width: t.w * rect.w,
            height: t.h * rect.h,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <KineticText
            text={content.title}
            beat={titleBeat}
            mode="letters"
            enter="type"
            size="h2"
            align="center"
            maxWidth={t.w * rect.w}
          />
        </div>
        <div
          style={{
            position: "absolute",
            left: graphLeft,
            top: graphTop,
            width: graphW,
            height: graphH,
          }}
        >
          <FlowGraph nodes={nodes} edges={content.edges} beat={graphBeat} width={graphW} height={graphH}>
            {content.flows.map((f) => (
              <PulseAlongPath
                key={`${f.edge}-${f.direction}-${f.beat}`}
                edgeId={f.edge}
                beat={beatOf(beats, f.beat)}
                travel={content.travel}
                count={1}
                repeat={false}
                reverse={f.direction === "back"}
                size={10}
                tail={160}
                color={s.palette.accent[f.direction === "back" ? content.pulse_colors.back : content.pulse_colors.forward]}
              />
            ))}
            <AnswerBadge content={content} beats={beats} graphTop={graphTop} />
          </FlowGraph>
        </div>
      </SafeArea>
    </>
  );
};

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    <AbsoluteFill>
      <SceneBody {...props} />
    </AbsoluteFill>
  </StyleProvider>
);
