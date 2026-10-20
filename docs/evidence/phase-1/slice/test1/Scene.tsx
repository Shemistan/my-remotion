import React from "react";
import {
  AnimatedNumber,
  Background,
  Card,
  KineticText,
  LineChart,
  SafeArea,
  StyleProvider,
} from "@ms/motion-kit";

type Point = { label: string; value: number };

export type SceneProps = {
  kicker?: string;
  title?: string;
  caption?: string;
  from?: number;
  to?: number;
  badge?: string;
  badgeNote?: string;
  points?: Point[];
};

const DEFAULT_POINTS: Point[] = [
  { label: "янв 22", value: 10000 },
  { label: "июл 22", value: 28000 },
  { label: "янв 23", value: 70000 },
  { label: "июл 23", value: 150000 },
  { label: "янв 24", value: 290000 },
  { label: "июл 24", value: 520000 },
  { label: "янв 25", value: 1000000 },
];

// Биты из спецификации
const B_BG = { start_frame: 0, end_frame: 40 };
const B_KICKER = { start_frame: 6, end_frame: 30 };
const B_TITLE = { start_frame: 14, end_frame: 44 };
const B_CHART = { start_frame: 28, end_frame: 112 };
const B_COUNT = { start_frame: 40, end_frame: 118 };
const B_CAPTION = { start_frame: 52, end_frame: 76 };
const B_BADGE = { start_frame: 120, end_frame: 140 };
const B_BADGE_VALUE = { start_frame: 124, end_frame: 138 };
const B_BADGE_NOTE = { start_frame: 128, end_frame: 140 };

// Раскладка в px внутри SafeArea (1728×972, отступ 96×54 от края кадра)
const LEFT_W = 730;

export const Scene: React.FC<SceneProps> = ({
  kicker = "Данные · 2022–2025",
  title = "В 100 раз за три года",
  caption = "активных пользователей",
  from = 10000,
  to = 1000000,
  badge = "×100",
  badgeNote = "с 10 000",
  points = DEFAULT_POINTS,
}) => {
  return (
    <StyleProvider style="dark-premium">
      <Background beat={B_BG} variant="aurora" grain seed="growth-1m" />
      <SafeArea>
        <div style={{ position: "absolute", left: 0, top: 54, width: LEFT_W, opacity: 0.62 }}>
          <KineticText
            text={kicker}
            beat={B_KICKER}
            mode="letters"
            enter="fade"
            size={1}
            font="mono"
            caps
          />
        </div>

        <div style={{ position: "absolute", left: 0, top: 119, width: LEFT_W }}>
          <KineticText
            text={title}
            beat={B_TITLE}
            mode="words"
            enter="rise"
            size={5}
            weight={800}
            maxWidth={720}
            lineHeight={1.05}
            highlight={["100", "раз"]}
          />
        </div>

        <div style={{ position: "absolute", left: 0, top: 400, width: LEFT_W }}>
          <AnimatedNumber
            from={from}
            to={to}
            beat={B_COUNT}
            locale="ru"
            size={7}
            font="display"
            reserveWidth
          />
        </div>

        <div style={{ position: "absolute", left: 0, top: 562, width: LEFT_W, opacity: 0.62 }}>
          <KineticText
            text={caption}
            beat={B_CAPTION}
            mode="letters"
            enter="fade"
            size={2}
            font="body"
          />
        </div>

        <div style={{ position: "absolute", left: 0, top: 659 }}>
          <Card
            elevation={3}
            beat={B_BADGE}
            enter="scale"
            accentIndex={0}
            width={326}
            height={140}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                height: "100%",
                gap: 6,
              }}
            >
              <KineticText
                text={badge}
                beat={B_BADGE_VALUE}
                mode="words"
                enter="scale"
                size={4}
                weight={800}
                highlight={[badge]}
              />
              <div style={{ opacity: 0.6 }}>
                <KineticText
                  text={badgeNote}
                  beat={B_BADGE_NOTE}
                  mode="letters"
                  enter="fade"
                  size={0}
                  font="body"
                />
              </div>
            </div>
          </Card>
        </div>

        <div style={{ position: "absolute", left: 806, top: 162 }}>
          <LineChart
            points={points}
            beat={B_CHART}
            area
            highlightLast
            width={900}
            height={560}
            locale="ru"
            compact
            accentIndex={0}
            yTicks={4}
          />
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
