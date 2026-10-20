// @ms/motion-kit — детерминированные компоненты Remotion для сцен AI Motion Studio.
// Справка для агента — API.md, происхождение — PROVENANCE.md.
import { ensureFonts } from "./fonts.js";

// шрифты kit грузятся при импорте: первый кадр уже нужным шрифтом
ensureFonts();

export { ensureFonts, FONT_FILES, KIT_FONT_FAMILIES } from "./fonts.js";
export { type PresetId, presets } from "./presets.js";
export { StyleProvider, useStyle } from "./style.js";
export { type BeatPhase, type BeatState, type BeatWindow, beatPhase, beatProgress, useBeat } from "./beat.js";
export { EASE, type EasingFn, type EasingRole, type SpringRole, easingOf, frames, springAt, springConfig } from "./easing.js";
export { type FormatOptions, formatNumber } from "./format.js";
export {
  type CubicSegment,
  type PathLUT,
  type Point,
  cubicPoint,
  edgeSegment,
  lutLength,
  niceTicks,
  pathD,
  pathLUT,
  pointAtLength,
  pointsBetween,
  polylineD,
  smoothSegments,
} from "./geometry.js";
export {
  type Elevation,
  type FontRef,
  type Intensity,
  type Rect,
  accent,
  alpha,
  fontFamily,
  intensityScale,
  isDark,
  luminance,
  mix,
  radius,
  safeAreaPx,
  shadow,
  space,
  surfaceAt,
  tracking,
  typeSize,
} from "./tokens.js";

export { AnimatedNumber, type AnimatedNumberProps } from "./components/AnimatedNumber.js";
export { Background, type BackgroundProps, type BackgroundVariant } from "./components/Background.js";
export { Card, type CardEnter, type CardProps, cardEnterStyle, cardSurface } from "./components/Card.js";
export { type FlowEdge, FlowGraph, type FlowGraphProps, type FlowNode, edgePath, useFlowGeometry } from "./components/FlowGraph.js";
export { KineticText, type KineticEnter, type KineticTextProps } from "./components/KineticText.js";
export { LineChart, type LineChartProps } from "./components/LineChart.js";
export { PulseAlongPath, type PulseAlongPathProps } from "./components/PulseAlongPath.js";
export { SafeArea, useSafeArea } from "./components/SafeArea.js";
