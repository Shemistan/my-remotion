// Галерея паттернов (kit 0.4): облик узла по роли (FlowNode.kind) — окно клиента, карточка
// сервиса, ядро модели, буфер FIFO, сетка ячеек памяти (загорается на записях), цилиндр
// хранилища. Кадр 0 — силуэты схемы; дальше узлы входят, по рёбрам идут импульсы и токены.
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
} from "@ms/motion-kit";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
}

const T = 18;
const EDGES: FlowEdge[] = [
  { id: "e-api", from: "client", to: "api" },
  { id: "e-llm", from: "api", to: "llm" },
  { id: "e-q", from: "api", to: "q" },
  { id: "e-mem", from: "q", to: "mem" },
  { id: "e-db", from: "mem", to: "db" },
];
const beatAt = (f: number) => ({ start_frame: f, end_frame: f + 1 });

function nodes(b: Record<string, Window>): FlowNode[] {
  const writes = [0, 1, 2, 3].map((i) => pulseArrival("e-mem", beatAt(b.flow!.start_frame + 14 + i * 18), T, { repeat: false }));
  return [
    { id: "client", kind: "client", label: "Браузер", caption: "client", x: 0, y: 40, w: 340, h: 170, enter: "slide" },
    { id: "api", label: "API", caption: "service", size: "h2", x: 560, y: 40, w: 340, h: 170, elevation: 3, enter: "pop" },
    { id: "llm", kind: "llm", label: "Модель", caption: "llm", x: 1120, y: 40, w: 360, h: 170, enter: "scale", accentIndex: 1 },
    { id: "q", kind: "queue", label: "jobs", caption: "queue", x: 330, y: 380, w: 520, h: 220, enter: "rise" },
    { id: "mem", kind: "cache", label: "Память", caption: "cache", x: 920, y: 380, w: 380, h: 220, enter: "rise", writes, filled: 3 },
    { id: "db", kind: "store", label: "Хранилище", caption: "store", x: 1380, y: 350, w: 300, h: 280, enter: "rise", accentIndex: 2 },
  ];
}

export const Scene = ({ timing, style }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  const f0 = b.flow!.start_frame;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} variant="aurora" seed="kinds" focus={{ x: 0.5, y: 0.5 }} />
      <SafeArea>
        <SceneTitle mode="kicker" kicker="Роли узлов · облик по смыслу" beat={b.title!} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FlowGraph
            nodes={nodes(b)}
            edges={EDGES}
            beat={b.graph!}
            width={1680}
            height={640}
            overlay={
              <>
                <StatusChip anchor={{ node: "llm" }} states={[{ text: "Думает", tone: "accent", accentIndex: 1, at: f0 + 10 }, { text: "Готово", tone: "positive", at: f0 + 48 }]} />
                <DataToken edgeId="e-q" beat={beatAt(f0 + 4)} travel={T} label="job:7" cell={0} />
                <DataToken edgeId="e-q" beat={beatAt(f0 + 30)} travel={T} label="job:8" cell={1} />
                <DataToken edgeId="e-db" beat={beatAt(f0 + 40)} travel={22} label="row:42" />
              </>
            }
          >
            <PulseAlongPath edgeId="e-api" beat={{ start_frame: f0, end_frame: 150 }} travel={T} />
            <PulseAlongPath edgeId="e-llm" beat={{ start_frame: f0 + 8, end_frame: 150 }} travel={T} />
            {[0, 1, 2, 3].map((i) => (
              <PulseAlongPath key={i} edgeId="e-mem" beat={beatAt(f0 + 14 + i * 18)} travel={T} repeat={false} />
            ))}
          </FlowGraph>
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
