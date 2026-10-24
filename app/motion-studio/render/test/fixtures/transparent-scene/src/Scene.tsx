// Сцена экспорта (Task 19): каркас сгенерированной сцены — тайминги из props.timing, стиль
// из props.style, кадровые величины из props.content (договор isContentFrameKey). При
// style.transparent Background не рисуется и фон на корне не ставится — ProRes 4444 с
// альфой; без него — обычная непрозрачная сцена (сверка кадров 30 и 60 fps).
import { Background, Card, KineticText, SafeArea, StyleProvider, type ResolveStyleInput } from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: { title: string; stagger: number };
};

export const Scene = ({ timing, style, content }: Props) => {
  const [cards, title] = timing.beats;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 30 }} seed="transparent-scene" />
      <SafeArea style={{ justifyContent: "center", alignItems: "center", gap: 48 }}>
        <KineticText text={content.title} beat={title!} mode="words" enter="rise" size={5} />
        <div style={{ display: "flex", gap: 32 }}>
          {[0, 1, 2].map((i) => (
            <Card key={i} elevation={2} beat={cards!} delay={i * content.stagger} enter="rise" accentIndex={i} width={260} height={180}>
              <div style={{ fontFamily: '"Inter", sans-serif', fontWeight: 600, fontSize: 32 }}>Слой {i + 1}</div>
            </Card>
          ))}
        </div>
      </SafeArea>
    </StyleProvider>
  );
};
