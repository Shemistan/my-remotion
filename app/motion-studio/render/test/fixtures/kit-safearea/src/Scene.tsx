// SafeArea: AbsoluteFill внутри отсчитывается от безопасной зоны, раскладка из style
// (justifyContent: space-between) действует на детей. Кадр проверяется по пикселям.
import { SafeArea, StyleProvider } from "@ms/motion-kit";
import { AbsoluteFill } from "remotion";

export const Scene = () => (
  <StyleProvider style="dark-premium">
    <AbsoluteFill style={{ background: "#000000" }} />
    <SafeArea style={{ justifyContent: "space-between" }}>
      <AbsoluteFill style={{ background: "#ff0000" }} />
      <div style={{ position: "relative", height: 40, background: "#00ff00" }} />
      <div style={{ position: "relative", height: 40, background: "#00ff00" }} />
    </SafeArea>
  </StyleProvider>
);
