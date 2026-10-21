import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Emphasis,
  Enter,
  FlowGraph,
  KineticText,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  alpha,
  easingOf,
  enterStyle,
  flowTiming,
  mix,
  pulseArrival,
  springAt,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Win = { start_frame: number; end_frame: number };
type Box = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type Tone = "accent0" | "accent1" | "accent2" | "positive";

type NodeSpec = {
  id: string;
  label: string;
  enter: NodeEnter;
  elevation: 0 | 1 | 2 | 3;
  enterAt: number;
  accentIndex?: number;
  layout: Box;
};
type EdgeSpec = { id: string; from: string; to: string };
type FlowSpec = { edge: string; direction: "forward" | "back"; beat: string; tone: Tone };
type StatusSpec = { text: string; beat: string };

type Content = {
  kicker: { text: string; beat: string; layout: Box };
  graph: { beat: string; enter: NodeEnter; layout: Box };
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  flows: FlowSpec[];
  pulse: { travel: number; repeat: boolean; count: number };
  cache: {
    node: string;
    caption_before: string;
    caption_after: string;
    flash_edge: string;
    flash_beat: string;
  };
  dim: { edge: string; node: string; after_beat: string; opacity: number };
  request_label: { text: string; edge: string; beat: string };
  status: { layout: Box; miss: StatusSpec; write: StatusSpec; hit: StatusSpec };
  atmosphere: { beat: string; particles: number };
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
};

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const beatOf = (beats: Beat[], id: string): Win => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <SceneBody timing={timing} content={content} />
  </StyleProvider>
);

const SceneBody: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const s = useStyle();
  const atmo = beatOf(timing.beats, content.atmosphere.beat);
  return (
    <AbsoluteFill>
      {s.transparent ? null : <Background beat={atmo} seed="cache-scene" />}
      <Particles count={content.atmosphere.particles} seed="cache-dust" beat={atmo} layer={0} />
      <SafeArea>
        <Kicker timing={timing} content={content} />
        <CacheFlow timing={timing} content={content} />
        <Statuses timing={timing} content={content} />
      </SafeArea>
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const { kicker } = content;
  const l = kicker.layout;
  return (
    <div
      style={{
        position: "absolute",
        left: l.x * rect.w,
        top: l.y * rect.h,
        width: l.w * rect.w,
        height: l.h * rect.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <KineticText
        text={kicker.text}
        beat={beatOf(timing.beats, kicker.beat)}
        mode="letters"
        enter="type"
        size="body"
        font="body"
        color={s.palette.muted}
        align="center"
        maxWidth={l.w * rect.w}
      />
    </div>
  );
};

const toneColor = (s: ReturnType<typeof useStyle>, tone: Tone): string => {
  if (tone === "positive") return s.palette.positive;
  const i = tone === "accent1" ? 1 : tone === "accent2" ? 2 : 0;
  return s.palette.accent[i] ?? s.palette.accent[0]!;
};

const CacheFlow: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();
  const g = content.graph.layout;
  const graphBox: Box = { x: g.x * rect.w, y: g.y * rect.h, w: g.w * rect.w, h: g.h * rect.h };
  const graphBeat = beatOf(timing.beats, content.graph.beat);
  const { travel, repeat, count } = content.pulse;

  const cacheFlashBeat = beatOf(timing.beats, content.cache.flash_beat);
  const cacheArrival = pulseArrival(content.cache.flash_edge, cacheFlashBeat, travel, { count, repeat });

  // Узлы — фиксированные прямоугольники в px области графа (раскладка spec — доли safe area).
  const nodes = content.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    x: n.layout.x * rect.w - graphBox.x,
    y: n.layout.y * rect.h - graphBox.y,
    w: n.layout.w * rect.w,
    h: n.layout.h * rect.h,
    elevation: n.elevation,
    enter: n.enter,
    enterAt: n.enterAt,
    ...(n.accentIndex !== undefined ? { accentIndex: n.accentIndex } : {}),
    ...(n.id === content.cache.node ? { flash: cacheArrival } : {}),
  }));

  const flowT = flowTiming(nodes, content.edges, graphBeat, s, fps);
  const arrivalFrames = flowT.arrivals(cacheArrival);
  const writeAt = arrivalFrames[0] ?? cacheFlashBeat.end_frame;

  const cache = nodes.find((n) => n.id === content.cache.node)!;
  const cacheSpec = content.nodes.find((n) => n.id === content.cache.node)!;

  // Подпись «Запрос» — над серединой ребра e-req.
  const reqEdge = content.edges.find((e) => e.id === content.request_label.edge)!;
  const reqFrom = nodes.find((n) => n.id === reqEdge.from)!;
  const reqTo = nodes.find((n) => n.id === reqEdge.to)!;
  const bodyPx = typeSize(s, "body", height);
  const reqMidX = (reqFrom.x + reqFrom.w + reqTo.x) / 2;
  const reqMidY = (reqFrom.y + reqFrom.h / 2 + reqTo.y + reqTo.h / 2) / 2;
  const reqLabelW = reqTo.x - (reqFrom.x + reqFrom.w);

  // Длинный путь (e-miss и База) приглушается после второго запроса.
  const dimBeat = beatOf(timing.beats, content.dim.after_beat);
  const dimLevel = interpolate(
    frame,
    [dimBeat.end_frame, dimBeat.end_frame + s.motion.exit_frames],
    [1, content.dim.opacity],
    { ...CLAMP, easing: easingOf(s, "enter") },
  );
  const dimStart = cache.x + cache.w + bodyPx * 0.25;
  const dimEnd = dimStart + bodyPx;
  const mask =
    dimLevel < 1
      ? `linear-gradient(to right, #000 0px, #000 ${dimStart}px, rgba(0,0,0,${dimLevel}) ${dimEnd}px, rgba(0,0,0,${dimLevel}) 100%)`
      : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: graphBox.x,
        top: graphBox.y,
        width: graphBox.w,
        height: graphBox.h,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      <FlowGraph
        nodes={nodes}
        edges={content.edges}
        beat={graphBeat}
        width={graphBox.w}
        height={graphBox.h}
        enter={content.graph.enter}
      >
        {content.flows.map((f, i) => (
          <PulseAlongPath
            key={`${f.edge}-${f.beat}-${i}`}
            edgeId={f.edge}
            beat={beatOf(timing.beats, f.beat)}
            travel={travel}
            repeat={repeat}
            count={count}
            reverse={f.direction === "back"}
            color={toneColor(s, f.tone)}
            size={12}
            tail={170}
          />
        ))}
      </FlowGraph>

      <div
        style={{
          position: "absolute",
          left: reqMidX - reqLabelW / 2,
          top: reqMidY - bodyPx * 2.4,
          width: reqLabelW,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Enter kind="fade" beat={beatOf(timing.beats, content.request_label.beat)}>
          <div
            style={{
              fontFamily: s.typography.body.family,
              fontWeight: 600,
              fontSize: bodyPx,
              lineHeight: 1.2,
              color: s.palette.text,
              letterSpacing: `${s.typography.tracking.body}em`,
              whiteSpace: "nowrap",
            }}
          >
            {content.request_label.text}
          </div>
        </Enter>
      </div>

      <CacheCell
        box={cache}
        enterAt={cacheSpec.enterAt}
        graphEnd={graphBeat.end_frame}
        writeAt={writeAt}
        before={content.cache.caption_before}
        after={content.cache.caption_after}
      />
    </div>
  );
};

// Ячейка кэша: подпись и полоса внизу узла; в кадр прихода ответа — заливка и смена подписи.
const CacheCell: React.FC<{
  box: Box;
  enterAt: number;
  graphEnd: number;
  writeAt: number;
  before: string;
  after: string;
}> = ({ box, enterAt, graphEnd, writeAt, before, after }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useStyle();
  const cap = typeSize(s, "caption", height);
  const barH = Math.round(cap * 0.36);
  const inset = cap * 1.5;
  const fill = Math.max(0, springAt(frame, fps, s, writeAt, "soft"));
  const swap = interpolate(frame, [writeAt, writeAt + s.motion.exit_frames], [0, 1], {
    ...CLAMP,
    easing: easingOf(s, "enter"),
  });
  const shown = Math.min(enterAt + s.motion.enter_frames, graphEnd);
  const textStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: s.typography.body.family,
    fontWeight: 500,
    fontSize: cap,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
  const opts = { amplitude: s.amplitude, distancePx: cap };
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h }}>
      <Enter kind="fade" beat={{ start_frame: shown, end_frame: graphEnd }} style={{ position: "absolute", inset: 0 }}>
        <div
          style={{
            position: "absolute",
            left: inset,
            right: inset,
            bottom: cap + barH + cap * 0.5,
            height: cap * 1.3,
          }}
        >
          <div style={{ ...textStyle, color: s.palette.muted, ...enterStyle("blur", 1 - swap, opts) }}>{before}</div>
          <div style={{ ...textStyle, color: s.palette.text, ...enterStyle("blur", swap, opts) }}>{after}</div>
        </div>
        <div
          style={{
            position: "absolute",
            left: inset,
            right: inset,
            bottom: cap,
            height: barH,
            borderRadius: barH,
            border: `1px solid ${mix(alpha(s.palette.muted, 0.5), s.palette.accent[1]!, Math.min(1, fill))}`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: mix(s.palette.surface, s.palette.accent[1]!, 0.45),
              transform: `scaleX(${fill})`,
              transformOrigin: "left center",
            }}
          />
        </div>
      </Enter>
    </div>
  );
};

const Pill: React.FC<{ text: string; color: string; edge: string }> = ({ text, color, edge }) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  return (
    <div
      style={{
        padding: "0.22em 0.9em",
        borderRadius: 999,
        background: s.palette.surface,
        border: `2px solid ${edge}`,
        fontFamily: s.typography.display.family,
        fontWeight: s.typography.display.weight,
        fontSize: typeSize(s, "h2", height),
        lineHeight: 1.15,
        letterSpacing: `${s.typography.tracking.display}em`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
};

const Statuses: React.FC<{ timing: SceneProps["timing"]; content: Content }> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();
  const l = content.status.layout;
  const miss = beatOf(timing.beats, content.status.miss.beat);
  const write = beatOf(timing.beats, content.status.write.beat);
  const hit = beatOf(timing.beats, content.status.hit.beat);
  const exitEase = easingOf(s, "exit");
  const exitP = (b: Win) =>
    1 - interpolate(frame, [b.end_frame - s.motion.exit_frames, b.end_frame], [0, 1], { ...CLAMP, easing: exitEase });
  const dist = typeSize(s, "h2", height);
  const missOut = enterStyle("blur", exitP(miss), { amplitude: s.amplitude, distancePx: dist });
  const writeOut = enterStyle("rise", exitP(write), { amplitude: s.amplitude, distancePx: dist, direction: "up" });
  const slot: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <div
      style={{
        position: "absolute",
        left: l.x * rect.w,
        top: l.y * rect.h,
        width: l.w * rect.w,
        height: l.h * rect.h,
      }}
    >
      {frame < miss.end_frame ? (
        <div style={{ ...slot, ...missOut }}>
          <Enter kind="pop" beat={miss}>
            <Pill text={content.status.miss.text} color={s.palette.negative} edge={alpha(s.palette.negative, 0.7)} />
          </Enter>
        </div>
      ) : null}
      {frame < write.end_frame ? (
        <div style={{ ...slot, ...writeOut }}>
          <Enter kind="rise" beat={write}>
            <Pill text={content.status.write.text} color={s.palette.text} edge={alpha(s.palette.accent[2]!, 0.7)} />
          </Enter>
        </div>
      ) : null}
      <div style={slot}>
        <Enter kind="scale" beat={hit}>
          <Emphasis beat={hit} loop shape="pill" color={s.palette.positive}>
            <Pill text={content.status.hit.text} color={s.palette.positive} edge={alpha(s.palette.positive, 0.35)} />
          </Emphasis>
        </Enter>
      </div>
    </div>
  );
};
