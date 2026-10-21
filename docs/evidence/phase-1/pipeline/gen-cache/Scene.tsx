import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Card,
  Emphasis,
  Enter,
  FlowGraph,
  KineticText,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  cardEnterStyle,
  easingOf,
  flowTiming,
  pathD,
  pulseArrival,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };
type Elevation = 0 | 1 | 2 | 3;
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type StatusKind = "rise" | "slide" | "fade" | "scale" | "mask" | "blur" | "pop";
type ColorKey = "text" | "muted" | "positive" | "negative";
// color — цвет вспышки на приходе: ключ палитры или индекс акцента (по умолчанию accentIndex узла).
type FlowRef = { edge: string; beat: string; color?: "negative" | "positive" | number };

type NodeContent = {
  id: string;
  label: string;
  caption?: string;
  enter: NodeEnter;
  elevation: Elevation;
  enterAt: number;
  accentIndex: number;
  flash_on: FlowRef[];
  layout: Layout;
};

type Flow = { edge: string; direction: "forward" | "back"; beat: string; travel: number };

type Content = {
  title: { text: string; beat: string; layout: Layout };
  graph: {
    beat: string;
    layout: Layout;
    edges: { id: string; from: string; to: string }[];
    repeat: boolean;
    pulse_size: number;
    pulse_tail: number;
    pulse_colors: { forward: number; back: number };
    flows: Flow[];
    edge_dim: { edge: string; beat: string; opacity: number };
  };
  nodes: NodeContent[];
  cache_slot: {
    empty_label: string;
    filled_label: string;
    fill_on: FlowRef;
    accentIndex: number;
    layout: Layout;
  };
  statuses: { id: string; text: string; kind: StatusKind; color: ColorKey; beat: string; layout: Layout }[];
  hero: { text: string; color: ColorKey; beat: string; emphasis_beat: string; accentIndex: number; layout: Layout };
  atmosphere: { beat: string; particles: number; seed: string };
};

// props.style сцены уходит в StyleProvider как есть; поля читаем из useStyle()
type SceneStyle = React.ComponentProps<typeof StyleProvider>["style"];

type FlowNodes = React.ComponentProps<typeof FlowGraph>["nodes"];
type ResolvedStyle = ReturnType<typeof useStyle>;

const flashColor = (style: ResolvedStyle, ref: FlowRef): string =>
  typeof ref.color === "string" ? style.palette[ref.color] : accent(style, ref.color ?? 0);

type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CACHE_ID = "node-cache";

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Beat ${id} not found in props.timing.beats`);
  return b;
};

const travelOf = (flows: Flow[], ref: FlowRef): number => {
  const f = flows.find((x) => x.edge === ref.edge && x.beat === ref.beat);
  if (!f) throw new Error(`Flow ${ref.edge}/${ref.beat} not found`);
  return f.travel;
};

// Приглушение длинного ребра на попадании — SVG-слой внутри FlowGraph (дети графа рисуются в его SVG).
const DimEdge: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const frame = useCurrentFrame();
  const style = useStyle();
  const geo = useFlowGeometry();
  const { graph } = content;
  const dimBeat = beatOf(beats, graph.edge_dim.beat);
  const dim = interpolate(
    frame,
    [dimBeat.start_frame, dimBeat.start_frame + style.motion.exit_frames],
    [0, 1 - graph.edge_dim.opacity],
    { ...CLAMP, easing: easingOf(style, "enter") },
  );
  const dimSeg = geo?.edges.get(graph.edge_dim.edge);
  if (!dimSeg || dim <= 0) return null;
  return (
    <path
      d={pathD([dimSeg])}
      fill="none"
      stroke={style.palette.bg}
      strokeWidth={12}
      strokeLinecap="round"
      opacity={dim}
    />
  );
};

// Внутренность узла «Кэш»: подпись, пояснение и ячейка (пусто → данные) и вспышки по приходу импульсов.
// HTML-слой поверх графа (вне FlowGraph), кадры прихода — из flowTiming с теми же узлами и битом.
const CacheLayer: React.FC<{ beats: Beat[]; content: Content; flowNodes: FlowNodes; W: number; H: number }> = ({
  beats,
  content,
  flowNodes,
  W,
  H,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const style = useStyle();
  const { graph, cache_slot: slot } = content;
  const cache = content.nodes.find((n) => n.id === CACHE_ID);
  if (!cache) throw new Error("node-cache missing");

  const g = graph.layout;
  const nx = (cache.layout.x - g.x) * W;
  const ny = (cache.layout.y - g.y) * H;
  const nw = cache.layout.w * W;
  const nh = cache.layout.h * H;
  const sx = (slot.layout.x - cache.layout.x) * W;
  const sy = (slot.layout.y - cache.layout.y) * H;
  const sw = slot.layout.w * W;
  const sh = slot.layout.h * H;

  const timing = flowTiming(flowNodes, graph.edges, beatOf(beats, graph.beat), style, fps);
  const arrivalsOf = (ref: FlowRef): number[] =>
    timing.arrivals(
      pulseArrival(ref.edge, beatOf(beats, ref.beat), travelOf(graph.flows, ref), { repeat: graph.repeat }),
    );

  // Вспышки узла: по одной на приход, цвет фазы (промах — negative, запись — accent[1], попадание — accent[0]).
  const flashes = cache.flash_on
    .map((ref) => ({ at: arrivalsOf(ref)[0] ?? beatOf(beats, ref.beat).end_frame, color: flashColor(style, ref) }))
    .sort((a, b) => a.at - b.at);
  const current = [...flashes].reverse().find((f) => f.at <= frame) ?? flashes[0];

  const fillAt = arrivalsOf(slot.fill_on)[0] ?? beatOf(beats, slot.fill_on.beat).end_frame;
  const emptyOpacity = interpolate(frame, [fillAt, fillAt + style.motion.exit_frames], [1, 0], {
    ...CLAMP,
    easing: easingOf(style, "exit"),
  });

  const enter = cardEnterStyle(style, frame, fps, cache.enterAt, cache.enter);
  const radius = style.surfaces.radius[1];
  const display = style.typography.display;
  const body = style.typography.body;

  const inner = (
    <div style={{ position: "relative", width: nw, height: nh }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: nw,
            height: sy,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontFamily: display.family,
              fontWeight: display.weight,
              fontSize: typeSize(style, "h2", height),
              color: style.palette.text,
              lineHeight: 1.1,
              letterSpacing: `${style.typography.tracking.display}em`,
            }}
          >
            {cache.label}
          </div>
          {cache.caption ? (
            <div
              style={{
                fontFamily: body.family,
                fontWeight: body.weight,
                fontSize: typeSize(style, "caption", height),
                color: style.palette.muted,
                lineHeight: 1.1,
              }}
            >
              {cache.caption}
            </div>
          ) : null}
        </div>
        <div style={{ position: "absolute", left: sx, top: sy, width: sw, height: sh }}>
          {emptyOpacity > 0 ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: radius,
                border: `2px dashed ${alpha(style.palette.muted, 0.7)}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: emptyOpacity,
                fontFamily: body.family,
                fontWeight: body.weight,
                fontSize: typeSize(style, "caption", height),
                color: style.palette.muted,
              }}
            >
              {slot.empty_label}
            </div>
          ) : null}
          {frame >= fillAt ? (
            <Card
              elevation={1}
              enter="pop"
              beat={{ start_frame: fillAt, end_frame: fillAt + style.motion.enter_frames }}
              accentIndex={slot.accentIndex}
              width={sw}
              height={sh}
              padding={0}
              style={{ position: "absolute", left: 0, top: 0 }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: body.family,
                  fontWeight: 600,
                  fontSize: typeSize(style, "body", height),
                  color: style.palette.text,
                }}
              >
                {slot.filled_label}
              </div>
            </Card>
          ) : null}
        </div>
    </div>
  );

  return (
    <div style={{ position: "absolute", left: nx, top: ny, width: nw, height: nh, transformOrigin: "50% 50%", ...enter }}>
      {current ? (
        <Emphasis
          key={current.at}
          beat={{ start_frame: current.at, end_frame: current.at }}
          loop={false}
          color={current.color}
          shape="rounded"
        >
          {inner}
        </Emphasis>
      ) : (
        inner
      )}
    </div>
  );
};

const SceneBody: React.FC<SceneProps> = ({ timing, content }) => {
  const style = useStyle();
  const safe = useSafeArea();
  const { height } = useVideoConfig();
  const { beats } = timing;
  const W = safe.w;
  const H = safe.h;
  const { graph } = content;
  const g = graph.layout;
  const graphRect = { x: g.x * W, y: g.y * H, w: g.w * W, h: g.h * H };

  const nodes: FlowNodes = content.nodes.map((n) => {
    const isCache = n.id === CACHE_ID;
    // Вспышки «Кэша» — цветные по фазам, их рисует CacheLayer; остальные узлы — штатный flash.
    const flash = isCache
      ? []
      : n.flash_on.map((ref) =>
          pulseArrival(ref.edge, beatOf(beats, ref.beat), travelOf(graph.flows, ref), { repeat: graph.repeat }),
        );
    return {
      id: n.id,
      // Подпись «Кэш» и ячейка рисуются слоем CacheLayer внутри карточки узла.
      label: isCache ? "" : n.label,
      ...(n.caption && !isCache ? { caption: n.caption } : {}),
      x: (n.layout.x - g.x) * W,
      y: (n.layout.y - g.y) * H,
      w: n.layout.w * W,
      h: n.layout.h * H,
      elevation: n.elevation,
      accentIndex: n.accentIndex,
      enter: n.enter,
      enterAt: n.enterAt,
      flash,
    };
  });

  const title = content.title;
  const titleBeat = beatOf(beats, title.beat);
  const hero = content.hero;
  const display = style.typography.display;

  return (
    <SafeArea>
      {/* Шторка оборачивает текст в потоке: у обёртки есть размер, клип открывается по биту */}
      <div
        style={{
          position: "absolute",
          left: title.layout.x * W,
          top: title.layout.y * H,
          width: title.layout.w * W,
          height: title.layout.h * H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Enter kind="mask" beat={titleBeat}>
          <div
            style={{
              textAlign: "center",
              whiteSpace: "nowrap",
              fontFamily: display.family,
              fontWeight: display.weight,
              fontSize: typeSize(style, "h2", height),
              letterSpacing: `${style.typography.tracking.display}em`,
              lineHeight: 1.2,
              color: style.palette.text,
            }}
          >
            {title.text}
          </div>
        </Enter>
      </div>

      <div
        style={{
          position: "absolute",
          left: graphRect.x,
          top: graphRect.y,
          width: graphRect.w,
          height: graphRect.h,
        }}
      >
        <FlowGraph nodes={nodes} edges={graph.edges} beat={beatOf(beats, graph.beat)} width={graphRect.w} height={graphRect.h}>
          <DimEdge beats={beats} content={content} />
          {graph.flows.map((f) => (
            <PulseAlongPath
              key={`${f.edge}-${f.beat}`}
              edgeId={f.edge}
              beat={beatOf(beats, f.beat)}
              travel={f.travel}
              repeat={graph.repeat}
              reverse={f.direction === "back"}
              color={accent(style, f.direction === "back" ? graph.pulse_colors.back : graph.pulse_colors.forward)}
              size={graph.pulse_size}
              tail={graph.pulse_tail}
            />
          ))}
        </FlowGraph>
        <CacheLayer beats={beats} content={content} flowNodes={nodes} W={W} H={H} />
      </div>

      {content.statuses.map((s) => (
        <div
          key={s.id}
          style={{
            position: "absolute",
            left: s.layout.x * W,
            top: s.layout.y * H,
            width: s.layout.w * W,
            height: s.layout.h * H,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Enter kind={s.kind} beat={beatOf(beats, s.beat)} exit>
            <div
              style={{
                fontFamily: display.family,
                fontWeight: display.weight,
                fontSize: typeSize(style, "h1", height),
                letterSpacing: `${style.typography.tracking.display}em`,
                color: style.palette[s.color],
                lineHeight: 1.1,
                textAlign: "center",
              }}
            >
              {s.text}
            </div>
          </Enter>
        </div>
      ))}

      <div
        style={{
          position: "absolute",
          left: hero.layout.x * W,
          top: hero.layout.y * H,
          width: hero.layout.w * W,
          height: hero.layout.h * H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Emphasis
          beat={beatOf(beats, hero.emphasis_beat)}
          loop
          accentIndex={hero.accentIndex}
          shape="pill"
          spread={36}
        >
          <KineticText
            text={hero.text}
            beat={beatOf(beats, hero.beat)}
            mode="words"
            enter="scale"
            size="display"
            color={style.palette[hero.color]}
            align="center"
          />
        </Emphasis>
      </div>
    </SafeArea>
  );
};

const Atmosphere: React.FC<{ beat: Beat; particles: number; seed: string }> = ({ beat, particles, seed }) => {
  const style = useStyle();
  return (
    <>
      {style.transparent ? null : <Background beat={beat} variant="aurora" seed="cache" />}
      <Particles count={particles} seed={seed} beat={beat} layer={0} />
    </>
  );
};

export const Scene: React.FC<SceneProps> = (props) => {
  const { content, timing } = props;
  const atmoBeat = beatOf(timing.beats, content.atmosphere.beat);
  return (
    <StyleProvider style={props.style}>
      <Atmosphere beat={atmoBeat} particles={content.atmosphere.particles} seed={content.atmosphere.seed} />
      <SceneBody {...props} />
    </StyleProvider>
  );
};
