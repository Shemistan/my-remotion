// Галерея паттернов: FlowGraph kit 0.2 — у каждого узла свой вход (slide, pop, swing,
// blur, rise), импульсы запрос → оркестратор → инструменты → обратно, узел-получатель
// вспыхивает в кадр прихода импульса (FlowNode.flash + pulseArrival). Плашка «Ответ
// готов» входит в кадр прихода последнего импульса (useFlowGeometry().arrivals).
import {
  Background,
  Emphasis,
  type FlowEdge,
  FlowGraph,
  type FlowNode,
  KineticText,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  fontFamily,
  pulseArrival,
  springAt,
  surfaceAt,
  typeSize,
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

const TRAVEL = 22;
const EDGES: FlowEdge[] = [
  { id: "e-ask", from: "user", to: "orc" },
  { id: "e-search", from: "orc", to: "search" },
  { id: "e-db", from: "orc", to: "db" },
  { id: "e-llm", from: "orc", to: "llm" },
];

function nodes(b: Record<string, Window>): FlowNode[] {
  const back = (id: string) => pulseArrival(id, b.back!, TRAVEL, { repeat: false });
  const fan = (id: string) => pulseArrival(id, b.fanout!, TRAVEL, { repeat: false });
  return [
    { id: "user", label: "Запрос", caption: "user", x: 0, y: 270, w: 280, h: 120, enter: "slide" },
    {
      id: "orc",
      label: "Оркестратор",
      caption: "agent",
      x: 450,
      y: 255,
      w: 400,
      h: 150,
      elevation: 3,
      enter: "pop",
      flash: [pulseArrival("e-ask", b.ask!, TRAVEL, { repeat: false }), back("e-search"), back("e-db"), back("e-llm")],
    },
    { id: "search", label: "Поиск", caption: "tool", x: 1040, y: 40, w: 300, h: 120, enter: "swing", accentIndex: 1, flash: fan("e-search") },
    { id: "db", label: "База", caption: "tool", x: 1040, y: 270, w: 300, h: 120, enter: "blur", accentIndex: 1, flash: fan("e-db") },
    { id: "llm", label: "LLM", caption: "tool", x: 1040, y: 500, w: 300, h: 120, enter: "rise", accentIndex: 1, flash: fan("e-llm") },
  ];
}

/** Плашка входит в кадр прихода обратного импульса в оркестратор. */
function Ready({ b }: { b: Record<string, Window> }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const flow = useFlowGeometry();
  const at = flow?.arrivals(pulseArrival("e-db", b.back!, TRAVEL, { repeat: false }))[0] ?? b.back!.start_frame;
  const p = springAt(frame, fps, s, at, "pop");
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: 450, top: 440, width: 400, display: "flex", justifyContent: "center", opacity: Math.min(1, p * 2), transform: `scale(${(0.6 + 0.4 * p).toFixed(4)})` }}>
      <Emphasis beat={{ start_frame: Math.ceil(at), end_frame: b.back!.end_frame }} spread={48}>
        <div style={{ padding: "0.35em 0.9em", borderRadius: 999, background: surfaceAt(s, 2), color: accent(s, 0), fontFamily: fontFamily(s.typography.body), fontWeight: 700, fontSize: typeSize(s, "body", height), whiteSpace: "nowrap" }}>
          Ответ готов
        </div>
      </Emphasis>
    </div>
  );
}

/** Запрос туда, веер к инструментам, ответы обратно — цветом акцента 0. */
function Pulses({ b }: { b: Record<string, Window> }) {
  const s = useStyle();
  const tools = ["e-search", "e-db", "e-llm"];
  return (
    <>
      <PulseAlongPath edgeId="e-ask" beat={b.ask!} travel={TRAVEL} repeat={false} />
      {tools.map((id) => (
        <PulseAlongPath key={id} edgeId={id} beat={b.fanout!} travel={TRAVEL} repeat={false} />
      ))}
      {tools.map((id) => (
        <PulseAlongPath key={`${id}-back`} edgeId={id} beat={b.back!} travel={TRAVEL} repeat={false} reverse color={accent(s, 0)} />
      ))}
    </>
  );
}

export const Scene = ({ timing, style }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="flow" />
      <SafeArea style={{ gap: 40 }}>
        <KineticText text="Схема · входы и приход импульса" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FlowGraph nodes={nodes(b)} edges={EDGES} beat={b.graph!} width={1340} height={660}>
            <Pulses b={b} />
            <Ready b={b} />
          </FlowGraph>
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
