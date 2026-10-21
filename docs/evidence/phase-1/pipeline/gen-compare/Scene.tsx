import React from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Card,
  Emphasis,
  Enter,
  KineticText,
  Particles,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  easingOf,
  formatNumber,
  pluralForm,
  springAt,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Span ={ start_frame: number; end_frame: number };
type Frac = { x: number; y: number; w: number; h: number };
type Lane = { label: string; note: string; elevation: 0 | 1 | 2 | 3 };

type SceneContent = {
  title: string;
  locale: "ru" | "en";
  weeks: number;
  lane_mono: Lane;
  lane_micro: Lane;
  mono_releases_at_week: number[];
  services: string[];
  releases_per_service: number;
  release_window_weeks: [number, number];
  release_min_gap_weeks: number;
  axis_labels: { text: string; at: number }[];
  hero: { from: number; to: number; suffix_forms: [string, string, string]; emphasis_spread: number };
  mono_count: { prefix: string; forms: [string, string, string] };
  dim: { mono_track: number; mono_count: number };
  layout: Record<
    | "title"
    | "lane_mono"
    | "lane_micro"
    | "track_mono"
    | "track_micro"
    | "axis_weeks"
    | "hero_count"
    | "mono_count",
    Frac
  >;
};

type SceneProps = {
  timing: { duration_frames: number; beats: Beat[] };
  style: React.ComponentProps<typeof StyleProvider>["style"];
  content: SceneContent;
};

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
// Поля оси внутри трека: крайние маркеры (ромб 34 px) не выходят за его край.
const AXIS_PAD = 20;
const MONO_HALF = 17;
const MICRO_R = 7;

const findBeat = (beats: Beat[], id: string): Span => {
  const b = beats.find((x) => x.id === id);
  return b ? { start_frame: b.start_frame, end_frame: b.end_frame } : { start_frame: 0, end_frame: 0 };
};

// 12 релизов на сервис: по одному в равных корзинах окна, сдвиг random(seed) —
// соседние релизы не ближе min_gap недель.
const microReleases = (c: SceneContent): { service: number; week: number }[] => {
  const [from, to] = c.release_window_weeks;
  const n = c.releases_per_service;
  const bin = (to - from) / n;
  const out: { service: number; week: number }[] = [];
  c.services.forEach((_, i) => {
    for (let k = 0; k < n; k++) {
      const jitter = random(`svc-${i}-${k}`) * Math.max(0, bin - c.release_min_gap_weeks);
      out.push({ service: i, week: from + k * bin + jitter });
    }
  });
  return out.sort((a, b) => a.week - b.week);
};

const SceneBody: React.FC<SceneProps> = ({ timing, content }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const s = useStyle();
  const rect = useSafeArea();

  const titleIn = findBeat(timing.beats, "title-in");
  const lanesIn = findBeat(timing.beats, "lanes-in");
  const tracksIn = findBeat(timing.beats, "tracks-in");
  const countersIn = findBeat(timing.beats, "counters-in");
  const run = findBeat(timing.beats, "releases-count");
  const finale = findBeat(timing.beats, "final-emphasis");

  const stagger = s.motion.stagger_frames;
  const box = (l: Frac) => ({ left: l.x * rect.w, top: l.y * rect.h, width: l.w * rect.w, height: l.h * rect.h });
  const L = content.layout;
  const title = box(L.title);
  const laneMono = box(L.lane_mono);
  const laneMicro = box(L.lane_micro);
  const trackMono = box(L.track_mono);
  const trackMicro = box(L.track_micro);
  const axis = box(L.axis_weeks);
  const hero = box(L.hero_count);
  const monoCountBox = box(L.mono_count);

  const bodyPx = typeSize(s, "body", height);
  const captionPx = typeSize(s, "caption", height);

  // Общая ось: доля квартала → x внутри треков.
  const plotW = trackMono.width - 2 * AXIS_PAD;
  const xAt = (frac: number) => AXIS_PAD + frac * plotW;

  // Линия «сейчас»: один источник для маркеров, счётчиков и самой линии.
  const runLen = run.end_frame - run.start_frame;
  const crossFrame = (week: number) => run.start_frame + Math.ceil((week / content.weeks) * runLen);
  const head = interpolate(frame, [run.start_frame, run.end_frame], [0, 1], CLAMP);

  const monoMarks = content.mono_releases_at_week.map((week) => ({ week, at: crossFrame(week) }));
  const microMarks = microReleases(content).map((m) => ({ ...m, at: crossFrame(m.week) }));
  const monoPassed = monoMarks.filter((m) => frame >= m.at).length;
  const microPassed = microMarks.filter((m) => frame >= m.at).length;

  // Прорисовка дорожек — linear.
  const monoDraw = interpolate(frame, [tracksIn.start_frame, tracksIn.end_frame - stagger / 2], [0, 1], CLAMP);
  const microDrawBeat = { start_frame: tracksIn.start_frame + stagger, end_frame: tracksIn.end_frame };
  const microDraw = interpolate(frame, [microDrawBeat.start_frame, microDrawBeat.end_frame], [0, 1], CLAMP);
  const axisBeat = { start_frame: tracksIn.start_frame + Math.round(1.5 * stagger), end_frame: tracksIn.end_frame };
  const axisIn = interpolate(frame, [axisBeat.start_frame, axisBeat.start_frame + s.motion.enter_frames], [0, 1], {
    ...CLAMP,
    easing: easingOf(s, "enter"),
  });

  // Финал: линия гаснет, монолит уходит в тень.
  const dim = interpolate(frame, [finale.start_frame, finale.start_frame + s.motion.exit_frames], [0, 1], {
    ...CLAMP,
    easing: easingOf(s, "exit"),
  });
  const playheadOpacity =
    interpolate(frame, [run.start_frame, run.start_frame + stagger], [0, 1], CLAMP) * (1 - dim);
  const monoOpacity = 1 - (1 - content.dim.mono_track) * dim;
  const monoCountOpacity = 1 - (1 - content.dim.mono_count) * dim;

  // Геометрия общего SVG треков (от верха монолита до низа микросервисов).
  const svgTop = trackMono.top;
  const svgH = trackMicro.top + trackMicro.height - svgTop;
  const monoY = trackMono.height / 2;
  const microTop = trackMicro.top - svgTop;
  const slot = trackMicro.height / content.services.length;
  const laneY = (i: number) => microTop + slot * i + captionPx + MICRO_R * 2;

  const trackColor = alpha(s.palette.text, 0.16);
  const ink = s.palette.text;
  const lead = accent(s, 0);
  const px = xAt(head);

  const monoLabel = pluralForm(monoPassed, content.mono_count.forms, { locale: content.locale });
  const monoNum = formatNumber(monoPassed, { locale: content.locale });
  const monoText = /^[\d−-]/.test(monoLabel) ? monoLabel : `${monoNum} ${monoLabel}`;

  const laneCard = (lane: Lane, b: Span,size: { width: number; height: number }) => (
    <Card elevation={lane.elevation} beat={b} enter="slide" width={size.width} height={size.height} padding={24}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 8 }}>
        <div
          style={{
            fontFamily: s.typography.display.family,
            fontWeight: 700,
            fontSize: bodyPx,
            lineHeight: 1.15,
            color: ink,
            whiteSpace: "nowrap",
          }}
        >
          {lane.label}
        </div>
        <div
          style={{
            fontFamily: s.typography.body.family,
            fontWeight: 500,
            fontSize: captionPx,
            lineHeight: 1.2,
            color: s.palette.muted,
          }}
        >
          {lane.note}
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <div style={{ position: "absolute", ...title }}>
        <Enter kind="mask" beat={titleIn}>
          <KineticText
            text={content.title}
            beat={titleIn}
            mode="words"
            enter="rise"
            size="h2"
            font="display"
            weight={800}
            color={ink}
            maxWidth={title.width}
          />
        </Enter>
      </div>

      <div style={{ position: "absolute", ...laneMono }}>
        {laneCard(content.lane_mono, lanesIn, laneMono)}
      </div>
      <div style={{ position: "absolute", ...laneMicro }}>
        {laneCard(
          content.lane_micro,
          { start_frame: lanesIn.start_frame + 2 * stagger, end_frame: lanesIn.end_frame },
          laneMicro,
        )}
      </div>

      <svg
        width={trackMono.width}
        height={svgH}
        style={{ position: "absolute", left: trackMono.left, top: svgTop, overflow: "visible" }}
      >
        {/* опорные недели — тонкие вертикали под подписями оси */}
        {content.axis_labels.map((a) => (
          <line
            key={a.text}
            x1={xAt(a.at)}
            x2={xAt(a.at)}
            y1={0}
            y2={svgH}
            stroke={alpha(s.palette.muted, 0.22)}
            strokeWidth={1.5}
            strokeDasharray="4 8"
            opacity={axisIn}
          />
        ))}

        <g opacity={monoOpacity}>
          <line
            x1={xAt(0)}
            x2={xAt(monoDraw)}
            y1={monoY}
            y2={monoY}
            stroke={trackColor}
            strokeWidth={8}
            strokeLinecap="round"
            opacity={monoDraw > 0 ? 1 : 0}
          />
          {monoMarks.map((m) => {
            if (frame < m.at) return null;
            const k = springAt(frame, fps, s, m.at, "bouncy");
            return (
              <polygon
                key={m.week}
                points={`0,${-MONO_HALF} ${MONO_HALF},0 0,${MONO_HALF} ${-MONO_HALF},0`}
                fill={ink}
                transform={`translate(${xAt(m.week / content.weeks)} ${monoY}) scale(${Math.max(0, k)})`}
              />
            );
          })}
        </g>

        {content.services.map((name, i) => (
          <line
            key={name}
            x1={xAt(0)}
            x2={xAt(microDraw)}
            y1={laneY(i)}
            y2={laneY(i)}
            stroke={trackColor}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={microDraw > 0 ? 1 : 0}
          />
        ))}
        {microMarks.map((m) => {
          if (frame < m.at) return null;
          const k = springAt(frame, fps, s, m.at, "bouncy");
          return (
            <circle
              key={`${m.service}-${m.week}`}
              r={MICRO_R}
              fill={ink}
              transform={`translate(${xAt(m.week / content.weeks)} ${laneY(m.service)}) scale(${Math.max(0, k)})`}
            />
          );
        })}

        {/* линия «сейчас» — единственный акцент бита releases-count */}
        <g opacity={playheadOpacity}>
          <line x1={px} x2={px} y1={0} y2={svgH} stroke={lead} strokeWidth={3} strokeLinecap="round" />
          <circle cx={px} cy={0} r={16} fill={alpha(lead, 0.18)} />
          <circle cx={px} cy={0} r={10} fill={alpha(lead, 0.35)} />
          <circle cx={px} cy={0} r={6} fill={lead} />
        </g>
      </svg>

      {/* подписи сервисов — над своей полосой, у левого конца */}
      {content.services.map((name, i) => (
        <div
          key={name}
          style={{
            position: "absolute",
            left: trackMicro.left + AXIS_PAD,
            top: trackMicro.top + slot * i,
            height: captionPx,
          }}
        >
          <Enter kind="fade" beat={microDrawBeat} index={i} total={content.services.length}>
            <div
              style={{
                fontFamily: s.typography.body.family,
                fontWeight: 500,
                fontSize: captionPx,
                lineHeight: 1,
                color: s.palette.muted,
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </div>
          </Enter>
        </div>
      ))}

      <div style={{ position: "absolute", ...axis }}>
        <Enter kind="fade" beat={axisBeat}>
          <div style={{ position: "relative", width: axis.width, height: axis.height }}>
            {content.axis_labels.map((a, i) => {
              const first = i === 0;
              const last = i === content.axis_labels.length - 1;
              const x = xAt(a.at);
              return (
                <div
                  key={a.text}
                  style={{
                    position: "absolute",
                    top: (axis.height - captionPx * 1.2) / 2,
                    left: first ? 0 : last ? undefined : x,
                    right: last ? 0 : undefined,
                    transform: first || last ? undefined : "translateX(-50%)",
                    fontFamily: s.typography.body.family,
                    fontWeight: 500,
                    fontSize: captionPx,
                    lineHeight: 1.2,
                    color: s.palette.muted,
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.text}
                </div>
              );
            })}
          </div>
        </Enter>
      </div>

      <div style={{ position: "absolute", ...hero, display: "flex", alignItems: "center" }}>
        <Emphasis
          beat={finale}
          loop
          accentIndex={0}
          shape="pill"
          spread={content.hero.emphasis_spread}
        >
          <AnimatedNumber
            from={content.hero.from}
            to={content.hero.to}
            value={microPassed}
            beat={run}
            enterAt={countersIn.start_frame}
            locale={content.locale}
            size="display"
            suffix={content.hero.suffix_forms}
            color={ink}
            align="left"
          />
        </Emphasis>
      </div>

      <div
        style={{
          position: "absolute",
          ...monoCountBox,
          display: "flex",
          alignItems: "center",
          opacity: monoCountOpacity,
        }}
      >
        <Enter kind="fade" beat={{ start_frame: countersIn.start_frame + stagger, end_frame: countersIn.end_frame }}>
          <div
            style={{
              fontFamily: s.typography.body.family,
              fontWeight: 600,
              fontSize: bodyPx,
              lineHeight: 1.2,
              color: s.palette.muted,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {content.mono_count.prefix}
            {monoText}
          </div>
        </Enter>
      </div>
    </>
  );
};

const Atmosphere: React.FC<{ until: number }> = ({ until }) => {
  const s = useStyle();
  if (s.transparent) return null;
  return (
    <>
      <Background beat={{ start_frame: 0, end_frame: until }} variant="aurora" seed="releases" />
      <Particles count={40} seed="dust" beat={{ start_frame: 0, end_frame: until }} layer={0} accentShare={0.2} />
    </>
  );
};

export const Scene: React.FC<SceneProps> = (props) => {
  const titleIn = findBeat(props.timing.beats, "title-in");
  return (
    <StyleProvider style={props.style}>
      <Atmosphere until={titleIn.end_frame} />
      <SafeArea>
        <SceneBody {...props} />
      </SafeArea>
    </StyleProvider>
  );
};
