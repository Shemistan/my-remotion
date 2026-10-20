// Сцена с одной ошибкой типов: номер кадра присвоен строке.
import { AbsoluteFill, useCurrentFrame } from "remotion";

export const Scene = () => {
  const frame: string = useCurrentFrame();
  return <AbsoluteFill>{frame}</AbsoluteFill>;
};
