import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import {
  AnimatedNumber,
  Background,
  Emphasis,
  Enter,
  KineticText,
  LineChart,
  SafeArea,
  StyleProvider,
  lineChartHead,
  pluralForm,
  typeSize,
  useSafeArea,
  useStyle,
} from "@ms/motion-kit";
import type { ResolveStyleInput } from "@ms/motion-kit";

type TypeLevel = "display" | "h1" | "h2" | "body" | "caption";
type HoldMode = "steady-flow" | "repeat-result" | "data-shimmer" | "now-pulse" | "settle-push";
type Layout = { x: number; y: number; w: number; h: number };
type BeatT = { id: string; start_frame: number; end_frame: number };
type Point = { label: string; value: number };

type Content = {
  hold_mode: HoldMode;
  background: {
    variant: "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";
    seed: string;
    focus: { x: number; y: number };
  };
  chart: {
    id: string;
    points: Point[];
    area: boolean;
    callout: boolean;
    yTicks: number;
    compact: boolean;
    locale: "ru" | "en";
    accentIndex: number;
    pre: "silhouette" | "hidden";
    width: number;
    height: number;
    layout: Layout;
  };
  hero: {
    id: string;
    from: number;
    to: number;
    locale: "ru" | "en";
    size: TypeLevel;
    align: "left" | "right" | "center";
    reserveWidth: boolean;
    round_to: number;
    accentIndex: number;
    layout: Layout;
  };
  users_label: {
    id: string;
    text: string;
    suffix_forms: [string, string, string];
    size: TypeLevel;
    align: "left" | "right" | "center";
    layout: Layout;
  };
  multiplier: {
    id: string;
    text: string;
    size: TypeLevel;
    weight: number;
    align: "left" | "right" | "center";
    layout: Layout;
  };
  multiplier_sub: {
    id: string;
    text: string;
    size: TypeLevel;
    align: "left" | "right" | "center";
    layout: Layout;
  };
};

type Props = {
  timing: { duration_frames: number; beats: BeatT[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: Content;
};

const justify = (align: "left" | "right" | "center") =>
  align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";

// Блок элемента по его layout (доли safe area) в px safe area.
const Slot: React.FC<{
  layout: Layout;
  align: "left" | "right" | "center";
  children: React.ReactNode;
  vAlign?: "flex-start" | "center" | "flex-end";
}> = ({ layout, align, children, vAlign = "center" }) => {
  const rect = useSafeArea();
  return (
    <div
      style={{
        position: "absolute",
        left: layout.x * rect.w,
        top: layout.y * rect.h,
        width: layout.w * rect.w,
        height: layout.h * rect.h,
        display: "flex",
        justifyContent: justify(align),
        alignItems: vAlign,
      }}
    >
      {children}
    </div>
  );
};

const SceneBody: React.FC<{ beats: Record<string, BeatT>; content: Content }> = ({ beats, content }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const s = useStyle();
  const { chart, hero, users_label, multiplier, multiplier_sub } = content;

  const chartBeat = beats["chart-draw"]!;
  const heroIn = beats["hero-in"]!;
  const heroCount = beats["hero-count-count"]!;
  const finalEmphasis = beats["final-emphasis"]!;
  const hold = { mode: content.hold_mode, beat: beats.hold! };

  // Число идёт за головой линии: одно движение, округление до тысяч.
  const head = lineChartHead(chart.points, chartBeat, frame, {
    width: chart.width,
    height: chart.height,
    yTicks: chart.yTicks,
    frameHeight: height,
  });
  const shown = Math.round(head.value / hero.round_to) * hero.round_to;
  const labelText = pluralForm(shown, users_label.suffix_forms, { locale: hero.locale });

  return (
    <>
      <Slot layout={chart.layout} align="left" vAlign="flex-start">
        <LineChart
          points={chart.points}
          beat={chartBeat}
          area={chart.area}
          callout={chart.callout}
          endpointEmphasis={{
            beat: { start_frame: head.endFrame, end_frame: finalEmphasis.start_frame },
            loop: false,
          }}
          yTicks={chart.yTicks}
          compact={chart.compact}
          locale={chart.locale}
          accentIndex={chart.accentIndex}
          pre={chart.pre}
          width={chart.width}
          height={chart.height}
        />
      </Slot>

      <Slot layout={hero.layout} align={hero.align}>
        <Emphasis
          beat={finalEmphasis}
          hold={hold}
          shape="rounded"
          ring="strike"
          accentIndex={hero.accentIndex}
          spread={48}
        >
          <AnimatedNumber
            from={hero.from}
            to={hero.to}
            value={shown}
            beat={{ start_frame: heroCount.start_frame, end_frame: head.endFrame }}
            enterAt={heroIn.start_frame}
            locale={hero.locale}
            size={hero.size}
            align={hero.align}
            reserveWidth={hero.reserveWidth}
          />
        </Emphasis>
      </Slot>

      <Slot layout={users_label.layout} align={users_label.align} vAlign="flex-start">
        <KineticText
          text={labelText}
          beat={beats["label-in"]!}
          mode="words"
          enter="fade"
          size={users_label.size}
          font="body"
          color={s.palette.muted}
          align={users_label.align}
        />
      </Slot>

      <Slot layout={multiplier.layout} align={multiplier.align}>
        <Enter kind="mask" beat={beats["multiplier-in"]!} pre="hidden">
          <div
            style={{
              fontFamily: s.typography.display.family,
              fontWeight: multiplier.weight,
              fontSize: typeSize(s, multiplier.size, height),
              letterSpacing: `${s.typography.tracking.display}em`,
              color: s.palette.text,
              lineHeight: 1.1,
              textAlign: multiplier.align,
              whiteSpace: "nowrap",
            }}
          >
            {multiplier.text}
          </div>
        </Enter>
      </Slot>

      <Slot layout={multiplier_sub.layout} align={multiplier_sub.align} vAlign="flex-start">
        <KineticText
          text={multiplier_sub.text}
          beat={beats["multiplier-sub-in"]!}
          mode="words"
          enter="fade"
          size={multiplier_sub.size}
          font="body"
          color={s.palette.muted}
          align={multiplier_sub.align}
        />
      </Slot>
    </>
  );
};

export const Scene: React.FC<Props> = ({ timing, style, content }) => {
  const beats: Record<string, BeatT> = Object.fromEntries(timing.beats.map((b) => [b.id, b]));
  return (
    <StyleProvider style={style}>
      {style.transparent ? null : (
        <Background
          variant={content.background.variant}
          seed={content.background.seed}
          focus={content.background.focus}
        />
      )}
      <SafeArea>
        <SceneBody beats={beats} content={content} />
      </SafeArea>
    </StyleProvider>
  );
};
