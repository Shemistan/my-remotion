import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
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
  easingOf,
  flowTiming,
  formatNumber,
  pulseArrival,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type SceneStyle = React.ComponentProps<typeof StyleProvider>["style"];
type NodeEnter = NonNullable<React.ComponentProps<typeof Card>["enter"]>;
type Window = { start_frame: number; end_frame: number };
type Beat = Window & { id: string };
type Rect01 = { x: number; y: number; w: number; h: number };
type TextEl = { text: string; layout: Rect01 };
type NodeData = {
  id: string;
  label: string;
  caption?: string;
  elevation: 0 | 1 | 2 | 3;
  enter: NodeEnter;
  enterAt: number;
  accentIndex?: number;
  layout: Rect01;
};
type EdgeData = { id: string; from: string; to: string };
type GraphData = { layout: Rect01; nodes: NodeData[]; edges: EdgeData[] };

type Content = {
  lanes: { mono: TextEl; micro: TextEl };
  divider: { layout: Rect01; opacity: number; stroke_px: number };
  mono_graph: GraphData & {
    pulse: { edgeId: string; travel: number; size: number; tail: number };
  };
  micro_graph: GraphData & {
    flash_node: string;
    pulses: { edgeId: string; accentIndex: number }[];
    travel: number;
    size: number;
    tail: number;
    hold: { edges: string[]; travel: number; size: number; tail: number; opacity: number };
  };
  mono_count: { from: number; to: number; suffix: string; locale: "ru" | "en"; layout: Rect01 };
  micro_count: { from: number; to: number; locale: "ru" | "en"; spread: number; layout: Rect01 };
  micro_caption: TextEl;
  dim_opacity: number;
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const beatOf = (beats: Beat[], id: string): Window => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`Нет бита ${id} в props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

type Px = { x: number; y: number; w: number; h: number };
const toPx = (r: Rect01, w: number, h: number): Px => ({ x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h });

// Узлы в координатах области графа (layout spec — доли safe area).
const graphNodes = (g: GraphData, area: { w: number; h: number }) => {
  const box = toPx(g.layout, area.w, area.h);
  return g.nodes.map((n) => {
    const r = toPx(n.layout, area.w, area.h);
    return {
      id: n.id,
      label: n.label,
      caption: n.caption,
      elevation: n.elevation,
      enter: n.enter,
      enterAt: n.enterAt,
      accentIndex: n.accentIndex,
      x: r.x - box.x,
      y: r.y - box.y,
      w: r.w,
      h: r.h,
    };
  });
};

const Divider: React.FC<{ data: Content["divider"]; beat: Window }> = ({ data, beat }) => {
  const frame = useCurrentFrame();
  const style = useStyle();
  const area = useSafeArea();
  const r = toPx(data.layout, area.w, area.h);
  // прорисовка от центра — linear по прогрессу бита
  const p = interpolate(frame, [beat.start_frame, beat.end_frame], [0, 1], CLAMP);
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const half = (r.h / 2) * p;
  return (
    <svg style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} width={area.w} height={area.h}>
      <line
        x1={cx}
        x2={cx}
        y1={cy - half}
        y2={cy + half}
        stroke={style.palette.muted}
        strokeOpacity={data.opacity}
        strokeWidth={data.stroke_px}
        strokeLinecap="round"
      />
    </svg>
  );
};

// Счётчик монолита шагает 0 → 1 → 2 ровно в кадры прихода импульса, без удара акцентом.
const MonoCount: React.FC<{ data: Content["mono_count"]; enter: Window; arrivals: number[] }> = ({
  data,
  enter,
  arrivals,
}) => {
  const frame = useCurrentFrame();
  const style = useStyle();
  const { height } = useVideoConfig();
  const area = useSafeArea();
  const r = toPx(data.layout, area.w, area.h);
  const steps = arrivals.filter((f) => frame >= f).length;
  const value = Math.min(data.to, data.from + steps);
  return (
    <div style={{ position: "absolute", left: r.x, top: r.y, width: r.w }}>
      <Enter kind="rise" beat={enter}>
        <div
          style={{
            fontFamily: style.typography.display.family,
            fontWeight: style.typography.display.weight,
            fontSize: typeSize(style, "h2", height),
            letterSpacing: `${style.typography.tracking.display}em`,
            color: style.palette.muted,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            lineHeight: 1.1,
          }}
        >
          {formatNumber(value, { locale: data.locale })}
          {data.suffix}
        </div>
      </Enter>
    </div>
  );
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = useStyle();
  const area = useSafeArea();
  const { beats } = timing;

  const lanesIn = beatOf(beats, "lanes-in");
  const monoIn = beatOf(beats, "mono-graph-in");
  const microIn = beatOf(beats, "micro-graph-in");
  const countersIn = beatOf(beats, "counters-in");
  const pulsesRun = beatOf(beats, "pulses-run");
  const countRun = beatOf(beats, "micro-count-run");
  const finalEmphasis = beatOf(beats, "final-emphasis");
  const hold = beatOf(beats, "hold");

  const stagger = style.motion.stagger_frames;
  const enterFrames = style.motion.enter_frames;

  // Заголовки дорожек: «Монолит» rise, «Микросервисы» slide со сдвигом.
  const monoLaneBeat = { start_frame: lanesIn.start_frame, end_frame: lanesIn.start_frame + enterFrames };
  const microLaneBeat = { start_frame: lanesIn.start_frame + 2 * stagger, end_frame: lanesIn.end_frame };

  // Счётчики: слева rise, герой pop позже, подпись — из размытия ещё позже.
  const heroEnterAt = countersIn.start_frame + 2 * stagger;
  const captionBeat = { start_frame: countersIn.start_frame + 4 * stagger, end_frame: countersIn.end_frame };

  // Левая дорожка: один тяжёлый импульс, проход заканчивается до конца бита потоков.
  const mono = content.mono_graph;
  const monoBox = toPx(mono.layout, area.w, area.h);
  const monoNodes = graphNodes(mono, area);
  const monoPulseBeat = {
    start_frame: pulsesRun.start_frame,
    end_frame: pulsesRun.end_frame - mono.pulse.travel,
  };
  const monoArrivals = flowTiming(monoNodes, mono.edges, monoIn, style, fps).arrivals(
    pulseArrival(mono.pulse.edgeId, monoPulseBeat, mono.pulse.travel, { repeat: true }),
  );

  // Правая дорожка: короткие импульсы по четырём рёбрам, последние приходы — к финишу счёта.
  const micro = content.micro_graph;
  const microBox = toPx(micro.layout, area.w, area.h);
  const microPulseBeats = micro.pulses.map((p, i) => ({
    ...p,
    beat: {
      start_frame: pulsesRun.start_frame + (i + 1) * stagger,
      end_frame: countRun.end_frame - micro.travel,
    },
  }));
  const flashes = microPulseBeats.map((p) =>
    pulseArrival(p.edgeId, p.beat, micro.travel, { repeat: true }),
  );
  const microNodes = graphNodes(micro, area).map((n) =>
    n.id === micro.flash_node ? { ...n, flash: flashes } : n,
  );

  // Финальный акцент: проигравшая сторона уходит в полутень и замирает.
  const dim = interpolate(
    frame,
    [finalEmphasis.start_frame, finalEmphasis.start_frame + style.motion.exit_frames],
    [1, content.dim_opacity],
    { ...CLAMP, easing: easingOf(style, "exit") },
  );

  const lane = (t: TextEl) => toPx(t.layout, area.w, area.h);
  const monoLane = lane(content.lanes.mono);
  const microLane = lane(content.lanes.micro);
  const hero = toPx(content.micro_count.layout, area.w, area.h);
  const caption = lane(content.micro_caption);

  return (
    <>
      <Divider data={content.divider} beat={lanesIn} />

      <AbsoluteFill style={{ opacity: dim }}>
        <div style={{ position: "absolute", left: monoLane.x, top: monoLane.y, width: monoLane.w }}>
          <KineticText
            text={content.lanes.mono.text}
            beat={monoLaneBeat}
            mode="words"
            enter="rise"
            size="h2"
            color={style.palette.text}
            align="left"
            maxWidth={monoLane.w}
          />
        </div>
        <div style={{ position: "absolute", left: monoBox.x, top: monoBox.y }}>
          <FlowGraph nodes={monoNodes} edges={mono.edges} beat={monoIn} width={monoBox.w} height={monoBox.h}>
            <PulseAlongPath
              edgeId={mono.pulse.edgeId}
              beat={monoPulseBeat}
              travel={mono.pulse.travel}
              repeat
              size={mono.pulse.size}
              tail={mono.pulse.tail}
              color={style.palette.muted}
            />
          </FlowGraph>
        </div>
        <MonoCount data={content.mono_count} enter={countersIn} arrivals={monoArrivals} />
      </AbsoluteFill>

      <div style={{ position: "absolute", left: microLane.x, top: microLane.y, width: microLane.w }}>
        <KineticText
          text={content.lanes.micro.text}
          beat={microLaneBeat}
          mode="words"
          enter="slide"
          size="h2"
          color={style.palette.text}
          align="left"
          maxWidth={microLane.w}
        />
      </div>
      <div style={{ position: "absolute", left: microBox.x, top: microBox.y }}>
        <FlowGraph nodes={microNodes} edges={micro.edges} beat={microIn} width={microBox.w} height={microBox.h}>
          {microPulseBeats.map((p) => (
            <PulseAlongPath
              key={p.edgeId}
              edgeId={p.edgeId}
              beat={p.beat}
              travel={micro.travel}
              repeat
              size={micro.size}
              tail={micro.tail}
              color={accent(style, p.accentIndex)}
            />
          ))}
          {micro.hold.edges.map((edgeId) => (
            <PulseAlongPath
              key={`hold-${edgeId}`}
              edgeId={edgeId}
              beat={hold}
              travel={micro.hold.travel}
              repeat
              size={micro.hold.size}
              tail={micro.hold.tail}
              color={alpha(accent(style, micro.pulses.find((p) => p.edgeId === edgeId)?.accentIndex ?? 1), micro.hold.opacity)}
            />
          ))}
        </FlowGraph>
      </div>

      <div style={{ position: "absolute", left: hero.x, top: hero.y, width: hero.w }}>
        <Emphasis beat={finalEmphasis} loop accentIndex={0} shape="pill" spread={content.micro_count.spread}>
          <AnimatedNumber
            from={content.micro_count.from}
            to={content.micro_count.to}
            beat={countRun}
            enterAt={heroEnterAt}
            locale={content.micro_count.locale}
            size="display"
            color={style.palette.text}
            align="left"
          />
        </Emphasis>
      </div>
      <div style={{ position: "absolute", left: caption.x, top: caption.y, width: caption.w }}>
        <KineticText
          text={content.micro_caption.text}
          beat={captionBeat}
          mode="words"
          enter="fade"
          size="body"
          color={style.palette.muted}
          align="left"
          maxWidth={caption.w}
        />
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = (props) => {
  const lanesIn = beatOf(props.timing.beats, "lanes-in");
  const style: SceneStyle = props.style;
  const transparent =
    typeof style === "object" && style !== null && "transparent" in style && style.transparent === true;
  return (
    <StyleProvider style={props.style}>
      {transparent ? null : <Background beat={lanesIn} seed="split-lanes" />}
      <Particles count={40} seed="dust" beat={lanesIn} layer={0} />
      <SafeArea>
        <SceneBody {...props} />
      </SafeArea>
    </StyleProvider>
  );
};
