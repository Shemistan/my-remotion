// Evidence галереи хореографии motion-kit: реальный рендер фикстуры choreo-gallery и
// JPEG-кадры в docs/evidence/phase-1/kit-v0.2/choreo/ (960 px, малый вес).
// Запуск: `./scripts/with-node.sh npx tsx scripts/kit-evidence.mts` из app/motion-studio.
// Полноразмерные PNG остаются в tmp/kit-evidence-*/ репозитория для просмотра.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRenderBrowser } from "../render/src/node/browser.ts";
import { renderVersion } from "../render/src/node/render-version.ts";
import { REPO_TMP, copyFixture, fixtureSettings, makeStore } from "../render/test/helpers.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const OUT = join(REPO, "docs/evidence/phase-1/kit-v0.2/choreo");
const KEY = [0, 12, 24, 45, 90, 179];
const MID = [8, 16, 26, 34];

await ensureRenderBrowser();
mkdirSync(REPO_TMP, { recursive: true });
const work = mkdtempSync(join(REPO_TMP, "kit-evidence-"));
mkdirSync(join(work, "cache"));
const r = await renderVersion({
  versionDir: await copyFixture("choreo-gallery", join(work, "v")),
  settings: await fixtureSettings("choreo-gallery"),
  cacheDir: join(work, "cache"),
  stills: [...new Set([...KEY, ...MID])].sort((a, b) => a - b),
  preview: { scale: 0.5, crf: 23 },
  timeoutMs: 240_000,
  run: { root: await makeStore(work), runId: "evidence", attempt: 1 },
});
if (!r.ok) throw new Error(`рендер не удался: ${JSON.stringify(r.error)}`);

const png = (f: number) => join(work, "v", "frames", `${f}.png`);
const ff = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
mkdirSync(OUT, { recursive: true });
for (const f of KEY) ff(["-i", png(f), "-vf", "scale=960:-1", "-q:v", "3", join(OUT, `choreo-${f}.jpg`)]);
// полоса середин входов: 4 кадра столбиком по 640 px
const inputs = MID.flatMap((f) => ["-i", png(f)]);
const scaled = MID.map((_, i) => `[${i}]scale=640:-1[s${i}]`).join(";");
const stack = `${MID.map((_, i) => `[s${i}]`).join("")}vstack=${MID.length}`;
ff([...inputs, "-filter_complex", `${scaled};${stack}`, "-q:v", "3", join(OUT, `choreo-mid-${MID.join("-")}.jpg`)]);
console.log(`evidence: ${OUT}\nполные кадры: ${join(work, "v", "frames")}`);
