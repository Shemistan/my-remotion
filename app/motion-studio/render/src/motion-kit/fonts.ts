// Шрифты kit: Inter, Manrope, JetBrains Mono (OFL-1.1, fonts/OFL.txt), подмножества
// latin и cyrillic. woff2 импортируются как ассеты webpack (asset/resource) и лежат
// внутри motion-kit: сеть и public/ версии не нужны, а содержимое шрифтов входит в
// contentKey бандла. Файлы обновляет scripts/sync-fonts.mjs.
import { loadFont } from "@remotion/fonts";
import Inter400Latin from "./fonts/Inter-400-latin.woff2";
import Inter400Cyrillic from "./fonts/Inter-400-cyrillic.woff2";
import Inter500Latin from "./fonts/Inter-500-latin.woff2";
import Inter500Cyrillic from "./fonts/Inter-500-cyrillic.woff2";
import Inter600Latin from "./fonts/Inter-600-latin.woff2";
import Inter600Cyrillic from "./fonts/Inter-600-cyrillic.woff2";
import Inter700Latin from "./fonts/Inter-700-latin.woff2";
import Inter700Cyrillic from "./fonts/Inter-700-cyrillic.woff2";
import Manrope600Latin from "./fonts/Manrope-600-latin.woff2";
import Manrope600Cyrillic from "./fonts/Manrope-600-cyrillic.woff2";
import Manrope700Latin from "./fonts/Manrope-700-latin.woff2";
import Manrope700Cyrillic from "./fonts/Manrope-700-cyrillic.woff2";
import Manrope800Latin from "./fonts/Manrope-800-latin.woff2";
import Manrope800Cyrillic from "./fonts/Manrope-800-cyrillic.woff2";
import JetBrainsMono400Latin from "./fonts/JetBrainsMono-400-latin.woff2";
import JetBrainsMono400Cyrillic from "./fonts/JetBrainsMono-400-cyrillic.woff2";
import JetBrainsMono500Latin from "./fonts/JetBrainsMono-500-latin.woff2";
import JetBrainsMono500Cyrillic from "./fonts/JetBrainsMono-500-cyrillic.woff2";
import JetBrainsMono700Latin from "./fonts/JetBrainsMono-700-latin.woff2";
import JetBrainsMono700Cyrillic from "./fonts/JetBrainsMono-700-cyrillic.woff2";

// unicode-range подмножеств @fontsource (одинаковы для трёх семейств)
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const CYRILLIC = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";

/** Семейства и начертания, которые kit гарантирует. */
export const FONT_FILES: readonly { family: string; weight: string; range: string; url: string }[] = [
  { family: "Inter", weight: "400", range: LATIN, url: Inter400Latin },
  { family: "Inter", weight: "400", range: CYRILLIC, url: Inter400Cyrillic },
  { family: "Inter", weight: "500", range: LATIN, url: Inter500Latin },
  { family: "Inter", weight: "500", range: CYRILLIC, url: Inter500Cyrillic },
  { family: "Inter", weight: "600", range: LATIN, url: Inter600Latin },
  { family: "Inter", weight: "600", range: CYRILLIC, url: Inter600Cyrillic },
  { family: "Inter", weight: "700", range: LATIN, url: Inter700Latin },
  { family: "Inter", weight: "700", range: CYRILLIC, url: Inter700Cyrillic },
  { family: "Manrope", weight: "600", range: LATIN, url: Manrope600Latin },
  { family: "Manrope", weight: "600", range: CYRILLIC, url: Manrope600Cyrillic },
  { family: "Manrope", weight: "700", range: LATIN, url: Manrope700Latin },
  { family: "Manrope", weight: "700", range: CYRILLIC, url: Manrope700Cyrillic },
  { family: "Manrope", weight: "800", range: LATIN, url: Manrope800Latin },
  { family: "Manrope", weight: "800", range: CYRILLIC, url: Manrope800Cyrillic },
  { family: "JetBrains Mono", weight: "400", range: LATIN, url: JetBrainsMono400Latin },
  { family: "JetBrains Mono", weight: "400", range: CYRILLIC, url: JetBrainsMono400Cyrillic },
  { family: "JetBrains Mono", weight: "500", range: LATIN, url: JetBrainsMono500Latin },
  { family: "JetBrains Mono", weight: "500", range: CYRILLIC, url: JetBrainsMono500Cyrillic },
  { family: "JetBrains Mono", weight: "700", range: LATIN, url: JetBrainsMono700Latin },
  { family: "JetBrains Mono", weight: "700", range: CYRILLIC, url: JetBrainsMono700Cyrillic },
];

export const KIT_FONT_FAMILIES = ["Inter", "Manrope", "JetBrains Mono"] as const;

let started = false;

/**
 * Загружает все шрифты kit (идемпотентно). loadFont держит delayRender до загрузки,
 * так что первый кадр рендерится уже нужным шрифтом. Зовётся при импорте
 * `@ms/motion-kit`; сцене звать не нужно, но можно.
 */
export function ensureFonts(): void {
  if (started) return;
  started = true;
  for (const f of FONT_FILES) {
    void loadFont({ family: f.family, url: f.url, weight: f.weight, unicodeRange: f.range, display: "block", format: "woff2" });
  }
}
