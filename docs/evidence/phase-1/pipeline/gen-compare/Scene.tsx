import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Card,
  Emphasis,
  Enter,
  Particles,
  SafeArea,
  StyleProvider,
  alpha,
  cardEnterStyle,
  cardSurface,
  easingOf,
  mix,
  springAt,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { start_frame: number; end_frame: number };
type TimedBeat = Beat & { id: string };

type Stage = { label: string; share: number };
type Row = { label: string; releases: number[] };

type Content = {
  title: string;
  label_monolith: string;
  label_micro: string;
  stages: Stage[];
  rows: Row[];
  time_axis: { labels: string[]; positions: number[]; caption: string };
  monolith_result: string;
  counter: { from: number; to: number; locale: "ru" | "en"; caption: string };
};

type SceneStyle = {
  preset: "dark-premium" | "light-clean" | "tech-neon";
  intensity: "calm" | "balanced" | "energetic";
  depth?: 0 | 1 | 2 | 3;
  transparent?: boolean;
  safe_area?: { x: number; y: number };
};

type Props = {
  timing: { duration_frames: number; beats: TimedBeat[] };
  style: SceneStyle;
  content: Content;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Раскладка — доли safe area из spec.layout
const L = {
  title: { x: 0, y: 0, w: 0.86, h: 0.1 },
  labelMonolith: { x: 0, y: 0.24, w: 0.18, h: 0.08 },
  labelMicro: { x: 0, y: 0.62, w: 0.19, h: 0.08 },
  pipeline: { x: 0.2, y: 0.17, w: 0.56, h: 0.22 },
  lanes: { x: 0.2, y: 0.5, w: 0.56, h: 0.34 },
  playhead: { x: 0.2, y: 0.15, w: 0.56, h: 0.75 },
  axis: { x: 0.2, y: 0.88, w: 0.56, h: 0.07 },
  result: { x: 0.8, y: 0.2, w: 0.2, h: 0.16 },
  hero: { x: 0.79, y: 0.5, w: 0.21, h: 0.34 },
};

const beatOf = (beats: TimedBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  if (!b) throw new Error(`beat "${id}" not found in props.timing.beats`);
  return { start_frame: b.start_frame, end_frame: b.end_frame };
};

const Body: React.FC<Props> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useStyle();
  const area = useSafeArea();
  const { w, h } = area;
  const pal = s.palette;
  const st = s.motion.stagger_frames;

  const bTitle = beatOf(timing.beats, "title-in");
  const bLabels = beatOf(timing.beats, "labels-in");
  const bTracks = beatOf(timing.beats, "tracks-in");
  const bCounterIn = beatOf(timing.beats, "counter-in");
  const bRace = beatOf(timing.beats, "race-run");
  const bCount = beatOf(timing.beats, "counter-count");
  const bRelease = beatOf(timing.beats, "monolith-release");
  const bFinal = beatOf(timing.beats, "final-emphasis");

  // Каскад внутри tracks-in: конвейер → дорожки → ось → playhead
  const lanesBeat: Beat = { start_frame: bTracks.start_frame + st * 1.5, end_frame: bTracks.end_frame };
  const axisBeat: Beat = { start_frame: bTracks.start_frame + st * 2, end_frame: bTracks.end_frame };
  const playheadStart = bTracks.start_frame + st * 3.5;

  // Единый источник движения — playhead.x (доля 0..1), линейный прогресс
  const p = interpolate(frame, [bRace.start_frame, bRace.end_frame], [0, 1], CLAMP);
  const raceLen = bRace.end_frame - bRace.start_frame;
  const allReleases = content.rows.flatMap((r) => r.releases);
  const passed = allReleases.filter((f) => f <= p).length;

  const fsH2 = typeSize(s, "h2", height);
  const fsBody = typeSize(s, "body", height);
  const fsCaption = typeSize(s, "caption", height);
  const display = s.typography.display;
  const bodyFont = s.typography.body;
  const r = s.surfaces.radius;

  const box = (l: { x: number; y: number; w: number; h: number }) => ({
    left: l.x * w,
    top: l.y * h,
    width: l.w * w,
    height: l.h * h,
  });

  // Монолит приглушается к финальному акценту
  const monolithDim = interpolate(frame, [bFinal.start_frame, bFinal.end_frame], [1, 0.7], {
    ...CLAMP,
    easing: easingOf(s, "enter"),
  });

  // Конвейер монолита
  const pipe = box(L.pipeline);
  const pipeEnter = cardEnterStyle(s, frame, fps, bTracks.start_frame, "rise");
  const diamond = springAt(frame, fps, s, bRace.end_frame, "snappy");
  const diamondSize = 26;
  let acc = 0;
  const segments = content.stages.map((stage) => {
    const start = acc;
    acc += stage.share;
    return { ...stage, start };
  });

  // Дорожки сервисов
  const lanes = box(L.lanes);
  const rowH = lanes.height / content.rows.length;
  const trackY = rowH * 0.72;
  const blockW = 36;
  const blockH = 22;

  // Playhead
  const ph = box(L.playhead);
  const axis = box(L.axis);
  const axisY = axis.top;
  const lineTop = ph.top;
  const draw = interpolate(frame, [playheadStart, playheadStart + s.motion.enter_frames], [0, 1], {
    ...CLAMP,
    easing: easingOf(s, "enter"),
  });
  const phX = ph.left + p * ph.width;
  const dot = 16;

  const hero = box(L.hero);
  const result = box(L.result);

  return (
    <>
      {/* Заголовок */}
      <div style={{ position: "absolute", ...box(L.title) }}>
        <Enter kind="mask" beat={bTitle}>
          <div
            style={{
              fontFamily: display.family,
              fontWeight: 800,
              fontSize: fsH2,
              letterSpacing: `${s.typography.tracking.display}em`,
              color: pal.text,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            {content.title}
          </div>
        </Enter>
      </div>

      {/* Подписи дорожек */}
      {[
        { text: content.label_monolith, l: L.labelMonolith },
        { text: content.label_micro, l: L.labelMicro },
      ].map((lab, i) => (
        <div key={lab.text} style={{ position: "absolute", ...box(lab.l), display: "flex", alignItems: "center" }}>
          <Enter kind="slide" beat={bLabels} index={i} total={2}>
            <div
              style={{
                fontFamily: bodyFont.family,
                fontWeight: 600,
                fontSize: fsBody,
                letterSpacing: `${s.typography.tracking.body}em`,
                color: pal.text,
                whiteSpace: "nowrap",
              }}
            >
              {lab.text}
            </div>
          </Enter>
        </div>
      ))}

      {/* Конвейер монолита */}
      <div style={{ position: "absolute", ...pipe, opacity: monolithDim }}>
        <div
          style={{
            ...cardSurface(s, 1),
            ...pipeEnter,
            position: "relative",
            width: pipe.width,
            height: pipe.height,
            overflow: "hidden",
            borderRadius: r[2],
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: p * pipe.width,
              background: alpha(pal.muted, 0.35),
            }}
          />
          {segments.map((seg, i) => {
            const lit = interpolate(p, [seg.start, seg.start + 0.03], [0, 1], CLAMP);
            return (
              <div
                key={seg.label}
                style={{
                  position: "absolute",
                  left: seg.start * pipe.width,
                  top: 0,
                  width: seg.share * pipe.width,
                  height: pipe.height,
                  borderLeft: i > 0 ? `2px solid ${alpha(pal.muted, 0.5)}` : undefined,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingBottom: pipe.height * 0.12,
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    fontFamily: bodyFont.family,
                    fontWeight: 500,
                    fontSize: fsBody,
                    letterSpacing: `${s.typography.tracking.body}em`,
                    color: mix(pal.muted, pal.text, lit),
                    whiteSpace: "nowrap",
                  }}
                >
                  {seg.label}
                </div>
              </div>
            );
          })}
          {/* Ромб релиза на правом краю «выкатки» */}
          <div
            style={{
              position: "absolute",
              left: pipe.width - diamondSize * 1.9,
              top: pipe.height * 0.78 - diamondSize / 2,
              width: diamondSize,
              height: diamondSize,
              background: alpha(pal.text, 0.85),
              borderRadius: r[0] / 3,
              opacity: frame >= bRace.end_frame ? 1 : 0,
              transform: `rotate(45deg) scale(${diamond})`,
            }}
          />
        </div>
      </div>

      {/* Плашка «1 релиз» — проигравшая сторона, без акцента */}
      <div style={{ position: "absolute", ...result, opacity: 0.7 }}>
        <Card elevation={1} enter="pop" beat={bRelease} width={result.width} height={result.height} padding={0}>
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: bodyFont.family,
              fontWeight: 600,
              fontSize: fsBody,
              color: pal.muted,
              whiteSpace: "nowrap",
            }}
          >
            {content.monolith_result}
          </div>
        </Card>
      </div>

      {/* Дорожки микросервисов */}
      <div style={{ position: "absolute", ...lanes }}>
        {content.rows.map((row, i) => (
          <div key={row.label} style={{ position: "absolute", left: 0, top: i * rowH, width: lanes.width, height: rowH }}>
            <Enter kind="blur" beat={lanesBeat} index={i} total={content.rows.length}>
              <div style={{ position: "relative", width: lanes.width, height: rowH }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: trackY - blockH / 2 - fsCaption * 1.35,
                    fontFamily: bodyFont.family,
                    fontWeight: 500,
                    fontSize: fsCaption,
                    color: pal.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: trackY - 1,
                    width: lanes.width,
                    height: 2,
                    background: alpha(pal.muted, 0.4),
                  }}
                />
                {row.releases.map((f) => {
                  const start = bRace.start_frame + f * raceLen;
                  const pop = springAt(frame, fps, s, start, "bouncy");
                  const settle = interpolate(frame, [start, start + s.motion.enter_frames], [1, 0.85], CLAMP);
                  return (
                    <div
                      key={f}
                      style={{
                        position: "absolute",
                        left: f * lanes.width - blockW / 2,
                        top: trackY - blockH / 2,
                        width: blockW,
                        height: blockH,
                        borderRadius: r[0] / 2,
                        background: pal.accent[1],
                        opacity: f <= p ? settle : 0,
                        transform: `scale(${pop})`,
                      }}
                    />
                  );
                })}
              </div>
            </Enter>
          </div>
        ))}
      </div>

      {/* Ось квартала */}
      <div style={{ position: "absolute", ...axis }}>
        <Enter kind="fade" beat={axisBeat}>
          <div style={{ position: "relative", width: axis.width, height: axis.height }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: axis.width, height: 2, background: alpha(pal.muted, 0.4) }} />
            {[0, 1 / 3, 2 / 3, 1].map((t) => (
              <div
                key={t}
                style={{ position: "absolute", left: t * axis.width - 1, top: -6, width: 2, height: 12, background: alpha(pal.muted, 0.5) }}
              />
            ))}
            {content.time_axis.labels.map((lab, i) => (
              <div
                key={lab}
                style={{
                  position: "absolute",
                  left: (content.time_axis.positions[i] ?? 0) * axis.width,
                  top: 14,
                  transform: "translateX(-50%)",
                  fontFamily: bodyFont.family,
                  fontWeight: 500,
                  fontSize: fsCaption,
                  color: pal.muted,
                  whiteSpace: "nowrap",
                }}
              >
                {lab}
              </div>
            ))}
          </div>
        </Enter>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: axisY - fsCaption * 0.65,
          width: L.labelMonolith.w * w,
          height: axis.height,
        }}
      >
        <Enter kind="fade" beat={axisBeat}>
          <div style={{ fontFamily: bodyFont.family, fontWeight: 500, fontSize: fsCaption, color: pal.muted, whiteSpace: "nowrap" }}>
            {content.time_axis.caption}
          </div>
        </Enter>
      </div>

      {/* Playhead — общая стрелка времени */}
      <div
        style={{
          position: "absolute",
          left: phX - 1,
          top: axisY - (axisY - lineTop) * draw,
          width: 2,
          height: (axisY - lineTop) * draw,
          background: alpha(pal.text, 0.7),
          opacity: draw,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: phX - dot / 2,
          top: axisY - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot,
          background: pal.text,
          opacity: draw,
        }}
      />

      {/* Герой — счётчик релизов */}
      <div style={{ position: "absolute", ...hero, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <Emphasis beat={bFinal} loop shape="rounded" spread={48} accentIndex={0}>
          <AnimatedNumber
            from={content.counter.from}
            to={content.counter.to}
            value={passed}
            beat={bCount}
            enterAt={bCounterIn.start_frame}
            locale={content.counter.locale}
            size="display"
            font="display"
            color={pal.accent[0]}
          />
        </Emphasis>
        <Enter kind="fade" beat={bCounterIn}>
          <div
            style={{
              marginTop: fsBody * 0.3,
              maxWidth: hero.width,
              fontFamily: bodyFont.family,
              fontWeight: 500,
              fontSize: fsBody,
              lineHeight: 1.15,
              color: pal.muted,
            }}
          >
            {content.counter.caption}
          </div>
        </Enter>
      </div>
    </>
  );
};

export const Scene: React.FC<Props> = (props) => {
  const bTitle = beatOf(props.timing.beats, "title-in");
  return (
    <StyleProvider style={props.style}>
      {!props.style.transparent && <Background beat={bTitle} variant="aurora" seed="releases" />}
      <Particles count={50} seed="dust-releases" beat={bTitle} layer={0} />
      <SafeArea>
        <Body {...props} />
      </SafeArea>
    </StyleProvider>
  );
};
