// Галерея паттернов: процесс из четырёх шагов со стрелками.
import {
  Enter, Background, KineticText, ProcessSteps, SafeArea, StyleProvider, type ResolveStyleInput } from "@ms/motion-kit";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
  /** Вариант для e2e: вид коннектора (по умолчанию arrow). */
  content?: { connector?: "arrow" | "line" };
}

export const Scene = ({ timing, style, content }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} seed="process" />
      <SafeArea style={{ gap: 28 }}>
        <KineticText text="Как это работает" beat={b.kicker!} mode="letters" enter="type" size="caption" font="mono" caps />
        <Enter kind="none" pre="silhouette" beat={b.headline!}><KineticText text="Четыре шага от запроса до сцены" beat={b.headline!} mode="words" enter="rise" size="h1" highlight={["сцены"]} /></Enter>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ProcessSteps
            steps={["Понять запрос", "Собрать раскадровку", "Написать код сцены", "Проверить кадры"]}
            beat={b.steps!}
            connector={content?.connector ?? "arrow"}
            notes={["что и для кого", "биты и входы", "Remotion и kit", "QA по пикселям"]}
            width={1690}
            height={600}
          />
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
