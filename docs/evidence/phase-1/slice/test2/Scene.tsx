import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  EASE,
  KineticText,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  beatProgress,
  cardSurface,
  edgePath,
  mix,
  pathD,
  presets,
  springAt,
  useStyle,
} from "@ms/motion-kit";

type SceneProps = {
  kicker?: string;
  query?: string;
};

type Style = ReturnType<typeof useStyle>;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const TEXT = "#F2F0FA";
const MUTED = "#A9A6BD";
const DISPLAY = "Manrope, sans-serif";
const MONO = "JetBrains Mono, monospace";

// Область графа внутри safe area (1728×972): layout y 0.1, h 0.8
const GRAPH_W = 1728;
const GRAPH_H = 780;
const GRAPH_TOP = 97;

const NODES = {
  user: { id: "user", label: "Пользователь", x: 40, y: 330, w: 320, h: 120 },
  orch: { id: "orch", label: "Оркестратор", x: 684, y: 300, w: 360, h: 180 },
  search: { id: "tool-search", label: "Веб-поиск", x: 1368, y: 40, w: 320, h: 110 },
  kb: { id: "tool-kb", label: "База знаний", x: 1368, y: 335, w: 320, h: 110 },
  calc: { id: "tool-calc", label: "Калькулятор", x: 1368, y: 630, w: 320, h: 110 },
};

const SEG = {
  request: edgePath(NODES.user, NODES.orch),
  search: edgePath(NODES.orch, NODES.search),
  kb: edgePath(NODES.orch, NODES.kb),
  calc: edgePath(NODES.orch, NODES.calc),
};

// Тайминг из битов spec
const EDGE_DRAW = [
  { key: "request" as const, start: 36, end: 54 },
  { key: "search" as const, start: 44, end: 60 },
  { key: "kb" as const, start: 50, end: 66 },
  { key: "calc" as const, start: 56, end: 72 },
];

const TOOLS = [
  { node: NODES.search, seg: "search" as const, caption: "search()", enter: 30, call: 76, ret: 102, loopCall: 151, loopRet: 163 },
  { node: NODES.kb, seg: "kb" as const, caption: "retrieve()", enter: 38, call: 80, ret: 106, loopCall: 153, loopRet: 165 },
  { node: NODES.calc, seg: "calc" as const, caption: "calc()", enter: 46, call: 84, ret: 110, loopCall: 155, loopRet: 167 },
];

const REQUEST = { start: 50, end: 76 };
const CALL_PASS = 18;
const RET_PASS = 16;
const ANSWER = { start: 124, end: 140 };
const LOOP_REQ = { start: 141, end: 151 };
const LOOP_PASS = 10;
const LOOP_ANSWER = { start: 175, end: 186 };
const HOLD = { start: 140, end: 180 };

const PHASES = [
  { text: "запрос", from: 50, to: 76, accentIndex: 0 },
  { text: "вызов инструментов", from: 76, to: 102, accentIndex: 1 },
  { text: "ответ", from: 102, to: 999, accentIndex: 2 },
];

// Вспышка в кадр прихода импульса: быстрый подъём и пружинный спад
const flash = (frame: number, fps: number, style: Style, at: number): number => {
  if (frame < at) return 0;
  const up = interpolate(frame, [at, at + 4], [0, 1], CLAMP);
  const down = springAt(frame, fps, style, at + 4, "bouncy");
  return up * (1 - down);
};

const step = (frame: number, at: number): number =>
  interpolate(frame, [at, at + 5], [0, 1], { ...CLAMP, easing: EASE.outQuart });

type NodeBoxProps = {
  x: number;
  y: number;
  w: number;
  h: number;
  elevation: 0 | 1 | 2 | 3;
  transform: string;
  opacity: number;
  glow: number;
  glowColor: string;
  topEdge?: string;
  children: React.ReactNode;
};

const NodeBox: React.FC<NodeBoxProps> = ({ x, y, w, h, elevation, transform, opacity, glow, glowColor, topEdge, children }) => {
  const style = useStyle();
  const surface = cardSurface(style, elevation);
  const g = Math.max(0, glow);
  return (
    <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform, opacity }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: surface.borderRadius,
          boxShadow: `0 0 ${20 + 46 * g}px ${alpha(glowColor, Math.min(0.85, 0.55 * g))}`,
        }}
      />
      <div
        style={{
          ...surface,
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          border: `1.5px solid ${alpha(glowColor, Math.min(1, 0.18 + 0.6 * g))}`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 8,
        }}
      >
        {topEdge ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 3,
              background: topEdge,
              boxShadow: `0 0 18px ${topEdge}`,
            }}
          />
        ) : null}
        {children}
      </div>
    </div>
  );
};

const GridOverlay: React.FC<{ frame: number }> = ({ frame }) => {
  const fadeIn = interpolate(frame, [0, 30], [0, 1], { ...CLAMP, easing: EASE.outQuart });
  const drift = interpolate(frame, [HOLD.start, HOLD.end], [0, 1], { ...CLAMP, easing: EASE.inOutCubic });
  const dx = 3 * drift;
  const dy = -3 * drift;
  return (
    <AbsoluteFill style={{ opacity: 0.35 * fadeIn }}>
      <svg width={1920} height={1080}>
        <defs>
          <pattern id="agent-grid" width={48} height={48} patternUnits="userSpaceOnUse" patternTransform={`translate(${dx} ${dy})`}>
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke={alpha(TEXT, 0.22)} strokeWidth={1} />
          </pattern>
          <radialGradient id="agent-grid-fade" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
            <stop offset="70%" stopColor="#FFFFFF" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </radialGradient>
          <mask id="agent-grid-mask">
            <rect width={1920} height={1080} fill="url(#agent-grid-fade)" />
          </mask>
        </defs>
        <rect width={1920} height={1080} fill="url(#agent-grid)" mask="url(#agent-grid-mask)" />
      </svg>
    </AbsoluteFill>
  );
};

const PhaseLabel: React.FC<{ frame: number }> = ({ frame }) => {
  const style = useStyle();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 904, height: 58 }}>
      {PHASES.map((p) => {
        if (frame < p.from) return null;
        const inP = springAt(frame, fps, style, p.from, "snappy");
        const out = interpolate(frame, [p.to, p.to + 8], [0, 1], { ...CLAMP, easing: EASE.outQuart });
        if (out >= 1) return null;
        const color = accent(style, p.accentIndex);
        const x = 40 * (1 - inP) - 40 * out;
        const skew = -10 * (1 - inP) + 10 * out;
        return (
          <div
            key={p.text}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 14,
              opacity: Math.min(1, Math.max(0, inP)) * (1 - out),
              transform: `translateX(${x}px) skewX(${skew}deg)`,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, background: color, boxShadow: `0 0 14px ${color}` }} />
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, color: mix(MUTED, color, 0.55), letterSpacing: 0.5 }}>
              {p.text}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AgentScene: React.FC<Required<SceneProps>> = ({ kicker, query }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = useStyle();

  const violet = accent(style, 0);
  const teal = accent(style, 1);
  const amber = accent(style, 2);

  // Камера: статична до 140, затем наезд 1 → 1,015 и дрейф 6 px вправо-вверх
  const cam = interpolate(frame, [HOLD.start, HOLD.end], [0, 1], { ...CLAMP, easing: EASE.inOutCubic });
  const camScale = 1 + 0.015 * cam;
  const camX = 6 * cam;
  const camY = -6 * cam;

  // --- Пользователь: rise 40 px, snappy, кадры 8–30
  const userP = springAt(frame, fps, style, 8, "snappy");
  const userIn = interpolate(frame, [8, 16], [0, 1], CLAMP);
  const userFlash = flash(frame, fps, style, ANSWER.end);
  const answered = step(frame, ANSWER.end);
  const breathe = frame >= HOLD.start ? Math.sin(((frame - HOLD.start) / 40) * Math.PI * 2) : 0;
  const userGlow = 0.12 + userFlash * 1.2 + answered * (0.5 + 0.08 * breathe);
  const userColor = mix(MUTED, amber, answered);
  const userScale = 1 + 0.08 * userFlash;

  const fullQuery = `«${query}»`;
  const typed = Math.floor(interpolate(frame, [12, 40], [0, fullQuery.length], CLAMP));
  // Курсор: сплошной во время печати, мигает, гаснет после 40-го кадра
  const cursorOn = frame >= 12 && frame < 40 && (typed < fullQuery.length || Math.floor(frame / 6) % 2 === 0);
  const checkP = springAt(frame, fps, style, ANSWER.end, "bouncy");

  // --- Оркестратор: scale 0.6 → 1, bouncy, кадры 18–46
  const orchP = springAt(frame, fps, style, 18, "bouncy");
  const orchIn = interpolate(frame, [18, 26], [0, 1], CLAMP);
  const edgeOn = interpolate(frame, [38, 48], [0, 1], { ...CLAMP, easing: EASE.outQuart });
  const reqFlash = flash(frame, fps, style, REQUEST.end);
  const retArrivals = TOOLS.map((t) => t.ret + RET_PASS);
  const charge = 0.4 + 0.3 * step(frame, retArrivals[1]) + 0.3 * step(frame, retArrivals[2]);
  const drain = interpolate(frame, [ANSWER.start + 2, ANSWER.end], [0, 0.55], { ...CLAMP, easing: EASE.outQuart });
  const retFlash = retArrivals.reduce((s, a) => s + flash(frame, fps, style, a), 0);
  const loopFlash = TOOLS.reduce((s, t) => s + flash(frame, fps, style, t.loopRet + LOOP_PASS), 0) + flash(frame, fps, style, LOOP_REQ.end);
  const orchLevel = edgeOn * (frame < retArrivals[0] ? 0.4 : charge - drain);
  const orchGlow = (orchLevel + 0.8 * reqFlash + 0.25 * retFlash + 0.2 * loopFlash) * (1 + 0.15 * breathe);
  const hue = interpolate(frame, [retArrivals[0], retArrivals[2]], [0, 1], CLAMP) - interpolate(frame, [ANSWER.end, HOLD.end], [0, 0.6], { ...CLAMP, easing: EASE.inOutCubic });
  const orchColor = mix(violet, amber, Math.max(0, hue));
  const orchScale = (0.6 + 0.4 * orchP) * (1 + 0.06 * reqFlash + 0.015 * retFlash);

  return (
    <SafeArea>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${camX}px, ${camY}px) scale(${camScale})`,
          transformOrigin: "50% 50%",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: 700 }}>
          <KineticText text={kicker} beat={{ start_frame: 2, end_frame: 30 }} mode="letters" enter="fade" size={1} font="mono" caps color={MUTED} />
        </div>

        <div style={{ position: "absolute", left: 0, top: GRAPH_TOP, width: GRAPH_W, height: GRAPH_H }}>
          {/* Рёбра: прорисовка stroke-dashoffset, стрелка на конце */}
          <svg width={GRAPH_W} height={GRAPH_H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <defs>
              <marker id="agent-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={alpha(TEXT, 0.55)} />
              </marker>
            </defs>
            {EDGE_DRAW.map((e) => {
              const p = beatProgress(frame, { start_frame: e.start, end_frame: e.end }, EASE.outQuart);
              const d = pathD([SEG[e.key]]);
              return (
                <g key={e.key}>
                  <path d={d} fill="none" stroke={alpha(TEXT, 0.06)} strokeWidth={8} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} strokeLinecap="round" />
                  <path d={d} fill="none" stroke={alpha(TEXT, 0.3)} strokeWidth={2} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} strokeLinecap="round" />
                  <g opacity={interpolate(p, [0.85, 1], [0, 1], CLAMP)}>
                    <path d={d} fill="none" stroke="none" strokeWidth={2} markerEnd="url(#agent-arrow)" />
                  </g>
                </g>
              );
            })}
          </svg>

          {/* Пользователь */}
          <NodeBox
            {...NODES.user}
            elevation={1}
            transform={`translateY(${40 * (1 - userP)}px) scale(${userScale})`}
            opacity={userIn}
            glow={userGlow}
            glowColor={mix(MUTED, amber, answered)}
          >
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: TEXT, lineHeight: 1 }}>{NODES.user.label}</div>
            <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 20, color: userColor, display: "flex", alignItems: "center", gap: 6, height: 26 }}>
              <span>{fullQuery.slice(0, typed)}</span>
              <span style={{ display: "inline-block", width: 10, height: 22, background: TEXT, opacity: cursorOn ? 0.85 : 0 }} />
              {frame >= ANSWER.end ? (
                <span style={{ color: amber, fontWeight: 700, display: "inline-block", transform: `scale(${checkP})`, marginLeft: -10 }}>✓</span>
              ) : null}
            </div>
          </NodeBox>

          {/* Оркестратор — герой */}
          <NodeBox
            {...NODES.orch}
            elevation={3}
            transform={`scale(${orchScale})`}
            opacity={orchIn}
            glow={orchGlow}
            glowColor={orchColor}
            topEdge={alpha(orchColor, edgeOn)}
          >
            <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, color: TEXT, lineHeight: 1 }}>{NODES.orch.label}</div>
            <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 20, color: mix(MUTED, orchColor, 0.5) }}>LLM · планирует шаги</div>
          </NodeBox>

          {/* Инструменты: slide 48 px со скосом, шаг 8 кадров */}
          {TOOLS.map((t) => {
            const p = springAt(frame, fps, style, t.enter, "snappy");
            const op = interpolate(frame, [t.enter, t.enter + 8], [0, 1], CLAMP);
            const arrive = t.call + CALL_PASS;
            const f = flash(frame, fps, style, arrive);
            const lf = flash(frame, fps, style, t.loopCall + LOOP_PASS);
            const linger = frame >= arrive ? interpolate(frame, [arrive, arrive + 30], [0.55, 0.3], CLAMP) : 0.12;
            const glow = linger + 0.9 * f + 0.3 * lf;
            return (
              <NodeBox
                key={t.node.id}
                {...t.node}
                elevation={2}
                transform={`translateX(${48 * (1 - p)}px) skewX(${-8 * (1 - p)}deg) scale(${1 + 0.06 * f + 0.02 * lf})`}
                opacity={op}
                glow={glow}
                glowColor={teal}
                topEdge={alpha(teal, 0.35 + 0.5 * Math.min(1, glow))}
              >
                <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 34, color: TEXT, lineHeight: 1 }}>{t.node.label}</div>
                <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 20, color: mix(MUTED, teal, 0.45) }}>{t.caption}</div>
              </NodeBox>
            );
          })}

          {/* Импульсы: один источник тайминга с вспышками узлов */}
          <div style={{ position: "absolute", left: 0, top: 0, width: GRAPH_W, height: GRAPH_H }}>
            <PulseAlongPath segments={[SEG.request]} beat={{ start_frame: REQUEST.start, end_frame: REQUEST.end }} color={violet} tail={120} size={8} />
            {TOOLS.map((t) => (
              <PulseAlongPath key={`call-${t.seg}`} segments={[SEG[t.seg]]} beat={{ start_frame: t.call, end_frame: t.call + CALL_PASS }} color={teal} tail={110} size={7} />
            ))}
            {TOOLS.map((t) => (
              <PulseAlongPath key={`ret-${t.seg}`} segments={[SEG[t.seg]]} beat={{ start_frame: t.ret, end_frame: t.ret + RET_PASS }} color={amber} tail={110} size={7} reverse />
            ))}
            <PulseAlongPath segments={[SEG.request]} beat={{ start_frame: ANSWER.start, end_frame: ANSWER.end }} color={amber} tail={160} size={10} reverse />
          </div>

          {/* Живой цикл удержания: мелкие импульсы по всей петле */}
          <div style={{ position: "absolute", left: 0, top: 0, width: GRAPH_W, height: GRAPH_H, opacity: 0.6 }}>
            <PulseAlongPath segments={[SEG.request]} beat={{ start_frame: LOOP_REQ.start, end_frame: LOOP_REQ.end }} color={violet} tail={70} size={5} />
            {TOOLS.map((t) => (
              <PulseAlongPath key={`lcall-${t.seg}`} segments={[SEG[t.seg]]} beat={{ start_frame: t.loopCall, end_frame: t.loopCall + LOOP_PASS }} color={teal} tail={70} size={5} />
            ))}
            {TOOLS.map((t) => (
              <PulseAlongPath key={`lret-${t.seg}`} segments={[SEG[t.seg]]} beat={{ start_frame: t.loopRet, end_frame: t.loopRet + LOOP_PASS }} color={amber} tail={70} size={5} reverse />
            ))}
            <PulseAlongPath segments={[SEG.request]} beat={{ start_frame: LOOP_ANSWER.start, end_frame: LOOP_ANSWER.end }} color={amber} tail={70} size={5} reverse />
          </div>
        </div>

        <PhaseLabel frame={frame} />
      </div>
    </SafeArea>
  );
};

const Frame: React.FC<Required<SceneProps>> = (props) => {
  const frame = useCurrentFrame();
  return (
    <>
      <Background beat={{ start_frame: 0, end_frame: 30 }} variant="aurora" seed="agent-arch" />
      <GridOverlay frame={frame} />
      <AgentScene {...props} />
    </>
  );
};

export const Scene: React.FC<SceneProps> = ({ kicker = "Архитектура AI-агента", query = "Посчитай бюджет" }) => (
  <StyleProvider
    style={{
      ...presets["dark-premium"],
      motion: { ...presets["dark-premium"].motion, intensity: "balanced" as const },
    }}
  >
    <Frame kicker={kicker} query={query} />
  </StyleProvider>
);
