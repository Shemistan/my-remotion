// Видеосцена-оверлей (Task 36, Р-V5): холст на весь кадр, графика — только в props.layout.rect
// (зона lower_third). Версия непрозрачная (фон Background); на таймлайне её делает прозрачной
// overlayInputProps (style.transparent = true), и вне rect виден исходник.
import { Background, KineticText, LayoutRect, StyleProvider, type ResolveStyleInput } from "@ms/motion-kit";

type Beat = { id: string; start_frame: number; end_frame: number };
type Props = {
  timing: { duration_frames: number; beats: Beat[] };
  style: Omit<ResolveStyleInput, "fps">;
  content: { title: string };
  layout?: { rect: { x: number; y: number; w: number; h: number } };
};

export const Scene = ({ timing, style, content, layout }: Props) => (
  <StyleProvider style={style}>
    <Background beat={{ start_frame: 0, end_frame: 30 }} seed="overlay-lower-third" />
    <LayoutRect rect={layout?.rect}>
      <div style={{ position: "absolute", inset: 0, background: "#1d4ed8", display: "flex", alignItems: "center", paddingLeft: 48 }}>
        <KineticText text={content.title} beat={timing.beats[0]!} mode="words" enter="fade" size={4} />
      </div>
    </LayoutRect>
  </StyleProvider>
);
