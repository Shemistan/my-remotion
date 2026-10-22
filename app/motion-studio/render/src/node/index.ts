export { ensureRenderBrowser, findRenderBrowser } from "./browser.js";
export { APP_NODE_MODULES, MOTION_KIT_DIR, contentKey, writeEntry } from "./entry.js";
export { type ProbeResult, ffprobe, h264Size, probeGate } from "./ffprobe.js";
export { type Proc, reapStrayRenderers } from "./processes.js";
export { type RenderRequest, type RenderResult, type RenderStage, renderVersion } from "./render-version.js";
// Чистые расчёты стиля kit (без React и шрифтов) — для QA и пайплайна на сервере.
export { type ResolveStyleInput, type ResolvedStyle, resolveStyle } from "../motion-kit/style/resolve.js";
export { contrastRatio, relativeLuminance } from "../motion-kit/style/contrast.js";
export { type Rect, safeRect } from "../motion-kit/choreo/safe-area.js";
export { type TypeLevel, typeSize } from "../motion-kit/style/type-scale.js";
export { lineDrawWindow } from "../motion-kit/line-window.js";
export { ARRIVAL_PX, EASE_PASS, PULSE_MIN_S, PULSE_PX_PER_S, arrivalInPass, cubicBezier, pulsePass, pulseStarts } from "../motion-kit/choreo/pulse-timing.js";
export { type BeatPlan, type PlanInput, type PlanPhase, type PlannedBeat, STRUCTURES, planBeats, readingFrames } from "../motion-kit/choreo/plan.js";
