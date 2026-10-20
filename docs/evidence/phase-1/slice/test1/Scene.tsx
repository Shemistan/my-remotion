import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  EASE,
  KineticText,
  LineChart,
  SafeArea,
  StyleProvider,
  accent,
  alpha,
  lineChartHead,
  presets,
  springAt,
  useStyle,
} from "@ms/motion-kit";

type Intensity = "calm" | "balanced" | "energetic";

type Point = { label: string; value: number };

export type SceneProps = {
  animation_intensity?: Intensity;
  caption?: string;
  points?: Point[];
};

const DEFAULT_POINTS: Point[] = [
  { label: "янв 2022", value: 10_000 },
  { label: "июл 2022", value: 22_000 },
  { label: "янв 2023", value: 48_000 },
  { label: "июл 2023", value: 105_000 },
  { label: "янв 2024", value: 230_000 },
  { label: "июл 2024", value: 480_000 },
  { label: "янв 2025", value: 1_000_000 },
];

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Биты из spec
const BG_BEAT = { start_frame: 0, end_frame: 40 };
const CHART_BEAT = { start_frame: 10, end_frame: 130 };
const HERO_START = 18;
const CAPTION_BEAT = { start_frame: 26, end_frame: 52 };
const HOLD_START = 132;

// Раскладка в px безопасной зоны (1728×972)
const CHART = { left: 570, top: 330, width: 1140, height: 600 };
const HERO = { left: 60, top: 29 };
const CAPTION = { left: 64, top: 236 };
// Вершина графика (правый верхний угол поля данных) — точка, к которой тянется камера
const PEAK = { x: CHART.left + CHART.width - 50, y: CHART.top + 40 };
// Период «прихода импульса» в удержании (balanced: 40–50 кадров)
const PULSE_PERIOD = 45;

const Content: React.FC<{ points: Point[]; caption: string }> = ({ points, caption }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const style = useStyle();
  const amber = accent(style, 2);

  // Один источник: голова линии → значение героя и момент удара
  const head = lineChartHead(points, CHART_BEAT, frame, {
    width: CHART.width,
    height: CHART.height,
    yTicks: 4,
  });
  const impactFrame = head.endFrame;

  // Камера: медленный наезд 1.00 → 1.03 к вершине + дрейф 6 px вправо-вверх в hold
  const camT = EASE.inOutCubic(
    interpolate(frame, [0, durationInFrames - 1], [0, 1], CLAMP),
  );
  const camScale = 1 + 0.03 * camT;
  const driftT = EASE.inOutCubic(
    interpolate(frame, [HOLD_START - 20, durationInFrames - 1], [0, 1], CLAMP),
  );
  const driftX = 4.8 * driftT;
  const driftY = -3.6 * driftT;

  // Вход героя: из глубины, пружина snappy, blur 8 → 0
  const heroIn = springAt(frame, fps, style, HERO_START, "snappy");
  const heroOpacity = interpolate(frame, [HERO_START, HERO_START + 10], [0, 1], CLAMP);
  const heroBlur = 8 * Math.max(0, 1 - heroIn);
  // Дыхание в удержании: scale 1.00 ↔ 1.015
  const holdLocal = Math.max(0, frame - HOLD_START);
  const breathPhase = (holdLocal / PULSE_PERIOD) * Math.PI * 2;
  const holdOn = interpolate(frame, [HOLD_START, HOLD_START + 8], [0, 1], CLAMP);
  const breath = holdOn * (0.5 - 0.5 * Math.cos(breathPhase));
  const heroScale = (0.88 + 0.12 * heroIn) * (1 + 0.015 * breath);

  // Свечение героя: вспышка в кадр удара, затем дыхание ±10 %
  const flash = interpolate(
    frame,
    [impactFrame, impactFrame + 5, impactFrame + 26],
    [0, 1, 0.4],
    CLAMP,
  );
  const glow = frame < HOLD_START ? flash : 0.4 + 0.1 * Math.sin(breathPhase);
  const glowRise = interpolate(frame, [HERO_START, 60], [0, 0.12], CLAMP);
  const heroGlow = Math.max(glowRise, glow);

  // Янтарное пятно за вершиной: проявляется с линией, ярчает на 20 % в удар,
  // в hold мягко пульсирует на каждом «приходе» импульса
  const bloomBase = interpolate(frame, [24, 106], [0.35, 0.8], CLAMP);
  const bloomHit = interpolate(
    frame,
    [impactFrame, impactFrame + 6, impactFrame + 30],
    [0, 0.2, 0.1],
    CLAMP,
  );
  const arrival = holdOn * Math.pow(0.5 + 0.5 * Math.cos(breathPhase), 3);
  const bloom = bloomBase * (1 + bloomHit + 0.12 * arrival);
  const bloomScale = 1 + 0.06 * arrival + 0.05 * bloomHit;

  return (
    <AbsoluteFill
      style={{
        transformOrigin: `${PEAK.x}px ${PEAK.y}px`,
        transform: `translate(${driftX}px, ${driftY}px) scale(${camScale})`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: PEAK.x - 380,
          top: PEAK.y - 380,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${alpha(amber, 0.28)} 0%, ${alpha(amber, 0.08)} 40%, ${alpha(amber, 0)} 70%)`,
          opacity: bloom,
          transform: `scale(${bloomScale})`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: CHART.left,
          top: CHART.top,
          width: CHART.width,
          height: CHART.height,
        }}
      >
        <LineChart
          points={points}
          beat={CHART_BEAT}
          width={CHART.width}
          height={CHART.height}
          area
          highlightLast={false}
          accentIndex={0}
          yTicks={4}
          compact
          locale="ru"
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: HERO.left,
          top: HERO.top,
          transformOrigin: "left center",
          transform: `scale(${heroScale})`,
          opacity: heroOpacity,
          filter: `blur(${heroBlur}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -80,
            top: -50,
            width: 1060,
            height: 300,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 45% 50%, ${alpha(amber, 0.32)} 0%, ${alpha(amber, 0)} 68%)`,
            opacity: heroGlow,
          }}
        />
        <AnimatedNumber
          from={10_000}
          to={1_000_000}
          value={head.value}
          beat={{ start_frame: CHART_BEAT.start_frame, end_frame: impactFrame }}
          locale="ru"
          size={8}
          font="display"
          reserveWidth
          align="left"
        />
      </div>

      <div style={{ position: "absolute", left: CAPTION.left, top: CAPTION.top, width: 700 }}>
        <KineticText
          text={caption}
          beat={CAPTION_BEAT}
          mode="words"
          enter="rise"
          size={3}
          font="body"
          weight={600}
          highlight={["три года"]}
          stagger={7}
          align="left"
        />
      </div>
    </AbsoluteFill>
  );
};

export const Scene: React.FC<SceneProps> = ({
  animation_intensity = "balanced",
  caption = "пользователей за три года",
  points = DEFAULT_POINTS,
}) => {
  const base = presets["dark-premium"];
  return (
    <StyleProvider
      style={{ ...base, motion: { ...base.motion, intensity: animation_intensity } }}
    >
      <Background beat={BG_BEAT} variant="aurora" seed="million-growth" grain />
      <SafeArea>
        <Content points={points} caption={caption} />
      </SafeArea>
    </StyleProvider>
  );
};
