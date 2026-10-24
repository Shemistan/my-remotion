// @ms/motion-kit — детерминированные компоненты Remotion для сцен AI Motion Studio.
// Справка для агента — API.md, происхождение — PROVENANCE.md.
import { ensureFonts } from "./fonts.js";

// шрифты kit грузятся при импорте: первый кадр уже нужным шрифтом
ensureFonts();

/** Версия API kit (API.md): 0.2 — StyleBible-система, хореография, примитивы паттернов ТЗ §8.4; 0.2.1 — Emphasis/Halo, акцент точки LineChart, входы и вспышки узлов FlowGraph (аддитивно); 0.2.2 — FlowNode.emphasis, AccentPulse.swell (аддитивно); 0.3.0 — кольцо акцента только на ударе по умолчанию, шторка mask с мягкой кромкой 14–18 кадров, FlowNode.size, Background seed/focus/spotlight/blueprint, useArrivalCount, StatusChip, DataToken, LatencyRace, SceneTitle (меняет вид существующих сцен, API — обратно совместим); 0.3.1 — полировка после дизайн-ревью: FlowNode.slot и DataToken в слот, разная грамматика StatusChip / DataToken, LatencyRace от высоты кадра, различимые blueprint / spotlight, свечение Emphasis за текстом, сообщения kit о неверном использовании (аддитивно); 0.4.0 — плохое движение трудно выразить: DataToken без копий текста (штрих-след, путь по линии, полоса узла / consume), FlowNode.kind (облик по роли), места данных и статуса узла, кадр-постер (pre-силуэты, фон с кадра 0), предел кегля 22 px, ось ≤ 4 делений, разметка реестра раскладки для QA (меняет вид существующих сцен, API — обратно совместим); 0.4.1 — ошибки kit `[motion-kit:error]` (QA kit_misuse): ёмкость `cells` буфера queue, токен раньше готовности ребра; ярлык компактного токена подписью связи (аддитивно); 0.4.2 — DataToken: запись в полосу без шторки, передача токена без двойника, постер под сдвигающим входом гаснет за 1/6; планировщик ритма: полоса удара по структуре, phaseTokens (меняет вид существующих сцен, API — обратно совместим); 0.5.0 — hold engine: живой финал по режиму удержания (`hold` у FlowGraph, LineChart, LatencyRace, Timeline, Emphasis, Camera; useHold, Comet, RadarRing, TickLabel), потоки графа в удержании стоят, кроме steady-flow (без `hold` — как раньше; аддитивно); 0.5.1 — планировщик ритма: полосы удара сдвигаются вместе под длинный вывод (ширина и порядок структур), главный акцент payoff входит целиком, setup графа не короче прорисовки рёбер (graphSetupMin), импульс со вспышкой прихода гаснет к удару (меняет кадры сцен с фазами, API — обратно совместим); 0.5.2 — S3-fix: передача акцента Emphasis в финал без скачка (emphasisHold), подпись тика repeat-result по приходу (repeatTick), герой графа дышит только в now-pulse / repeat-result / settle-push, steady-flow ведёт потоки с бита hold и держит каскад, блик data-shimmer графа — цепочкой к герою (shimmerPaths), блик repeat-result к тику у LineChart / Timeline, без подписи тика у гонки, settlePushHeadroom и kitWarn, хвост длинной сцены в секундах (HOLD_MAX_S, PAYOFF_MAX_S) (меняет вид финалов и кадры длинных сцен, API — обратно совместим); 0.5.3 — S3-fix2: метки пробы QA от движения (импульс steady-flow в пути, волна героя, повтор, блик), а не от включённого режима, привязка меток к кадру, kitWarn у steady-flow без потока; cold-open — крючок, а не спойлер (ColdOpen / useColdOpen / coldOpenAt: итог в полную силу с кадра 0, уходит целиком, возвращается на ударе), постер с текстом (`ghost` у Enter, `dim` у KineticText) — только у текста первых 1,5 с (меняет вид cold-open и поздних текстов с постером, API — аддитивно). */
export const MOTION_KIT_VERSION = "0.5.3";

export { ensureFonts, FONT_FILES, KIT_FONT_FAMILIES } from "./fonts.js";
export { type PresetId, presets } from "./presets.js";
export { LAYOUT_TAG, type LayoutFrame, type LayoutItem, type RawText, VISIBLE_OPACITY, summarizeLayout } from "./layout-probe.js";
export { StyleProvider, type StyleSource, toResolved, useStyle } from "./style.js";
export { type Depth, type PaletteOverrides, type ResolveStyleInput, type ResolvedStyle, resolveStyle } from "./style/resolve.js";
export { contrastRatio, relativeLuminance } from "./style/contrast.js";
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
export { type ComparisonSide, ComparisonSplit, type ComparisonSplitProps } from "./components/ComparisonSplit.js";
export { Highlight, type HighlightProps } from "./components/Highlight.js";
export { Particles, type ParticlesProps } from "./components/Particles.js";
export { ProcessSteps, type ProcessStepsProps, stepStarts } from "./components/ProcessSteps.js";
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
