// Галерея паттернов (kit 0.3): скорость во времени — LatencyRace. Медленная дорожка
// (без кэша, 120 мс) идёт длинным проходом, быстрая (из кэша, 4 мс) успевает ответить
// много раз за то же время. Заголовок — утверждение в потоке (SceneTitle statement),
// фон — прожектор за гонкой (Background spotlight + focus), без полосы h2 сверху.
import { Background, LatencyRace, SafeArea, SceneTitle, StyleProvider, type ResolveStyleInput } from "@ms/motion-kit";

type Window = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: ({ id: string } & Window)[] };
  style: Omit<ResolveStyleInput, "fps">;
}

export const Scene = ({ timing, style }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Window>;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 40 }} variant="spotlight" seed="speed" focus={{ x: 0.62, y: 0.6 }} />
      <SafeArea style={{ justifyContent: "center", gap: 72 }}>
        <SceneTitle mode="statement" kicker="Кэш · задержка ответа" text="Из кэша — в 30 раз быстрее" highlight={["30"]} beat={b.title!} />
        <LatencyRace
          beat={b.race!}
          locale="ru"
          travel={66}
          width={1600}
          lanes={[
            { id: "db", label: "Без кэша", caption: "запрос в БД", ms: 120, tone: "negative" },
            { id: "cache", label: "Из кэша", caption: "Redis · память", ms: 4, tone: "positive" },
          ]}
        />
      </SafeArea>
    </StyleProvider>
  );
};
