// Дефект Task 13 «камера сдвигает сцену»: наезд с панорамой вправо-вверх. `content.raw`
// — прежняя камера без зажима (как было в kit до Task 17): заголовок у левого края safe
// area уходит за край кадра, фон открывает полосы справа и сверху. Без `raw` — `<Camera>`
// kit: панорама зажата запасом наезда, кадр не выходит за сцену.
import type { ReactNode } from "react";
import {
  AnimatedNumber, Background, Camera, KineticText, Parallax, SafeArea, StyleProvider, cameraAt, cameraTransform, useStyle,
} from "@ms/motion-kit";
import { AbsoluteFill, useCurrentFrame } from "remotion";

type Win = { start_frame: number; end_frame: number };
interface Props {
  timing: { duration_frames: number; beats: (Win & { id: string })[] };
  style: { preset: "dark-premium"; intensity: "balanced"; depth: 1; transparent: false };
  content: { raw?: boolean };
}

const KEYS = [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 60, scale: 1.06, x: 170, y: -70 }];

function RawCamera({ children }: { children: ReactNode }) {
  const s = useStyle();
  const c = cameraAt(useCurrentFrame(), KEYS, s);
  return <AbsoluteFill style={{ transformOrigin: "50% 50%", transform: cameraTransform(c) }}>{children}</AbsoluteFill>;
}

export const Scene = ({ timing, style, content }: Props) => {
  const b = Object.fromEntries(timing.beats.map((x) => [x.id, x])) as Record<string, Win>;
  const body = (
    <>
      <Parallax layer={0}>
        <Background beat={{ start_frame: 0, end_frame: 20 }} seed="camera" />
      </Parallax>
      <Parallax layer={1}>
        <SafeArea>
          <KineticText text="Выручка растёт" beat={b.title!} mode="words" enter="rise" size="h1" />
          <div style={{ position: "absolute", left: 0, right: 0, top: "40%", display: "flex", justifyContent: "center" }}>
            <AnimatedNumber from={10_000} to={1_000_000} beat={b.count!} locale="ru" size={8} />
          </div>
        </SafeArea>
      </Parallax>
    </>
  );
  return (
    <StyleProvider style={style}>
      {content.raw ? <RawCamera>{body}</RawCamera> : <Camera keys={KEYS}>{body}</Camera>}
    </StyleProvider>
  );
};
