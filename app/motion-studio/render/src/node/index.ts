export { ensureRenderBrowser, findRenderBrowser } from "./browser.js";
export { CACHE_KEY_RE, CACHE_USED_DIR, type CacheUse, cacheUsePath, markCacheUse } from "./cache-use.js";
export { configureRenderConcurrency, currentRenderConcurrency, renderConcurrency } from "./concurrency.js";
export { APP_NODE_MODULES, MOTION_KIT_DIR, contentKey, writeEntry } from "./entry.js";
export { type ProbeResult, ffprobe, findOnPath, h264Size, probeGate } from "./ffprobe.js";
export { type Proc, reapStrayRenderers } from "./processes.js";
export { type RenderRequest, type RenderResult, type RenderStage, type RunRef, renderVersion } from "./render-version.js";
export { EXPORT_TIMEOUT_MS, type ExportResult, type ExportStage, type ExportVersionRequest, exportProps, exportVersion } from "./export-version.js";
export { TEMPO_HOT_TILE, TEMPO_HOT_TILES_MIN, TEMPO_TILE_THRESHOLD, type TempoCheck, type TempoSample, tempoCheck } from "./tempo.js";
export { FfmpegError, type FfmpegOptions } from "./ffmpeg.js";
export { exportDurationFrames, exportFps, exportGate } from "./export-gate.js";
export { isOverlayUnsupported, overlayInputProps } from "./overlay-props.js";
// Task 36: единая композиция таймлайна (ADR 0010)
export type { TimelineRenderProps, TimelineSceneSpec } from "../timeline/types.js";
export { type SceneCheck, type SceneViolation, TIMELINE_COMPOSITION, type TimelineEntryInput, timelineKey, writeTimelineEntry } from "../timeline/entry.js";
export { type MediaServer, serveMedia } from "../timeline/media-server.js";
export {
  type TimelineOutput, type TimelineRenderRequest, type TimelineRenderResult, type TimelineStage, checkTimelineRequest, renderTimelineRange, timelineSceneProps,
} from "../timeline/render-range.js";
export { type AlphaCoverage, alphaAtCorner, alphaCoverage, overlayFrames } from "./alpha.js";
export { previewLuma } from "./motion.js";
export { SWEEP_ERROR_TAG, SWEEP_RETRY_TAG } from "./sweep.js";
// Чистые расчёты стиля kit (без React и шрифтов) — для QA и пайплайна на сервере.
export { KIT_FONTS, type ResolveStyleInput, type ResolvedStyle, resolveStyle } from "../motion-kit/style/resolve.js";
export { MOTION_KIT_VERSION } from "../motion-kit/version.js";
export { contrastRatio, relativeLuminance } from "../motion-kit/style/contrast.js";
export { type Rect, safeRect } from "../motion-kit/choreo/safe-area.js";
export { type TypeLevel, typeSize } from "../motion-kit/style/type-scale.js";
export { lineDrawWindow } from "../motion-kit/line-window.js";
export { HERO_NUMBER_SHARE, type HeroCandidate, type RawText, SWEEP_EVERY, SWEEP_TAG, type SweepFrame, gridDims, summarizeLayout, summarizeSweep, textLineItems } from "../motion-kit/layout-probe.js";
export { ARRIVAL_PX, EASE_PASS, PULSE_MIN_S, PULSE_PX_PER_S, arrivalInPass, cubicBezier, pulsePass, pulseStarts } from "../motion-kit/choreo/pulse-timing.js";
export { type BeatPlan, type PlanInput, type PlanPhase, type PhaseTokens, type PlannedBeat, STRUCTURES, TAKEAWAY_BAND, phaseTokens, planBeats, readingFrames } from "../motion-kit/choreo/plan.js";
export { graphSetupMin } from "../motion-kit/choreo/graph-timing.js";
