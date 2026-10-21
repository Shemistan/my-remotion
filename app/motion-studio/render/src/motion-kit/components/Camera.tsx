// Камера сцены: наезд и панорама по ключам (MotionSpec.camera). Масштаб не больше
// camera.max_scale стиля. Панорама — только в запасе наезда (`panLimit`): кадр никогда не
// выходит за сцену и safe area не уходит за край; без наезда камера стоит. Слои
// <Parallax> внутри двигаются сильнее или слабее камеры.
import type { CSSProperties, ReactNode } from "react";
import { createContext, useContext } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { type CameraKey, type CameraState, cameraAt, cameraTransform } from "../choreo/camera.js";
import { useStyle } from "../style.js";

const CameraContext = createContext<CameraState>({ scale: 1, x: 0, y: 0 });

/** Положение камеры ближайшего <Camera> в текущем кадре (вне камеры — покой). */
export const useCamera = () => useContext(CameraContext);

export interface CameraProps {
  keys: CameraKey[];
  children?: ReactNode;
  style?: CSSProperties;
}

export function Camera({ keys, children, style }: CameraProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // панорама зажата по размеру кадра: края фона не открываются, safe area в кадре
  const cam = cameraAt(frame, keys, s, { width, height });
  return (
    <CameraContext.Provider value={cam}>
      <AbsoluteFill style={{ transformOrigin: "50% 50%", transform: cameraTransform(cam), ...style }}>{children}</AbsoluteFill>
    </CameraContext.Provider>
  );
}
