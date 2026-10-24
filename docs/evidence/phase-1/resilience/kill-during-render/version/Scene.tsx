import React from "react";
import { useCurrentFrame } from "remotion";
import {
  AnimatedNumber,
  Background,
  Camera,
  DataToken,
  Emphasis,
  FlowGraph,
  Parallax,
  PulseAlongPath,
  SafeArea,
  SceneTitle,
  StatusChip,
  StyleProvider,
  arrivalCount,
  edgeSegment,
  pulseArrival,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type Tone = "neutral" | "accent" | "positive" | "negative" | "warning";
type Level = "display" | "h1" | "h2" | "body" | "caption";
type HoldMode = "steady-flow" | "repeat-result" | "data-shimmer" | "now-pulse" | "settle-push";
type CardEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

type Flow = { edge: string; direction: "forward" | "back"; beat: string; count: number; repeat: boolean; travel: number };
type NodeSpec = {
  id: string;
  label: string;
  caption?: string;
  kind: "service" | "client" | "llm" | "queue" | "cache" | "store";
  size: "h2" | "body" | "caption";
  cells?: number;
  enter: CardEnter;
  elevation: 0 | 1 | 2 | 3;
  accentIndex?: number;
  emphasis?: { beat: string; ring: "strike" | "every-breath" | false; loop: boolean };
  layout: Layout;
};
type TokenSpec = {
  id: string;
  label: string;
  edge: string;
  beat: string;
  travel: number;
  cell?: number;
  until_beat?: string;
  consume?: boolean;
  layout: Layout;
};
type ChipSpec = {
  id: string;
  node: string;
  size: Level;
  until_beat?: string;
  pin?: boolean;
  states: { text: string; tone: Tone; flow_beat: string }[];
  layout: Layout;
};
type CounterSpec = {
  id: string;
  prefix: string;
  from: number;
  to: number;
  locale: "ru" | "en";
  size: Level;
  enter_beat: string;
  emphasis_beat: string;
  in_edge: string;
  out_edge: string;
  layout: Layout;
};

type Content = {
  background: { variant: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid"; seed: string; focus: { x: number; y: number } };
  camera: { frame: number; scale: number; x: number; y: number }[];
  hold: { mode: HoldMode; beat: string; node: string };
  title: { id: string; mode: "integrated"; text: string; size: Level; align: "left" | "center"; beat: string; layout: Layout };
  graph: { id: string; beat: string; pre: "silhouette" | "hidden"; layout: Layout; edges: { id: string; from: string; to: string }[]; flows: Flow[] };
  nodes: NodeSpec[];
  tokens: TokenSpec[];
  chips: ChipSpec[];
  counter: CounterSpec;
};

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} not found`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const flowArrival = (beats: TimedBeat[], f: Flow) =>
  pulseArrival(f.edge, beatOf(beats, f.beat), f.travel, { count: f.count, repeat: f.repeat });

// Счётчик «в очереди»: приходы по входному ребру минус приходы по выходному.
const QueueCounter: React.FC<{ beats: TimedBeat[]; flows: Flow[]; counter: CounterSpec; origin: { x: number; y: number } }> = ({
  beats,
  flows,
  counter,
  origin,
}) => {
  const frame = useCurrentFrame();
  const style = useStyle();
  const geo = useFlowGeometry();
  const sa = useSafeArea();

  let value = counter.from;
  let pop = 0;
  let zeroAt = beatOf(beats, counter.emphasis_beat).start_frame;
  for (const f of flows) {
    const frames = geo ? geo.arrivals(flowArrival(beats, f)) : [];
    const r = arrivalCount(frames, frame, style, {});
    const sign = f.edge === counter.in_edge ? 1 : f.edge === counter.out_edge ? -1 : 0;
    value += sign * r.value;
    pop = Math.max(pop, r.pop);
    if (sign < 0 && frames.length > 0) zeroAt = Math.max(zeroAt, frames[frames.length - 1]!);
  }

  const enter = beatOf(beats, counter.enter_beat);
  const emph = beatOf(beats, counter.emphasis_beat);
  const done = frame >= zeroAt && value === counter.to;
  const left = counter.layout.x * sa.w - origin.x;
  const top = counter.layout.y * sa.h - origin.y;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: counter.layout.w * sa.w,
        height: counter.layout.h * sa.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Emphasis
        beat={{ start_frame: zeroAt, end_frame: Math.max(zeroAt, emph.end_frame) }}
        loop={false}
        shape="rounded"
        color={style.palette.positive}
      >
        <AnimatedNumber
          from={counter.from}
          to={counter.to}
          value={value}
          pop={pop}
          beat={{ start_frame: enter.start_frame, end_frame: zeroAt }}
          locale={counter.locale}
          prefix={counter.prefix}
          size={counter.size}
          color={done ? style.palette.positive : style.palette.text}
        />
      </Emphasis>
    </div>
  );
};

// Статус узла: смены — в кадры прихода своего потока.
// pinned — центр плашки из layout spec (px графа): у узла у правого края авто-место выводит длинный статус за поле.
const NodeStatus: React.FC<{ beats: TimedBeat[]; flows: Flow[]; chip: ChipSpec; pinned?: { x: number; y: number } }> = ({
  beats,
  flows,
  chip,
  pinned,
}) => {
  const geo = useFlowGeometry();
  const states = chip.states.map((s) => {
    const flow = flows.find((f) => f.beat === s.flow_beat);
    const at = flow && geo ? geo.arrivals(flowArrival(beats, flow))[0] : undefined;
    return { text: s.text, tone: s.tone, at: at ?? beatOf(beats, s.flow_beat).end_frame };
  });
  const until = chip.until_beat ? beatOf(beats, chip.until_beat).start_frame : undefined;
  if (pinned) return <StatusChip x={pinned.x} y={pinned.y} states={states} size={chip.size} until={until} />;
  return <StatusChip anchor={{ node: chip.node }} states={states} size={chip.size} until={until} />;
};

// Склад вынимает сообщения: каждый токен выезжает из своей ячейки буфера по своей дорожке
// к складу (дорожки разведены по высоте — три медленных токена в пути не наезжают друг на друга).
const OutTokens: React.FC<{ beats: TimedBeat[]; content: Content }> = ({ beats, content }) => {
  const geo = useFlowGeometry();
  if (!geo) return null;
  const outs = content.tokens.filter((t) => t.consume);
  const n = outs.length;
  return (
    <>
      {outs.map((t, k) => {
        const link = content.graph.edges.find((e) => e.id === t.edge);
        if (!link) return null;
        const slot = geo.slots.get(link.from);
        const target = geo.nodes.get(link.to);
        const sourceSpec = content.nodes.find((nd) => nd.id === link.from);
        const inToken = content.tokens.find((x) => !x.consume && x.label === t.label);
        if (!slot || !target) return null;
        const cells = sourceSpec?.cells ?? n;
        const cell = inToken?.cell ?? k;
        // ячейка 0 — у выхода (справа)
        const start = { x: slot.x + slot.w - ((cell + 0.5) * slot.w) / cells, y: slot.y + slot.h / 2 };
        const lane = n > 1 ? k / (n - 1) : 0.5;
        const end = { x: target.x - target.w * 0.2, y: target.y + target.h * (0.2 + 0.6 * lane) };
        return (
          <DataToken
            key={t.id}
            label={t.label}
            segments={[edgeSegment(start, end, "h")]}
            beat={beatOf(beats, t.beat)}
            travel={t.travel}
            consume
          />
        );
      })}
    </>
  );
};

const SceneBody: React.FC<{ beats: TimedBeat[]; content: Content }> = ({ beats, content }) => {
  const sa = useSafeArea();
  const style = useStyle();
  const { graph, title, hold } = content;
  const gx = graph.layout.x * sa.w;
  const gy = graph.layout.y * sa.h;
  const gw = graph.layout.w * sa.w;
  const gh = graph.layout.h * sa.h;
  const holdBeat = beatOf(beats, hold.beat);
  const graphBeat = beatOf(beats, graph.beat);
  const stagger = style.motion.stagger_frames;

  // Вход узлов от начала бита графа: источник и буфер — почти сразу (ребро e-in готово к первому
  // токену), потребитель — позже; e-out нужен только к уходу сообщений.
  const nodes = content.nodes.map((n, i) => ({
    enterAt: graphBeat.start_frame + (i === 0 ? 0 : i === 1 ? Math.round(stagger / 2) : stagger * i),
    id: n.id,
    label: n.label,
    caption: n.caption,
    kind: n.kind,
    size: n.size,
    cells: n.cells,
    enter: n.enter,
    elevation: n.elevation,
    accentIndex: n.accentIndex,
    x: n.layout.x * sa.w - gx,
    y: n.layout.y * sa.h - gy,
    w: n.layout.w * sa.w,
    h: n.layout.h * sa.h,
    emphasis: n.emphasis ? { ...beatOf(beats, n.emphasis.beat), ring: n.emphasis.ring, loop: n.emphasis.loop } : undefined,
  }));

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: title.layout.x * sa.w,
          top: title.layout.y * sa.h,
          width: title.layout.w * sa.w,
          height: title.layout.h * sa.h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SceneTitle
          mode={title.mode}
          text={title.text}
          beat={beatOf(beats, title.beat)}
          align={title.align}
          size={title.size}
          maxWidth={title.layout.w * sa.w}
        />
      </div>
      <div style={{ position: "absolute", left: gx, top: gy, width: gw, height: gh }}>
        <FlowGraph
          nodes={nodes}
          edges={graph.edges}
          beat={graphBeat}
          width={gw}
          height={gh}
          pre={graph.pre}
          hold={{ mode: hold.mode, beat: holdBeat, node: hold.node }}
          overlay={
            <>
              {content.tokens
                .filter((t) => !t.consume)
                .map((t) => (
                  <DataToken
                    key={t.id}
                    label={t.label}
                    edgeId={t.edge}
                    beat={beatOf(beats, t.beat)}
                    travel={t.travel}
                    cell={t.cell}
                    until={t.until_beat ? beatOf(beats, t.until_beat).start_frame : undefined}
                  />
                ))}
              <OutTokens beats={beats} content={content} />
              {content.chips.map((c) => (
                <NodeStatus
                  key={c.id}
                  beats={beats}
                  flows={graph.flows}
                  chip={c}
                  pinned={
                    c.pin
                      ? {
                          x: (c.layout.x + c.layout.w / 2) * sa.w - gx,
                          y: (c.layout.y + c.layout.h / 2) * sa.h - gy,
                        }
                      : undefined
                  }
                />
              ))}
              <QueueCounter beats={beats} flows={graph.flows} counter={content.counter} origin={{ x: gx, y: gy }} />
            </>
          }
        >
          {graph.flows.map((f) => (
            <PulseAlongPath
              key={`${f.edge}-${f.beat}`}
              edgeId={f.edge}
              beat={beatOf(beats, f.beat)}
              travel={f.travel}
              count={f.count}
              repeat={f.repeat}
              reverse={f.direction === "back"}
              size={10}
              tail={160}
            />
          ))}
        </FlowGraph>
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <Camera keys={content.camera}>
      {!style.transparent && (
        <Parallax layer={0}>
          <Background
            variant={content.background.variant}
            seed={content.background.seed}
            focus={content.background.focus}
          />
        </Parallax>
      )}
      <Parallax layer={1}>
        <SafeArea>
          <SceneBody beats={timing.beats} content={content} />
        </SafeArea>
      </Parallax>
    </Camera>
  </StyleProvider>
);
