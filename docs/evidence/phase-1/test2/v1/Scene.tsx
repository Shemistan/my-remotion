import React from "react";
import {
  Background,
  DataToken,
  FlowGraph,
  KineticText,
  PulseAlongPath,
  SafeArea,
  StatusChip,
  StyleProvider,
  accent,
  pulseArrival,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Window = { start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type Tone = "neutral" | "accent" | "positive" | "negative" | "warning";

type NodeSpec = {
  id: string;
  label: string;
  caption: string;
  kind: "client" | "llm" | "service" | "store" | "queue" | "cache";
  size: "h2" | "body" | "caption";
  slot?: boolean;
  elevation: 0 | 1 | 2 | 3;
  enter: "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
  accentIndex?: number;
  delay: number;
  layout: Layout;
};

type FlowSpec = {
  edge: string;
  direction: "forward" | "back";
  beat: string;
  count: number;
  repeat: boolean;
  travel: number;
  delay: number;
};

type Content = {
  background: {
    variant: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";
    seed: string;
    focus: { x: number; y: number };
  };
  request: {
    id: string;
    text: string;
    beat: string;
    size: "display" | "h1" | "h2" | "body" | "caption";
    mode: "words" | "letters";
    enter: "rise" | "fade" | "scale" | "slide" | "type";
    pre: "dim" | "hidden";
    align: "left" | "center" | "right";
    layout: Layout;
  };
  graph: {
    id: string;
    beat: string;
    pre: "silhouette" | "hidden";
    layout: Layout;
    nodes: NodeSpec[];
    edges: { id: string; from: string; to: string }[];
    flows: FlowSpec[];
    pulse: { size: number; tail: number; forward_accent: number; back_accent: number };
    orch_emphasis: { node: string; beat: string };
    user_emphasis: { node: string; beat: string };
    hold: { mode: "now-pulse" | "steady-flow" | "repeat-result" | "data-shimmer" | "settle-push"; beat: string; node: string };
  };
  status: {
    id: string;
    node: string;
    size: "caption" | "body";
    layout: Layout;
    states: { text: string; tone: Tone; on: string }[];
    min_hold_frames: number;
  };
  token: {
    id: string;
    label: string;
    edge: string;
    beat: string;
    reverse: boolean;
    travel: number;
    dock: "slot";
    tone: "accent";
    accentIndex: number;
    size: "caption" | "body";
    mono: boolean;
    layout: Layout;
  };
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

type Beats = Record<string, Window>;

const beatsById = (beats: Beat[]): Beats =>
  Object.fromEntries(beats.map((b) => [b.id, { start_frame: b.start_frame, end_frame: b.end_frame }]));

const flowKey = (f: FlowSpec) => (f.direction === "back" ? `${f.edge}:back` : f.edge);

type PlannedFlow = FlowSpec & { window: Window; key: string };

// Окна импульсов: старт = бит потока + сдвиг веера. Возврат по ребру не стартует раньше,
// чем до инструмента дошёл вызов по тому же ребру: импульсы туда и обратно не встречаются.
const planFlows = (flows: FlowSpec[], beats: Beats): PlannedFlow[] => {
  const forward = new Map<string, number>();
  return flows.map((f) => {
    const b = beats[f.beat]!;
    let start = b.start_frame + f.delay;
    if (f.direction === "forward") {
      forward.set(f.edge, start + f.travel);
    } else {
      start = Math.max(start, forward.get(f.edge) ?? start);
    }
    return { ...f, key: flowKey(f), window: { start_frame: start, end_frame: Math.max(b.end_frame, start) } };
  });
};

const arrivalOf = (f: PlannedFlow) => pulseArrival(f.edge, f.window, f.travel, { count: f.count, repeat: f.repeat });

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    <SceneBody {...props} />
  </StyleProvider>
);

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const style = useStyle();
  const sa = useSafeArea();
  const beats = beatsById(timing.beats);
  const g = content.graph;
  const flows = planFlows(g.flows, beats);
  const byKey = new Map(flows.map((f) => [f.key, f]));

  const gx = g.layout.x * sa.w;
  const gy = g.layout.y * sa.h;
  const gw = g.layout.w * sa.w;
  const gh = g.layout.h * sa.h;
  const build = beats[g.beat]!;

  const tokenBeat = beats[content.token.beat]!;
  const tokenArrive = tokenBeat.start_frame + content.token.travel;
  const orchEmph = beats[g.orch_emphasis.beat]!;
  const userEmph = beats[g.user_emphasis.beat]!;

  // вспышки: инструмент — на приходе вызова, ядро — на приходе запроса и каждого возврата
  const edgeEnds = new Map(g.edges.map((e) => [e.id, e]));
  const flowsWithEnds = flows.map((f) => {
    const e = edgeEnds.get(f.edge)!;
    return { ...f, edgeFrom: e.from, edgeTo: e.to };
  });
  const flashes = (id: string) =>
    flowsWithEnds
      .filter((f) => (f.direction === "forward" ? f.edgeTo === id : f.edgeFrom === id))
      .map(arrivalOf);

  const nodes = g.nodes.map((n) => {
    const base = {
      id: n.id,
      label: n.label,
      caption: n.caption,
      kind: n.kind,
      size: n.size,
      elevation: n.elevation,
      enter: n.enter,
      enterAt: build.start_frame + n.delay,
      x: n.layout.x * sa.w - gx,
      y: n.layout.y * sa.h - gy,
      w: n.layout.w * sa.w,
      h: n.layout.h * sa.h,
      ...(n.slot ? { slot: true } : {}),
      ...(n.accentIndex !== undefined ? { accentIndex: n.accentIndex } : {}),
    };
    const fl = flashes(n.id);
    const emphasis =
      n.id === g.orch_emphasis.node
        ? { start_frame: orchEmph.start_frame, end_frame: orchEmph.end_frame, loop: false }
        : n.id === g.user_emphasis.node
          ? { start_frame: tokenArrive, end_frame: Math.max(userEmph.end_frame, tokenArrive) }
          : undefined;
    return {
      ...base,
      ...(fl.length > 0 ? { flash: fl } : {}),
      ...(emphasis ? { emphasis } : {}),
    };
  });

  const req = content.request;
  const showBg = !style.transparent;

  return (
    <>
      {showBg ? (
        <Background
          beat={build}
          variant={content.background.variant}
          seed={content.background.seed}
          focus={content.background.focus}
        />
      ) : null}
      <SafeArea>
        <div style={{ position: "absolute", left: gx, top: gy, width: gw, height: gh }}>
          <FlowGraph
            nodes={nodes}
            edges={g.edges}
            beat={build}
            width={gw}
            height={gh}
            pre={g.pre}
            hold={{ mode: g.hold.mode, beat: beats[g.hold.beat]!, node: g.hold.node }}
            overlay={
              <GraphOverlay
                content={content}
                beats={beats}
                byKey={byKey}
              />
            }
          >
            {flows.map((f) => (
              <PulseAlongPath
                key={`${f.key}`}
                edgeId={f.edge}
                beat={f.window}
                travel={f.travel}
                count={f.count}
                repeat={f.repeat}
                reverse={f.direction === "back"}
                size={g.pulse.size}
                tail={g.pulse.tail}
                color={accent(style, f.direction === "back" ? g.pulse.back_accent : g.pulse.forward_accent)}
              />
            ))}
          </FlowGraph>
        </div>
        <div
          style={{
            position: "absolute",
            left: req.layout.x * sa.w,
            top: req.layout.y * sa.h,
            width: req.layout.w * sa.w,
            height: req.layout.h * sa.h,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <KineticText
            text={req.text}
            beat={beats[req.beat]!}
            mode={req.mode}
            enter={req.enter}
            pre={req.pre}
            size={req.size}
            align={req.align}
            maxWidth={req.layout.w * sa.w}
          />
        </div>
      </SafeArea>
    </>
  );
};

const GraphOverlay: React.FC<{
  content: Content;
  beats: Beats;
  byKey: Map<string, PlannedFlow>;
}> = ({ content, beats, byKey }) => {
  const geo = useFlowGeometry();
  const tk = content.token;
  const tokenBeat = beats[tk.beat]!;

  const firstArrival = (f: PlannedFlow | undefined, fallback: number) => {
    if (!f) return fallback;
    const frames = geo ? geo.arrivals(arrivalOf(f)) : [];
    return frames[0] ?? f.window.start_frame + f.travel;
  };

  const tokenArrival = (() => {
    const a = pulseArrival(tk.edge, tokenBeat, tk.travel, { count: 1, repeat: false });
    const frames = geo ? geo.arrivals(a) : [];
    return frames[0] ?? tokenBeat.start_frame + tk.travel;
  })();

  // кадр смены статуса — событие spec: начало бита, приход импульса или приход токена;
  // статусы идут по порядку, каждый держится не меньше min_hold_frames
  const resolveOn = (on: string): number => {
    const [ref, part] = on.split(".");
    if (part === "start" && beats[ref!]) return beats[ref!]!.start_frame;
    if (part === "arrival" && ref === tk.id) return tokenArrival;
    const f = byKey.get(on);
    return firstArrival(f, tokenBeat.start_frame);
  };
  let prev = -Infinity;
  const states = content.status.states.map((s) => {
    const at = Math.max(resolveOn(s.on), prev + content.status.min_hold_frames);
    prev = at;
    return { text: s.text, tone: s.tone, at };
  });

  return (
    <>
      <StatusChip anchor={{ node: content.status.node }} states={states} size={content.status.size} />
      <DataToken
        label={tk.label}
        edgeId={tk.edge}
        beat={tokenBeat}
        travel={tk.travel}
        reverse={tk.reverse}
        dock={tk.dock}
        tone={tk.tone}
        accentIndex={tk.accentIndex}
        size={tk.size}
        mono={tk.mono}
      />
    </>
  );
};
