// Компоненты приёмов сценарных сцен с данными смоука блока 1 (S14): вид по умолчанию —
// ось времени с делениями и годами, сравнение «было/стало», граф без пустых узлов.
// Часть — из props (`part`), пресет — tech-neon, как у проекта блока 1.
import { Background, ComparisonSplit, FlowGraph, ProcessSteps, SafeArea, StyleProvider, Timeline, type FlowEdge, type FlowNode, type PresetId } from "@ms/motion-kit";
import { AbsoluteFill } from "remotion";

const NODES: FlowNode[] = [
  { id: "q1", label: "Память заранее", caption: "make(map, n)", x: 0, y: 0, w: 330, h: 104, elevation: 1 },
  { id: "q2", label: "Случайный обход", caption: "range", x: 0, y: 248, w: 330, h: 104, elevation: 1 },
  { id: "q3", label: "Указатель — нельзя", caption: "&m[k]", x: 0, y: 496, w: 330, h: 104, elevation: 1 },
  { id: "grow", label: "Рост map", caption: "четвёртый вопрос", x: 560, y: 220, w: 400, h: 160, elevation: 3, accentIndex: 0 },
  { id: "iter", label: "Итерация", caption: "в этот момент", x: 1180, y: 236, w: 330, h: 128, elevation: 2, accentIndex: 1 },
];
const EDGES: FlowEdge[] = [
  { id: "e1", from: "q1", to: "grow" },
  { id: "e2", from: "q2", to: "grow" },
  { id: "e3", from: "q3", to: "grow" },
  { id: "e4", from: "grow", to: "iter" },
];

function Part({ part }: { part: string }) {
  if (part === "timeline1") {
    return <Timeline items={[{ date: "февраль 2025", label: "Go 1.24", note: "map на Swiss Table" }]} beat={{ start_frame: 10, end_frame: 100 }} orientation="h" />;
  }
  if (part === "timeline3") {
    return (
      <Timeline
        items={[{ date: "2012", label: "Go 1.0", note: "map на бакетах" }, { date: "2022", label: "Swiss Table", note: "статья Google" }, { date: "февраль 2025", label: "Go 1.24", note: "map заново" }]}
        beat={{ start_frame: 10, end_frame: 100 }}
        orientation="h"
      />
    );
  }
  // S15a (kit 0.5.6): скученные вехи — равномерно, без наложений подписей
  if (part === "timelineCrowded") {
    return (
      <Timeline
        items={[{ date: "1990", label: "Хеш-таблицы", note: "цепочки" }, { date: "2020", label: "Abseil", note: "Swiss Table" }, { date: "2022", label: "Rust", note: "hashbrown" }, { date: "2024", label: "Go 1.24", note: "map заново" }]}
        beat={{ start_frame: 10, end_frame: 100 }}
        orientation="h"
      />
    );
  }
  if (part === "splitMetric") {
    return (
      <ComparisonSplit
        left={{ label: "Бакеты", title: "Старая map", items: ["цепочки overflow"], metric: { value: 8, max: 16 } }}
        right={{ label: "Go 1.24", title: "Swiss Table", items: ["группы по 8"], metric: { value: 14, max: 16 } }}
        beat={{ start_frame: 10, end_frame: 100 }}
        divider="line"
      />
    );
  }
  // лента шагов в двух копиях под clipPath (как сц. 5 смоука S14): проба видит текст один раз
  if (part === "stepsClip") {
    const steps = ["Память заранее", "Случайный обход", "Адрес элемента", "Рост при обходе"];
    return (
      <div style={{ position: "relative", width: 1690, height: 560 }}>
        {[{ l: -10, r: 25, o: 0.5 }, { l: 75, r: -10, o: 1 }].map((c, k) => (
          <div key={k} style={{ position: "absolute", inset: 0, opacity: c.o, clipPath: `inset(-20% ${c.r}% -20% ${c.l}%)` }}>
            <ProcessSteps steps={steps} beat={{ start_frame: 10, end_frame: 100 }} connector="arrow" />
          </div>
        ))}
      </div>
    );
  }
  if (part === "stepsDim") {
    return <ProcessSteps steps={["Память заранее", "Случайный обход", "Адрес элемента", "Рост при обходе"]} beat={{ start_frame: 10, end_frame: 100 }} connector="arrow" dimBefore focusIndex={3} />;
  }
  if (part === "split") {
    return (
      <ComparisonSplit
        left={{ label: "Ответы", title: "Старая map", items: ["бакеты по 8", "overflow-цепочки", "эвакуация"] }}
        right={{ label: "Go 1.24", title: "Swiss Table", items: ["группы по 8", "контрольные байты", "SIMD-поиск"] }}
        beat={{ start_frame: 10, end_frame: 100 }}
        divider="vs"
      />
    );
  }
  return <FlowGraph nodes={NODES} edges={EDGES} beat={{ start_frame: 10, end_frame: 100 }} width={1510} height={600} />;
}

export const Scene = ({ preset = "tech-neon", part = "timeline1" }: { preset?: PresetId; part?: string }) => (
  <StyleProvider style={preset}>
    <AbsoluteFill>
      <Background />
      <SafeArea>
        <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Part part={part} />
        </AbsoluteFill>
      </SafeArea>
    </AbsoluteFill>
  </StyleProvider>
);
