import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
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
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Frac = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
// enter_at — доля бита graph-in до входа узла: каскад растянут по биту, тайминг живёт в props.
type NodeSpec = { id: string; label: string; elevation: 0 | 1 | 2 | 3; enter: NodeEnter; enter_at: number; layout: Frac };
type EdgeSpec = { id: string; from: string; to: string };
type PulseSpec = { travel: number; count: number; repeat: boolean; accent_index?: number };

type Content = {
  locale: "ru" | "en";
  title: string;
  mono_label: string;
  micro_label: string;
  mono_count: string;
  conclusion: string;
  graph: {
    layout: Frac;
    nodes: NodeSpec[];
    edges: EdgeSpec[];
    mono_edges: string[];
    micro_edge: string;
    pulses: { mono: PulseSpec; micro: PulseSpec };
  };
  micro_count: { from: number; to: number; suffix_forms: [string, string, string] };
  layout: Record<"title" | "mono_label" | "micro_label" | "mono_count" | "micro_count" | "conclusion", Frac>;
};

type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" missing in props.timing.beats`);
  return b;
};

const Body: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  const rect = useSafeArea();
  const stagger = s.motion.stagger_frames;

  const titleIn = beatOf(beats, "title-in");
  const labelsIn = beatOf(beats, "labels-in");
  const graphIn = beatOf(beats, "graph-in");
  const countIn = beatOf(beats, "count-in");
  const monoFlow = beatOf(beats, "mono-flow");
  const microFlow = beatOf(beats, "micro-flow");
  const countRun = beatOf(beats, "micro-count-run");
  const conclusionIn = beatOf(beats, "conclusion-in");
  const monoResultIn = beatOf(beats, "mono-result-in");
  const finalEmphasis = beatOf(beats, "final-emphasis");

  const box = (f: Frac): React.CSSProperties => ({
    position: "absolute",
    left: f.x * rect.w,
    top: f.y * rect.h,
    width: f.w * rect.w,
    height: f.h * rect.h,
    display: "flex",
    alignItems: "center",
  });

  const L = content.layout;
  const g = content.graph;
  const graphW = g.layout.w * rect.w;
  const graphH = g.layout.h * rect.h;

  const graphLen = graphIn.end_frame - graphIn.start_frame;
  const nodes = g.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    x: n.layout.x * rect.w - g.layout.x * rect.w,
    y: n.layout.y * rect.h - g.layout.y * rect.h,
    w: n.layout.w * rect.w,
    h: n.layout.h * rect.h,
    elevation: n.elevation,
    enter: n.enter,
    enterAt: graphIn.start_frame + Math.round(n.enter_at * graphLen),
  }));

  // Один импульс проходит цепочку монолита последовательно: бит mono-flow делится на подбиты по рёбрам.
  const monoN = g.mono_edges.length;
  const monoStep = (monoFlow.end_frame - monoFlow.start_frame) / monoN;
  const monoBeats = g.mono_edges.map((_, i) => ({
    start_frame: Math.round(monoFlow.start_frame + i * monoStep),
    end_frame: Math.round(monoFlow.start_frame + (i + 1) * monoStep),
  }));

  const microLabelBeat = { start_frame: labelsIn.start_frame + stagger, end_frame: labelsIn.end_frame };

  return (
    <>
      <div style={box(L.title)}>
        <KineticText text={content.title} beat={titleIn} mode="words" enter="rise" size="h2" maxWidth={L.title.w * rect.w} />
      </div>

      <div style={box(L.mono_label)}>
        <KineticText text={content.mono_label} beat={labelsIn} mode="words" enter="slide" size="body" color={s.palette.muted} />
      </div>
      <div style={box(L.micro_label)}>
        <KineticText text={content.micro_label} beat={microLabelBeat} mode="words" enter="slide" size="body" />
      </div>

      <div
        style={{
          position: "absolute",
          left: g.layout.x * rect.w,
          top: g.layout.y * rect.h,
          width: graphW,
          height: graphH,
        }}
      >
        <FlowGraph nodes={nodes} edges={g.edges} beat={graphIn} width={graphW} height={graphH} enter="flip">
          {g.mono_edges.map((edgeId, i) => (
            <PulseAlongPath
              key={edgeId}
              edgeId={edgeId}
              beat={monoBeats[i]!}
              travel={g.pulses.mono.travel}
              count={g.pulses.mono.count}
              repeat={g.pulses.mono.repeat}
              color={s.palette.muted}
              size={10}
              tail={160}
            />
          ))}
          <PulseAlongPath
            edgeId={g.micro_edge}
            beat={microFlow}
            travel={g.pulses.micro.travel}
            count={g.pulses.micro.count}
            repeat={g.pulses.micro.repeat}
            color={accent(s, g.pulses.micro.accent_index ?? 1)}
            size={12}
            tail={180}
          />
        </FlowGraph>
      </div>

      <div style={box(L.mono_count)}>
        <Enter kind="blur" beat={monoResultIn}>
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: s.typography.display.weight,
              fontSize: typeSize(s, "h2", height),
              color: s.palette.muted,
              whiteSpace: "nowrap",
            }}
          >
            {content.mono_count}
          </div>
        </Enter>
      </div>

      <div style={box(L.micro_count)}>
        <Emphasis beat={finalEmphasis} loop shape="pill" accentIndex={0} spread={48} strength={1.3}>
          <AnimatedNumber
            from={content.micro_count.from}
            to={content.micro_count.to}
            enterAt={countIn.start_frame}
            beat={countRun}
            locale={content.locale}
            suffix={content.micro_count.suffix_forms}
            size={8}
            align="left"
          />
        </Emphasis>
      </div>

      <div style={{ ...box(L.conclusion), justifyContent: "center" }}>
        <Enter kind="mask" beat={conclusionIn}>
          <div
            style={{
              fontFamily: s.typography.body.family,
              fontWeight: 600,
              fontSize: typeSize(s, "body", height),
              color: s.palette.text,
              whiteSpace: "nowrap",
            }}
          >
            {content.conclusion}
          </div>
        </Enter>
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ beat: Beat }> = ({ beat }) => {
  const s = useStyle();
  return (
    <>
      {s.transparent ? null : <Background beat={beat} variant="aurora" seed="releases" />}
      <AbsoluteFill>
        <Particles count={60} seed="releases-dust" beat={beat} layer={0} />
      </AbsoluteFill>
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Atmosphere beat={beatOf(timing.beats, "title-in")} />
    <SafeArea>
      <Body beats={timing.beats} content={content} />
    </SafeArea>
  </StyleProvider>
);
