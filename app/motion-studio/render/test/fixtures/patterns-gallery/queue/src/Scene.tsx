// Галерея паттернов (kit 0.4): буфер FIFO. Публикатор кладёт сообщения в узел kind "queue" —
// каждое встаёт в свою ячейку (DataToken cell: 0 — у выхода), исполнитель забирает их по
// одному: токен уходит из ячейки (until), едет к исполнителю и поглощается (consume), статус
// исполнителя сменяется на месте статуса узла (StatusChip без side). Публикатор не ждёт:
// публикует дальше и в удержании — система работает до последнего кадра.
import {
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
  type ResolveStyleInput,
  pulseArrival,
  useFlowGeometry,
} from "@ms/motion-kit";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
}

const IN = 16;
const OUT = 14;
const EDGES: FlowEdge[] = [
  { id: "e-pub", from: "pub", to: "q" },
  { id: "e-take", from: "q", to: "worker" },
];
/** Сообщения: публикация (кадр старта полёта), кадр, когда исполнитель забирает его, ячейка буфера (0 — у выхода). */
const MSGS = [
  { id: "#101", pub: 44, take: 76, cell: 0 },
  { id: "#102", pub: 62, take: 100, cell: 1 },
  { id: "#103", pub: 82, take: 124, cell: 0 },
  { id: "#104", pub: 112, take: 148, cell: 1 },
];

function nodes(): FlowNode[] {
  return [
    { id: "pub", kind: "client", label: "Бронирование", caption: "publish", x: 0, y: 150, w: 400, h: 170, enter: "slide" },
    { id: "q", kind: "queue", label: "events.booked", caption: "topic", size: "h2", x: 620, y: 120, w: 560, h: 230, elevation: 3, enter: "pop", flash: MSGS.map((m) => pulseArrival("e-pub", { start_frame: m.pub, end_frame: m.pub + 1 }, IN, { repeat: false })) },
    { id: "worker", label: "Уведомления", caption: "consumer", x: 1300, y: 150, w: 360, h: 170, enter: "rise", accentIndex: 2, flash: MSGS.map((m) => pulseArrival("e-take", { start_frame: m.take, end_frame: m.take + 1 }, OUT, { repeat: false })) },
  ];
}

function Overlay() {
  const flow = useFlowGeometry();
  const at = (edge: string, f: number, travel: number) => Math.ceil(flow?.arrivals(pulseArrival(edge, { start_frame: f, end_frame: f + 1 }, travel, { repeat: false }))[0] ?? f);
  return (
    <>
      <StatusChip anchor={{ node: "pub" }} states={MSGS.map((m) => ({ text: `Принято ${m.id}`, tone: "positive" as const, at: at("e-pub", m.pub, IN) }))} />
      <StatusChip anchor={{ node: "worker" }} states={[{ text: "Ожидание", at: 30 }, ...MSGS.map((m) => ({ text: `В работе ${m.id}`, tone: "accent" as const, accentIndex: 2, at: at("e-take", m.take, OUT) }))]} />
      {MSGS.map((m) => (
        <DataToken key={`in-${m.id}`} edgeId="e-pub" beat={{ start_frame: m.pub, end_frame: m.pub + IN }} travel={IN} label={m.id} cell={m.cell} until={m.take} />
      ))}
      {MSGS.map((m) => (
        <DataToken key={`out-${m.id}`} edgeId="e-take" beat={{ start_frame: m.take, end_frame: m.take + OUT }} travel={OUT} label={m.id} consume accentIndex={2} />
      ))}
    </>
  );
}

export const Scene = ({ timing, style }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} variant="blueprint" seed="queue" focus={{ x: 0.5, y: 0.45 }} />
      <SafeArea>
        <SceneTitle mode="kicker" kicker="Буфер · публикатор не ждёт исполнителя" beat={b.title!} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FlowGraph nodes={nodes()} edges={EDGES} beat={b.graph!} width={1660} height={470} overlay={<Overlay />}>
            {MSGS.map((m) => (
              <PulseAlongPath key={m.id} edgeId="e-pub" beat={{ start_frame: m.pub, end_frame: m.pub + 1 }} travel={IN} repeat={false} />
            ))}
          </FlowGraph>
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
