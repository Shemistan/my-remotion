// Галерея паттернов: количества — столбцы с акцентом на лучшем квартале и рост
// активной аудитории (AreaChart).
import { AreaChart, Background, BarChart, Enter, KineticText, SafeArea, StyleProvider, fontFamily, typeSize, useStyle, type ResolveStyleInput } from "@ms/motion-kit";
import { useVideoConfig } from "remotion";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
}

const BARS = [
  { label: "I кв.", value: 42_000 },
  { label: "II кв.", value: 58_000 },
  { label: "III кв.", value: 51_000 },
  { label: "IV кв.", value: 87_000 },
];
const USERS = [
  { label: "янв", value: 120_000 },
  { label: "мар", value: 180_000 },
  { label: "май", value: 260_000 },
  { label: "июл", value: 310_000 },
  { label: "сен", value: 450_000 },
  { label: "ноя", value: 640_000 },
];

/** Подпись графика входит раньше своего графика: шторка у одной, сдвиг у другой (правило соседей). */
function Caption({ text, beat, kind }: { text: string; beat: Window; kind: "mask" | "slide" }) {
  const s = useStyle();
  const { height } = useVideoConfig();
  return (
    <Enter kind={kind} beat={beat}>
      <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 600, fontSize: typeSize(s, "body", height) * 0.8, color: s.palette.text }}>{text}</div>
    </Enter>
  );
}

export const Scene = ({ timing, style }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="data" />
      <SafeArea style={{ gap: 36 }}>
        <KineticText text="Итоги года" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
        <div style={{ display: "flex", gap: 90, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Caption text="Выручка по кварталам, ₽" beat={b.bars_caption!} kind="mask" />
            <BarChart bars={BARS} beat={b.bars!} highlight={3} locale="ru" width={800} height={700} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Caption text="Активные пользователи" beat={b.area_caption!} kind="slide" />
            <AreaChart points={USERS} beat={b.area!} width={800} height={700} accentIndex={1} />
          </div>
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
