import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
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
  flowTiming,
  pulseArrival,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Frac = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type TypeLevel = "display" | "h1" | "h2" | "body" | "caption";
type PluralForms = [string, string, string];

type LaneNode = {
  id: string;
  label: string;
  caption?: string;
  enter: NodeEnter;
  elevation: 0 | 1 | 2 | 3;
  accentIndex?: number;
  layout: Frac;
};
type LaneEdge = { id: string; from: string; to: string };

type Content = {
  locale: "ru" | "en";
  title: { text: string; layout: Frac };
  mono_label: { text: string; layout: Frac };
  micro_label: { text: string; layout: Frac };
  mono_lane: {
    layout: Frac;
    nodes: LaneNode[];
    edges: LaneEdge[];
    flash_node: string;
    flash_edge: string;
    pulse: { travel: number; size: number; tail: number; accent_index: number };
    dim_opacity: number;
  };
  micro_lane: {
    layout: Frac;
    nodes: LaneNode[];
    edges: LaneEdge[];
    pulse: { travel: number; size: number; tail: number; accent_indices: number[]; offsets_frames: number[] };
  };
  mono_count: { from: number; to: number; size: TypeLevel; suffix_forms: PluralForms; layout: Frac };
  micro_count: {
    from: number;
    to: number;
    size: TypeLevel;
    suffix_forms: PluralForms;
    enter_delay_frames: number;
    emphasis: { accentIndex: number; spread: number };
    layout: Frac;
  };
  atmosphere: { particles: number; seed: string };
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
  font?: string;
};

export type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} missing in props.timing.beats`);
  return b;
};

// Доли safe area -> px внутри SafeArea.
const place = (f: Frac, rect: { w: number; h: number }) => ({
  left: f.x * rect.w,
  top: f.y * rect.h,
  width: f.w * rect.w,
  height: f.h * rect.h,
});

const Body: React.FC<SceneProps> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();

  const b = (id: string) => beatOf(timing.beats, id);
  const bTitle = b("b-title");
  const bMonoLabel = b("b-mono-label");
  const bMicroLabel = b("b-micro-label");
  const bMonoGraph = b("b-mono-graph");
  const bMicroGraph = b("b-micro-graph");
  const bCounters = b("b-counters-in");
  const bMicro = b("b-micro-releases");
  const bMono = b("b-mono-release");
  const bFlash = b("b-mono-flash");
  const bFinal = b("b-final-emphasis");

  // ---- Дорожка монолита: один импульс проходит оба ребра подряд.
  const mono = content.mono_lane;
  const monoBox = place(mono.layout, rect);
  const monoMid = Math.round((bMono.start_frame + bMono.end_frame) / 2);
  const monoEdgeBeats: Record<string, { start_frame: number; end_frame: number }> = {
    [mono.edges[0]!.id]: { start_frame: bMono.start_frame, end_frame: monoMid },
    [mono.edges[1]!.id]: { start_frame: monoMid, end_frame: bMono.end_frame },
  };
  const flashBeat = monoEdgeBeats[mono.flash_edge]!;
  const monoFlash = pulseArrival(mono.flash_edge, flashBeat, mono.pulse.travel, { repeat: false });
  const monoNodes = mono.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    caption: n.caption,
    elevation: n.elevation,
    accentIndex: n.accentIndex,
    enter: n.enter,
    x: (n.layout.x - mono.layout.x) * rect.w,
    y: (n.layout.y - mono.layout.y) * rect.h,
    w: n.layout.w * rect.w,
    h: n.layout.h * rect.h,
    ...(n.id === mono.flash_node ? { flash: monoFlash } : {}),
  }));
  const monoTiming = flowTiming(monoNodes, mono.edges, bMonoGraph, s, fps);
  const monoArrival = monoTiming.arrivals(monoFlash)[0] ?? bFlash.start_frame;
  const monoValue = frame >= monoArrival ? content.mono_count.to : content.mono_count.from;

  // После передачи акцента герою дорожка монолита и её счётчик приглушаются.
  const dim = interpolate(
    frame,
    [bFinal.start_frame, bFinal.start_frame + s.motion.exit_frames],
    [1, mono.dim_opacity],
    { ...CLAMP, easing: easingOf(s, "exit") },
  );

  // ---- Дорожка микросервисов: частые импульсы вразнобой к «Проду».
  const micro = content.micro_lane;
  const microBox = place(micro.layout, rect);
  const microNodes = micro.nodes.map((n, i) => ({
    id: n.id,
    label: n.label,
    elevation: n.elevation,
    enter: n.enter,
    // сервисы — каскадом сверху вниз, «Прод» — последним
    enterAt: bMicroGraph.start_frame + i * s.motion.stagger_frames,
    x: (n.layout.x - micro.layout.x) * rect.w,
    y: (n.layout.y - micro.layout.y) * rect.h,
    w: n.layout.w * rect.w,
    h: n.layout.h * rect.h,
  }));
  const microEdgeBeats = micro.edges.map((e, i) => ({
    edge: e,
    beat: { start_frame: bMicro.start_frame + (micro.pulse.offsets_frames[i] ?? 0), end_frame: bMicro.end_frame },
    color: accent(s, micro.pulse.accent_indices[i] ?? 0),
  }));
  const microTiming = flowTiming(microNodes, micro.edges, bMicroGraph, s, fps);
  // Герой считает приходы импульсов к «Проду» внутри бита.
  const arrivals = microEdgeBeats
    .flatMap((m) => microTiming.arrivals(pulseArrival(m.edge.id, m.beat, micro.pulse.travel, { repeat: true })))
    .filter((f) => f <= bMicro.end_frame);
  const arrived = arrivals.filter((f) => frame >= f).length;
  const hero = content.micro_count;
  const heroValue =
    arrivals.length > 0
      ? Math.min(hero.to, Math.round((hero.to * arrived) / arrivals.length))
      : Math.round(hero.to * beatProgress(frame, bMicro));

  const titleBox = place(content.title.layout, rect);
  const monoLabelBox = place(content.mono_label.layout, rect);
  const microLabelBox = place(content.micro_label.layout, rect);
  const monoCountBox = place(content.mono_count.layout, rect);
  const heroBox = place(hero.layout, rect);
  const display = s.typography.display;

  return (
    <SafeArea>
      <div style={{ position: "absolute", ...titleBox }}>
        <Enter kind="mask" beat={bTitle}>
          <div
            style={{
              fontFamily: display.family,
              fontWeight: display.weight,
              fontSize: typeSize(s, "h2", height),
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.text,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            {content.title.text}
          </div>
        </Enter>
      </div>

      <div style={{ position: "absolute", ...monoLabelBox, display: "flex", alignItems: "center" }}>
        <KineticText
          text={content.mono_label.text}
          beat={bMonoLabel}
          mode="letters"
          enter="type"
          size="body"
          color={s.palette.muted}
        />
      </div>

      <div style={{ position: "absolute", ...microLabelBox, display: "flex", alignItems: "center" }}>
        <KineticText
          text={content.micro_label.text}
          beat={bMicroLabel}
          mode="words"
          enter="slide"
          size="body"
          color={s.palette.text}
        />
      </div>

      <div style={{ position: "absolute", ...monoBox, opacity: dim }}>
        <FlowGraph nodes={monoNodes} edges={mono.edges} beat={bMonoGraph} width={monoBox.width} height={monoBox.height} enter="flip">
          {mono.edges.map((e) => (
            <PulseAlongPath
              key={e.id}
              edgeId={e.id}
              beat={monoEdgeBeats[e.id]!}
              travel={mono.pulse.travel}
              size={mono.pulse.size}
              tail={mono.pulse.tail}
              color={accent(s, mono.pulse.accent_index)}
              repeat={false}
            />
          ))}
        </FlowGraph>
      </div>

      <div style={{ position: "absolute", ...microBox }}>
        <FlowGraph nodes={microNodes} edges={micro.edges} beat={bMicroGraph} width={microBox.width} height={microBox.height}>
          {microEdgeBeats.map((m) => (
            <PulseAlongPath
              key={m.edge.id}
              edgeId={m.edge.id}
              beat={m.beat}
              travel={micro.pulse.travel}
              size={micro.pulse.size}
              tail={micro.pulse.tail}
              color={m.color}
              repeat
            />
          ))}
        </FlowGraph>
      </div>

      <div style={{ position: "absolute", ...monoCountBox, display: "flex", alignItems: "center", opacity: dim }}>
        <AnimatedNumber
          from={content.mono_count.from}
          to={content.mono_count.to}
          value={monoValue}
          beat={{ start_frame: monoArrival, end_frame: monoArrival }}
          enterAt={bCounters.start_frame}
          locale={content.locale}
          suffix={content.mono_count.suffix_forms}
          size={content.mono_count.size}
          color={s.palette.muted}
          align="left"
        />
      </div>

      <div style={{ position: "absolute", ...heroBox, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Emphasis beat={bFinal} loop shape="pill" accentIndex={hero.emphasis.accentIndex} spread={hero.emphasis.spread}>
          <AnimatedNumber
            from={hero.from}
            to={hero.to}
            value={heroValue}
            beat={bMicro}
            enterAt={bCounters.start_frame + hero.enter_delay_frames}
            locale={content.locale}
            suffix={hero.suffix_forms}
            size={hero.size}
            color={s.palette.text}
            reserveWidth
            align="center"
          />
        </Emphasis>
      </div>
    </SafeArea>
  );
};

const Atmosphere: React.FC<{ beat: Beat; content: Content }> = ({ beat, content }) => {
  const s = useStyle();
  if (s.transparent) return null;
  return (
    <>
      <Background beat={beat} />
      <Particles count={content.atmosphere.particles} seed={content.atmosphere.seed} beat={beat} layer={0} />
    </>
  );
};

export const Scene: React.FC<SceneProps> = (props) => (
  <StyleProvider style={props.style}>
    <Atmosphere beat={beatOf(props.timing.beats, "b-title")} content={props.content} />
    <Body {...props} />
  </StyleProvider>
);
