// @ms/motion-kit — детерминированные компоненты Remotion для сцен AI Motion Studio.
// Справка для агента — API.md, происхождение — PROVENANCE.md.
import { ensureFonts } from "./fonts.js";

// шрифты kit грузятся при импорте: первый кадр уже нужным шрифтом
ensureFonts();

export { MOTION_KIT_VERSION } from "./version.js";

export { ensureFonts, FONT_FILES, KIT_FONT_FAMILIES } from "./fonts.js";
export { type PresetId, presets } from "./presets.js";
export { LAYOUT_TAG, type LayoutBox, type LayoutFrame, type LayoutItem, type RawBox, type RawText, VISIBLE_OPACITY, areaShares, summarizeBoxes, summarizeLayout } from "./layout-probe.js";
export { StyleProvider, type StyleSource, toResolved, useStyle } from "./style.js";
export { type Depth, type PaletteOverrides, type ResolveStyleInput, type ResolvedStyle, resolveStyle } from "./style/resolve.js";
export { contrastRatio, relativeLuminance } from "./style/contrast.js";
export { dimText, textHalo, withHalo } from "./style/halo.js";
export { MIN_TEXT_PX, TYPE_LEVELS, type TypeLevel, floorText, minTextPx, sizePx } from "./style/type-scale.js";
export { INTENSITY, amplitudeOf } from "./style/intensity.js";
export { type EnterDirection, type EnterKind, type EnterOptions, type EnterPre, MASK_FEATHER, PRE_ALPHA, enterStyle, posterStyle } from "./choreo/enter.js";
export { staggerBeat } from "./choreo/stagger.js";
export { ACCENT_REST, type AccentPulse, type AccentPulseOptions, accentPulse } from "./choreo/accent.js";
export { type ArrivalCount, type FlowHoldCtx, type PathArrival, type PulseArrival, STEADY_RECENT_S, arrivalCount, pathArrivals, pathStarts, pulseArrival, steadyContinues, steadyLive } from "./choreo/pulse.js";
export { HOLD_MODES, HOLD_PROBE, HOLD_RATE, type Hold, type HoldFrame, anchoredStarts, holdAt, holdTicks, holdTiming, repeatTick, steadyStarts, tickLabel } from "./choreo/hold.js";
export { CardRadar, Comet, RadarRing, TickLabel, useHold } from "./components/HoldLayers.js";
export { type ColdOpenFrame, coldOpenAt, coldOpenStyle, coldOpenTiming } from "./choreo/cold-open.js";
export { ColdOpen, useColdOpen } from "./components/ColdOpen.js";
export { type CameraKey, type CameraState, type FrameSize, SETTLE_PUSH, cameraAt, cameraHoldAt, cameraTransform, settlePushHeadroom, panLimit, zoomLimit, parallaxFactor, parallaxTransform, PARALLAX_OVERSCAN } from "./choreo/camera.js";
export { type Rect, safeRect, styleSafeRect } from "./choreo/safe-area.js";
export { edgeDelay, kineticStep, typeRhythm } from "./choreo/rhythm.js";
export { type BeatPlan, type PlanInput, type PlanPhase, type PhaseTokens, type PlannedBeat, HOLD_MAX_S, PAYOFF_MAX_S, STRUCTURES, TAKEAWAY_BAND, phaseTokens, planBeats, readingFrames } from "./choreo/plan.js";
export { gridColumns, layoutLayered } from "./choreo/layout.js";
export { type BeatPhase, type BeatState, type BeatWindow, beatPhase, beatProgress, useBeat } from "./beat.js";
export { EASE, type EasingFn, type EasingRole, type SpringRole, easingOf, fpsFrames, frames, springAt, springConfig } from "./easing.js";
export { type FormatOptions, type PluralForms, formatNumber, pluralForm } from "./format.js";
export { axisTicks, niceTicks } from "./ticks.js";
export { barLayout } from "./bars.js";
export { type CodeFragment, type CodeLang, type CodeToken, type TokenKind, caretLine, codeLines, tokenizeCode, typedTokens } from "./code-tokens.js";
export { datePosition, TIMELINE_LABEL_MIN, type TimelineFit, type TimelineScale, type TimelineTick, timelineFit, timelineLayout, timelineLayoutFor, timelineScale } from "./timeline-layout.js";
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
  hueDistance,
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
export { type ComparisonSide, ComparisonSplit, type ComparisonSplitProps, metricShare } from "./components/ComparisonSplit.js";
export { Highlight, type HighlightProps } from "./components/Highlight.js";
export { Particles, type ParticlesProps } from "./components/Particles.js";
export { ProcessSteps, type ProcessStepsProps, STEP_DIM, stepDim, stepStarts } from "./components/ProcessSteps.js";
export { Timeline, type TimelineProps } from "./components/Timeline.js";
export { Background, type BackgroundBlob, type BackgroundProps, type BackgroundVariant, backgroundLayout, backgroundReveal } from "./components/Background.js";
export { Camera, type CameraProps, useCamera } from "./components/Camera.js";
export { Card, type CardEnter, type CardProps, cardEnterStyle, cardSurface, depthElevation } from "./components/Card.js";
export { Emphasis, type EmphasisProps, HALO_FALLOFF, Halo, type HaloProps, emphasisFilter, emphasisHold, holdAccent, emphasisRingVisible, falloff, haloLevel, useAccentPulse } from "./components/Emphasis.js";
export { Enter, type EnterProps, enterDuration } from "./components/Enter.js";
export { Parallax, type ParallaxProps } from "./components/Parallax.js";
export { type FlowEdge, FlowGraph, type FlowGraphProps, type FlowHold, type FlowNode, type FlowSlot, cacheFill, flowHoldPlan, heroBreath, shimmerPaths, edgePath, flowLabelSizes, flowSlot, flowTiming, useFlowGeometry } from "./components/FlowGraph.js";
export { FLOW_KINDS, type FlowNodeKind, type FlowStatusSlot, flowLabelZone, flowStatusSlot, queueCellCenter, queueCells, usedSides } from "./components/flow-layout.js";
export { KineticText, type KineticEnter, type KineticTextProps } from "./components/KineticText.js";
export { LineChart, type LineChartProps, chartFont, lineChartHead, lineHighlight } from "./components/LineChart.js";
export { PulseAlongPath, type PulseAlongPathProps, useArrivalCount } from "./components/PulseAlongPath.js";
export { SafeArea, useSafeArea } from "./components/SafeArea.js";
export { type StatusAnchor, StatusChip, type StatusChipProps, type StatusFrame, type StatusState, type StatusTone, statusAt, statusChipLook, toneColor } from "./components/StatusChip.js";
export { DataToken, type DataTokenProps, type TokenFrame, type TokenMode, type TokenShot, dataColor, dataTokenLook, tokenAt, tokenBox, tokenMode, tokenShot, tokenSpan } from "./components/DataToken.js";
export { type LaneFrame, type LaneTiming, type LatencyLane, LatencyRace, type LatencyRaceProps, type LaneReadout, type LatencyLayout, laneReadout, latencyAt, latencyLayout, latencyTiming } from "./components/LatencyRace.js";
export { SceneTitle, type SceneTitleProps, TITLE_IN_FLOW, type TitleMode } from "./components/SceneTitle.js";
