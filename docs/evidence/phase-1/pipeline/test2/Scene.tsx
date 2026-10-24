import React from "react";
import {
  Background,
  DataToken,
  FlowGraph,
  KineticText,
  Particles,
  PulseAlongPath,
  SafeArea,
  SceneTitle,
  StatusChip,
  StyleProvider,
  accent,
  pulseArrival,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";
import { useVideoConfig } from "remotion";
import { beatOf, resolveBeats } from "./beats";
import type { Beat, TimedBeat } from "./beats";

type Level = "h2" | "body" | "caption";
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";
type Tone = "neutral" | "accent" | "positive" | "negative" | "warning";
type Layout = { x: number; y: number; w: number; h: number };

type NodeContent = {
  id: string;
  label: string;
  caption: string;
  size: Level;
  enter: NodeEnter;
  enter_beat: string;
  elevation: 0 | 1 | 2 | 3;
  slot?: boolean;
  layout: Layout;
};
type EdgeContent = { id: string; from: string; to: string };
type FlowContent = {
  edge: string;
  direction: "forward" | "back";
  beat: string;
  repeat?: boolean;
  travel: number;
  count?: number;
};
type TokenContent = { id: string; edge: string; beat: string; label: string; stay: boolean };
type StateContent = { text: string; tone: Tone; accent?: number; beat: string; edge?: string };
type TextContent = { text: string; size: Level; beat: string; layout: Layout };

type Content = {
  locale: "ru" | "en";
  title_mode: "none" | "kicker" | "statement" | "integrated" | "strip";
  background: {
    variant: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";
    seed: string;
    focus: { x: number; y: number };
  };
  query: TextContent;
  summary: TextContent;
  graph_beat: string;
  nodes: NodeContent[];
  edges: EdgeContent[];
  flows: FlowContent[];
  pulse_accent: { forward: number; back: number };
  tokens: TokenContent[];
  token_accent: number;
  status: {
    anchor: { node: string; side: "top" | "bottom" | "left" | "right" | "center" };
    states: StateContent[];
  };
  emphasis: { node: string; beat: string };
};

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

type Beats = Record<string, Beat>;

const arrivalOf = (f: FlowContent, beats: Beats) =>
  pulseArrival(f.edge, beatOf(beats, f.beat), f.travel, {
    count: f.count ?? 1,
    repeat: f.repeat ?? true,
  });

// Узел, которого касается импульс потока: вперёд — `to`, обратно — `from`.
const targetOf = (f: FlowContent, edges: EdgeContent[]): string | undefined => {
  const e = edges.find((x) => x.id === f.edge);
  if (!e) return undefined;
  return f.direction === "back" ? e.from : e.to;
};

const GraphOverlay: React.FC<{ content: Content; beats: Beats }> = ({ content, beats }) => {
  const geo = useFlowGeometry();
  const s = useStyle();
  const { height } = useVideoConfig();
  const cap = typeSize(s, "caption", height);

  // Данные инструментов собираются стопкой над оркестратором (над статусом) и остаются
  // там как собранный контекст ответа. Стопка — смещение от конца пути (правый порт).
  // Токены инструментов — нейтральные записи; акцентом светится только ответ у пользователя.
  const hub = geo?.nodes.get(content.status.anchor.node);
  const stacked = content.tokens.filter((t) => !t.stay);
  const pitch = Math.round(cap * 2.25);
  const chipReserve = Math.round(cap * 2.6);
  const dockOf = (t: TokenContent): { dx: number; dy: number } | undefined => {
    const i = stacked.indexOf(t);
    if (!hub || i < 0) return undefined;
    const cx = hub.x + hub.w * 0.3;
    const cy = hub.y - chipReserve - pitch * (stacked.length - i - 0.5);
    return { dx: Math.round(cx - (hub.x + hub.w)), dy: Math.round(cy - (hub.y + hub.h / 2)) };
  };

  const states = content.status.states.map((s) => {
    const b = beatOf(beats, s.beat);
    const flow = s.edge ? content.flows.find((f) => f.edge === s.edge && f.beat === s.beat) : undefined;
    const at = flow && geo ? (geo.arrivals(arrivalOf(flow, beats))[0] ?? b.end_frame) : b.start_frame;
    return { text: s.text, tone: s.tone, at, ...(s.accent !== undefined ? { accentIndex: s.accent } : {}) };
  });
  return (
    <>
      <StatusChip anchor={content.status.anchor} states={states} />
      {content.tokens.map((t) => {
        // Токен летит вместе с импульсом своего потока: тот же бит, travel и направление.
        const flow = content.flows.find((f) => f.edge === t.edge && f.beat === t.beat);
        if (!flow) return null;
        const dock = t.stay ? undefined : dockOf(t);
        return (
          <DataToken
            key={t.id}
            edgeId={t.edge}
            beat={beatOf(beats, t.beat)}
            travel={flow.travel}
            reverse={flow.direction === "back"}
            stay={t.stay || dock !== undefined}
            {...(dock ? { dock } : {})}
            label={t.label}
            {...(t.stay ? { accentIndex: content.token_accent } : { tone: "neutral" as const })}
          />
        );
      })}
    </>
  );
};

const SceneBody: React.FC<Props> = ({ timing, content }) => {
  const s = useStyle();
  const rect = useSafeArea();
  const beats = resolveBeats(timing.beats, timing.duration_frames);
  const stagger = s.motion.stagger_frames;

  const nodes = content.nodes.map((n) => {
    const group = content.nodes.filter((m) => m.enter_beat === n.enter_beat);
    const idx = group.findIndex((m) => m.id === n.id);
    const flashes = content.flows
      .filter((f) => targetOf(f, content.edges) === n.id && n.id !== content.emphasis.node)
      .map((f) => arrivalOf(f, beats));
    const emph = content.emphasis.node === n.id ? beatOf(beats, content.emphasis.beat) : undefined;
    return {
      id: n.id,
      label: n.label,
      caption: n.caption,
      size: n.size,
      enter: n.enter,
      enterAt: beatOf(beats, n.enter_beat).start_frame + idx * stagger,
      elevation: n.elevation,
      ...(n.slot ? { slot: true } : {}),
      x: Math.round(n.layout.x * rect.w),
      y: Math.round(n.layout.y * rect.h),
      w: Math.round(n.layout.w * rect.w),
      h: Math.round(n.layout.h * rect.h),
      ...(flashes.length > 0 ? { flash: flashes } : {}),
      // Узел с ответом светится цветом токена ответа — один носитель акцента, а не два.
      ...(emph
        ? {
            accentIndex: content.token_accent,
            emphasis: { start_frame: emph.start_frame, end_frame: emph.end_frame, loop: true, ring: "every-breath" as const },
          }
        : {}),
    };
  });

  const box = (l: Layout): React.CSSProperties => ({
    position: "absolute",
    left: l.x * rect.w,
    top: l.y * rect.h,
    width: l.w * rect.w,
  });

  return (
    <SafeArea>
      <div style={box(content.query.layout)}>
        <KineticText
          text={content.query.text}
          beat={beatOf(beats, content.query.beat)}
          mode="letters"
          enter="type"
          size={content.query.size}
          font="body"
          color={s.palette.text}
          maxWidth={content.query.layout.w * rect.w}
        />
      </div>
      <div style={{ position: "absolute", left: 0, top: 0, width: rect.w, height: rect.h }}>
        <FlowGraph
          nodes={nodes}
          edges={content.edges}
          beat={beatOf(beats, content.graph_beat)}
          width={rect.w}
          height={rect.h}
          overlay={<GraphOverlay content={content} beats={beats} />}
        >
          {content.flows.map((f) => (
            <PulseAlongPath
              key={`${f.edge}-${f.beat}`}
              edgeId={f.edge}
              beat={beatOf(beats, f.beat)}
              travel={f.travel}
              count={f.count ?? 1}
              repeat={f.repeat ?? true}
              reverse={f.direction === "back"}
              color={accent(s, f.direction === "back" ? content.pulse_accent.back : content.pulse_accent.forward)}
              size={11}
              tail={170}
            />
          ))}
        </FlowGraph>
      </div>
      <div style={box(content.summary.layout)}>
        <SceneTitle
          mode={content.title_mode}
          text={content.summary.text}
          beat={beatOf(beats, content.summary.beat)}
          size={content.summary.size}
          maxWidth={content.summary.layout.w * rect.w}
        />
      </div>
    </SafeArea>
  );
};

export const Scene: React.FC<Props> = (props) => {
  const { timing, style, content } = props;
  const intro = beatOf(resolveBeats(timing.beats, timing.duration_frames), "b-user-in");
  return (
    <StyleProvider style={style}>
      {!style.transparent && (
        <Background
          beat={{ start_frame: intro.start_frame, end_frame: intro.end_frame }}
          variant={content.background.variant}
          seed={content.background.seed}
          focus={content.background.focus}
        />
      )}
      {/* Атмосфера чертежа: медленный дрейф пылинок за схемой — финал не застывает. */}
      <Particles
        count={56}
        seed={`${content.background.seed}-dust`}
        beat={{ start_frame: intro.start_frame, end_frame: intro.end_frame }}
        layer={0}
        accentShare={0.15}
      />
      <Particles
        count={24}
        seed={`${content.background.seed}-mid`}
        beat={{ start_frame: intro.start_frame, end_frame: intro.end_frame }}
        layer={1}
        accentShare={0.1}
      />
      <SceneBody {...props} />
    </StyleProvider>
  );
};
