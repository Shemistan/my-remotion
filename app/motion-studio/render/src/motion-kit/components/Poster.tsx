// Кадр-постер для примитивов со своим входом (0.4.0): до начала бита компонент показан в
// виде каркаса итога (Freeze на конце бита, формы без текста) — кадр 0 уже собран. С начала
// бита идёт живой вход, а каркас (S2-fix I4) лежит под ним слоем `underlay` и гаснет за бит:
// бит с кадра 0 тоже даёт постер, на смене каркас → живой нет провала. Корень компонента
// получает стиль слоя (posterStyle) последним — поверх своего `style`.
import type { Beat } from "@ms/contracts";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Freeze, useCurrentFrame } from "remotion";
import { PRE_ALPHA, posterAlpha, posterStyle } from "../choreo/enter.js";

export function PosterGate({ pre = "silhouette", beat, render }: { pre?: "silhouette" | "hidden"; beat: Pick<Beat, "start_frame" | "end_frame">; render: (css: CSSProperties | undefined, underlay?: ReactNode) => ReactElement }) {
  const frame = useCurrentFrame();
  if (pre === "hidden") return render(undefined);
  const end = Math.max(beat.end_frame, beat.start_frame);
  const poster = (css: CSSProperties) => <Freeze frame={end}>{render({ ...posterStyle("silhouette", 0), ...css })}</Freeze>;
  if (frame < beat.start_frame) return poster({ opacity: PRE_ALPHA.silhouette });
  const under = posterAlpha("silhouette", frame, beat.start_frame, end - beat.start_frame);
  if (under <= 0) return render(undefined);
  // каркас — первым ребёнком живого корня, под его содержимым (корень изолирует стопку)
  return render({ isolation: "isolate" }, <div aria-hidden style={{ position: "absolute", left: 0, top: 0, zIndex: -1, pointerEvents: "none" }}>{poster({ opacity: under, position: "absolute", left: 0, top: 0, right: "auto", bottom: "auto", margin: 0 })}</div>);
}
