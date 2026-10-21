export { ensureRenderBrowser, findRenderBrowser } from "./browser.js";
export { APP_NODE_MODULES, MOTION_KIT_DIR, contentKey, writeEntry } from "./entry.js";
export { type ProbeResult, ffprobe, h264Size, probeGate } from "./ffprobe.js";
export { reapStrayRenderers } from "./processes.js";
export { type RenderRequest, type RenderResult, type RenderStage, renderVersion } from "./render-version.js";
// Чистые расчёты стиля kit (без React и шрифтов) — для QA и пайплайна на сервере.
export { type ResolveStyleInput, type ResolvedStyle, resolveStyle } from "../motion-kit/style/resolve.js";
export { contrastRatio, relativeLuminance } from "../motion-kit/style/contrast.js";
export { type Rect, safeRect } from "../motion-kit/choreo/safe-area.js";
