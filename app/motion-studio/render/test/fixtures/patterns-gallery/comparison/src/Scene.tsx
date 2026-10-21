// Галерея паттернов: сравнение «Было / Стало» — ComparisonSplit с бейджем VS.
import { Background, ComparisonSplit, KineticText, SafeArea, StyleProvider, type ResolveStyleInput } from "@ms/motion-kit";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  /** Вариант для e2e: разделитель (по умолчанию vs). */
  content?: { divider?: "vs" | "line" };
}

export const Scene = ({ timing, style, content }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="comparison" />
      <SafeArea style={{ gap: 28 }}>
        <KineticText text="Сравнение" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
        <KineticText text="Ручной отчёт против пайплайна" beat={b.headline!} mode="words" enter="rise" size="h1" highlight={["пайплайна"]} />
        <div style={{ flex: 1, marginTop: 20 }}>
          <ComparisonSplit
            beat={b.split!}
            divider={content?.divider ?? "vs"}
            left={{ label: "Было", title: "Ручной отчёт", items: ["Выгрузка в Excel", "Сверка вручную", "Ошибки в формулах"], value: "3 дня" }}
            right={{ label: "Стало", title: "Пайплайн данных", items: ["Данные из DWH", "Проверки в коде", "Отчёт по расписанию"], value: "15 минут" }}
          />
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
