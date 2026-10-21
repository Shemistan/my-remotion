// @ms/motion-kit — детерминированные компоненты Remotion для сцен AI Motion Studio.
// Справка для агента — API.md, происхождение — PROVENANCE.md.
import { ensureFonts } from "./fonts.js";

// шрифты kit грузятся при импорте: первый кадр уже нужным шрифтом
ensureFonts();

/** Версия API kit (API.md): 0.2.0 — StyleBible-система и хореография. */
export const MOTION_KIT_VERSION = "0.2.0";

export { ensureFonts, FONT_FILES, KIT_FONT_FAMILIES } from "./fonts.js";
export { type PresetId, presets } from "./presets.js";
export { StyleProvider, type StyleSource, toResolved, useStyle } from "./style.js";
export { type Depth, type PaletteOverrides, type ResolveStyleInput, type ResolvedStyle, resolveStyle } from "./style/resolve.js";
export { contrastRatio, relativeLuminance } from "./style/contrast.js";
export { TYPE_LEVELS, type TypeLevel } from "./style/type-scale.js";
export { INTENSITY, amplitudeOf } from "./style/intensity.js";
export { type EnterDirection, type EnterKind, type EnterOptions, enterStyle } from "./choreo/enter.js";
export { staggerBeat } from "./choreo/stagger.js";
export { type CameraKey, type CameraState, cameraAt, cameraTransform, parallaxFactor, parallaxTransform } from "./choreo/camera.js";
export { type Rect, safeRect, styleSafeRect } from "./choreo/safe-area.js";
export { edgeDelay, kineticStep, typeRhythm } from "./choreo/rhythm.js";
export { gridColumns, layoutLayered } from "./choreo/layout.js";
export { type BeatPhase, type BeatState, type BeatWindow, beatPhase, beatProgress, useBeat } from "./beat.js";
export { EASE, type EasingFn, type EasingRole, type SpringRole, easingOf, fpsFrames, frames, springAt, springConfig } from "./easing.js";
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
  type Box,
  type Elevation,
  type FontRef,
  type Intensity,
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
export { Camera, type CameraProps, useCamera } from "./components/Camera.js";
export { Card, type CardEnter, type CardProps, cardEnterStyle, cardSurface, depthElevation } from "./components/Card.js";
export { Enter, type EnterProps } from "./components/Enter.js";
export { Parallax, type ParallaxProps } from "./components/Parallax.js";
export { type FlowEdge, FlowGraph, type FlowGraphProps, type FlowNode, edgePath, useFlowGeometry } from "./components/FlowGraph.js";
export { KineticText, type KineticEnter, type KineticTextProps } from "./components/KineticText.js";
export { LineChart, type LineChartProps, lineChartHead } from "./components/LineChart.js";
export { PulseAlongPath, type PulseAlongPathProps } from "./components/PulseAlongPath.js";
export { SafeArea, useSafeArea } from "./components/SafeArea.js";
