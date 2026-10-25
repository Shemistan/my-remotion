// Полноэкранная видеосцена (Task 36, Р-V5): непрозрачная, закрывает исходник целиком.
import { Background, Card, KineticText, SafeArea, StyleProvider, type ResolveStyleInput } from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: { title: string; value: string };
};

export const Scene = ({ timing, style, content }: Props) => {
  const [card, title] = timing.beats;
  return (
    <StyleProvider style={style}>
      <Background beat={{ start_frame: 0, end_frame: 30 }} seed="fullscreen-card" />
      <SafeArea style={{ justifyContent: "center", alignItems: "center", gap: 40 }}>
        <KineticText text={content.title} beat={title!} mode="words" enter="rise" size={4} />
        <Card elevation={2} beat={card!} enter="rise" accentIndex={0} width={520} height={220}>
          <div style={{ fontFamily: '"Inter", sans-serif', fontWeight: 700, fontSize: 96 }}>{content.value}</div>
        </Card>
      </SafeArea>
    </StyleProvider>
  );
};
