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
  accent,
  beatProgress,
  easingOf,
  pulseArrival,
  radius,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Span = { start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type CardEnterKind = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type WordEnter = "type" | "pop" | "rise";

type StatusState = { text: string; color: string; enter: WordEnter; beat: string; at: "start" | "end" };
type GraphNode = {
  id: string;
  label: string;
  caption?: string;
  enter: CardEnterKind;
  enter_frac: number;
  elevation: 0 | 1 | 2 | 3;
  accentIndex?: number;
  layout: Layout;
};
type Flow = { edge: string; beat: string; reverse: boolean; accent: number };
type EdgeRef = { edge: string; beat: string };

type Content = {
  locale: "ru" | "en";
  title: { text: string; beat: string; layout: Layout };
  status: { layout: Layout; states: StatusState[] };
  graph: {
    beat: string;
    layout: Layout;
    enter: CardEnterKind;
    nodes: GraphNode[];
    edges: { id: string; from: string; to: string }[];
    travel: number;
    pulse: { count: number; repeat: boolean; tail: number; size: number };
    flows: Flow[];
    cache: {
      id: string;
      slot_empty: string;
      slot_filled: string;
      fill_beat: string;
      flash_on: EdgeRef[];
      final_emphasis: { beat: string; accentIndex: number };
    };
    dim: { node: string; edge_from: string; beat: string; opacity: number };
  };
  summary: { text: string; highlight: string[]; beat: string; layout: Layout };
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

type Style = ReturnType<typeof useStyle>;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const beatOf = (beats: Beat[], id: string): Span => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Нет бита «${id}» в props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

// Цвет из токена spec: "muted", "negative", "accent[2]" …
const colorOf = (style: Style, token: string): string => {
  const m = /^accent\[(\d+)\]$/.exec(token);
  if (m) return accent(style, Number(m[1]));
  const p = style.palette;
  if (token === "muted") return p.muted;
  if (token === "negative") return p.negative;
  if (token === "positive") return p.positive;
  return p.text;
};

// Слово состояния над кэшем: входит своим видом, уходит fade до входа следующего.
const StatusWord: React.FC<{ state: StatusState; from: number; to: number; last: boolean }> = ({
  state,
  from,
  to,
  last,
}) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const style = useStyle();
  if (frame < from || frame >= to) return null;

  // Окно короткое («Запрос» — 16 кадров): выход не длиннее трети окна.
  const exitLen = last ? 0 : Math.max(1, Math.min(style.motion.exit_frames, Math.floor((to - from) / 3)));
  const exitStart = to - exitLen;
  const opacity = last
    ? 1
    : interpolate(frame, [exitStart, to - 1], [1, 0], { ...CLAMP, easing: easingOf(style, "exit") });
  const color = colorOf(style, state.color);
  const enterBeat = { start_frame: from, end_frame: Math.max(from + 1, exitStart - 1) };
  const fontSize = typeSize(style, "h1", height);

  const word =
    state.enter === "type" ? (
      <KineticText text={state.text} beat={enterBeat} mode="letters" enter="type" size="h1" color={color} align="center" />
    ) : (
      <Enter kind={state.enter} beat={enterBeat}>
        <div
          style={{
            fontFamily: style.typography.display.family,
            fontWeight: style.typography.display.weight,
            letterSpacing: `${style.typography.tracking.display}em`,
            fontSize,
            lineHeight: 1.1,
            color,
            whiteSpace: "nowrap",
          }}
        >
          {state.text}
        </div>
      </Enter>
    );

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity }}>{word}</AbsoluteFill>
  );
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const style = useStyle();
  const rect = useSafeArea();
  const beats = timing.beats;
  const g = content.graph;

  const at = (l: Layout) => ({ left: l.x * rect.w, top: l.y * rect.h, width: l.w * rect.w, height: l.h * rect.h });

  // Область графа и узлы в её координатах
  const area = at(g.layout);
  const graphBeat = beatOf(beats, g.beat);
  const graphLen = graphBeat.end_frame - graphBeat.start_frame;
  const nodeRect = (n: GraphNode) => {
    const r = at(n.layout);
    return { x: r.left - area.left, y: r.top - area.top, w: r.width, h: r.height };
  };

  const travel = g.travel;
  const pulseOpts = { count: g.pulse.count, repeat: g.pulse.repeat };
  const filled = frame >= beatOf(beats, g.cache.fill_beat).end_frame;

  const nodes = g.nodes.map((n) => {
    const isCache = n.id === g.cache.id;
    return {
      id: n.id,
      label: n.label,
      ...nodeRect(n),
      elevation: n.elevation,
      enter: n.enter,
      enterAt: graphBeat.start_frame + Math.round(n.enter_frac * graphLen),
      caption: isCache ? (filled ? g.cache.slot_filled : g.cache.slot_empty) : n.caption,
      ...(n.accentIndex !== undefined ? { accentIndex: n.accentIndex } : {}),
      ...(isCache
        ? { flash: g.cache.flash_on.map((f) => pulseArrival(f.edge, beatOf(beats, f.beat), travel, pulseOpts)) }
        : {}),
    };
  });

  const cacheNode = g.nodes.find((n) => n.id === g.cache.id);
  const dimNode = g.nodes.find((n) => n.id === g.dim.node);
  const dimFrom = g.nodes.find((n) => n.id === g.dim.edge_from);
  const cacheR = cacheNode ? nodeRect(cacheNode) : null;
  const dimR = dimNode ? nodeRect(dimNode) : null;
  const fromR = dimFrom ? nodeRect(dimFrom) : null;

  // Второй запрос: путь к базе не нужен — база и ребро гаснут до заданной яркости
  const dimP = beatProgress(frame, beatOf(beats, g.dim.beat), easingOf(style, "enter"));
  const veil = dimP * (1 - g.dim.opacity);
  const cardRadius = radius(style, 2);
  const bandH = typeSize(style, "body", height);

  // Окна слов состояния: от своего кадра до кадра следующего
  const starts = content.status.states.map((s) => {
    const b = beatOf(beats, s.beat);
    return s.at === "end" ? b.end_frame : b.start_frame;
  });

  const title = at(content.title.layout);
  const status = at(content.status.layout);
  const summary = at(content.summary.layout);
  const fin = beatOf(beats, g.cache.final_emphasis.beat);

  return (
    <>
      <div style={{ position: "absolute", ...title, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Enter kind="mask" beat={beatOf(beats, content.title.beat)}>
          <div
            style={{
              fontFamily: style.typography.display.family,
              fontWeight: style.typography.display.weight,
              letterSpacing: `${style.typography.tracking.display}em`,
              fontSize: typeSize(style, "h2", height),
              lineHeight: 1.15,
              color: style.palette.text,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {content.title.text}
          </div>
        </Enter>
      </div>

      <div style={{ position: "absolute", ...status }}>
        {content.status.states.map((s, i) => (
          <StatusWord
            key={s.text}
            state={s}
            from={starts[i] ?? 0}
            to={starts[i + 1] ?? timing.duration_frames}
            last={i === content.status.states.length - 1}
          />
        ))}
      </div>

      <div style={{ position: "absolute", ...area }}>
        {/* Акцент итога — под графом: ореол выходит из-за карточки кэша, кольцо идёт по её контуру */}
        {cacheR ? (
          <div style={{ position: "absolute", left: cacheR.x, top: cacheR.y }}>
            <Emphasis beat={fin} loop shape="rounded" radius={cardRadius} accentIndex={g.cache.final_emphasis.accentIndex}>
              <div style={{ width: cacheR.w, height: cacheR.h }} />
            </Emphasis>
          </div>
        ) : null}

        <div style={{ position: "absolute", inset: 0 }}>
          <FlowGraph nodes={nodes} edges={g.edges} beat={graphBeat} width={area.width} height={area.height} enter={g.enter}>
            {g.flows.map((f) => (
              <PulseAlongPath
                key={`${f.edge}-${f.beat}`}
                edgeId={f.edge}
                beat={beatOf(beats, f.beat)}
                travel={travel}
                count={g.pulse.count}
                repeat={g.pulse.repeat}
                tail={g.pulse.tail}
                size={g.pulse.size}
                color={accent(style, f.accent)}
                reverse={f.reverse}
              />
            ))}
          </FlowGraph>
        </div>

        {dimR && fromR && veil > 0 ? (
          <>
            <div
              style={{
                position: "absolute",
                left: dimR.x,
                top: dimR.y,
                width: dimR.w,
                height: dimR.h,
                borderRadius: cardRadius,
                background: style.palette.bg,
                opacity: veil,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: fromR.x + fromR.w,
                top: dimR.y + dimR.h / 2 - bandH / 2,
                width: Math.max(0, dimR.x - (fromR.x + fromR.w)),
                height: bandH,
                background: `linear-gradient(to bottom, transparent, ${style.palette.bg} 30%, ${style.palette.bg} 70%, transparent)`,
                opacity: veil,
              }}
            />
          </>
        ) : null}
      </div>

      <div style={{ position: "absolute", ...summary, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <KineticText
          text={content.summary.text}
          beat={beatOf(beats, content.summary.beat)}
          mode="words"
          enter="fade"
          size="body"
          font="body"
          color={style.palette.muted}
          highlight={content.summary.highlight}
          align="center"
          maxWidth={summary.width}
        />
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ beat: Span }> = ({ beat }) => {
  const style = useStyle();
  if (style.transparent) return null;
  return (
    <>
      <Background beat={beat} variant="aurora" seed="cache" />
      <Particles count={40} seed="cache-dust" beat={beat} layer={0} />
    </>
  );
};

export const Scene: React.FC<Props> = (props) => {
  const bg = beatOf(props.timing.beats, props.content.title.beat);
  return (
    <StyleProvider style={props.style}>
      <Atmosphere beat={bg} />
      <SafeArea>
        <SceneBody {...props} />
      </SafeArea>
    </StyleProvider>
  );
};
