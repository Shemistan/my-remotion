// Галерея финалов (hold engine 0.5.0): один носитель итога (`content.carrier`: graph,
// chart, race, timeline, number) и режим удержания (`content.mode`; `none` — финал без
// hold, контроль «застывшего» финала). Биты: сборка → действие → удар → hold 128–180.
// S3-fix: `emphasis` — у «Учёта» свой акцент payoff (дышит только ореол узла: негатив QA
// frozen); `inHold` — потоки графа с бита hold (как held-queue); носитель `radar` — RadarRing в
// голом svg, в группе с фильтром и в сдвинутом слое (как дорожка LatencyRace).
import {
  AnimatedNumber,
  Background,
  Camera,
  Emphasis,
  type FlowEdge,
  FlowGraph,
  type FlowNode,
  type Hold,
  LatencyRace,
  LineChart,
  PulseAlongPath,
  RadarRing,
  SafeArea,
  StyleProvider,
  Timeline,
  fontFamily,
  pulseArrival,
  typeSize,
  useArrivalCount,
  useHold,
  useStyle,
  type ResolveStyleInput,
} from "@ms/motion-kit";
import type { HoldMode } from "@ms/contracts";
import { useVideoConfig } from "remotion";

type Window = { start_frame: number; end_frame: number };
type Carrier = "graph" | "chart" | "race" | "timeline" | "number" | "radar";
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: { carrier: Carrier; mode: HoldMode | "none"; camera?: boolean; emphasis?: boolean; inHold?: boolean };
}

const EDGES: FlowEdge[] = [
  { id: "e-in", from: "api", to: "queue" },
  { id: "e-work", from: "queue", to: "worker" },
  { id: "e-store", from: "worker", to: "store" },
];
const TRAVEL = 26;

function Graph({ b, hold, emphasis, inHold }: { b: Record<string, Window>; hold?: Hold; emphasis?: boolean; inHold?: boolean }) {
  // inHold: потоки идут только с бита hold (held-queue), их рёбра — в hold.edges
  const flow = inHold ? b.hold! : b.action!;
  const a = (edge: string) => pulseArrival(edge, flow, TRAVEL);
  const nodes: FlowNode[] = [
    { id: "api", kind: "client", label: "Заказы", caption: "producer", x: 0, y: 140, w: 290, h: 180, enter: "slide" },
    { id: "queue", kind: "queue", label: "Очередь", caption: "orders", x: 400, y: 140, w: 400, h: 180, cells: 3, flash: a("e-in") },
    { id: "worker", label: "Склад", caption: "consumer", x: 910, y: 140, w: 280, h: 180, flash: a("e-work") },
    { id: "store", kind: "store", label: "Учёт", caption: "db", x: 1300, y: 90, w: 280, h: 290, size: "h2", flash: a("e-store"), ...(emphasis ? { emphasis: b.payoff! } : {}) },
  ];
  const h = hold ? { ...hold, node: "store", label: "2 мс", ...(inHold ? { edges: EDGES.map((e) => e.id) } : {}) } : undefined;
  return (
    <FlowGraph nodes={nodes} edges={EDGES} beat={b.build!} hold={h} overlay={<Tally b={b} />}>
      {EDGES.map((e, i) => (
        <PulseAlongPath key={e.id} edgeId={e.id} beat={{ start_frame: flow.start_frame + i * 4, end_frame: flow.end_frame }} travel={TRAVEL} size={10} tail={170} />
      ))}
    </FlowGraph>
  );
}

/** RadarRing в трёх контекстах (S3-fix I4): голый svg, группа с фильтром, сдвинутый слой. */
function Radar({ hold }: { hold?: Hold }) {
  const hf = useHold(hold);
  if (!hf) return null;
  const ring = <RadarRing x={250} y={200} r0={14} reach={48} t={hf.ripple} opacity={hf.rippleAlpha} />;
  const dot = <circle cx={250} cy={200} r={14} fill="#7aa2ff" />;
  return (
    <div style={{ position: "absolute", left: 160, top: 240, width: 1500, height: 400 }}>
      <svg width={500} height={400} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {dot}
        {ring}
      </svg>
      <svg width={500} height={400} style={{ position: "absolute", left: 500, top: 0, overflow: "visible" }}>
        <defs>
          <filter id="radar-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={4} />
          </filter>
        </defs>
        {dot}
        <g filter="url(#radar-glow)">{ring}</g>
      </svg>
      <div style={{ position: "absolute", left: 1000, top: 0, width: 500, height: 400, opacity: 0.98, transform: "translateY(1.5px)" }}>
        <svg width={500} height={400} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {dot}
          {ring}
        </svg>
      </div>
    </div>
  );
}

/** Счёт по приходам в «Учёт» — в steady-flow продолжает считать. */
function Tally({ b }: { b: Record<string, Window> }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  const r = useArrivalCount(pulseArrival("e-store", { start_frame: b.action!.start_frame + 8, end_frame: b.action!.end_frame }, TRAVEL), { from: 4800 });
  return (
    <div style={{ position: "absolute", left: 1300, top: 420, width: 280, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <AnimatedNumber from={4800} to={4800} value={r.value} pop={r.pop} beat={b.action!} locale="ru" size={4} align="center" />
      <div style={{ fontFamily: fontFamily(s.typography.body), fontSize: typeSize(s, "caption", height), color: s.palette.muted }}>записей учтено</div>
    </div>
  );
}

const POINTS = [
  { label: "2019", value: 120 }, { label: "2020", value: 180 }, { label: "2021", value: 260 },
  { label: "2022", value: 410 }, { label: "2023", value: 640 }, { label: "2024", value: 980 },
];

function Hero({ c, b, hold, emphasis, inHold }: { c: Carrier; b: Record<string, Window>; hold?: Hold; emphasis?: boolean; inHold?: boolean }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  if (c === "graph") return <div style={{ position: "absolute", left: 70, top: 220 }}><Graph b={b} hold={hold} emphasis={emphasis} inHold={inHold} /></div>;
  if (c === "radar") return <Radar hold={hold} />;
  if (c === "chart") return <div style={{ position: "absolute", left: 180, top: 160 }}><LineChart points={POINTS} beat={{ start_frame: b.build!.start_frame, end_frame: b.action!.end_frame }} width={1360} height={640} valueSuffix=" тыс." hold={hold} /></div>;
  if (c === "race") {
    return (
      <div style={{ position: "absolute", left: 200, top: 280 }}>
        <LatencyRace lanes={[{ id: "db", label: "Без кэша", caption: "запрос в БД", ms: 180, tone: "negative" }, { id: "cache", label: "Из кэша", caption: "память", ms: 15, tone: "positive" }]} beat={b.action!} locale="ru" hold={hold} />
      </div>
    );
  }
  if (c === "timeline") {
    return (
      <div style={{ position: "absolute", left: 30, top: 170 }}>
        <Timeline items={[{ date: "2015", label: "Монолит" }, { date: "2018", label: "Сервисы" }, { date: "2021", label: "Kubernetes" }, { date: "2025", label: "Агенты", note: "сейчас" }]} beat={{ start_frame: b.build!.start_frame, end_frame: b.action!.end_frame }} orientation="h" width={1560} height={560} hold={hold ? { ...hold, label: "+1 релиз" } : undefined} />
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 260, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
      <Emphasis beat={b.payoff!} hold={hold} spread={80}>
        <AnimatedNumber from={1} to={12} beat={b.action!} locale="ru" prefix="×" size={220} align="center" />
      </Emphasis>
      <div style={{ fontFamily: fontFamily(s.typography.body), fontSize: typeSize(s, "body", height), color: s.palette.muted }}>быстрее из кэша</div>
    </div>
  );
}

export const Scene = ({ timing, style, content }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x]));
  const hold: Hold | undefined = content.mode === "none" ? undefined : { mode: content.mode, beat: b.hold! };
  const keys = content.camera === false ? [] : [{ frame: 100, scale: 1, x: 0, y: 0 }, { frame: 128, scale: 1.02, x: 0, y: 0 }];
  return (
    <StyleProvider style={style}>
      <Camera keys={keys} hold={hold}>
        <Background seed={`hold-${content.carrier}`} />
        <SafeArea>
          <Kicker text={`финал · ${content.mode}`} />
          <Hero c={content.carrier} b={b} hold={hold} emphasis={content.emphasis} inHold={content.inHold} />
        </SafeArea>
      </Camera>
    </StyleProvider>
  );
};

function Kicker({ text }: { text: string }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  return <div style={{ position: "absolute", left: 0, top: 0, fontFamily: fontFamily(s.typography.mono), fontSize: typeSize(s, "caption", height), color: s.palette.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{text}</div>;
}
