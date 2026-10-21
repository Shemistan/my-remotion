// Кадр-постер для примитивов со своим входом (0.4.0): до начала бита компонент показан в
// виде каркаса итога (Freeze на конце бита, формы без текста) — кадр 0 уже собран, затем
// с начала бита идёт живой вход. Корень компонента получает стиль слоя (posterStyle).
import type { Beat } from "@ms/contracts";
import type { CSSProperties, ReactElement } from "react";
import { Freeze, useCurrentFrame } from "remotion";
import { posterStyle } from "../choreo/enter.js";

export function PosterGate({ pre = "silhouette", beat, render }: { pre?: "silhouette" | "hidden"; beat: Pick<Beat, "start_frame" | "end_frame">; render: (css: CSSProperties | undefined) => ReactElement }) {
  const frame = useCurrentFrame();
  if (pre === "hidden" || frame >= beat.start_frame) return render(undefined);
  return <Freeze frame={Math.max(beat.end_frame, beat.start_frame)}>{render(posterStyle("silhouette", 0))}</Freeze>;
}
