// Галерея паттернов (kit 0.3): кэш как процесс. Запрос — промах (статус на месте), медленный
// поход в базу, данные-объект «user:42» летят обратно и ложатся в кэш (DataToken dock),
// затем быстрые попадания: счётчик растёт ровно на приходах импульсов (useArrivalCount),
// статус сменяется «Промах → Запись → Попадание» в одной точке (StatusChip). Герой схемы —
// кэш (FlowNode.size h2), фон — чертёж с ореолом за героем, заголовок — рубрика (kicker).
import {
  AnimatedNumber,
  Background,
  DataToken,
  type FlowEdge,
  FlowGraph,
  type FlowNode,
  PulseAlongPath,
  SafeArea,
  SceneTitle,
  StatusChip,
  StyleProvider,
  accent,
  fontFamily,
  pulseArrival,
  typeSize,
  useArrivalCount,
  useFlowGeometry,
  useStyle,
  type ResolveStyleInput,
} from "@ms/motion-kit";
import { useCurrentFrame, useVideoConfig } from "remotion";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
}

const FAST = 10;
const SLOW = 30;
const EDGES: FlowEdge[] = [
  { id: "e-req", from: "client", to: "cache" },
  { id: "e-db", from: "cache", to: "db" },
];

const ask = (b: Record<string, Window>) => pulseArrival("e-req", b.ask!, 14, { repeat: false });
const miss = (b: Record<string, Window>) => pulseArrival("e-db", b.miss!, SLOW, { repeat: false });
const write = (b: Record<string, Window>) => pulseArrival("e-db", b.write!, SLOW, { repeat: false });
const hits = (b: Record<string, Window>) => pulseArrival("e-req", b.hits!, FAST);

function nodes(b: Record<string, Window>): FlowNode[] {
  return [
    { id: "client", label: "Клиент", caption: "GET /user/42", x: 0, y: 190, w: 320, h: 130, enter: "slide" },
    { id: "cache", label: "Кэш", caption: "Redis · в памяти", size: "h2", x: 560, y: 160, w: 420, h: 190, elevation: 3, enter: "pop", flash: [ask(b), write(b), hits(b)], emphasis: { start_frame: b.hits!.start_frame + 12, end_frame: 150 } },
    { id: "db", label: "База данных", caption: "PostgreSQL", x: 1220, y: 190, w: 320, h: 130, enter: "rise", accentIndex: 2, flash: miss(b) },
  ];
}

/** Слой над карточками: статус кэша, данные, ложащиеся в кэш, и счётчик попаданий. */
function Overlay({ b }: { b: Record<string, Window> }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  const frame = useCurrentFrame();
  const flow = useFlowGeometry();
  const first = (a: ReturnType<typeof pulseArrival>) => Math.ceil(flow?.arrivals(a)[0] ?? a.beat.start_frame);
  const landed = first(write(b));
  const hit = useArrivalCount(hits(b));
  return (
    <>
      <StatusChip
        anchor={{ node: "cache", side: "top", gap: 18 }}
        states={[
          { text: "Промах", tone: "negative", at: first(ask(b)) },
          { text: "Запись", tone: "warning", at: landed },
          { text: "Попадание", tone: "positive", at: first(hits(b)) },
        ]}
      />
      <DataToken edgeId="e-db" beat={b.write!} travel={SLOW} reverse label="user:42" dock={{ dx: -210, dy: 74 }} />
      <div style={{ position: "absolute", left: 560, top: 400, width: 420, display: "flex", justifyContent: "center", alignItems: "baseline", gap: 14, opacity: frame >= b.hits!.start_frame ? 1 : 0 }}>
        <AnimatedNumber from={0} to={hit.total} value={hit.value} pop={hit.pop} beat={{ start_frame: b.hits!.start_frame, end_frame: 150 }} locale="ru" size="h1" suffix={[" ответ", " ответа", " ответов"]} />
        <span style={{ fontFamily: fontFamily(s.typography.body), fontSize: typeSize(s, "caption", height), color: s.palette.muted }}>из кэша</span>
      </div>
    </>
  );
}

function Pulses({ b }: { b: Record<string, Window> }) {
  const s = useStyle();
  return (
    <>
      <PulseAlongPath edgeId="e-req" beat={b.ask!} travel={14} repeat={false} color={accent(s, 1)} />
      <PulseAlongPath edgeId="e-db" beat={b.miss!} travel={SLOW} repeat={false} color={accent(s, 1)} size={6} />
      <PulseAlongPath edgeId="e-req" beat={b.hits!} travel={FAST} color={accent(s, 1)} tail={80} />
      <PulseAlongPath edgeId="e-req" beat={{ start_frame: b.hits!.start_frame + 5, end_frame: b.hits!.end_frame }} travel={FAST} reverse color={accent(s, 2)} tail={80} />
    </>
  );
}

export const Scene = ({ timing, style }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} variant="blueprint" seed="cache" focus={{ x: 0.5, y: 0.5 }} />
      <SafeArea>
        <SceneTitle mode="kicker" kicker="Кэширование · промах → запись → попадание" beat={b.title!} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FlowGraph nodes={nodes(b)} edges={EDGES} beat={b.graph!} width={1540} height={520} overlay={<Overlay b={b} />}>
            <Pulses b={b} />
          </FlowGraph>
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
