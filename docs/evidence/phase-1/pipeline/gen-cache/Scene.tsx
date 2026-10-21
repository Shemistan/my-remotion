import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Camera,
  Emphasis,
  Enter,
  FlowGraph,
  Parallax,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  accentPulse,
  alpha,
  easingOf,
  enterStyle,
  mix,
  pulseArrival,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type CardEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type CameraKey = { frame: number; scale: number; x: number; y: number };

type StepItem = { n: string; label: string; active_beat: string };
type GraphNode = {
  id: string;
  label: string;
  enter: CardEnter;
  enter_offset: number;
  elevation: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  w: number;
  h: number;
};
type GraphEdge = { id: string; from: string; to: string };
type Flow = { edge: string; reverse: boolean; beat: string; accent: number; travel: number };

type Content = {
  title: string;
  stepper: { layout: Layout; separator: string; steps: StepItem[] };
  graph: {
    layout: Layout;
    width: number;
    height: number;
    nodes: GraphNode[];
    edges: GraphEdge[];
    flows: Flow[];
    dim_opacity: number;
    cache_caption_empty: string;
    cache_caption_filled: string;
  };
  conclusion: { layout: Layout; text: string; highlight: string };
  camera: CameraKey[];
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
  palette_overrides?: {
    bg?: string;
    surface?: string;
    text?: string;
    muted?: string;
    accent?: string[];
    positive?: string;
    negative?: string;
  };
};

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

type BeatWindow = { start_frame: number; end_frame: number };
type Beats = (id: string) => BeatWindow;
type Arrival = ReturnType<typeof pulseArrival>;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
// Запас вокруг графа: тени и свечение узлов не срезаются маской затемнения.
const GRAPH_PAD = 120;

const beatLookup = (beats: Beat[]): Beats => (id) => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} not found`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const firstArrival = (frames: number[], fallback: number) => frames[0] ?? fallback;

// ---------- Трекер этапов ----------

const StepChip: React.FC<{ step: StepItem; activeAt: number; last: boolean; separator: string; width: number }> = ({
  step,
  activeAt,
  last,
  separator,
  width,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const p = interpolate(frame, [activeAt, activeAt + s.motion.enter_frames], [0, 1], {
    ...CLAMP,
    easing: easingOf(s, "enter"),
  });
  const body = typeSize(s, "body", height);
  const caption = typeSize(s, "caption", height);
  const badge = Math.round(body * 1.3);
  const color = mix(s.palette.muted, s.palette.text, p);
  return (
    <div style={{ width, display: "flex", alignItems: "center", gap: Math.round(body * 0.3) }}>
      <div
        style={{
          width: badge,
          height: badge,
          borderRadius: badge,
          background: s.palette.surface,
          boxShadow: s.surfaces.elevation[0],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: s.typography.mono.family,
          fontWeight: 500,
          fontSize: caption,
          color,
          flexShrink: 0,
        }}
      >
        {step.n}
      </div>
      <div
        style={{
          fontFamily: s.typography.body.family,
          fontWeight: 600,
          fontSize: body,
          letterSpacing: `${s.typography.tracking.body}em`,
          color,
          whiteSpace: "nowrap",
        }}
      >
        {step.label}
      </div>
      {last ? null : (
        <div
          style={{
            marginLeft: "auto",
            marginRight: Math.round(body * 0.4),
            fontFamily: s.typography.body.family,
            fontSize: caption,
            color: s.palette.muted,
          }}
        >
          {separator}
        </div>
      )}
    </div>
  );
};

const Stepper: React.FC<{ content: Content["stepper"]; beat: Beats }> = ({ content, beat }) => {
  const rect = useSafeArea();
  const { layout, steps } = content;
  const width = layout.w * rect.w;
  const chipW = width / steps.length;
  return (
    <div
      style={{
        position: "absolute",
        left: layout.x * rect.w,
        top: layout.y * rect.h,
        width,
        height: layout.h * rect.h,
        display: "flex",
        alignItems: "center",
      }}
    >
      {steps.map((step, i) => (
        <Enter key={step.n} kind="slide" beat={beat("b-stepper-in")} index={i} total={steps.length}>
          <StepChip
            step={step}
            activeAt={beat(step.active_beat).start_frame}
            last={i === steps.length - 1}
            separator={content.separator}
            width={chipW}
          />
        </Enter>
      ))}
    </div>
  );
};

// ---------- Слой Кэша поверх графа: подпись состояния и акцент попадания ----------

const CacheOverlay: React.FC<{ node: GraphNode; graph: Content["graph"]; beat: Beats; flows: Flow[] }> = ({
  node,
  graph,
  beat,
  flows,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const geo = useFlowGeometry();
  const arrival = (beatId: string, fallback: number) => {
    const f = flows.find((x) => x.beat === beatId);
    if (!geo || !f) return fallback;
    return firstArrival(geo.arrivals(pulseArrival(f.edge, beat(beatId), f.travel, { repeat: false })), fallback);
  };
  const missAt = arrival("b-request", beat("b-miss-emphasis").start_frame);
  const writeAt = arrival("b-return", beat("b-write-emphasis").start_frame);
  const hitAt = arrival("b-hit-request", beat("b-hit-emphasis").start_frame);

  const body = typeSize(s, "body", height);
  const enterF = s.motion.enter_frames;

  // «пусто»: коротко краснеет в момент промаха и возвращается в muted
  const missPulse = accentPulse(frame, s, {
    beat: { start_frame: missAt, end_frame: beat("b-miss-emphasis").end_frame },
    loop: false,
  });
  const emptyColor = mix(s.palette.muted, s.palette.negative, Math.min(1, missPulse.level));
  const swap = interpolate(frame, [writeAt, writeAt + enterF], [0, 1], { ...CLAMP, easing: easingOf(s, "enter") });
  const emptyOut = interpolate(frame, [writeAt, writeAt + s.motion.exit_frames], [1, 0], {
    ...CLAMP,
    easing: easingOf(s, "exit"),
  });
  const filledStyle = enterStyle("blur", swap, { amplitude: s.amplitude, distancePx: 0 });

  // контур акцента попадания появляется в кадр прихода импульса
  const ringIn = interpolate(frame, [hitAt, hitAt + s.motion.stagger_frames], [0, 1], CLAMP);

  // подпись входит вслед за узлом Кэша
  const captionIn = {
    start_frame: beat("b-graph-in").start_frame + node.enter_offset + s.motion.stagger_frames,
    end_frame: beat("b-graph-in").end_frame,
  };
  const captionW = node.w + 200;
  const captionBox: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: captionW,
    textAlign: "center",
    fontFamily: s.typography.body.family,
    fontWeight: 500,
    fontSize: body,
    letterSpacing: `${s.typography.tracking.body}em`,
    whiteSpace: "nowrap",
  };

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: node.x + node.w / 2 - captionW / 2,
          top: node.y + node.h + Math.round(body * 0.45),
          width: captionW,
          height: body * 1.3,
        }}
      >
        {frame >= captionIn.start_frame ? (
          <Enter kind="fade" beat={captionIn}>
            <div style={{ position: "relative", width: captionW, height: body * 1.3 }}>
              <div style={{ ...captionBox, color: emptyColor, opacity: emptyOut }}>{graph.cache_caption_empty}</div>
              {frame >= writeAt ? (
                <div style={{ ...captionBox, color: s.palette.positive, ...filledStyle }}>{graph.cache_caption_filled}</div>
              ) : null}
            </div>
          </Enter>
        ) : null}
      </div>
      {frame >= hitAt ? (
        <div style={{ position: "absolute", left: node.x, top: node.y, width: node.w, height: node.h }}>
          <Emphasis
            beat={{ start_frame: hitAt, end_frame: beat("b-hit-emphasis").end_frame }}
            loop
            color={s.palette.positive}
            shape="rounded"
            halo={false}
            display="block"
          >
            <div
              style={{
                width: node.w,
                height: node.h,
                borderRadius: s.surfaces.radius[2],
                border: `3px solid ${alpha(s.palette.positive, 0.75 * ringIn)}`,
              }}
            />
          </Emphasis>
        </div>
      ) : null}
    </>
  );
};

// ---------- Схема ----------

const CacheGraph: React.FC<{ graph: Content["graph"]; beat: Beats }> = ({ graph, beat }) => {
  const frame = useCurrentFrame();
  const s = useStyle();
  const rect = useSafeArea();
  const graphBeat = beat("b-graph-in");
  // вспышки узлов — с теми же edgeId, beat, travel, repeat, что у импульсов
  const arrivalsOf = (ids: string[]): Arrival[] =>
    ids.flatMap((id) => {
      const f = graph.flows.find((x) => x.beat === id);
      return f ? [pulseArrival(f.edge, beat(id), f.travel, { repeat: false })] : [];
    });

  // Кромка Кэша: акцент, затем negative (промах), с возвратом данных — positive (accent[1])
  const cacheAccent = frame < beat("b-request").start_frame ? 0 : frame < beat("b-return").start_frame ? 2 : 1;

  const nodes = graph.nodes.map((n) => {
    const base = {
      id: n.id,
      label: n.label,
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      elevation: n.elevation,
      enter: n.enter,
      enterAt: graphBeat.start_frame + n.enter_offset,
    };
    if (n.id === "cache") {
      return { ...base, accentIndex: cacheAccent, flash: arrivalsOf(["b-request", "b-return"]) };
    }
    if (n.id === "db") {
      return { ...base, accentIndex: 0, flash: arrivalsOf(["b-fetch"]) };
    }
    return { ...base, flash: arrivalsOf([]) };
  });

  // Длинный путь гаснет: маска приглушает правую часть графа (ребро e-db и Базу данных)
  const dimBeat = beat("b-dim-long");
  const dim = interpolate(frame, [dimBeat.start_frame, dimBeat.end_frame], [1, graph.dim_opacity], {
    ...CLAMP,
    easing: easingOf(s, "exit"),
  });
  const cache = graph.nodes.find((n) => n.id === "cache");
  const db = graph.nodes.find((n) => n.id === "db");
  const fadeFrom = GRAPH_PAD + (cache ? cache.x + cache.w : 0) + 30;
  const fadeTo = GRAPH_PAD + (db ? db.x : graph.width) - 60;
  const mask =
    frame >= dimBeat.start_frame
      ? `linear-gradient(to right, #000 0px, #000 ${fadeFrom}px, rgba(0,0,0,${dim}) ${fadeTo}px)`
      : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: graph.layout.x * rect.w - GRAPH_PAD,
        top: graph.layout.y * rect.h - GRAPH_PAD,
        width: graph.width + GRAPH_PAD * 2,
        height: graph.height + GRAPH_PAD * 2,
        padding: GRAPH_PAD,
        boxSizing: "border-box",
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      <FlowGraph nodes={nodes} edges={graph.edges} beat={graphBeat} width={graph.width} height={graph.height}>
        {graph.flows.map((f) => (
          <PulseAlongPath
            key={`${f.edge}-${f.beat}`}
            edgeId={f.edge}
            beat={beat(f.beat)}
            travel={f.travel}
            repeat={false}
            reverse={f.reverse}
            color={accent(s, f.accent)}
            size={12}
            tail={180}
          />
        ))}
        {cache ? <CacheOverlay node={cache} graph={graph} beat={beat} flows={graph.flows} /> : null}
      </FlowGraph>
    </div>
  );
};

// ---------- Вывод ----------

const Conclusion: React.FC<{ content: Content["conclusion"]; beat: Beats }> = ({ content, beat }) => {
  const { height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();
  const { layout, text, highlight } = content;
  const at = text.lastIndexOf(highlight);
  const before = at >= 0 ? text.slice(0, at) : text;
  const after = at >= 0 ? text.slice(at + highlight.length) : "";
  return (
    <div
      style={{
        position: "absolute",
        left: layout.x * rect.w,
        top: layout.y * rect.h,
        width: layout.w * rect.w,
        height: layout.h * rect.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Enter kind="blur" beat={beat("b-conclusion-in")}>
        <div
          style={{
            fontFamily: s.typography.body.family,
            fontWeight: 600,
            fontSize: typeSize(s, "body", height),
            letterSpacing: `${s.typography.tracking.body}em`,
            color: s.palette.text,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {before}
          {at >= 0 ? <span style={{ color: s.palette.positive }}>{highlight}</span> : null}
          {after}
        </div>
      </Enter>
    </div>
  );
};

// ---------- Сцена ----------

const SceneBody: React.FC<SceneProps> = ({ timing, content }) => {
  const s = useStyle();
  const beat = beatLookup(timing.beats);
  return (
    <Camera keys={content.camera}>
      {s.transparent ? null : (
        <Parallax layer={0}>
          <Background variant="aurora" beat={{ start_frame: 0, end_frame: beat("b-graph-in").end_frame }} seed="cache" />
          <Particles
            count={40}
            seed="cache-dust"
            beat={{ start_frame: 0, end_frame: beat("b-graph-in").end_frame }}
            layer={0}
            accentShare={0.2}
          />
        </Parallax>
      )}
      <Parallax layer={1}>
        <SafeArea>
          <Stepper content={content.stepper} beat={beat} />
          <CacheGraph graph={content.graph} beat={beat} />
          <Conclusion content={content.conclusion} beat={beat} />
        </SafeArea>
      </Parallax>
    </Camera>
  );
};

export const Scene: React.FC<SceneProps> = (props) => (
  <StyleProvider style={props.style}>
    <SceneBody {...props} />
  </StyleProvider>
);
