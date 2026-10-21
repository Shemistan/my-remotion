// @ms/motion-kit — детерминированные компоненты Remotion для сцен AI Motion Studio.
// Справка для агента — API.md, происхождение — PROVENANCE.md.
import { ensureFonts } from "./fonts.js";

// шрифты kit грузятся при импорте: первый кадр уже нужным шрифтом
ensureFonts();

/** Версия API kit (API.md): 0.2.0 — StyleBible-система, хореография и примитивы паттернов ТЗ §8.4. */
export const MOTION_KIT_VERSION = "0.2.0";

export { ensureFonts, FONT_FILES, KIT_FONT_FAMILIES } from "./fonts.js";
export { type PresetId, presets } from "./presets.js";
export { StyleProvider, type StyleSource, toResolved, useStyle } from "./style.js";
export { type Depth, type PaletteOverrides, type ResolveStyleInput, type ResolvedStyle, resolveStyle } from "./style/resolve.js";
export { contrastRatio, relativeLuminance } from "./style/contrast.js";
export { TYPE_LEVELS, type TypeLevel, sizePx } from "./style/type-scale.js";
export { INTENSITY, amplitudeOf } from "./style/intensity.js";
export { type EnterDirection, type EnterKind, type EnterOptions, enterStyle } from "./choreo/enter.js";
export { staggerBeat } from "./choreo/stagger.js";
export { type AccentPulse, type AccentPulseOptions, accentPulse } from "./choreo/accent.js";
export { type PulseArrival, pulseArrival } from "./choreo/pulse.js";
export { type CameraKey, type CameraState, type FrameSize, cameraAt, cameraTransform, panLimit, zoomLimit, parallaxFactor, parallaxTransform, PARALLAX_OVERSCAN } from "./choreo/camera.js";
export { type Rect, safeRect, styleSafeRect } from "./choreo/safe-area.js";
export { edgeDelay, kineticStep, typeRhythm } from "./choreo/rhythm.js";
export { gridColumns, layoutLayered } from "./choreo/layout.js";
export { type BeatPhase, type BeatState, type BeatWindow, beatPhase, beatProgress, useBeat } from "./beat.js";
export { EASE, type EasingFn, type EasingRole, type SpringRole, easingOf, fpsFrames, frames, springAt, springConfig } from "./easing.js";
export { type FormatOptions, formatNumber } from "./format.js";
export { niceTicks } from "./ticks.js";
export { barLayout } from "./bars.js";
export { type CodeFragment, type CodeLang, type CodeToken, type TokenKind, caretLine, codeLines, tokenizeCode, typedTokens } from "./code-tokens.js";
export { timelineLayout } from "./timeline-layout.js";
export {
  type CubicSegment,
  type PathLUT,
  type Point,
  cubicPoint,
  edgeSegment,
  lutLength,
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
export { AreaChart, type AreaChartProps } from "./components/AreaChart.js";
export { BarChart, type BarChartProps, barTimings } from "./components/BarChart.js";
export { Callout, type CalloutProps } from "./components/Callout.js";
export { CodeBlock, type CodeBlockProps, codeCharWidth, codeLineRect } from "./components/CodeBlock.js";
export { type ComparisonSide, ComparisonSplit, type ComparisonSplitProps } from "./components/ComparisonSplit.js";
export { Highlight, type HighlightProps } from "./components/Highlight.js";
export { Particles, type ParticlesProps } from "./components/Particles.js";
export { ProcessSteps, type ProcessStepsProps, stepStarts } from "./components/ProcessSteps.js";
export { Timeline, type TimelineProps } from "./components/Timeline.js";
export { Background, type BackgroundProps, type BackgroundVariant } from "./components/Background.js";
export { Camera, type CameraProps, useCamera } from "./components/Camera.js";
export { Card, type CardEnter, type CardProps, cardEnterStyle, cardSurface, depthElevation } from "./components/Card.js";
export { Emphasis, type EmphasisProps, Halo, type HaloProps, useAccentPulse } from "./components/Emphasis.js";
export { Enter, type EnterProps } from "./components/Enter.js";
export { Parallax, type ParallaxProps } from "./components/Parallax.js";
export { type FlowEdge, FlowGraph, type FlowGraphProps, type FlowNode, edgePath, flowTiming, useFlowGeometry } from "./components/FlowGraph.js";
export { KineticText, type KineticEnter, type KineticTextProps } from "./components/KineticText.js";
export { LineChart, type LineChartProps, chartFont, lineChartHead, lineHighlight } from "./components/LineChart.js";
export { PulseAlongPath, type PulseAlongPathProps } from "./components/PulseAlongPath.js";
export { SafeArea, useSafeArea } from "./components/SafeArea.js";
