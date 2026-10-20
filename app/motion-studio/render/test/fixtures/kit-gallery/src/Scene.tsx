// Галерея motion-kit: все компоненты в одной сцене 1920×1080, 150 кадров.
// Пресет — из props (dark-premium по умолчанию): та же сцена в трёх стилях.
import {
  AnimatedNumber,
  Background,
  Card,
  FlowGraph,
  KineticText,
  LineChart,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  presets,
  useStyle,
  type Elevation,
  type FlowEdge,
  type FlowNode,
  type PresetId,
} from "@ms/motion-kit";
import { AbsoluteFill } from "remotion";

const POINTS = [
  { label: "янв 22", value: 10_000 },
  { label: "июл 22", value: 28_000 },
  { label: "янв 23", value: 72_000 },
  { label: "июл 23", value: 165_000 },
  { label: "янв 24", value: 340_000 },
  { label: "июл 24", value: 610_000 },
  { label: "янв 25", value: 1_000_000 },
];

const NODES: FlowNode[] = [
  { id: "user", label: "Пользователь", caption: "запрос", x: 0, y: 214, w: 250, h: 96, elevation: 1, accentIndex: 2 },
  { id: "orch", label: "Оркестратор", caption: "LLM-агент", x: 318, y: 202, w: 240, h: 120, elevation: 3, accentIndex: 0 },
  { id: "search", label: "Поиск", caption: "web", x: 600, y: 24, w: 210, h: 88, elevation: 2, accentIndex: 1 },
  { id: "kb", label: "База знаний", caption: "RAG", x: 600, y: 218, w: 210, h: 88, elevation: 2, accentIndex: 1 },
  { id: "code", label: "Код", caption: "sandbox", x: 600, y: 412, w: 210, h: 88, elevation: 2, accentIndex: 1 },
];
const EDGES: FlowEdge[] = [
  { id: "e-user", from: "user", to: "orch" },
  { id: "e-search", from: "orch", to: "search" },
  { id: "e-kb", from: "orch", to: "kb" },
  { id: "e-code", from: "orch", to: "code" },
];

const CARD_ENTERS = ["rise", "scale", "flip", "flip"] as const;

function Gallery() {
  const s = useStyle();
  return (
    <AbsoluteFill>
      <Background beat={{ start_frame: 0, end_frame: 40 }} />
      <SafeArea>
        <div style={{ display: "flex", justifyContent: "space-between", height: "100%" }}>
          {/* левая колонка: заголовок, счётчик, график */}
          <div style={{ width: 830, display: "flex", flexDirection: "column", gap: 18 }}>
            <KineticText
              text="Данные · 2022–2025"
              beat={{ start_frame: 0, end_frame: 30 }}
              mode="letters"
              enter="fade"
              size={1}
              font="mono"
              caps
              color={s.palette.muted}
            />
            <KineticText text="Рост пользователей" beat={{ start_frame: 4, end_frame: 50 }} mode="words" enter="rise" size={6} highlight={["Рост"]} />
            <AnimatedNumber from={10_000} to={1_000_000} beat={{ start_frame: 12, end_frame: 100 }} locale="ru" suffix="пользователей" size={6} />
            <div style={{ marginTop: 8 }}>
              <LineChart points={POINTS} beat={{ start_frame: 20, end_frame: 110 }} width={830} height={500} locale="ru" />
            </div>
          </div>

          {/* правая колонка: схема с импульсами и карточки по высоте */}
          <div style={{ width: 810, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <FlowGraph nodes={NODES} edges={EDGES} beat={{ start_frame: 18, end_frame: 90 }} width={810} height={524}>
              <PulseAlongPath edgeId="e-user" beat={{ start_frame: 60, end_frame: 150 }} count={2} />
              <PulseAlongPath edgeId="e-search" beat={{ start_frame: 70, end_frame: 150 }} />
              <PulseAlongPath edgeId="e-kb" beat={{ start_frame: 74, end_frame: 150 }} count={2} />
              <PulseAlongPath edgeId="e-code" beat={{ start_frame: 78, end_frame: 150 }} reverse color={s.palette.accent[2]} />
            </FlowGraph>
            <div style={{ display: "flex", gap: 22 }}>
              {([0, 1, 2, 3] as Elevation[]).map((e) => (
                <Card key={e} elevation={e} beat={{ start_frame: 34, end_frame: 90 }} delay={e * 5} enter={CARD_ENTERS[e]} accentIndex={e === 3 ? 0 : undefined} width={186} height={150}>
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                    <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, color: s.palette.muted }}>elevation {e}</div>
                    <div style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600, fontSize: 24, whiteSpace: "nowrap" }}>Уровень {e}</div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
}

export const Scene = ({ preset = "dark-premium" }: { preset?: PresetId }) => (
  <StyleProvider style={presets[preset] ? preset : "dark-premium"}>
    <Gallery />
  </StyleProvider>
);
