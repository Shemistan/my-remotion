import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  DataToken,
  Emphasis,
  Enter,
  PulseAlongPath,
  SafeArea,
  SceneTitle,
  StyleProvider,
  accent,
  alpha,
  easingOf,
  edgeSegment,
  fpsFrames,
  mix,
  pathArrivals,
  typeSize,
  useArrivalCount,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type CubicSegment = ReturnType<typeof edgeSegment>;
type Beat = { start_frame: number; end_frame: number };
type TimingBeat = Beat & { id: string };
type Rect = { x: number; y: number; w: number; h: number };
type PluralForms = [string, string, string];

type Flow = {
  edge: string;
  direction: "forward" | "back";
  beat: Beat;
  count: number;
  repeat: boolean;
  travel: number;
};

type Track = { id: string; service: string; row_center_y: number; accent_index: number };

type Counter = { from: number; to: number; suffix_forms: PluralForms; layout: Rect };

type Content = {
  locale: "ru" | "en";
  background: { variant: "spotlight"; seed: string; focus: { x: number; y: number } };
  title: { text: string; mode: "integrated"; size: "h2"; align: "left"; layout: Rect };
  mono: {
    label: string;
    label_layout: Rect;
    stages: string[];
    stages_layout: Rect;
    track_layout: Rect;
    end_mark: string;
    token: {
      label: string;
      beat: string;
      travel: number;
      count: number;
      repeat: boolean;
      stay: boolean;
      tone: "neutral";
      dock: { dx: number; dy: number };
    };
    counter: Counter;
  };
  micro: {
    label: string;
    label_layout: Rect;
    services_layout: Rect;
    tracks_layout: Rect;
    tracks: Track[];
    flows: Flow[];
    counter: Counter;
  };
  axis: { items: string[]; layout: Rect };
  hero: { text: string; layout: Rect; sub: string; sub_layout: Rect };
};

type Props = {
  timing: { duration_frames: number; beats: TimingBeat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

const beatOf = (beats: TimingBeat[], id: string): Beat => {
  const b = beats.find((x) => x.id === id);
  return b ? { start_frame: b.start_frame, end_frame: b.end_frame } : { start_frame: 0, end_frame: 0 };
};

const box = (sa: { w: number; h: number }, l: Rect) => ({
  left: l.x * sa.w,
  top: l.y * sa.h,
  width: l.w * sa.w,
  height: l.h * sa.h,
});

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Scene: React.FC<Props> = ({ timing, style, content }) => (
  <StyleProvider style={style}>
    {!style.transparent && (
      <Background
        beat={beatOf(timing.beats, "labels-in")}
        variant={content.background.variant}
        seed={content.background.seed}
        focus={content.background.focus}
      />
    )}
    <SafeArea>
      <Layout timing={timing} content={content} />
    </SafeArea>
  </StyleProvider>
);

const Layout: React.FC<{ timing: Props["timing"]; content: Content }> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useStyle();
  const sa = useSafeArea();
  const st = s.motion.stagger_frames;

  const tracksIn = beatOf(timing.beats, "tracks-in");
  const labelsIn = beatOf(timing.beats, "labels-in");
  const countersIn = beatOf(timing.beats, "counters-in");
  const race = beatOf(timing.beats, "race");
  const heroIn = beatOf(timing.beats, "hero-in");

  const caption = typeSize(s, "caption", height);
  const body = typeSize(s, "body", height);
  const display = typeSize(s, "display", height);
  const displayFamily = `${s.typography.display.family}, sans-serif`;
  const bodyFamily = `${s.typography.body.family}, sans-serif`;

  // каскад входов внутри бита labels-in
  const at = (k: number): Beat => ({ start_frame: labelsIn.start_frame + Math.round(k * st), end_frame: labelsIn.end_frame });

  // дорожка монолита
  const mTrack = box(sa, content.mono.track_layout);
  const mMid = mTrack.top + mTrack.height / 2;
  const trackW = mTrack.width;
  const monoLine = [edgeSegment({ x: 0, y: mMid }, { x: trackW, y: mMid }, "h")];
  // токен едет под дорожкой: подпись «Монолит» слева и этапы сверху остаются открытыми
  const tokenDrop = caption * 2.6;
  const tokenPath = [edgeSegment({ x: 0, y: mMid + tokenDrop }, { x: trackW, y: mMid + tokenDrop }, "h")];
  const tokenBeat = beatOf(timing.beats, content.mono.token.beat);
  const tokenFlow = {
    beat: tokenBeat,
    travel: content.mono.token.travel,
    count: content.mono.token.count,
    repeat: content.mono.token.repeat,
  };
  const monoArrival = pathArrivals(tokenPath, tokenFlow, s, fps)[0] ?? tokenBeat.start_frame + tokenFlow.travel;

  // дорожки сервисов
  const tBox = box(sa, content.micro.tracks_layout);
  const microTracks = content.micro.tracks.map((t) => {
    const y = tBox.top + t.row_center_y * tBox.height;
    const flow = content.micro.flows.find((f) => f.edge === t.id);
    const segments = [edgeSegment({ x: 0, y }, { x: trackW, y }, "h")];
    const arrivals: number[] = flow
      ? pathArrivals(segments, { beat: flow.beat, travel: flow.travel, count: flow.count, repeat: flow.repeat }, s, fps)
      : [];
    return { ...t, y, flow, segments, arrivals };
  });
  const lastMicroArrival = Math.max(race.start_frame, ...microTracks.flatMap((t) => t.arrivals));

  // прорисовка дорожек: монолит первым, сервисы со сдвигом stagger
  const drawLen = tracksIn.end_frame - tracksIn.start_frame - 3 * st;
  const drawP = (i: number) =>
    interpolate(frame, [tracksIn.start_frame + i * st, tracksIn.start_frame + i * st + drawLen], [0, 1], clamp);

  // после итога монолит уходит на ступень вниз
  const monoDim = interpolate(frame, [heroIn.start_frame, heroIn.start_frame + s.motion.exit_frames], [1, 0.5], {
    ...clamp,
    easing: easingOf(s, "enter"),
  });

  const flagLife = fpsFrames(s, 8);
  const shimmerPeriod = fps * 2.4;

  const heroLen = heroIn.end_frame - heroIn.start_frame;
  const heroBox = box(sa, content.hero.layout);
  const heroSubBox = box(sa, content.hero.sub_layout);
  const titleBox = box(sa, content.title.layout);
  const monoLabelBox = box(sa, content.mono.label_layout);
  const microLabelBox = box(sa, content.micro.label_layout);
  const stagesBox = box(sa, content.mono.stages_layout);
  const servicesBox = box(sa, content.micro.services_layout);
  const axisBox = box(sa, content.axis.layout);
  const segW = trackW / content.mono.stages.length;
  const monoTravel = Math.max(1, monoArrival - tokenBeat.start_frame);

  const labelStyle: React.CSSProperties = {
    fontFamily: displayFamily,
    fontWeight: 800,
    fontSize: body,
    color: s.palette.text,
    letterSpacing: `${s.typography.tracking.display}em`,
    whiteSpace: "nowrap",
  };

  return (
    <AbsoluteFill>
      {/* заголовок */}
      <div style={{ position: "absolute", left: titleBox.left, top: titleBox.top, width: titleBox.width }}>
        <SceneTitle
          mode={content.title.mode}
          text={content.title.text}
          size={content.title.size}
          align={content.title.align}
          beat={{ start_frame: at(0.5).start_frame, end_frame: labelsIn.end_frame }}
        />
      </div>

      {/* подписи сторон */}
      <div style={{ position: "absolute", ...monoLabelBox, display: "flex", alignItems: "center", top: mMid - monoLabelBox.height / 2 }}>
        <Enter kind="slide" beat={at(0)}>
          <div style={labelStyle}>{content.mono.label}</div>
        </Enter>
      </div>
      <div style={{ position: "absolute", ...microLabelBox, display: "flex", alignItems: "center" }}>
        <Enter kind="slide" beat={at(1)}>
          <div style={labelStyle}>{content.micro.label}</div>
        </Enter>
      </div>

      {/* этапы монолита */}
      {content.mono.stages.map((name, i) => {
        const cross = tokenBeat.start_frame + (monoTravel * i) / content.mono.stages.length;
        const lit = interpolate(frame, [cross, cross + 2 * st], [0, 1], clamp);
        return (
          <div
            key={name}
            style={{
              position: "absolute",
              left: mTrack.left + i * segW,
              width: segW,
              top: stagesBox.top,
              height: stagesBox.height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Enter kind="blur" beat={at(2.5)} index={i} total={content.mono.stages.length}>
              <div
                style={{
                  fontFamily: bodyFamily,
                  fontWeight: 500,
                  fontSize: caption,
                  color: mix(s.palette.muted, s.palette.text, lit),
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </div>
            </Enter>
          </div>
        );
      })}

      {/* дорожка монолита: тяжёлая линия, деления этапов, отметка «прод» */}
      <div style={{ position: "absolute", left: mTrack.left, top: 0, width: trackW, height: sa.h, opacity: monoDim }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: mMid - 5,
            height: 10,
            width: trackW * drawP(0),
            borderRadius: 5,
            background: alpha(s.palette.muted, 0.55),
          }}
        />
        {content.mono.stages.slice(1).map((name, i) => (
          <div
            key={name}
            style={{
              position: "absolute",
              left: segW * (i + 1) - 1,
              top: mMid - 14,
              width: 2,
              height: 28,
              background: alpha(s.palette.muted, 0.8),
              opacity: drawP(0) >= (i + 1) / content.mono.stages.length ? 1 : 0,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: trackW - 3,
            top: mMid - 18,
            width: 6,
            height: 36,
            borderRadius: 3,
            background: s.palette.muted,
            opacity: drawP(0) >= 1 ? 1 : 0,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: mMid + 12,
            fontFamily: bodyFamily,
            fontWeight: 500,
            fontSize: caption,
            lineHeight: 1.1,
            color: s.palette.muted,
            opacity: interpolate(frame, [tracksIn.end_frame - st, tracksIn.end_frame], [0, 1], clamp),
          }}
        >
          {content.mono.end_mark}
        </div>
      </div>

      {/* токен релиза монолита: медленно ползёт и остаётся на конце */}
      <div style={{ position: "absolute", left: mTrack.left, top: 0, width: trackW, height: sa.h }}>
        <DataToken
          segments={tokenPath}
          beat={tokenBeat}
          travel={content.mono.token.travel}
          stay={content.mono.token.stay}
          tone={content.mono.token.tone}
          dock={content.mono.token.dock}
          label={content.mono.token.label}
          size="caption"
        />
      </div>

      {/* счётчик монолита */}
      <div style={{ position: "absolute", ...box(sa, content.mono.counter.layout), top: mMid - body, height: body * 2, display: "flex", alignItems: "center", opacity: monoDim }}>
        <MonoCounter
          segments={tokenPath}
          flow={tokenFlow}
          counter={content.mono.counter}
          locale={content.locale}
          enterAt={countersIn.start_frame}
          beat={{ start_frame: race.start_frame, end_frame: monoArrival }}
        />
      </div>

      {/* имена сервисов */}
      {microTracks.map((t, i) => (
        <div
          key={t.id}
          style={{
            position: "absolute",
            left: servicesBox.left,
            width: servicesBox.width,
            top: t.y - body,
            height: body * 2,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Enter kind="fade" beat={at(2)} index={i} total={microTracks.length}>
            <div style={{ fontFamily: bodyFamily, fontWeight: 500, fontSize: body, color: s.palette.text, whiteSpace: "nowrap" }}>
              {t.service}
            </div>
          </Enter>
        </div>
      ))}

      {/* дорожки сервисов: тонкая линия, импульсы, флажки релизов на конце */}
      {microTracks.map((t, i) => (
        <div key={t.id} style={{ position: "absolute", left: mTrack.left, top: 0, width: trackW, height: sa.h }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: t.y - 2,
              height: 4,
              width: trackW * drawP(i + 1),
              borderRadius: 2,
              background: alpha(s.palette.muted, 0.45),
            }}
          />
          {t.flow && (
            <PulseAlongPath
              segments={t.segments}
              beat={t.flow.beat}
              travel={t.flow.travel}
              count={t.flow.count}
              repeat={t.flow.repeat}
              reverse={t.flow.direction === "back"}
              color={accent(s, t.accent_index)}
              size={12}
              tail={180}
            />
          )}
          {t.arrivals.map((a, j) => {
            const flash = interpolate(frame, [a, a + flagLife], [1, 0], clamp);
            const phase = random(`flag-${t.id}-${j}`) * Math.PI * 2;
            const shimmer = 0.5 + 0.12 * Math.sin((frame / shimmerPeriod) * Math.PI * 2 + phase);
            const shown = frame >= a;
            return (
              <div
                key={a}
                style={{
                  position: "absolute",
                  left: trackW - 8 - j * 14,
                  top: t.y - 14,
                  width: 5,
                  height: 28,
                  borderRadius: 2.5,
                  background: accent(s, t.accent_index),
                  opacity: shown ? shimmer + (1 - shimmer) * flash : 0,
                  transform: `scaleY(${1 + 0.5 * flash})`,
                }}
              />
            );
          })}
        </div>
      ))}

      {/* счётчик микросервисов */}
      <div style={{ position: "absolute", ...box(sa, content.micro.counter.layout), top: microTracks[1] ? microTracks[1].y - body : 0, height: body * 2, display: "flex", alignItems: "center" }}>
        <MicroCounter
          tracks={microTracks}
          counter={content.micro.counter}
          locale={content.locale}
          enterAt={countersIn.start_frame + st}
          beat={{ start_frame: race.start_frame, end_frame: lastMicroArrival }}
        />
      </div>

      {/* общая шкала квартала */}
      <div style={{ position: "absolute", ...axisBox }}>
        <Enter kind="fade" beat={at(3.5)}>
          <div style={{ position: "relative", width: axisBox.width, height: axisBox.height }}>
            {content.axis.items.map((m, i) => {
              const w = axisBox.width / content.axis.items.length;
              return (
                <React.Fragment key={m}>
                  <div style={{ position: "absolute", left: i * w - 1, top: 0, width: 2, height: 14, background: alpha(s.palette.muted, 0.7) }} />
                  <div
                    style={{
                      position: "absolute",
                      left: i * w,
                      width: w,
                      top: 14,
                      textAlign: "center",
                      fontFamily: bodyFamily,
                      fontWeight: 500,
                      fontSize: caption,
                      color: s.palette.muted,
                    }}
                  >
                    {m}
                  </div>
                </React.Fragment>
              );
            })}
            <div style={{ position: "absolute", left: axisBox.width - 1, top: 0, width: 2, height: 14, background: alpha(s.palette.muted, 0.7) }} />
          </div>
        </Enter>
      </div>

      {/* герой */}
      <div style={{ position: "absolute", ...heroBox, display: "flex", alignItems: "center" }}>
        <Enter kind="pop" beat={heroIn}>
          <Emphasis
            beat={{ start_frame: heroIn.start_frame + Math.round(heroLen / 3), end_frame: heroIn.end_frame }}
            loop
            ring="strike"
            halo
            shape="circle"
            spread={64}
          >
            <div
              style={{
                fontFamily: displayFamily,
                fontWeight: 800,
                fontSize: display,
                lineHeight: 1,
                color: accent(s, 0),
                letterSpacing: `${s.typography.tracking.display}em`,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {content.hero.text}
            </div>
          </Emphasis>
        </Enter>
      </div>
      <div style={{ position: "absolute", ...heroSubBox, display: "flex", alignItems: "center" }}>
        <Enter kind="blur" beat={{ start_frame: heroIn.start_frame + Math.round(heroLen / 4), end_frame: heroIn.end_frame }}>
          <div style={{ fontFamily: bodyFamily, fontWeight: 500, fontSize: body, color: s.palette.text, whiteSpace: "nowrap" }}>
            {content.hero.sub}
          </div>
        </Enter>
      </div>
    </AbsoluteFill>
  );
};

type ArrivalFlow = { beat: Beat; travel: number; count: number; repeat: boolean };

const MonoCounter: React.FC<{
  segments: CubicSegment[];
  flow: ArrivalFlow;
  counter: Counter;
  locale: "ru" | "en";
  enterAt: number;
  beat: Beat;
}> = ({ segments, flow, counter, locale, enterAt, beat }) => {
  const s = useStyle();
  const r = useArrivalCount({ segments, ...flow });
  return (
    <AnimatedNumber
      from={counter.from}
      to={counter.to}
      value={r.value}
      pop={r.pop}
      beat={beat}
      enterAt={enterAt}
      locale={locale}
      size="body"
      suffix={counter.suffix_forms}
      color={s.palette.muted}
      align="left"
    />
  );
};

type MicroTrack = { id: string; segments: CubicSegment[]; flow?: Flow };

const flowOf = (t: MicroTrack | undefined) => ({
  segments: t?.segments ?? [],
  beat: t?.flow?.beat ?? { start_frame: 0, end_frame: 0 },
  travel: t?.flow?.travel ?? 1,
  count: t?.flow?.count ?? 0,
  repeat: t?.flow?.repeat ?? false,
});

const MicroCounter: React.FC<{
  tracks: MicroTrack[];
  counter: Counter;
  locale: "ru" | "en";
  enterAt: number;
  beat: Beat;
}> = ({ tracks, counter, locale, enterAt, beat }) => {
  const a = useArrivalCount(flowOf(tracks[0]));
  const b = useArrivalCount(flowOf(tracks[1]));
  const c = useArrivalCount(flowOf(tracks[2]));
  return (
    <AnimatedNumber
      from={counter.from}
      to={counter.to}
      value={a.value + b.value + c.value}
      pop={Math.max(a.pop, b.pop, c.pop)}
      beat={beat}
      enterAt={enterAt}
      locale={locale}
      size="body"
      suffix={counter.suffix_forms}
      align="left"
    />
  );
};
