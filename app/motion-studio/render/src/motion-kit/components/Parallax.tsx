// Слой параллакса внутри <Camera>: движение камеры × (1 + 0.15·layer). Слой 0 — как
// камера (дальний план), 2 — ближний, едет сильнее. Только при camera.parallax стиля.
// Слои > 0 чуть крупнее кадра (PARALLAX_OVERSCAN): край ближнего плана не открывается.
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { parallaxTransform } from "../choreo/camera.js";
import { useStyle } from "../style.js";
import { useCamera } from "./Camera.js";

export interface ParallaxProps {
  layer: 0 | 1 | 2;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Parallax({ layer, children, style }: ParallaxProps) {
  const s = useStyle();
  const cam = useCamera();
  const { width, height } = useVideoConfig();
  // слой > 0 с запасом за край кадра (overscan): ближний план не открывает края
  const t = s.camera.parallax ? parallaxTransform(cam, layer, { width, height }) : { scale: 1, x: 0, y: 0 };
  const transform = t.scale === 1 && t.x === 0 && t.y === 0 ? undefined : `translate(${t.x.toFixed(3)}px, ${t.y.toFixed(3)}px) scale(${t.scale.toFixed(5)})`;
  return <AbsoluteFill style={{ transformOrigin: "50% 50%", transform, ...style }}>{children}</AbsoluteFill>;
}
