import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Card,
  FlowGraph,
  KineticText,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  EASE,
  accent,
  alpha,
  cardSurface,
  springAt,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };

type SceneProps = {
  kicker?: string;
  title?: string;
  highlight?: string;
  answer?: string;
};

// Биты из spec.json
const BEATS = {
  bg: { start_frame: 0, end_frame: 40 },
  kicker: { start_frame: 4, end_frame: 28 },
  title: { start_frame: 12, end_frame: 42 },
  graph: { start_frame: 30, end_frame: 90 },
  request: { start_frame: 66, end_frame: 94 },
  fanout: { start_frame: 86, end_frame: 114 },
  dataReturn: { start_frame: 108, end_frame: 134 },
  answer: { start_frame: 126, end_frame: 148 },
  emphasis: { start_frame: 140, end_frame: 160 },
} satisfies Record<string, Beat>;

// Раскладка в px внутри SafeArea (1728×972, отступ 96×54)
const GRAPH_LEFT = 64; // 0.083 × 1920 − 96
const GRAPH_TOP = 216; // 0.25 × 1080 − 54
const GRAPH_W = 1600;
const GRAPH_H = 640;

const NODES = [
  { id: "user", label: "Пользователь", caption: "запрос", x: 0, y: 265, w: 300, h: 110, elevation: 2 as const },
  { id: "orch", label: "Оркестратор", caption: "планирует шаги", x: 620, y: 235, w: 360, h: 170, elevation: 3 as const, accentIndex: 0 },
  { id: "tool-search", label: "Веб-поиск", caption: "API", x: 1300, y: 40, w: 300, h: 110, elevation: 1 as const },
  { id: "tool-kb", label: "База знаний", caption: "векторы", x: 1300, y: 265, w: 300, h: 110, elevation: 1 as const },
  { id: "tool-code", label: "Python-код", caption: "вычисления", x: 1300, y: 490, w: 300, h: 110, elevation: 1 as const },
];

const EDGES = [
  { id: "e-user-orch", from: "user", to: "orch" },
  { id: "e-orch-search", from: "orch", to: "tool-search" },
  { id: "e-orch-kb", from: "orch", to: "tool-kb" },
  { id: "e-orch-code", from: "orch", to: "tool-code" },
];

type Flow = {
  edge: string;
  reverse: boolean;
  beat: Beat;
  accentIndex: number;
  delay: number;
};

// Один проход на фазу; задержка сдвигает окно целиком, чтобы скорость импульсов совпадала
const FLOWS: Flow[] = [
  { edge: "e-user-orch", reverse: false, beat: BEATS.request, accentIndex: 0, delay: 0 },
  { edge: "e-orch-search", reverse: false, beat: BEATS.fanout, accentIndex: 1, delay: 0 },
  { edge: "e-orch-kb", reverse: false, beat: BEATS.fanout, accentIndex: 1, delay: 4 },
  { edge: "e-orch-code", reverse: false, beat: BEATS.fanout, accentIndex: 1, delay: 8 },
  { edge: "e-orch-search", reverse: true, beat: BEATS.dataReturn, accentIndex: 2, delay: 0 },
  { edge: "e-orch-kb", reverse: true, beat: BEATS.dataReturn, accentIndex: 2, delay: 5 },
  { edge: "e-orch-code", reverse: true, beat: BEATS.dataReturn, accentIndex: 2, delay: 10 },
  { edge: "e-user-orch", reverse: true, beat: BEATS.answer, accentIndex: 2, delay: 0 },
];

const shift = (b: Beat, d: number): Beat => ({
  start_frame: b.start_frame + d,
  end_frame: b.end_frame + d,
});

// Свечение под карточкой оркестратора: вспышка на веере и ровное дыхание в финале
const OrchGlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = useStyle();
  const node = NODES[1];

  const flashIn = springAt(frame, fps, style, BEATS.fanout.start_frame - 2, "snappy");
  const flashOut = interpolate(
    frame,
    [BEATS.fanout.start_frame + 4, BEATS.fanout.start_frame + 24],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.outQuart },
  );
  const flash = Math.max(0, flashIn) * flashOut;

  const settle = interpolate(
    frame,
    [BEATS.emphasis.start_frame, BEATS.emphasis.end_frame],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE.outExpo },
  );
  const breathe = 0.85 + 0.15 * Math.sin((frame - BEATS.emphasis.start_frame) / 14);
  const glow = Math.max(flash, settle * 0.7 * breathe);

  const color = accent(style, 0);
  const surface = cardSurface(style, 3);

  return (
    <div
      style={{
        position: "absolute",
        left: GRAPH_LEFT + node.x,
        top: GRAPH_TOP + node.y,
        width: node.w,
        height: node.h,
        borderRadius: surface.borderRadius,
        boxShadow: `0 0 ${24 + 40 * glow}px ${4 + 10 * glow}px ${alpha(color, 0.55 * glow)}, 0 0 0 2px ${alpha(color, 0.6 * glow)}`,
        opacity: glow > 0.001 ? 1 : 0,
      }}
    />
  );
};

const AgentScene: React.FC<Required<SceneProps>> = ({ kicker, title, highlight, answer }) => {
  const style = useStyle();

  return (
    <>
      <Background beat={BEATS.bg} variant="aurora" grain seed="agent-arch" />
      <SafeArea>
        <div style={{ position: "absolute", left: 0, top: 11, width: 864 }}>
          <KineticText
            text={kicker}
            beat={BEATS.kicker}
            mode="letters"
            enter="fade"
            size={1}
            font="mono"
            caps
          />
        </div>

        <div style={{ position: "absolute", left: 0, top: 54, width: 1728 }}>
          <KineticText
            text={title}
            beat={BEATS.title}
            mode="words"
            enter="rise"
            size={5}
            highlight={[highlight]}
          />
        </div>

        <OrchGlow />

        <div
          style={{
            position: "absolute",
            left: GRAPH_LEFT,
            top: GRAPH_TOP,
            width: GRAPH_W,
            height: GRAPH_H,
          }}
        >
          <FlowGraph
            nodes={NODES}
            edges={EDGES}
            beat={BEATS.graph}
            width={GRAPH_W}
            height={GRAPH_H}
            enter="flip"
          >
            {FLOWS.map((f) => (
              <PulseAlongPath
                key={`${f.edge}-${f.reverse ? "r" : "f"}`}
                edgeId={f.edge}
                beat={shift(f.beat, f.delay)}
                color={accent(style, f.accentIndex)}
                reverse={f.reverse}
                repeat={false}
                count={1}
              />
            ))}
          </FlowGraph>
        </div>

        <div style={{ position: "absolute", left: GRAPH_LEFT, top: 886 }}>
          <Card
            elevation={2}
            beat={BEATS.emphasis}
            enter="scale"
            accentIndex={2}
            width={384}
            padding={16}
          >
            <KineticText
              text={answer}
              beat={{ start_frame: BEATS.emphasis.start_frame + 6, end_frame: BEATS.emphasis.end_frame }}
              mode="words"
              enter="fade"
              size={2}
              weight={700}
            />
          </Card>
        </div>
      </SafeArea>
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({
  kicker = "Как работает агент",
  title = "Один запрос — три инструмента",
  highlight = "три инструмента",
  answer = "Ответ готов",
}) => (
  <StyleProvider style="dark-premium">
    <AgentScene kicker={kicker} title={title} highlight={highlight} answer={answer} />
  </StyleProvider>
);
