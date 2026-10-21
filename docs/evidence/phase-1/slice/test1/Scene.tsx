import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Card,
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

type Point = { label: string; value: number };
type Intensity = "calm" | "balanced" | "energetic";

export type SceneProps = {
  preset?: keyof typeof presets;
  animation_intensity?: Intensity;
  kicker?: string;
  subtitle?: string;
  multiplier?: string;
  multiplierCaption?: string;
  points?: Point[];
};

const DEFAULT_POINTS: Point[] = [
  { label: "янв 22", value: 10_000 },
  { label: "июл 22", value: 24_000 },
  { label: "янв 23", value: 55_000 },
  { label: "июл 23", value: 120_000 },
  { label: "янв 24", value: 250_000 },
  { label: "июл 24", value: 500_000 },
  { label: "янв 25", value: 1_000_000 },
];

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Биты из spec.beats
const BG_BEAT = { start_frame: 0, end_frame: 40 };
const KICKER_BEAT = { start_frame: 6, end_frame: 36 };
const CHART_BEAT = { start_frame: 14, end_frame: 130 };
const SUBTITLE_BEAT = { start_frame: 24, end_frame: 50 };
const CHIP_START = 113;
const HOLD_START = 136;

// Раскладка в координатах безопасной зоны (1728×972). Отступ INSET слева
// оставляет запас под наезд камеры 1.02, чтобы текст не уходил за safe area.
const INSET = 40;
const CHART_W = 1688;
const CHART_H = 600;
const CHART_TOP = 350;
// Опора наезда — примерно финальная точка графика (справа вверху)
const ORIGIN_X = 1690;
const ORIGIN_Y = 400;
const CHIP_W = 290;

const Content: React.FC<Required<Omit<SceneProps, "preset" | "animation_intensity">>> = ({
  kicker,
  subtitle,
  multiplier,
  multiplierCaption,
  points,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const style = useStyle();

  // Один источник движения: голова линии ведёт счёт героя
  const head = lineChartHead(points, CHART_BEAT, frame, { width: CHART_W, height: CHART_H, yTicks: 4 });
  const peak = head.endFrame;

  // Камера: медленный наезд 1.00 → 1.02 с кадра 14 до конца сцены
  const camera = interpolate(frame, [CHART_BEAT.start_frame, durationInFrames - 1], [1, 1.02], {
    ...CLAMP,
    easing: EASE.inOutCubic,
  });

  // Вход героя: snappy-пружина, 40 px снизу, scale 0.96 → 1
  const heroIn = springAt(frame, fps, style, CHART_BEAT.start_frame, "snappy");
  const heroOpacity = interpolate(frame, [CHART_BEAT.start_frame, CHART_BEAT.start_frame + 10], [0, 1], CLAMP);

  // Вспышка свечения в кадр прихода головы на вершину + дыхание в удержании (~60 кадров)
  const flash = interpolate(frame, [peak, peak + 4, peak + 30], [0, 1, 0], CLAMP);
  const breatheOn = interpolate(frame, [peak + 10, HOLD_START], [0, 1], CLAMP);
  const breathe = Math.sin(((frame - HOLD_START) / 60) * Math.PI * 2) * breatheOn;
  const glowColor = accent(style, 0);
  const glowAlpha = 0.18 + 0.5 * flash + 0.12 * breathe * 0.5 + 0.1 * breatheOn;
  const glowBlur = 18 + 30 * flash + 6 * breathe;

  // Плашка: лёгкое парение в удержании и проход блика
  const chipFloat = Math.sin(((frame - HOLD_START) / 50) * Math.PI * 2) * 4 * breatheOn;
  const sheen = interpolate(frame, [142, 172], [-140, 140], { ...CLAMP, easing: EASE.inOutCubic });

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${camera})`,
        transformOrigin: `${ORIGIN_X}px ${ORIGIN_Y}px`,
      }}
    >
      <div style={{ position: "absolute", left: INSET, top: 10 }}>
        <KineticText text={kicker} beat={KICKER_BEAT} mode="letters" enter="fade" size={1} font="mono" caps
          style={{ opacity: 0.6 }} />
      </div>

      <div
        style={{
          position: "absolute",
          left: INSET,
          top: 58,
          opacity: heroOpacity,
          transform: `translateY(${40 * (1 - heroIn)}px) scale(${0.96 + 0.04 * heroIn})`,
          transformOrigin: "left bottom",
          filter: `brightness(${1 + 0.12 * breathe}) drop-shadow(0 0 ${glowBlur}px ${alpha(glowColor, glowAlpha)})`,
        }}
      >
        <AnimatedNumber
          from={10_000}
          to={1_000_000}
          value={head.value}
          beat={{ start_frame: CHART_BEAT.start_frame, end_frame: peak }}
          locale="ru"
          size={8}
          font="display"
          reserveWidth
        />
      </div>

      <div style={{ position: "absolute", left: INSET + 4, top: 262 }}>
        <KineticText text={subtitle} beat={SUBTITLE_BEAT} mode="words" enter="slide" size={3} weight={600}
          style={{ opacity: 0.66 }} />
      </div>

      <div style={{ position: "absolute", left: INSET, top: CHART_TOP, width: CHART_W, height: CHART_H }}>
        <LineChart
          points={points}
          beat={CHART_BEAT}
          area
          highlightLast={false}
          width={CHART_W}
          height={CHART_H}
          locale="ru"
          compact
          yTicks={4}
          accentIndex={0}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: ORIGIN_X - CHIP_W - 10,
          top: 196,
          width: CHIP_W,
          transform: `translateY(${chipFloat}px)`,
        }}
      >
        <Card
          elevation={3}
          beat={{ start_frame: CHIP_START, end_frame: HOLD_START }}
          enter="scale"
          accentIndex={2}
          width={CHIP_W}
          style={{ transformOrigin: "90% 100%" }}
        >
          <div style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 4 }}>
            <KineticText text={multiplier} beat={{ start_frame: CHIP_START + 3, end_frame: CHIP_START + 20 }}
              mode="words" enter="scale" size={5} weight={800} />
            <KineticText text={multiplierCaption} beat={{ start_frame: CHIP_START + 9, end_frame: CHIP_START + 26 }}
              mode="words" enter="fade" size={1} font="mono" caps style={{ opacity: 0.66 }} />
            <div
              style={{
                position: "absolute",
                top: -20,
                bottom: -20,
                left: "50%",
                width: 60,
                marginLeft: -30,
                transform: `translateX(${sheen * 2}px) skewX(-20deg)`,
                background: `linear-gradient(90deg, transparent, ${alpha(accent(style, 2), 0.22)}, transparent)`,
                opacity: interpolate(frame, [142, 148, 166, 172], [0, 1, 1, 0], CLAMP),
              }}
            />
          </div>
        </Card>
      </div>
    </AbsoluteFill>
  );
};

export const Scene: React.FC<SceneProps> = ({
  preset = "dark-premium",
  animation_intensity = "balanced",
  kicker = "Пользователи · 2022–2025",
  subtitle = "пользователей",
  multiplier = "×100",
  multiplierCaption = "за 3 года",
  points = DEFAULT_POINTS,
}) => (
  <StyleProvider
    style={{ ...presets[preset], motion: { ...presets[preset].motion, intensity: animation_intensity } }}
  >
    <Background beat={BG_BEAT} variant="aurora" seed="growth-100x" grain />
    <SafeArea>
      <Content
        kicker={kicker}
        subtitle={subtitle}
        multiplier={multiplier}
        multiplierCaption={multiplierCaption}
        points={points}
      />
    </SafeArea>
  </StyleProvider>
);
