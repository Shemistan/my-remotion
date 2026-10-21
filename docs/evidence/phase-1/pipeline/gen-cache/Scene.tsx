import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
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
  alpha,
  beatProgress,
  cardEnterStyle,
  cardSurface,
  easingOf,
  flowTiming,
  mix,
  pulseArrival,
  radius,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Style = ReturnType<typeof useStyle>;
type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };
type Layout = { x: number; y: number; w: number; h: number };
type NodeEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

type GraphNode = {
  id: string;
  label: string;
  caption?: string;
  enter: NodeEnter;
  enterAt: number;
  elevation: 0 | 1 | 2 | 3;
  accentIndex: number;
  flash_on: string[];
  layout: Layout;
};

type Pulse = {
  beat: string;
  edgeId: string;
  travel: number;
  repeat: boolean;
  reverse: boolean;
  color: string;
  size: number;
  tail: number;
};

type Content = {
  title: string;
  background: { variant: "aurora" | "grid" | "paper" | "solid"; seed: string; beat: string; particles: number };
  kicker: { text: string; beat: string; layout: Layout };
  graph: {
    beat: string;
    enter: NodeEnter;
    layout: Layout;
    nodes: GraphNode[];
    edges: { id: string; from: string; to: string }[];
    pulses: Pulse[];
    dim: { node: string; beat: string; opacity: number };
  };
  slot: { empty_text: string; filled_text: string; beat: string; fill_on: string; layout: Layout };
  steps: {
    beat: string;
    final_beat: string;
    layout: Layout;
    items: { label: string; beat: string; tone: "text" | "negative" }[];
  };
};

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: Content;
};

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const colorOf = (s: Style, key: string): string => {
  const m = /^accent\[(\d)\]$/.exec(key);
  if (m) return accent(s, Number(m[1]));
  if (key === "muted") return s.palette.muted;
  if (key === "negative") return s.palette.negative;
  if (key === "positive") return s.palette.positive;
  return s.palette.text;
};

const arrivalOf = (p: Pulse, beats: TimedBeat[]) =>
  pulseArrival(p.edgeId, beatOf(beats, p.beat), p.travel, { repeat: p.repeat });

// Ячейка внутри Кэша: «пусто» → «user:42 ✓» в кадр прихода обратного импульса
const CacheSlot: React.FC<{ rect: Layout; beat: Beat; fillFrame: number; emptyText: string; filledText: string }> = ({
  rect,
  beat,
  fillFrame,
  emptyText,
  filledText,
}) => {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const filled = beatProgress(
    frame,
    { start_frame: fillFrame, end_frame: fillFrame + s.motion.enter_frames },
    easingOf(s, "enter"),
  );
  const border = alpha(mix(s.palette.muted, s.palette.positive, filled), 0.35 + 0.65 * filled);
  const font = typeSize(s, "body", height);
  const center: React.CSSProperties = {
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
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        ...cardSurface(s, 1),
        border: `2px solid ${border}`,
        boxSizing: "border-box",
        ...cardEnterStyle(s, frame, fps, beat.start_frame, "scale"),
      }}
    >
      <div style={center}>
        <Enter kind="fade" beat={{ start_frame: beat.start_frame, end_frame: fillFrame }} exit>
          <span style={{ fontFamily: s.typography.body.family, fontWeight: s.typography.body.weight, fontSize: font, color: s.palette.muted }}>
            {emptyText}
          </span>
        </Enter>
      </div>
      <div style={center}>
        <Enter kind="pop" beat={{ start_frame: fillFrame, end_frame: fillFrame + s.motion.enter_frames }}>
          <span style={{ fontFamily: s.typography.mono.family, fontWeight: s.typography.mono.weight, fontSize: font, color: s.palette.text }}>
            {filledText}
          </span>
        </Enter>
      </div>
    </div>
  );
};

// Шаг ряда «Запрос · Промах · Запись · Попадание»: pending → active → done
const StepItem: React.FC<{
  label: string;
  index: number;
  total: number;
  enterBeat: Beat;
  activeFrom: number;
  activeTo: number | null;
  tone: "text" | "negative";
  emphasis: Beat | null;
  width: number;
}> = ({ label, index, total, enterBeat, activeFrom, activeTo, tone, emphasis, width }) => {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const on = beatProgress(frame, { start_frame: activeFrom, end_frame: activeFrom + s.motion.enter_frames }, easingOf(s, "enter"));
  const off =
    activeTo === null
      ? 0
      : beatProgress(frame, { start_frame: activeTo, end_frame: activeTo + s.motion.exit_frames }, easingOf(s, "exit"));
  const active = on * (1 - off);
  const color = mix(s.palette.muted, colorOf(s, tone), active);
  const font = typeSize(s, "body", height);
  const bar = Math.max(2, Math.round(height * 0.003));
  const word = (
    <span style={{ display: "inline-block", fontFamily: s.typography.body.family, fontWeight: 600, fontSize: font, color }}>
      {label}
    </span>
  );
  return (
    <div style={{ position: "relative", width, display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
      {index > 0 ? (
        <div
          style={{
            position: "absolute",
            left: -bar * 2,
            top: "50%",
            width: bar * 4,
            height: bar * 4,
            marginTop: -bar * 2,
            borderRadius: 999,
            background: alpha(s.palette.muted, 0.6),
          }}
        />
      ) : null}
      <Enter kind="slide" beat={enterBeat} index={index} total={total}>
        <div style={{ position: "relative", opacity: 0.5 + 0.5 * on, paddingBottom: bar * 4 }}>
          {emphasis ? (
            <Emphasis beat={emphasis} loop ring={false} shape="pill" accentIndex={0}>
              {word}
            </Emphasis>
          ) : (
            word
          )}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: bar,
              borderRadius: bar,
              background: s.palette.text,
              transform: `scaleX(${on})`,
              transformOrigin: "left center",
              opacity: 1 - off,
            }}
          />
        </div>
      </Enter>
    </div>
  );
};

const Body: React.FC<Props> = ({ timing, content }) => {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rect = useSafeArea();
  const beats = timing.beats;
  const at = (l: Layout): Layout => ({
    x: Math.round(l.x * rect.w),
    y: Math.round(l.y * rect.h),
    w: Math.round(l.w * rect.w),
    h: Math.round(l.h * rect.h),
  });

  const g = content.graph;
  const graphRect = at(g.layout);
  const graphBeat = beatOf(beats, g.beat);
  const pulseByBeat = (id: string) => g.pulses.find((p) => p.beat === id);

  const nodes = g.nodes.map((n) => {
    const r = at(n.layout);
    const flashes = n.flash_on
      .map((id) => pulseByBeat(id))
      .filter((p): p is Pulse => p !== undefined)
      .map((p) => arrivalOf(p, beats));
    return {
      id: n.id,
      label: n.label,
      x: r.x - graphRect.x,
      y: r.y - graphRect.y,
      w: r.w,
      h: r.h,
      elevation: n.elevation,
      accentIndex: n.accentIndex,
      enter: n.enter,
      enterAt: n.enterAt,
      ...(n.caption ? { caption: n.caption } : {}),
      ...(flashes.length > 0 ? { flash: flashes } : {}),
    };
  });

  // кадр прихода обратного импульса к Кэшу — момент записи в ячейку
  const writePulse = pulseByBeat(content.slot.fill_on);
  const writeBeat = beatOf(beats, content.slot.fill_on);
  const geometry = flowTiming(nodes, g.edges, graphBeat, s, fps);
  const fillFrame = writePulse ? geometry.arrivals(arrivalOf(writePulse, beats))[0] ?? writeBeat.end_frame : writeBeat.end_frame;

  // Источник гаснет, когда начинается попадание
  const dimNode = g.nodes.find((n) => n.id === g.dim.node);
  const dimRect = dimNode ? at(dimNode.layout) : null;
  const dimStart = beatOf(beats, g.dim.beat).start_frame;
  const dim = beatProgress(frame, { start_frame: dimStart, end_frame: dimStart + s.motion.exit_frames }, easingOf(s, "enter"));

  const k = content.kicker;
  const kRect = at(k.layout);
  const st = content.steps;
  const stRect = at(st.layout);
  const stBeat = beatOf(beats, st.beat);
  const finalBeat = beatOf(beats, st.final_beat);
  const colW = stRect.w / st.items.length;

  return (
    <>
      {s.transparent ? null : (
        <Background beat={beatOf(beats, content.background.beat)} variant={content.background.variant} seed={content.background.seed} />
      )}
      <Particles count={content.background.particles} seed={`${content.background.seed}-dust`} beat={beatOf(beats, content.background.beat)} layer={0} />
      <SafeArea>
        <div style={{ position: "absolute", left: kRect.x, top: kRect.y, width: kRect.w }}>
          <KineticText
            text={k.text}
            beat={beatOf(beats, k.beat)}
            mode="letters"
            enter="type"
            size="body"
            font="body"
            color={s.palette.muted}
          />
        </div>

        <div style={{ position: "absolute", left: graphRect.x, top: graphRect.y, width: graphRect.w, height: graphRect.h }}>
          <FlowGraph nodes={nodes} edges={g.edges} beat={graphBeat} width={graphRect.w} height={graphRect.h} enter={g.enter}>
            {g.pulses.map((p) => (
              <PulseAlongPath
                key={p.beat}
                edgeId={p.edgeId}
                beat={beatOf(beats, p.beat)}
                travel={p.travel}
                repeat={p.repeat}
                reverse={p.reverse}
                color={colorOf(s, p.color)}
                size={p.size}
                tail={p.tail}
              />
            ))}
          </FlowGraph>
        </div>

        {dimRect ? (
          <div
            style={{
              position: "absolute",
              left: dimRect.x,
              top: dimRect.y,
              width: dimRect.w,
              height: dimRect.h,
              borderRadius: radius(s, 2),
              background: s.palette.bg,
              opacity: (1 - g.dim.opacity) * dim,
            }}
          />
        ) : null}

        <CacheSlot
          rect={at(content.slot.layout)}
          beat={beatOf(beats, content.slot.beat)}
          fillFrame={fillFrame}
          emptyText={content.slot.empty_text}
          filledText={content.slot.filled_text}
        />

        <div style={{ position: "absolute", left: stRect.x, top: stRect.y, width: stRect.w, height: stRect.h, display: "flex" }}>
          {st.items.map((it, i) => {
            const next = st.items[i + 1];
            return (
              <StepItem
                key={it.label}
                label={it.label}
                index={i}
                total={st.items.length}
                enterBeat={stBeat}
                activeFrom={beatOf(beats, it.beat).start_frame}
                activeTo={next ? beatOf(beats, next.beat).start_frame : null}
                tone={it.tone}
                emphasis={next ? null : finalBeat}
                width={colW}
              />
            );
          })}
        </div>
      </SafeArea>
    </>
  );
};

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    <Body {...props} />
  </StyleProvider>
);
