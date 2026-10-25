import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  DataToken,
  FlowGraph,
  PulseAlongPath,
  SafeArea,
  SceneTitle,
  StatusChip,
  StyleProvider,
  dataColor,
  easingOf,
  edgeSegment,
  flowSlot,
  mix,
  pulseArrival,
  springAt,
  staggerBeat,
  typeSize,
  useFlowGeometry,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type TimingBeat = { id: string; start_frame: number; end_frame: number };
type Win = { start_frame: number; end_frame: number };
type Frac = { x: number; y: number; w: number; h: number };

type Flow = {
  edge: string;
  direction: "forward" | "back";
  beat: string;
  count: number;
  repeat: boolean;
  travel: number;
};

type NodeSpec = {
  id: string;
  label: string;
  caption?: string;
  size: "h2" | "body" | "caption";
  elevation: 0 | 1 | 2 | 3;
  enter: "slide" | "pop" | "blur" | "rise" | "flip" | "scale" | "swing" | "fade";
  enter_offset: number;
  slot?: boolean;
  slot_capacity?: number;
  accentIndex?: number;
  flash_on?: string;
  emphasis?: { beat: string; loop: boolean; ring: "strike" | "every-breath" };
  // Выравнивание слота узла по строке очереди: "tail" — куда ложится новый, "head" — откуда уходит.
  align_to?: "tail" | "head";
  layout: { x: number; w: number; h: number };
};

type TokenSpec = {
  id: string;
  label: string;
  accentIndex: number;
  appear: { beat: string; index?: number; total?: number; edge?: string };
  flights: { edge: string; beat: string; travel: number; stay: boolean }[];
};

type StatusAt = { beat: string; edge?: string };

type StatusSpec = {
  id: string;
  anchor: { node: string; side: "top" | "bottom" | "left" | "right" | "center" };
  states: { text: string; tone: "neutral" | "accent" | "positive" | "negative" | "warning"; at: StatusAt }[];
};

type Content = {
  background: { variant: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid"; seed: string; focus: { x: number; y: number } };
  graph: { beat: string; layout: Frac; edges: { id: string; from: string; to: string }[]; flows: Flow[]; nodes: NodeSpec[] };
  queue_node: string;
  queue_empty_label: string;
  tokens: TokenSpec[];
  statuses: StatusSpec[];
  statement: { text: string; beat: string; size: "h2" | "body"; align: "center" | "left"; layout: Frac };
};

export type SceneProps = {
  timing: { duration_frames: number; beats: TimingBeat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

const beatOf = (beats: TimingBeat[]) => (id: string): Win => {
  const b = beats.find((x) => x.id === id);
  return { start_frame: b?.start_frame ?? 0, end_frame: b?.end_frame ?? 0 };
};

type SlotRect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

// Коридоры полёта токенов: центр слота отправителя / строки очереди / слота склада.
// Узлы выставлены так, что коридор лежит в полосе слотов, ниже подписей карточек.
type Lanes = { slotCenter: Map<string, Pt>; rowCenter: (row: number) => Pt };

const departLift = (depart: number, travel: number) => depart + Math.round(travel * 0.75);

// Стопка ждущих заказов в очереди (FIFO): строки в слоте узла, уход — сдвиг вверх,
// когда улетевший токен уже освободил верхнюю строку.
const QueueStack: React.FC<{ content: Content; beats: TimingBeat[]; slot: SlotRect; capacity: number; step: number }> = ({
  content,
  beats,
  slot,
  capacity,
  step,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useStyle();
  const geo = useFlowGeometry();
  const b = beatOf(beats);
  const caption = typeSize(s, "caption", height);
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const enterEase = easingOf(s, "enter");
  const fromOf = (edgeId: string) => content.graph.edges.find((e) => e.id === edgeId)?.from;

  const arrivalAt = (edge: string, beatId: string): number => {
    const flow = content.graph.flows.find((f) => f.edge === edge && f.beat === beatId);
    const win = b(beatId);
    const a = geo?.arrivals(pulseArrival(edge, win, flow?.travel, { count: flow?.count ?? 1, repeat: flow?.repeat ?? false }));
    return a?.[0] ?? win.end_frame;
  };

  const timeline = content.tokens.map((t) => {
    const byEdge = t.appear.edge !== undefined;
    const appear = byEdge
      ? arrivalAt(t.appear.edge ?? "", t.appear.beat)
      : staggerBeat(b(t.appear.beat), t.appear.index ?? 0, t.appear.total ?? 1, s.motion.stagger_frames).start_frame;
    const out = t.flights.find((f) => fromOf(f.edge) === content.queue_node);
    const depart = out ? b(out.beat).start_frame : Number.POSITIVE_INFINITY;
    const lift = out ? departLift(depart, out.travel) : Number.POSITIVE_INFINITY;
    return { t, byEdge, appear, depart, lift };
  });

  // Очередь опустела: последний токен долетел до склада.
  const lastLift = Math.max(...timeline.map((x) => (Number.isFinite(x.lift) ? x.lift : 0)));
  const emptyOut = timeline.every((x) => Number.isFinite(x.depart))
    ? interpolate(frame, [lastLift, lastLift + s.motion.enter_frames], [0, 1], { ...clamp, easing: enterEase })
    : 0;
  const railsIn = interpolate(
    frame,
    [b(content.graph.beat).start_frame + s.motion.enter_frames, b(content.graph.beat).start_frame + s.motion.enter_frames * 2],
    [0, 1],
    { ...clamp, easing: enterEase },
  );
  const stackTop = slot.y - (capacity - 1) * step;

  return (
    <>
      {Array.from({ length: capacity }, (_, r) => (
        <div
          key={`rail-${r}`}
          style={{
            position: "absolute",
            left: slot.x,
            top: stackTop + r * step,
            width: slot.w,
            height: slot.h,
            boxSizing: "border-box",
            borderRadius: s.surfaces.radius[0],
            border: `1px dashed ${mix(s.palette.surface, s.palette.muted, 0.45)}`,
            opacity: railsIn,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          left: slot.x,
          top: stackTop,
          width: slot.w,
          height: slot.h + (capacity - 1) * step,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: s.typography.body.family,
          fontWeight: s.typography.body.weight,
          fontSize: caption,
          letterSpacing: `${s.typography.tracking.caps}em`,
          textTransform: "uppercase",
          color: s.palette.muted,
          opacity: emptyOut,
          transform: `translateY(${(1 - emptyOut) * caption * 0.5}px)`,
        }}
      >
        {content.queue_empty_label}
      </div>
      {timeline.map(({ t, byEdge, appear, depart }, i) => {
        // Строка исчезает ровно в кадр вылета: дальше её несёт DataToken, без дубликата.
        if (frame < appear || frame >= depart) return null;
        let lift = 0;
        for (let j = 0; j < i; j++) {
          const start = timeline[j]?.lift ?? Number.POSITIVE_INFINITY;
          if (frame >= start) lift += step * springAt(frame, fps, s, start, "snappy");
        }
        const rowIndex = Math.min(i, capacity - 1);
        const top = stackTop + rowIndex * step - lift;
        const p = byEdge
          ? 1
          : interpolate(frame, [appear, appear + s.motion.enter_frames], [0, 1], { ...clamp, easing: enterEase });
        const rise = (1 - p) * slot.h * 0.6 * s.amplitude;
        const opacity = interpolate(p, [0, 0.6], [0, 1], clamp);
        const color = dataColor(s, undefined, t.accentIndex);
        return (
          <div
            key={t.id}
            style={{
              position: "absolute",
              left: slot.x,
              top,
              width: slot.w,
              height: slot.h,
              display: "flex",
              justifyContent: "center",
              opacity,
              transform: `translateY(${rise}px)`,
            }}
          >
            <div
              style={{
                height: "100%",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                paddingLeft: caption * 0.5,
                paddingRight: caption * 0.5,
                background: mix(s.palette.surface, s.palette.text, 0.06),
                borderRadius: s.surfaces.radius[0],
                boxShadow: s.surfaces.elevation[1],
                borderLeft: `${Math.round(caption * 0.2)}px solid ${color}`,
                fontFamily: s.typography.mono.family,
                fontWeight: s.typography.mono.weight,
                fontSize: caption,
                color: s.palette.text,
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </div>
          </div>
        );
      })}
    </>
  );
};

type ChipState = { text: string; tone: StatusSpec["states"][number]["tone"]; at: number };

// Смена статуса с другим тоном («В работе» → «Зарезервировано»): прошлая плашка гаснет
// к кадру смены, новая входит в пустое место — без наложения букв.
const StatusGroups: React.FC<{ st: StatusSpec; states: ChipState[] }> = ({ st, states }) => {
  const frame = useCurrentFrame();
  const s = useStyle();
  const groups: ChipState[][] = [];
  states.forEach((x, i) => {
    const prev = states[i - 1];
    const last = groups[groups.length - 1];
    if (!prev || !last || prev.tone !== x.tone) groups.push([x]);
    else last.push(x);
  });
  return (
    <>
      {groups.map((g, k) => {
        const next = groups[k + 1]?.[0];
        const opacity = next
          ? interpolate(frame, [next.at - s.motion.stagger_frames, next.at], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easingOf(s, "exit"),
            })
          : 1;
        return (
          <div key={`${st.id}-${k}`} style={{ position: "absolute", inset: 0, opacity }}>
            <StatusChip anchor={{ node: st.anchor.node, side: st.anchor.side }} size="caption" states={g} />
          </div>
        );
      })}
    </>
  );
};

// Статусы и токены-данные над карточками графа.
const GraphOverlay: React.FC<{
  content: Content;
  beats: TimingBeat[];
  slot: SlotRect | null;
  capacity: number;
  step: number;
  lanes: Lanes;
}> = ({ content, beats, slot, capacity, step, lanes }) => {
  const geo = useFlowGeometry();
  const b = beatOf(beats);

  const atFrame = (at: StatusAt): number => {
    const win = b(at.beat);
    if (at.edge === undefined) return win.start_frame;
    const flow = content.graph.flows.find((f) => f.edge === at.edge && f.beat === at.beat);
    const a = geo?.arrivals(pulseArrival(at.edge, win, flow?.travel, { count: flow?.count ?? 1, repeat: flow?.repeat ?? false }));
    return a?.[0] ?? win.end_frame;
  };

  // Точка токена у узла: у очереди — строка стопки (вылет — голова, приход — своя строка).
  const pointAt = (nodeId: string, row: number): Pt | undefined =>
    nodeId === content.queue_node ? lanes.rowCenter(row) : lanes.slotCenter.get(nodeId);

  return (
    <>
      {slot ? <QueueStack content={content} beats={beats} slot={slot} capacity={capacity} step={step} /> : null}
      {content.statuses.map((st) => (
        <StatusGroups key={st.id} st={st} states={st.states.map((x) => ({ text: x.text, tone: x.tone, at: atFrame(x.at) }))} />
      ))}
      {content.tokens.flatMap((t, i) =>
        t.flights.map((fl) => {
          const link = content.graph.edges.find((e) => e.id === fl.edge);
          const a = link ? pointAt(link.from, 0) : undefined;
          const z = link ? pointAt(link.to, Math.min(i, capacity - 1)) : undefined;
          if (!a || !z) return null;
          return (
            <DataToken
              key={`${t.id}-${fl.beat}`}
              label={t.label}
              segments={[edgeSegment(a, z, "h")]}
              beat={b(fl.beat)}
              travel={fl.travel}
              stay={fl.stay}
              accentIndex={t.accentIndex}
              size="caption"
            />
          );
        }),
      )}
    </>
  );
};

const SceneBody: React.FC<Omit<SceneProps, "style">> = ({ timing, content }) => {
  const s = useStyle();
  const { height } = useVideoConfig();
  const rect = useSafeArea();
  const b = beatOf(timing.beats);
  const g = content.graph;

  const gx = g.layout.x * rect.w;
  const gy = g.layout.y * rect.h;
  const gw = g.layout.w * rect.w;
  const gh = g.layout.h * rect.h;
  const graphBeat = b(g.beat);

  const h2 = typeSize(s, "h2", height);
  const caption = typeSize(s, "caption", height);

  // Высота узла-очереди: подпись по центру над стопкой из slot_capacity строк, без наезда.
  const heightOf = (n: NodeSpec, w: number): number => {
    const capacity = n.slot_capacity ?? 1;
    if (!n.slot || capacity <= 1) return n.layout.h * rect.h;
    const probeH = 1000;
    const probe = flowSlot({ id: n.id, label: n.label, caption: n.caption, x: 0, y: 0, w, h: probeH, size: n.size, slot: true }, s, height);
    const reserve = probe?.reserve ?? caption * 2.2;
    const rowH = probe?.h ?? caption * 1.75;
    const pad = (probe?.y ?? probeH - reserve) - (probeH - reserve);
    const labelBlock = 1.2 * (h2 + caption * 1.15) + caption * 0.5;
    const margin = caption * 0.5;
    const step = rowH + Math.round(caption * 0.25);
    const free = labelBlock + 2 * margin + 2 * (capacity - 1) * step - 2 * pad;
    return Math.min(gh, Math.max(n.layout.h * rect.h, free + reserve));
  };

  // Очередь — по центру графа; её строки задают коридоры полёта токенов.
  const queueSpec = g.nodes.find((n) => n.id === content.queue_node);
  const capacity = queueSpec?.slot_capacity ?? 1;
  const qw = (queueSpec?.layout.w ?? 0) * gw;
  const qh = queueSpec ? heightOf(queueSpec, qw) : 0;
  const queueSlot = queueSpec
    ? flowSlot(
        { id: queueSpec.id, label: queueSpec.label, caption: queueSpec.caption, x: queueSpec.layout.x * gw, y: (gh - qh) / 2, w: qw, h: qh, size: queueSpec.size, slot: true },
        s,
        height,
      )
    : null;
  const slot: SlotRect | null = queueSlot ? { x: queueSlot.x, y: queueSlot.y, w: queueSlot.w, h: queueSlot.h } : null;
  const step = (slot?.h ?? 0) + Math.round(caption * 0.25);
  const rowCenter = (row: number): Pt => ({
    x: (slot?.x ?? 0) + (slot?.w ?? 0) / 2,
    y: (slot?.y ?? 0) + (slot?.h ?? 0) / 2 - (capacity - 1 - row) * step,
  });

  // Узел со слотом встаёт так, чтобы центр его слота лёг на строку очереди: полёт идёт
  // по прямой в полосе слотов, ниже подписей всех карточек.
  const yOf = (n: NodeSpec, w: number, h: number): number => {
    if (n.id === content.queue_node || !n.slot || !n.align_to) return (gh - h) / 2;
    const probe = flowSlot({ id: n.id, label: n.label, caption: n.caption, x: 0, y: 0, w, h, size: n.size, slot: true }, s, height);
    if (!probe) return (gh - h) / 2;
    const target = rowCenter(n.align_to === "head" ? 0 : capacity - 1).y;
    return Math.max(0, Math.min(gh - h, target - (probe.y + probe.h / 2)));
  };

  const nodes = g.nodes.map((n) => {
    const w = n.layout.w * gw;
    const h = n.id === content.queue_node ? qh : heightOf(n, w);
    const flashes = n.flash_on
      ? g.flows
          .filter((f) => f.edge === n.flash_on)
          .map((f) => pulseArrival(f.edge, b(f.beat), f.travel, { count: f.count, repeat: f.repeat }))
      : null;
    const em = n.emphasis ? b(n.emphasis.beat) : null;
    return {
      id: n.id,
      label: n.label,
      ...(n.caption ? { caption: n.caption } : {}),
      x: n.layout.x * gw,
      y: yOf(n, w, h),
      w,
      h,
      elevation: n.elevation,
      size: n.size,
      enter: n.enter,
      enterAt: graphBeat.start_frame + n.enter_offset,
      ...(n.slot ? { slot: true } : {}),
      ...(n.accentIndex !== undefined ? { accentIndex: n.accentIndex } : {}),
      ...(flashes ? { flash: flashes } : {}),
      ...(em && n.emphasis
        ? { emphasis: { start_frame: em.start_frame, end_frame: em.end_frame, loop: n.emphasis.loop, ring: n.emphasis.ring } }
        : {}),
    };
  });

  const slotCenter = new Map<string, Pt>();
  nodes.forEach((n) => {
    if (!n.slot || n.id === content.queue_node) return;
    const r = flowSlot(n, s, height);
    if (r) slotCenter.set(n.id, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
  });
  const lanes: Lanes = { slotCenter, rowCenter };

  const st = content.statement;
  const bg = content.background;

  return (
    <AbsoluteFill>
      {s.transparent ? null : <Background beat={graphBeat} variant={bg.variant} seed={bg.seed} focus={bg.focus} />}
      <SafeArea>
        <div style={{ position: "absolute", left: gx, top: gy, width: gw, height: gh }}>
          <FlowGraph
            nodes={nodes}
            edges={g.edges}
            beat={graphBeat}
            width={gw}
            height={gh}
            overlay={<GraphOverlay content={content} beats={timing.beats} slot={slot} capacity={capacity} step={step} lanes={lanes} />}
          >
            {g.flows.map((f) => (
              <PulseAlongPath
                key={`${f.edge}-${f.beat}`}
                edgeId={f.edge}
                beat={b(f.beat)}
                travel={f.travel}
                count={f.count}
                repeat={f.repeat}
                reverse={f.direction === "back"}
                size={12}
                tail={170}
              />
            ))}
          </FlowGraph>
        </div>
        <div
          style={{
            position: "absolute",
            left: st.layout.x * rect.w,
            top: st.layout.y * rect.h,
            width: st.layout.w * rect.w,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <SceneTitle mode="integrated" text={st.text} beat={b(st.beat)} align={st.align} size={st.size} maxWidth={st.layout.w * rect.w} />
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
};

export const Scene: React.FC<SceneProps> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    <SceneBody timing={timing} content={content} />
  </StyleProvider>
);
