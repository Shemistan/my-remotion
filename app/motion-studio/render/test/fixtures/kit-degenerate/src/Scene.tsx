// Вырожденные биты: нулевой длины (start = end) и обратный (end < start). Каждый
// компонент kit должен показать их ступенькой и не бросить исключение.
import { AnimatedNumber, Background, Card, FlowGraph, KineticText, LineChart, PulseAlongPath, SafeArea, StyleProvider } from "@ms/motion-kit";
import { AbsoluteFill } from "remotion";

const ZERO = { start_frame: 10, end_frame: 10 };
const BACK = { start_frame: 12, end_frame: 4 };

export const Scene = () => (
  <StyleProvider style="light-clean">
    <AbsoluteFill>
      <Background beat={ZERO} />
      <SafeArea>
        <div style={{ display: "flex", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 560 }}>
            <KineticText text="Нулевой бит" beat={ZERO} mode="letters" enter="rise" size={4} exit />
            <KineticText text="Обратный бит" beat={BACK} mode="words" enter="fade" size={3} />
            <AnimatedNumber from={0} to={1500} beat={ZERO} locale="ru" size={5} />
            <AnimatedNumber from={0} to={42} beat={BACK} locale="en" suffix="%" size={3} />
            <LineChart points={[{ label: "a", value: 1 }, { label: "b", value: 3 }]} beat={ZERO} width={520} height={260} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <FlowGraph
              nodes={[
                { id: "a", label: "Узел A", x: 0, y: 0, w: 200, h: 80 },
                { id: "b", label: "Узел B", x: 300, y: 120, w: 200, h: 80 },
              ]}
              edges={[{ id: "ab", from: "a", to: "b" }]}
              beat={ZERO}
            >
              <PulseAlongPath edgeId="ab" beat={ZERO} />
              <PulseAlongPath edgeId="ab" beat={BACK} reverse />
            </FlowGraph>
            <Card elevation={2} beat={ZERO} accentIndex={0} width={300}>
              Карточка
            </Card>
            <Card elevation={1} beat={BACK} width={300}>
              Обратный бит
            </Card>
          </div>
        </div>
      </SafeArea>
    </AbsoluteFill>
  </StyleProvider>
);
