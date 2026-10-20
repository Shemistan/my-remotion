// Копирует woff2 (подмножества latin и cyrillic) из devDependencies @fontsource/* в
// render/src/motion-kit/fonts/ и собирает OFL.txt из их лицензий. Результат коммитится:
// рендер не зависит от node_modules и сети. Запуск: ./scripts/with-node.sh node scripts/sync-fonts.mjs
/* global URL, console */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(APP, "render", "src", "motion-kit", "fonts");

/** Семейство → пакет, префикс файлов и начертания. Список синхронен с motion-kit/fonts.ts. */
const FONTS = [
  { name: "Inter", pkg: "inter", weights: [400, 500, 600, 700] },
  { name: "Manrope", pkg: "manrope", weights: [600, 700, 800] },
  { name: "JetBrainsMono", pkg: "jetbrains-mono", weights: [400, 500, 700] },
];
const SUBSETS = ["latin", "cyrillic"];

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".woff2") || f === "OFL.txt") rmSync(join(OUT, f));

const licenses = [];
for (const font of FONTS) {
  const dir = join(APP, "node_modules", "@fontsource", font.pkg);
  const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  for (const w of font.weights) {
    for (const subset of SUBSETS) {
      const src = join(dir, "files", `${font.pkg}-${subset}-${w}-normal.woff2`);
      copyFileSync(src, join(OUT, `${font.name}-${w}-${subset}.woff2`));
    }
  }
  licenses.push(`=== ${font.name} (@fontsource/${font.pkg}@${version}) ===\n\n${readFileSync(join(dir, "LICENSE"), "utf8").trim()}\n`);
}
writeFileSync(join(OUT, "OFL.txt"), licenses.join("\n"));
console.log(`sync-fonts: ${FONTS.reduce((n, f) => n + f.weights.length * SUBSETS.length, 0)} файлов → ${OUT}`);
