// Evidence галерей motion-kit: реальный рендер фикстур и малые JPEG в docs/evidence/.
// Запуск из app/motion-studio:
//   ./scripts/with-node.sh npx tsx scripts/kit-evidence.mts              # хореография (choreo-gallery)
//   ./scripts/with-node.sh npx tsx scripts/kit-evidence.mts patterns     # все сцены patterns-gallery
//   ./scripts/with-node.sh npx tsx scripts/kit-evidence.mts patterns code timeline
//   ./scripts/with-node.sh npx tsx scripts/kit-evidence.mts patterns timeline:orientation=v   # вариант (props.content)
//   ./scripts/with-node.sh npx tsx scripts/kit-evidence.mts kit       # галерея v0.1 в трёх пресетах (slice/kit)
// Полноразмерные PNG (ключевые и промежуточные кадры) остаются в tmp/kit-evidence-*/ репозитория.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRenderBrowser } from "../render/src/node/browser.ts";
import { renderVersion } from "../render/src/node/render-version.ts";
import { FIXTURES, REPO_TMP, copyFixture, fixtureSettings, makeStore } from "../render/test/helpers.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const ff = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

await ensureRenderBrowser();
mkdirSync(REPO_TMP, { recursive: true });
const work = mkdtempSync(join(REPO_TMP, "kit-evidence-"));
mkdirSync(join(work, "cache"));
const store = await makeStore(work);

/** Рендер фикстуры с кадрами; путь к PNG кадра. */
async function render(fixture: string, stills: number[], content: Record<string, string> = {}, tag = "", props?: object): Promise<(f: number) => string> {
  const dir = join(work, fixture.replace(/\//g, "-") + tag);
  const r = await renderVersion({
    versionDir: withProps(await withContent(await copyFixture(fixture, dir), content), props),
    settings: await fixtureSettings(fixture),
    cacheDir: join(work, "cache"),
    stills: [...new Set(stills)].sort((a, b) => a - b),
    preview: { scale: 0.5, crf: 23 },
    timeoutMs: 240_000,
    run: { root: store, runId: fixture.replace(/\//g, "-") + tag, attempt: 1 },
  });
  if (!r.ok) throw new Error(`${fixture}: рендер не удался: ${JSON.stringify(r.error)}`);
  return (f) => join(dir, "frames", `${f}.png`);
}

/** Вариант фикстуры: поля props.content поверх исходных. */
function withContent(dir: string, content: Record<string, string>): string {
  if (Object.keys(content).length === 0) return dir;
  const props = JSON.parse(readFileSync(join(dir, "props.json"), "utf8")) as { content?: Record<string, unknown> };
  writeFileSync(join(dir, "props.json"), JSON.stringify({ ...props, content: { ...props.content, ...content } }));
  return dir;
}

/** props.json целиком (kit-gallery v0.1 берёт пресет из props). */
function withProps(dir: string, props?: object): string {
  if (props) writeFileSync(join(dir, "props.json"), JSON.stringify(props));
  return dir;
}

/** Контактный лист: кадры плиткой cols × rows по `tile` px ширины (пустые клетки — чёрные). */
function sheet(pngs: string[], out: string, tile: number, cols: number) {
  const rows = Math.ceil(pngs.length / cols);
  const inputs = pngs.flatMap((p) => ["-i", p]);
  const scaled = pngs.map((_, i) => `[${i}]scale=${tile}:-1,setsar=1[s${i}]`).join(";");
  const join_ = `${pngs.map((_, i) => `[s${i}]`).join("")}concat=n=${pngs.length}:v=1:a=0,tile=${cols}x${rows}`;
  ff([...inputs, "-filter_complex", `${scaled};${join_}`, "-frames:v", "1", "-q:v", "4", out]);
}

const mode = process.argv[2] ?? "choreo";
if (mode === "choreo") {
  const OUT = join(REPO, "docs/evidence/phase-1/kit-v0.3/choreo");
  const KEY = [0, 12, 24, 45, 90, 179];
  const MID = [8, 16, 26, 34];
  const png = await render("choreo-gallery", [...KEY, ...MID]);
  mkdirSync(OUT, { recursive: true });
  for (const f of KEY) ff(["-i", png(f), "-vf", "scale=960:-1", "-q:v", "3", join(OUT, `choreo-${f}.jpg`)]);
  // полоса середин входов: 4 кадра столбиком по 640 px
  const inputs = MID.flatMap((f) => ["-i", png(f)]);
  const scaled = MID.map((_, i) => `[${i}]scale=640:-1[s${i}]`).join(";");
  const stack = `${MID.map((_, i) => `[s${i}]`).join("")}vstack=${MID.length}`;
  ff([...inputs, "-filter_complex", `${scaled};${stack}`, "-q:v", "3", join(OUT, `choreo-mid-${MID.join("-")}.jpg`)]);
  console.log(`evidence: ${OUT}\nполные кадры: ${work}`);
} else if (mode === "patterns") {
  const OUT = join(REPO, "docs/evidence/phase-1/kit-v0.3/patterns");
  const KEY = [0, 30, 75, 120, 149];
  const EXTRA = [15, 45, 60, 90, 105, 135];
  const all = readdirSync(join(FIXTURES, "patterns-gallery")).sort();
  const names = process.argv.length > 3 ? process.argv.slice(3) : all;
  mkdirSync(OUT, { recursive: true });
  for (const arg of names) {
    // «сцена» или «сцена:ключ=значение» — вариант через props.content
    const [name, opt] = arg.split(":") as [string, string | undefined];
    if (!all.includes(name)) throw new Error(`нет сцены patterns-gallery/${name} (есть: ${all.join(", ")})`);
    const [k, v] = (opt ?? "").split("=");
    const content = opt && k && v ? { [k]: v } : {};
    const tag = opt && k && v ? `-${k}-${v}` : "";
    const png = await render(`patterns-gallery/${name}`, [...KEY, ...EXTRA], content, tag);
    // ключевые кадры e2e плиткой 3 × 2 по 480 px — малый вес
    const out = join(OUT, `${name}${tag}-0-30-75-120-149.jpg`);
    sheet(KEY.map(png), out, 480, 3);
    console.log(`${arg}: ${out}`);
  }
  console.log(`полные кадры: ${work}`);
} else if (mode === "kit") {
  // галерея v0.1 (kit-gallery) в трёх пресетах — кадры docs/evidence/phase-1/slice/kit/ (PNG, как в срезе)
  const OUT = join(REPO, "docs/evidence/phase-1/slice/kit");
  mkdirSync(OUT, { recursive: true });
  const SETS: [string, number[]][] = [["dark-premium", [0, 30, 75, 120, 149]], ["light-clean", [75, 149]], ["tech-neon", [75, 149]]];
  for (const [preset, stills] of SETS) {
    const png = await render("kit-gallery", stills, {}, `-${preset}`, { preset });
    for (const f of stills) ff(["-i", png(f), join(OUT, `${preset}-${f}.png`)]);
  }
  console.log(`evidence: ${OUT}`);
} else {
  throw new Error(`неизвестный режим ${mode}: choreo | patterns [сцены…] | kit`);
}
