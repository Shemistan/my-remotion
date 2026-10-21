import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  Background,
  Camera,
  Card,
  Enter,
  FlowGraph,
  Parallax,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  beatProgress,
  cardSurface,
  easingOf,
  fpsFrames,
  springAt,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type SceneStyle = React.ComponentProps<typeof StyleProvider>["style"];
type CameraKeys = React.ComponentProps<typeof Camera>["keys"];
type FlowNodes = React.ComponentProps<typeof FlowGraph>["nodes"];
type Resolved = ReturnType<typeof useStyle>;

type Beat = { id: string; start_frame: number; end_frame: number };
type Span = { start_frame: number; end_frame: number };
type Layout = { x: number; y: number; w: number; h: number };

type NodeContent = {
  id: string;
  label: string;
  caption?: string;
  elevation: 0 | 1 | 2 | 3;
  accentIndex?: number;
  layout: Layout;
};

type Content = {
  title: string;
  title_layout: Layout;
  hero_id: string;
  user_id: string;
  nodes: NodeContent[];
  edges: { id: string; from: string; to: string }[];
  user_edge: string;
  tool_edges: string[];
  badge: { text: string; layout: Layout };
  camera: CameraKeys;
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: SceneStyle;
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" is missing in props.timing.beats`);
  return b;
};

// Удар акцента: пружина стиля от кадра прихода, гаснет по кривой выхода за `fade` кадров.
const flashAt = (
  frame: number,
  fps: number,
  st: Resolved,
  at: number,
  fade: number,
  role: "soft" | "snappy" | "bouncy",
): number => {
  if (frame < at) return 0;
  const hit = springAt(frame, fps, st, at, role);
  const decay = 1 - beatProgress(frame, { start_frame: at, end_frame: at + fade }, easingOf(st, "exit"));
  return Math.max(0, hit * decay);
};

const Ring: React.FC<{ rect: Layout; color: string; k: number; radius: React.CSSProperties["borderRadius"] }> = ({
  rect,
  color,
  k,
  radius,
}) => (
  <div
    style={{
      position: "absolute",
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      borderRadius: radius,
      boxShadow: `0 0 0 2px ${alpha(color, k)}, 0 0 48px 6px ${alpha(color, 0.55 * k)}`,
      opacity: k > 0.001 ? 1 : 0,
    }}
  />
);

const AgentScheme: React.FC<Props> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const st = useStyle();
  const rect = useSafeArea();

  const beats = timing.beats;
  const bTitle = beatOf(beats, "title-in");
  const bGraph = beatOf(beats, "graph-nodes-in");
  const bRequest = beatOf(beats, "request-pulse");
  const bEmph = beatOf(beats, "orchestrator-emphasis");
  const bTools = beatOf(beats, "tool-calls");
  const bData = beatOf(beats, "data-return");
  const bAnswer = beatOf(beats, "answer-return");
  const bBadge = beatOf(beats, "answer-badge-in");
  const bHold = beatOf(beats, "hold");

  const stagger = st.motion.stagger_frames;
  const enterF = st.motion.enter_frames;

  // Раскладка: доли safe area, центры поджаты к центру под наезд камеры слоя 1,
  // чтобы на максимальном наезде всё оставалось в safe area.
  const camMax = Math.max(1, ...content.camera.map((c) => c.scale));
  const fit = 1 / (1 + (camMax - 1) * 1.15);
  const place = (l: Layout): Layout => {
    const cx = 0.5 + (l.x + l.w / 2 - 0.5) * fit;
    const cy = 0.5 + (l.y + l.h / 2 - 0.5) * fit;
    return {
      x: Math.round((cx - l.w / 2) * rect.w),
      y: Math.round((cy - l.h / 2) * rect.h),
      w: Math.round(l.w * rect.w),
      h: Math.round(l.h * rect.h),
    };
  };

  const rects: Record<string, Layout> = {};
  for (const n of content.nodes) rects[n.id] = place(n.layout);
  const rectOf = (id: string): Layout => {
    const r = rects[id];
    if (!r) throw new Error(`node "${id}" has no layout`);
    return r;
  };

  const nodes: FlowNodes = content.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    elevation: n.elevation,
    ...(n.accentIndex !== undefined ? { accentIndex: n.accentIndex } : {}),
    ...rectOf(n.id),
  }));

  const hero = content.nodes.find((n) => n.id === content.hero_id);
  const heroRect = rectOf(content.hero_id);
  const userRect = rectOf(content.user_id);
  const toolTargets = content.tool_edges.map((eid) => {
    const e = content.edges.find((x) => x.id === eid);
    if (!e) throw new Error(`edge "${eid}" is missing`);
    return e.to;
  });
  const nTools = content.tool_edges.length;

  // Длительность прохода импульса — из битов: приход совпадает с концом окна события.
  const travelRequest = bEmph.start_frame - bRequest.start_frame;
  const travelTools = bTools.end_frame - bTools.start_frame - stagger * (nTools - 1);
  const travelData = bData.end_frame - bData.start_frame - stagger * (nTools - 1);
  const travelAnswer = bAnswer.end_frame - bAnswer.start_frame - stagger;

  const toolArrive = content.tool_edges.map((_, i) => bTools.start_frame + i * stagger + travelTools);
  const dataArrive = bData.start_frame + (nTools - 1) * stagger + travelData;
  const answerArrive = bAnswer.start_frame + travelAnswer;

  const c0 = accent(st, 0);
  const c1 = accent(st, 1);
  const c2 = accent(st, 2);

  // Герой: удар на приходе запроса, вспышка данных, дыхание в hold.
  const emph = flashAt(frame, fps, st, bEmph.start_frame, bEmph.end_frame - bEmph.start_frame, "snappy");
  const dataHit = flashAt(frame, fps, st, dataArrive, enterF, "snappy");
  const breathIn = beatProgress(
    frame,
    { start_frame: bHold.start_frame, end_frame: bHold.start_frame + enterF },
    easingOf(st, "enter"),
  );
  const period = fpsFrames(st, 40);
  const breath = breathIn * (0.5 - 0.5 * Math.cos((2 * Math.PI * (frame - bHold.start_frame)) / period));
  const heroScale = 1 + st.amplitude * (0.04 * emph + 0.02 * dataHit) + 0.03 * breath;
  const heroGlow = Math.max(emph, dataHit, 0.6 * breath);
  const heroColor = dataHit > emph && dataHit > 0.6 * breath ? c2 : c0;

  // Инструменты: вспышка в момент прихода своего импульса, следующий гасит предыдущий.
  const toolFlash = toolArrive.map((at, i) => {
    const own = flashAt(frame, fps, st, at, enterF, "snappy");
    const next = toolArrive[i + 1];
    if (next === undefined) return own;
    const handover: Span = { start_frame: next, end_frame: next + stagger };
    return own * (1 - beatProgress(frame, handover, easingOf(st, "exit")));
  });
  const userFlash = flashAt(frame, fps, st, answerArrive, enterF, "bouncy");

  const nodeRadius = cardSurface(st, 2).borderRadius;
  const heroRadius = cardSurface(st, 3).borderRadius;
  const heroStart = bGraph.start_frame + stagger * 2;

  const titleRect = place(content.title_layout);
  const badgeRect = place(content.badge.layout);

  const pulse = { size: 10, tail: 160 } as const;

  return (
    <>
      <div style={{ position: "absolute", left: titleRect.x, top: titleRect.y, width: titleRect.w, height: titleRect.h }}>
        <Enter kind="mask" beat={bTitle}>
          <div
            style={{
              height: titleRect.h,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: st.typography.display.family,
              fontWeight: 800,
              fontSize: typeSize(st, "body", height),
              letterSpacing: `${st.typography.tracking.caps}em`,
              textTransform: "uppercase",
              color: st.palette.muted,
              whiteSpace: "nowrap",
            }}
          >
            {content.title}
          </div>
        </Enter>
      </div>

      <div style={{ position: "absolute", left: 0, top: 0, width: rect.w, height: rect.h }}>
        <FlowGraph nodes={nodes} edges={content.edges} beat={bGraph} width={rect.w} height={rect.h} enter="flip">
          <PulseAlongPath edgeId={content.user_edge} beat={bRequest} color={c0} travel={travelRequest} repeat={false} {...pulse} />
          {content.tool_edges.map((eid, i) => (
            <PulseAlongPath
              key={`call-${eid}`}
              edgeId={eid}
              beat={{ start_frame: bTools.start_frame + i * stagger, end_frame: bTools.end_frame }}
              color={c1}
              travel={travelTools}
              repeat={false}
              {...pulse}
            />
          ))}
          {content.tool_edges.map((eid, i) => (
            <PulseAlongPath
              key={`data-${eid}`}
              edgeId={eid}
              beat={{ start_frame: bData.start_frame + i * stagger, end_frame: bData.end_frame }}
              color={c2}
              travel={travelData}
              repeat={false}
              reverse
              {...pulse}
            />
          ))}
          <PulseAlongPath edgeId={content.user_edge} beat={bAnswer} color={c0} travel={travelAnswer} repeat={false} reverse {...pulse} />
          {/* hold: тихий цикл — запрос и вызовы бегут дальше */}
          <PulseAlongPath edgeId={content.user_edge} beat={bHold} color={c0} travel={travelRequest} {...pulse} />
          {content.tool_edges.map((eid, i) => (
            <PulseAlongPath
              key={`hold-${eid}`}
              edgeId={eid}
              beat={{ start_frame: bHold.start_frame + i * stagger, end_frame: bHold.end_frame }}
              color={c1}
              travel={travelTools}
              {...pulse}
            />
          ))}
        </FlowGraph>
      </div>

      {toolTargets.map((id, i) => (
        <Ring key={`ring-${id}`} rect={rectOf(id)} color={c1} k={toolFlash[i] ?? 0} radius={nodeRadius} />
      ))}
      <Ring rect={userRect} color={c0} k={userFlash} radius={nodeRadius} />

      {/* Герой: Card того же rect поверх узла, подпись h2 */}
      <div
        style={{
          position: "absolute",
          left: heroRect.x,
          top: heroRect.y,
          width: heroRect.w,
          height: heroRect.h,
          transform: `scale(${heroScale})`,
          borderRadius: heroRadius,
          boxShadow: `0 0 0 2px ${alpha(heroColor, 0.9 * heroGlow)}, 0 0 ${Math.round(40 + 50 * heroGlow)}px 8px ${alpha(heroColor, 0.5 * heroGlow)}`,
        }}
      >
        <Card
          elevation={3}
          enter="scale"
          beat={{ start_frame: heroStart, end_frame: bGraph.end_frame }}
          accentIndex={hero?.accentIndex ?? 0}
          width={heroRect.w}
          height={heroRect.h}
          padding={0}
        >
          <div
            style={{
              width: "100%",
              height: heroRect.h,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: Math.round(typeSize(st, "caption", height) * 0.3),
            }}
          >
            <div
              style={{
                fontFamily: st.typography.display.family,
                fontWeight: 800,
                fontSize: typeSize(st, "h2", height),
                letterSpacing: `${st.typography.tracking.display}em`,
                color: st.palette.text,
                whiteSpace: "nowrap",
                lineHeight: 1.1,
              }}
            >
              {hero?.label}
            </div>
            {hero?.caption ? (
              <div
                style={{
                  fontFamily: st.typography.mono.family,
                  fontWeight: 500,
                  fontSize: typeSize(st, "caption", height),
                  color: st.palette.muted,
                  whiteSpace: "nowrap",
                }}
              >
                {hero.caption}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div style={{ position: "absolute", left: badgeRect.x, top: badgeRect.y, width: badgeRect.w, height: badgeRect.h }}>
        <Enter kind="pop" beat={bBadge}>
          <div
            style={{
              ...cardSurface(st, 1),
              width: badgeRect.w,
              height: badgeRect.h,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `${String(cardSurface(st, 1).boxShadow ?? "none")}, inset 0 0 0 2px ${c0}`,
              fontFamily: st.typography.body.family,
              fontWeight: 600,
              fontSize: typeSize(st, "body", height),
              color: c0,
              whiteSpace: "nowrap",
            }}
          >
            {content.badge.text}
          </div>
        </Enter>
      </div>
    </>
  );
};

const SceneBody: React.FC<Props> = (props) => {
  const st = useStyle();
  const bTitle = beatOf(props.timing.beats, "title-in");
  return (
    <Camera keys={props.content.camera}>
      <Parallax layer={0}>
        {st.transparent ? null : <Background beat={bTitle} variant="aurora" seed="agent" />}
        <Particles count={60} seed="agent-dust" beat={bTitle} layer={0} />
      </Parallax>
      <Parallax layer={1}>
        <SafeArea>
          <AgentScheme {...props} />
        </SafeArea>
      </Parallax>
    </Camera>
  );
};

export const Scene: React.FC<Props> = (props) => (
  <StyleProvider style={props.style}>
    <SceneBody {...props} />
  </StyleProvider>
);
