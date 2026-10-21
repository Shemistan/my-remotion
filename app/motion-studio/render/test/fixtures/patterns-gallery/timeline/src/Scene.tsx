// Галерея паттернов: таймлайн из четырёх вех (горизонтальный).
import { Background, KineticText, SafeArea, StyleProvider, Timeline, type ResolveStyleInput } from "@ms/motion-kit";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  /** Вариант для e2e: ориентация оси (по умолчанию h). */
  content?: { orientation?: "h" | "v" };
}

const ITEMS = [
  { date: "2019", label: "Прототип в гараже" },
  { date: "2021", label: "Первые клиенты" },
  { date: "2023", label: "Выход в СНГ" },
  { date: "2025", label: "1 млн пользователей" },
];

export const Scene = ({ timing, style, content }: Props) => {
  const v = content?.orientation === "v";
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="timeline" />
      <SafeArea style={{ gap: 28 }}>
        <KineticText text="История компании" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
        <KineticText text="Шесть лет от идеи до миллиона" beat={b.headline!} mode="words" enter="slide" size="h1" highlight={["миллиона"]} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {v ? (
            <Timeline items={ITEMS} beat={b.timeline!} orientation="v" width={1100} height={700} />
          ) : (
            <Timeline items={ITEMS} beat={b.timeline!} orientation="h" width={1690} height={560} />
          )}
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
