// Галерея паттернов: акценты kit 0.2 — Emphasis (удар + дыхание, ореол Halo, кольцо) на
// плашке итога и акцент конечной точки LineChart без выноски: значение показывает
// герой-число, привязанное к голове линии.
import { AnimatedNumber, Background, Emphasis, Enter, KineticText, LineChart, SafeArea, StyleProvider, fontFamily, lineChartHead, surfaceAt, typeSize, useStyle, type ResolveStyleInput } from "@ms/motion-kit";
import { useCurrentFrame, useVideoConfig } from "remotion";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
}

const POINTS = [
  { label: "янв", value: 120_000 },
  { label: "мар", value: 150_000 },
  { label: "май", value: 210_000 },
  { label: "июл", value: 260_000 },
  { label: "сен", value: 350_000 },
  { label: "ноя", value: 480_000 },
];
const CHART = { width: 960, height: 640 };

function Hero({ b }: { b: Record<string, Window> }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const head = lineChartHead(POINTS, b.chart!, frame, { ...CHART, frameHeight: height });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, width: 620 }}>
      <Enter kind="mask" pre="silhouette" beat={b.title!}>
        <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 600, fontSize: typeSize(s, "h2", height), color: s.palette.muted }}>Выручка в месяц, ₽</div>
      </Enter>
      <AnimatedNumber from={120_000} to={480_000} value={head.value} beat={{ start_frame: head.startFrame, end_frame: head.endFrame }} enterAt={b.title!.start_frame} locale="ru" size="display" />
      <Enter kind="pop" pre="silhouette" beat={b.badge_in!} style={{ alignSelf: "flex-start", marginTop: 24 }}>
        <Emphasis beat={b.badge!} shape="pill" spread={64}>
          <div
            style={{
              padding: "0.3em 0.8em",
              borderRadius: 999,
              background: surfaceAt(s, 2),
              color: s.palette.text,
              fontFamily: fontFamily(s.typography.display),
              fontWeight: 700,
              fontSize: typeSize(s, "h2", height),
            }}
          >
            ×4 за год
          </div>
        </Emphasis>
      </Enter>
    </div>
  );
}

export const Scene = ({ timing, style }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="accent" />
      <SafeArea style={{ gap: 40 }}>
        <KineticText text="Акцент · kit 0.2" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
        <div style={{ display: "flex", alignItems: "center", gap: 80, flex: 1 }}>
          <Hero b={b} />
          <LineChart points={POINTS} beat={b.chart!} {...CHART} callout={false} endpointEmphasis={{ beat: b.endpoint!, loop: false }} />
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
