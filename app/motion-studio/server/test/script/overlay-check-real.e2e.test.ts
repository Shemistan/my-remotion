// M7 (ревью S6): проверка наложения на РЕАЛЬНОМ рендере, без LLM. Фикстура kit
// render/test/fixtures/transparent-scene в непрозрачном виде (фон — только <Background>) →
// `overlayChecks` с настоящим `renderVersion` кадра hold (props.style.transparent = true) и
// настоящим `alphaCoverage`: PNG стоп-кадра с альфой, чистая сцена не получает overlay_opaque.
// Та же сцена с заливкой корня через переменную стиля (статика её не видит) — overlay_opaque.
// Запуск: `MS_E2E=1 vitest run server/test/script/overlay-check-real.e2e.test.ts`.
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type MotionSpec, SettingsSchema } from "@ms/contracts";
import { alphaAtCorner, alphaCoverage, ensureRenderBrowser, renderVersion } from "@ms/render";
import { overlayChecks, rootFillIssues } from "../../src/script/overlay-check.js";
import { makeStore, makeTmp, removeTmp } from "../pipeline/helpers.js";

const T = 600_000;
const FIXTURE = fileURLToPath(new URL("../../../render/test/fixtures/transparent-scene/", import.meta.url));
let tmp: string;
let root: string;
let cacheDir: string;

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  root = await makeStore(tmp);
  cacheDir = await mkdtemp(join(tmp, "cache-"));
}, T);
afterAll(() => removeTmp(tmp));

/** Непрозрачная версия-фикстура: props.style.transparent = false, settings.transparent_export = false. */
async function opaqueVersion(name: string, patchScene?: (src: string) => string): Promise<string> {
  const dir = join(tmp, name);
  await cp(FIXTURE, dir, { recursive: true });
  const props = JSON.parse(await readFile(join(dir, "props.json"), "utf8"));
  props.style.transparent = false;
  await writeFile(join(dir, "props.json"), JSON.stringify(props, null, 2));
  const settings = JSON.parse(await readFile(join(dir, "settings.json"), "utf8"));
  await writeFile(join(dir, "settings.json"), JSON.stringify({ ...settings, transparent_export: false }, null, 2));
  if (patchScene) {
    const p = join(dir, "src/Scene.tsx");
    await writeFile(p, patchScene(await readFile(p, "utf8")));
  }
  return dir;
}

/** spec фикстуры: вход карточек, удержание с кадра 60 (кадр проверки — начало hold). */
const spec = {
  duration_frames: 90, fps: { num: 30, den: 1 },
  beats: [
    { id: "cards", start_frame: 15, end_frame: 60, action: "enter", description: "карточки", element_ids: ["cards"] },
    { id: "rest", start_frame: 60, end_frame: 90, action: "hold", description: "удержание", element_ids: ["cards"] },
  ],
} as unknown as MotionSpec;

let k = 0;
async function check(versionDir: string) {
  const settings = SettingsSchema.parse(JSON.parse(await readFile(join(versionDir, "settings.json"), "utf8")));
  const pngs: string[] = [];
  const run = { root, runId: `ovl${++k}`, attempt: 1 };
  const issues = await overlayChecks({
    versionDir, spec, settings, signal: new AbortController().signal, run,
    renderStills: async (stills, inputProps) => {
      const outDir = await mkdtemp(join(tmp, "extra-"));
      const r = await renderVersion({ versionDir, outDir, settings, cacheDir, stills, preview: null, timeoutMs: T - 60_000, inputProps, run }, new AbortController().signal);
      pngs.push(...r.stills);
      return r;
    },
  });
  return { issues, pngs };
}

it("чистая сцена (фон — только <Background>): PNG кадра hold с альфой, overlay_opaque нет", async () => {
  const dir = await opaqueVersion("clean");
  const { issues, pngs } = await check(dir);
  expect(issues, JSON.stringify(issues)).toEqual([]);
  expect(pngs).toHaveLength(1);
  const pixFmt = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "csv=p=0", pngs[0]!], { encoding: "utf8" }).trim();
  expect(pixFmt).toMatch(/^rgba/);
  expect(await alphaAtCorner(pngs[0]!, 0)).toBe(0);
  const c = await alphaCoverage(pngs[0]!, [0]);
  expect(c.opaque).toBeGreaterThan(0.005);
  expect(c.opaque).toBeLessThan(0.92);
  console.log(`  чистая сцена: кадр 60 непрозрачен на ${(c.opaque * 100).toFixed(1)} %, дымка ${(c.haze * 100).toFixed(1)} %`);
}, T);

it("заливка корня через переменную стиля (статика не видит) — реальный кадр даёт overlay_opaque", async () => {
  const dir = await opaqueVersion("filled", (src) =>
    src
      .replace('import { Background,', 'import { AbsoluteFill } from "remotion";\nimport { Background,')
      .replace("export const Scene =", 'const ROOT = { background: "#0b0d12" };\nexport const Scene =')
      .replace("<StyleProvider style={style}>", "<StyleProvider style={style}>\n      <AbsoluteFill style={ROOT} />"),
  );
  expect(rootFillIssues([{ path: "src/Scene.tsx", text: await readFile(join(dir, "src/Scene.tsx"), "utf8") }])).toEqual([]);
  const { issues } = await check(dir);
  expect(issues.map((x) => x.code)).toEqual(["overlay_opaque"]);
  expect(issues[0]).toMatchObject({ severity: "blocking", frame: 60 });
}, T);
