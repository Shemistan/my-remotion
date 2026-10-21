import React from "react";
import { useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Emphasis,
  Enter,
  KineticText,
  Particles,
  PulseAlongPath,
  SafeArea,
  StyleProvider,
  accent,
  smoothSegments,
  staggerBeat,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import { Lane } from "./Lane";

type Beat = { id: string; start_frame: number; end_frame: number };
type Window = { start_frame: number; end_frame: number };
type Box = { x: number; y: number; w: number; h: number };

type Content = {
  locale: "ru" | "en";
  title: string;
  label_mono: string;
  label_micro: string;
  stages: string[];
  stage_positions: number[];
  micro_tracks: number[];
  mono_pulse: { size: number; tail: number; count: number; travel: number };
  micro_pulse: {
    size: number;
    tail: number;
    travel: number;
    count_main: number;
    count_hold: number;
    offsets_frames: number[];
  };
  count_mono: { from: number; to: number };
  count_micro: { from: number; to: number };
  suffix_forms: [string, string, string];
  period_caption: string;
  layout: {
    title: Box;
    label_mono: Box;
    label_micro: Box;
    lane_mono: Box;
    lane_micro: Box;
    count_mono: Box;
    count_micro: Box;
  };
};

type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: {
    preset: "dark-premium" | "light-clean" | "tech-neon";
    intensity: "calm" | "balanced" | "energetic";
    depth?: 0 | 1 | 2 | 3;
    transparent?: boolean;
    safe_area?: { x: number; y: number };
  };
  content: Content;
};

const beatOf = (beats: Beat[], id: string): Window => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat ${id} not found`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const SceneBody: React.FC<{ beats: Beat[]; content: Content }> = ({ beats, content }) => {
  const style = useStyle();
  const rect = useSafeArea();
  const { height: frameH } = useVideoConfig();
  const stagger = style.motion.stagger_frames;

  const bTitle = beatOf(beats, "title-in");
  const bLabels = beatOf(beats, "labels-in");
  const bLanes = beatOf(beats, "lanes-draw");
  const bCounters = beatOf(beats, "counters-in");
  const bMonoTravel = beatOf(beats, "mono-travel");
  const bStream = beatOf(beats, "micro-stream");
  const bMicroCount = beatOf(beats, "micro-count");
  const bEmphasis = beatOf(beats, "micro-emphasis");
  const bMonoCount = beatOf(beats, "mono-count");
  const bHold = beatOf(beats, "hold");

  const L = content.layout;
  const px = (b: Box) => ({ left: b.x * rect.w, top: b.y * rect.h, width: b.w * rect.w, height: b.h * rect.h });
  const laneMono = px(L.lane_mono);
  const laneMicro = px(L.lane_micro);

  // подписи дорожек: второй стартует на 2 × stagger позже первого
  const labelMonoBeat: Window = { start_frame: bLabels.start_frame, end_frame: bLabels.end_frame - 2 * stagger };
  const labelMicroBeat: Window = { start_frame: bLabels.start_frame + 2 * stagger, end_frame: bLabels.end_frame };

  // монолит — одна линия в первые ~70 % бита; микросервисы — каскадом за ним
  const lanesLen = bLanes.end_frame - bLanes.start_frame;
  const monoDraw: Window = { start_frame: bLanes.start_frame, end_frame: bLanes.start_frame + Math.round(lanesLen * 0.72) };
  const microBase: Window = { start_frame: bLanes.start_frame + Math.round(1.5 * stagger), end_frame: bLanes.end_frame };
  const microDraw: Window[] = content.micro_tracks.map((_, i) =>
    staggerBeat(microBase, i, content.micro_tracks.length, stagger),
  );

  // счётчики: монолит входит в начале бита, герой — на 1.5 × stagger позже
  const monoEnterAt = bCounters.start_frame;
  const microEnterAt = bCounters.start_frame + Math.round(1.5 * stagger);

  const monoY = 0.5 * laneMono.height;
  const monoSegments = smoothSegments([
    { x: 0, y: monoY },
    { x: laneMono.width, y: monoY },
  ]);
  const microSegments = content.micro_tracks.map((t) =>
    smoothSegments([
      { x: 0, y: t * laneMicro.height },
      { x: laneMicro.width, y: t * laneMicro.height },
    ]),
  );

  const mp = content.micro_pulse;
  const caption = typeSize(style, "caption", frameH);
  const microBox = px(L.count_micro);
  const monoBox = px(L.count_mono);

  return (
    <>
      <div style={{ position: "absolute", ...px(L.title) }}>
        <KineticText text={content.title} beat={bTitle} mode="words" enter="rise" size="h2" align="left" />
      </div>

      <div style={{ position: "absolute", ...px(L.label_mono), display: "flex", alignItems: "center" }}>
        <KineticText
          text={content.label_mono}
          beat={labelMonoBeat}
          mode="words"
          enter="slide"
          size="body"
          font="body"
          color={style.palette.muted}
        />
      </div>
      <div style={{ position: "absolute", ...px(L.label_micro), display: "flex", alignItems: "center" }}>
        <KineticText
          text={content.label_micro}
          beat={labelMicroBeat}
          mode="words"
          enter="slide"
          size="body"
          font="body"
          color={style.palette.text}
        />
      </div>

      <div style={{ position: "absolute", ...laneMono }}>
        <Lane
          width={laneMono.width}
          height={laneMono.height}
          tracks={[0.5]}
          windows={[monoDraw]}
          strokeWidth={4}
          stages={content.stages}
          stagePositions={content.stage_positions}
          captionSide="below"
        />
        <PulseAlongPath
          segments={monoSegments}
          beat={bMonoTravel}
          color={style.palette.muted}
          size={content.mono_pulse.size}
          tail={content.mono_pulse.tail}
          count={content.mono_pulse.count}
          travel={content.mono_pulse.travel}
          repeat={false}
        />
      </div>

      <div style={{ position: "absolute", ...laneMicro }}>
        <Lane
          width={laneMicro.width}
          height={laneMicro.height}
          tracks={content.micro_tracks}
          windows={microDraw}
          strokeWidth={3}
          stages={content.stages}
          stagePositions={content.stage_positions}
          captionSide="above"
        />
        {microSegments.map((seg, i) => {
          const off = mp.offsets_frames[i] ?? 0;
          return (
            <React.Fragment key={i}>
              <PulseAlongPath
                segments={seg}
                beat={{ start_frame: bStream.start_frame + off, end_frame: bStream.end_frame }}
                color={accent(style, i)}
                size={mp.size}
                tail={mp.tail}
                count={mp.count_main}
                travel={mp.travel}
              />
              <PulseAlongPath
                segments={seg}
                beat={{ start_frame: bHold.start_frame + off, end_frame: bHold.end_frame }}
                color={accent(style, i)}
                size={mp.size}
                tail={mp.tail}
                count={mp.count_hold}
                travel={mp.travel}
              />
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ position: "absolute", ...monoBox, display: "flex", alignItems: "center" }}>
        <AnimatedNumber
          from={content.count_mono.from}
          to={content.count_mono.to}
          beat={bMonoCount}
          enterAt={monoEnterAt}
          locale={content.locale}
          size="h2"
          color={style.palette.muted}
          suffix={content.suffix_forms}
          align="left"
        />
      </div>

      <div
        style={{
          position: "absolute",
          ...microBox,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: caption * 0.2,
        }}
      >
        <Emphasis beat={bEmphasis} loop accentIndex={0} shape="pill" spread={48}>
          <AnimatedNumber
            from={content.count_micro.from}
            to={content.count_micro.to}
            beat={bMicroCount}
            enterAt={microEnterAt}
            locale={content.locale}
            size="display"
            color={style.palette.text}
            suffix={content.suffix_forms}
            reserveWidth
            align="left"
          />
        </Emphasis>
        <Enter kind="fade" beat={{ start_frame: microEnterAt + stagger, end_frame: bCounters.end_frame }}>
          <div
            style={{
              fontFamily: style.typography.body.family,
              fontWeight: 500,
              fontSize: caption,
              lineHeight: 1.2,
              color: style.palette.muted,
            }}
          >
            {content.period_caption}
          </div>
        </Enter>
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const atmosphere: Window = { start_frame: 0, end_frame: 40 };
  return (
    <StyleProvider style={style}>
      {style.transparent ? null : (
        <>
          <Background beat={atmosphere} variant="aurora" seed="releases" />
          <Particles count={40} seed="releases-dust" beat={{ start_frame: 0, end_frame: 60 }} layer={0} accentShare={0.2} />
        </>
      )}
      <SafeArea>
        <SceneBody beats={timing.beats} content={content} />
      </SafeArea>
    </StyleProvider>
  );
};
