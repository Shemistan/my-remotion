import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Card,
  EASE,
  KineticText,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  edgePath,
  mix,
  pathD,
  presets,
  springAt,
  useStyle,
} from "@ms/motion-kit";

type SceneProps = {
  kicker?: string;
  userRequest?: string;
  finalCaption?: string;
};

type NodeDef = {
  id: string;
  label: string;
  caption: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type EdgeDef = { id: string; from: string; to: string; drawStart: number };

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const GRAPH_W = 1600;
const GRAPH_H = 760;
const GRAPH_LEFT = 64;
const GRAPH_TOP = 70;
const DRAW_LEN = 18;

const USER: NodeDef = { id: "user", label: "Пользователь", caption: "", x: 0, y: 300, w: 330, h: 160 };
const ORCH: NodeDef = { id: "orch", label: "Оркестратор", caption: "LLM · план", x: 620, y: 265, w: 380, h: 230 };
const TOOLS: NodeDef[] = [
  { id: "tool-search", label: "Веб-поиск", caption: "рейсы, отели", x: 1260, y: 30, w: 340, h: 150 },
  { id: "tool-db", label: "База знаний", caption: "профиль", x: 1260, y: 305, w: 340, h: 150 },
  { id: "tool-code", label: "Код", caption: "расчёт бюджета", x: 1260, y: 580, w: 340, h: 150 },
];
const NODES: Record<string, NodeDef> = Object.fromEntries(
  [USER, ORCH, ...TOOLS].map((n) => [n.id, n]),
);

const EDGES: EdgeDef[] = [
  { id: "e-req", from: "user", to: "orch", drawStart: 30 },
  { id: "e-search", from: "orch", to: "tool-search", drawStart: 56 },
  { id: "e-db", from: "orch", to: "tool-db", drawStart: 64 },
  { id: "e-code", from: "orch", to: "tool-code", drawStart: 72 },
];
const TOOL_EDGES = EDGES.slice(1);

const SEGMENTS: Record<string, ReturnType<typeof edgePath>> = Object.fromEntries(
  EDGES.map((e) => [e.id, edgePath(NODES[e.from], NODES[e.to])]),
);

// Тайминг импульсов (из битов spec): старт и travel → кадр прихода
const REQ_START = 38;
const REQ_TRAVEL = 20;
const REQ_ARRIVE = REQ_START + REQ_TRAVEL; // 58
const CALL_STARTS = [72, 79, 86];
const CALL_TRAVEL = 16;
const RET_STARTS = [98, 104, 110];
const RET_TRAVEL = 14;
const ANS_START = 118;
const ANS_TRAVEL = 20;
const ANS_ARRIVE = ANS_START + ANS_TRAVEL; // 138
const HOLD_START = 144;
const HOLD_TRAVEL = 45;

const PHASES = [
  { text: "1 · запрос", from: 34 },
  { text: "2 · вызов инструментов", from: 62 },
  { text: "3 · ответ", from: 118 },
];

// Вспышка от кадра прихода импульса: подъём 4 кадра, затухание 14
const spike = (frame: number, at: number): number =>
  interpolate(frame, [at, at + 4, at + 18], [0, 1, 0], { ...CLAMP, easing: EASE.outQuart });

const DISPLAY = "Manrope, sans-serif";
const MONO = "'JetBrains Mono', monospace";

export const Scene: React.FC<SceneProps> = (props) => {
  const base = presets["dark-premium"];
  return (
    <StyleProvider style={{ ...base, motion: { ...base.motion, intensity: "balanced" } }}>
      <SceneInner {...props} />
    </StyleProvider>
  );
};

const SceneInner: React.FC<SceneProps> = ({
  kicker = "Архитектура AI-агента",
  userRequest = "«Спланируй поездку»",
  finalCaption = "Готово: маршрут и бюджет",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const style = useStyle();
  const a0 = accent(style, 0);
  const a1 = accent(style, 1);
  const a2 = accent(style, 2);

  // Камера: наезд 1.00→1.02 к оркестратору весь ролик + дрейф 6 px в hold
  const camScale = interpolate(frame, [0, durationInFrames], [1, 1.02], { ...CLAMP, easing: EASE.inOutCubic });
  const drift = interpolate(frame, [HOLD_START, durationInFrames], [0, 1], { ...CLAMP, easing: EASE.inOutCubic });
  const originX = ORCH.x + ORCH.w / 2;
  const originY = ORCH.y + ORCH.h / 2;

  // ---- Пользователь: flip + подъём 40 px (snappy)
  const userIn = springAt(frame, fps, style, 4, "snappy");
  const userOpacity = interpolate(frame, [4, 12], [0, 1], CLAMP);
  const userRise = interpolate(frame, [ANS_ARRIVE, ANS_ARRIVE + 4], [0, 1], CLAMP);
  const userSettle = springAt(frame, fps, style, ANS_ARRIVE + 4, "bouncy");
  const userPunch = 1 + 0.06 * (userRise - userSettle);
  const userGlow = Math.max(
    spike(frame, ANS_ARRIVE),
    interpolate(frame, [ANS_ARRIVE + 4, ANS_ARRIVE + 18], [0, 0.5], CLAMP),
  );
  const ringT = interpolate(frame, [ANS_ARRIVE, ANS_ARRIVE + 24], [0, 1], { ...CLAMP, easing: EASE.outExpo });
  const ringOpacity = frame >= ANS_ARRIVE ? interpolate(ringT, [0, 0.15, 1], [0, 0.8, 0], CLAMP) : 0;

  // TypeWriter запроса 14–34, курсор мигает до 54; затем fade-swap на итог
  const typed = Math.floor(interpolate(frame, [14, 34], [0, userRequest.length], CLAMP));
  const cursorOn = frame >= 14 && frame < 54 && (frame < 34 || Math.floor((frame - 34) / 8) % 2 === 0);
  const oldCaptionOpacity = interpolate(frame, [ANS_ARRIVE, ANS_ARRIVE + 5], [1, 0], CLAMP);

  // ---- Оркестратор: из глубины 0.85→1, вспышка от запроса, ступени от возвратов, дыхание в hold
  const orchIn = springAt(frame, fps, style, 18, "snappy");
  const orchOpacity = interpolate(frame, [18, 26], [0, 1], CLAMP);
  const orchBlur = interpolate(frame, [18, 30], [10, 0], CLAMP);
  const reqFlash = interpolate(frame, [REQ_ARRIVE, REQ_ARRIVE + 4, REQ_ARRIVE + 18], [0, 1, 0.4], {
    ...CLAMP,
    easing: EASE.outQuart,
  });
  const retArrivals = RET_STARTS.map((s) => s + RET_TRAVEL);
  const retSteps = retArrivals.reduce((sum, at) => sum + interpolate(frame, [at, at + 4], [0, 0.2], CLAMP), 0);
  const retSpikes = retArrivals.reduce((sum, at) => sum + spike(frame, at), 0);
  const breathT = ((frame - HOLD_START) / 40) * Math.PI * 2;
  const inHold = frame >= HOLD_START;
  const orchGlow = inHold
    ? 0.85 + 0.15 * Math.cos(breathT)
    : Math.min(1, reqFlash + retSteps + 0.15 * retSpikes);
  const orchScale =
    (0.85 + 0.15 * orchIn) *
    (1 + 0.04 * spike(frame, REQ_ARRIVE) + 0.02 * retSpikes + (inHold ? 0.015 * Math.sin(breathT) : 0));

  // ---- Сетка: проявление 0–30, сдвиг 6 px в hold
  const gridOpacity = interpolate(frame, [0, 30], [0, 1], CLAMP);
  const gridShift = 6 * interpolate(frame, [HOLD_START, durationInFrames], [0, 1], CLAMP);

  return (
    <>
      <Background beat={{ start_frame: 0, end_frame: 30 }} variant="aurora" seed="agent-arch" />
      <GridOverlay opacity={gridOpacity} shift={gridShift} color={mix(a0, "#ffffff", 0.7)} />
      <SafeArea>
        <div style={{ position: "absolute", left: 0, top: 0, opacity: 0.68 }}>
          <KineticText
            text={kicker}
            beat={{ start_frame: 10, end_frame: 34 }}
            mode="letters"
            enter="fade"
            size={1}
            font="mono"
            caps
          />
        </div>

        {/* Слой камеры: граф */}
        <div
          style={{
            position: "absolute",
            left: GRAPH_LEFT,
            top: GRAPH_TOP,
            width: GRAPH_W,
            height: GRAPH_H,
            transformOrigin: `${originX}px ${originY}px`,
            transform: `translate(${-6 * drift}px, ${-3 * drift}px) scale(${camScale})`,
          }}
        >
          {/* Рёбра: подложка + прорисовка по кадру */}
          <svg width={GRAPH_W} height={GRAPH_H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <defs>
              {EDGES.map((e) => (
                <marker
                  key={e.id}
                  id={`arrow-${e.id}`}
                  viewBox="0 0 10 10"
                  refX={8}
                  refY={5}
                  markerWidth={7}
                  markerHeight={7}
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill={alpha(a0, 0.8)} />
                </marker>
              ))}
            </defs>
            {EDGES.map((e) => {
              const p = interpolate(frame, [e.drawStart, e.drawStart + DRAW_LEN], [0, 1], {
                ...CLAMP,
                easing: EASE.outQuart,
              });
              if (p <= 0) return null;
              const d = pathD([SEGMENTS[e.id]]);
              return (
                <g key={e.id}>
                  <path d={d} fill="none" stroke={alpha(a0, 0.22 * p)} strokeWidth={8} strokeLinecap="round" />
                  <path
                    d={d}
                    fill="none"
                    stroke={alpha(mix(a0, "#ffffff", 0.25), 0.75)}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - p}
                    markerEnd={p > 0.97 ? `url(#arrow-${e.id})` : undefined}
                  />
                </g>
              );
            })}
          </svg>

          {/* Пользователь */}
          <div
            style={{
              position: "absolute",
              left: USER.x,
              top: USER.y,
              width: USER.w,
              height: USER.h,
              opacity: userOpacity,
              transform: `perspective(1200px) translateY(${40 * (1 - userIn)}px) rotateY(${-55 * (1 - userIn)}deg) scale(${userPunch})`,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: -40 * ringT,
                borderRadius: 24 + 40 * ringT,
                border: `2px solid ${alpha(a1, ringOpacity)}`,
                boxShadow: `0 0 24px ${alpha(a1, ringOpacity * 0.6)}`,
              }}
            />
            <NodeCard node={USER} elevation={2} accentIndex={1} glow={userGlow} glowColor={a1}>
              <KineticText
                text={USER.label}
                beat={{ start_frame: 8, end_frame: 26 }}
                mode="words"
                enter="rise"
                size={3}
                align="center"
              />
              <div style={{ position: "relative", height: 60, width: "100%" }}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: oldCaptionOpacity,
                    fontFamily: MONO,
                    fontWeight: 500,
                    fontSize: 22,
                    color: mix(a1, "#ffffff", 0.55),
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>{userRequest.slice(0, typed)}</span>
                  <span
                    style={{
                      display: "inline-block",
                      width: 2,
                      height: 24,
                      marginLeft: 3,
                      background: a1,
                      opacity: cursorOn ? 1 : 0,
                    }}
                  />
                </div>
                {frame >= ANS_ARRIVE + 4 ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                    }}
                  >
                    <KineticText
                      text={finalCaption}
                      beat={{ start_frame: ANS_ARRIVE + 4, end_frame: ANS_ARRIVE + 14 }}
                      mode="words"
                      enter="fade"
                      size={1}
                      font="mono"
                      align="center"
                      maxWidth={290}
                      lineHeight={1.2}
                    />
                  </div>
                ) : null}
              </div>
            </NodeCard>
          </div>

          {/* Оркестратор — герой */}
          <div
            style={{
              position: "absolute",
              left: ORCH.x,
              top: ORCH.y,
              width: ORCH.w,
              height: ORCH.h,
              opacity: orchOpacity,
              filter: `blur(${orchBlur}px)`,
              transform: `scale(${orchScale})`,
            }}
          >
            <NodeCard node={ORCH} elevation={3} accentIndex={0} glow={orchGlow} glowColor={a0} rimBase={0.35}>
              <KineticText
                text={ORCH.label}
                beat={{ start_frame: 24, end_frame: 44 }}
                mode="words"
                enter="scale"
                size={4}
                align="center"
              />
              <div style={{ opacity: 0.7 }}>
                <KineticText
                  text={ORCH.caption}
                  beat={{ start_frame: 30, end_frame: 46 }}
                  mode="words"
                  enter="fade"
                  size={1}
                  font="mono"
                  align="center"
                />
              </div>
            </NodeCard>
          </div>

          {/* Инструменты: slide справа со скосом, когда ребро дорисовано на 70 % */}
          {TOOLS.map((node, i) => {
            const enterAt = TOOL_EDGES[i].drawStart + Math.round(DRAW_LEN * 0.7);
            const s = springAt(frame, fps, style, enterAt, "snappy");
            const op = interpolate(frame, [enterAt, enterAt + 6], [0, 1], CLAMP);
            const arrive = CALL_STARTS[i] + CALL_TRAVEL;
            const flash = spike(frame, arrive);
            const lit = interpolate(frame, [arrive, arrive + 18], [0, 0.3], CLAMP);
            const sendBack = 0.5 * spike(frame, RET_STARTS[i]);
            return (
              <div
                key={node.id}
                style={{
                  position: "absolute",
                  left: node.x,
                  top: node.y,
                  width: node.w,
                  height: node.h,
                  opacity: op,
                  transform: `translateX(${40 * (1 - s)}px) skewX(${-8 * (1 - s)}deg) scale(${1 + 0.03 * flash})`,
                }}
              >
                <NodeCard
                  node={node}
                  elevation={2}
                  glow={Math.max(flash, lit, sendBack)}
                  glowColor={sendBack > flash ? a2 : a0}
                >
                  <KineticText
                    text={node.label}
                    beat={{ start_frame: enterAt + 3, end_frame: enterAt + 18 }}
                    mode="words"
                    enter="slide"
                    size={3}
                    align="center"
                  />
                  <div style={{ opacity: 0.7 }}>
                    <KineticText
                      text={node.caption}
                      beat={{ start_frame: enterAt + 7, end_frame: enterAt + 20 }}
                      mode="words"
                      enter="fade"
                      size={1}
                      font="mono"
                      align="center"
                    />
                  </div>
                </NodeCard>
              </div>
            );
          })}

          {/* Импульсы: один источник тайминга с вспышками узлов */}
          <AbsoluteFill>
            <PulseAlongPath
              segments={[SEGMENTS["e-req"]]}
              beat={{ start_frame: REQ_START, end_frame: REQ_ARRIVE }}
              travel={REQ_TRAVEL}
              repeat={false}
              color={a0}
              size={8}
              tail={120}
            />
            {TOOL_EDGES.map((e, i) => (
              <PulseAlongPath
                key={`call-${e.id}`}
                segments={[SEGMENTS[e.id]]}
                beat={{ start_frame: CALL_STARTS[i], end_frame: CALL_STARTS[i] + CALL_TRAVEL }}
                travel={CALL_TRAVEL}
                repeat={false}
                color={a0}
              />
            ))}
            {TOOL_EDGES.map((e, i) => (
              <PulseAlongPath
                key={`ret-${e.id}`}
                segments={[SEGMENTS[e.id]]}
                beat={{ start_frame: RET_STARTS[i], end_frame: RET_STARTS[i] + RET_TRAVEL }}
                travel={RET_TRAVEL}
                repeat={false}
                reverse
                color={a2}
              />
            ))}
            <PulseAlongPath
              segments={[SEGMENTS["e-req"]]}
              beat={{ start_frame: ANS_START, end_frame: ANS_ARRIVE }}
              travel={ANS_TRAVEL}
              repeat={false}
              reverse
              color={a1}
              size={9}
              tail={140}
            />
          </AbsoluteFill>

          {/* Живое удержание: приглушённые циклы по всем рёбрам */}
          <AbsoluteFill style={{ opacity: 0.5 }}>
            {[
              { edge: "e-req", start: HOLD_START, reverse: true, color: a1 },
              { edge: "e-search", start: HOLD_START + 9, reverse: false, color: a0 },
              { edge: "e-db", start: HOLD_START + 18, reverse: false, color: a0 },
              { edge: "e-code", start: HOLD_START + 27, reverse: false, color: a0 },
              { edge: "e-search", start: HOLD_START + 4, reverse: true, color: a2 },
              { edge: "e-db", start: HOLD_START + 13, reverse: true, color: a2 },
              { edge: "e-code", start: HOLD_START + 22, reverse: true, color: a2 },
              { edge: "e-req", start: HOLD_START + 31, reverse: false, color: a1 },
            ].map((h) => (
              <PulseAlongPath
                key={`hold-${h.edge}-${h.start}`}
                segments={[SEGMENTS[h.edge]]}
                beat={{ start_frame: h.start, end_frame: durationInFrames }}
                travel={HOLD_TRAVEL}
                reverse={h.reverse}
                color={h.color}
                size={6}
                tail={90}
              />
            ))}
          </AbsoluteFill>
        </div>

        {/* Подпись фазы: уход влево с fade за 8 кадров, вход slide справа */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 878, height: 50 }}>
          {PHASES.map((ph, i) => {
            const next = PHASES[i + 1];
            const exitT = next ? interpolate(frame, [next.from, next.from + 8], [0, 1], CLAMP) : 0;
            const enterAt = i === 0 ? ph.from : ph.from + 4;
            if (frame < enterAt || exitT >= 1) return null;
            return (
              <div
                key={ph.text}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  justifyContent: "center",
                  opacity: 0.72 * (1 - exitT),
                  transform: `translateX(${-40 * exitT}px)`,
                }}
              >
                <KineticText
                  text={ph.text}
                  beat={{ start_frame: enterAt, end_frame: enterAt + 14 }}
                  mode="words"
                  enter="slide"
                  size={2}
                  font="mono"
                  align="center"
                />
              </div>
            );
          })}
        </div>
      </SafeArea>
    </>
  );
};

// ---- Узел-карточка со светящейся кромкой (glow 0..1 от прихода импульса)
const NodeCard: React.FC<{
  node: NodeDef;
  elevation: 0 | 1 | 2 | 3;
  accentIndex?: number;
  glow: number;
  glowColor: string;
  rimBase?: number;
  children: React.ReactNode;
}> = ({ node, elevation, accentIndex, glow, glowColor, rimBase = 0, children }) => {
  const rim = Math.min(1, rimBase + glow * 0.65);
  return (
    <div
      style={{
        position: "relative",
        width: node.w,
        height: node.h,
        borderRadius: 24,
        boxShadow: `0 0 ${24 + 48 * glow}px ${alpha(glowColor, 0.5 * glow)}`,
      }}
    >
      <Card elevation={elevation} enter="none" accentIndex={accentIndex} width={node.w} height={node.h} padding={20}>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontFamily: DISPLAY,
          }}
        >
          {children}
        </div>
      </Card>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 24,
          border: `2px solid ${alpha(glowColor, rim)}`,
          pointerEvents: "none",
        }}
      />
    </div>
  );
};

// ---- Инженерная сетка 48 px с радиальным затуханием (идея grid-pattern, сдвиг patternTransform по кадру)
const GridOverlay: React.FC<{ opacity: number; shift: number; color: string }> = ({ opacity, shift, color }) => (
  <AbsoluteFill style={{ opacity }}>
    <svg width="100%" height="100%">
      <defs>
        <pattern
          id="eng-grid"
          width={48}
          height={48}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${shift} ${shift * 0.5})`}
        >
          <path d="M48 0 L0 0 0 48" fill="none" stroke={alpha(color, 0.06)} strokeWidth={1} />
        </pattern>
        <radialGradient id="eng-grid-fade" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
          <stop offset="70%" stopColor="#ffffff" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        <mask id="eng-grid-mask">
          <rect width="100%" height="100%" fill="url(#eng-grid-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#eng-grid)" mask="url(#eng-grid-mask)" />
    </svg>
  </AbsoluteFill>
);
