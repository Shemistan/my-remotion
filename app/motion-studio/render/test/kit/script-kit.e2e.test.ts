// Вид по умолчанию компонентов приёмов сценарных сцен (S14, kit 0.5.5): реальный рендер с данными
// смоука блока 1. Таймлайн одной вехой — ось с делениями и годами (не точка), граф без пустых
// узлов; проба раскладки печатает контейнеры и доли площади. Кадры — в tmp/ репозитория
// (`tmp/s14/kit/<часть>-<кадр>.png`) для глаза. Запуск: `make e2e`.
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { ensureRenderBrowser } from "../../src/node/browser.js";
import { type RenderRequest, renderVersion } from "../../src/node/render-version.js";
import { LAYOUT_TAG, type LayoutFrame } from "../../src/motion-kit/layout-probe.js";
import { copyFixture, fixtureSettings, makeStore, makeTmp, removeTmp } from "../helpers.js";

const T = 600_000;
const OUT = join(import.meta.dirname, "../../../../../tmp/s14/kit");
let tmp: string;
let base: Omit<RenderRequest, "versionDir">;

beforeAll(async () => {
  await ensureRenderBrowser();
  tmp = await makeTmp();
  const cacheDir = join(tmp, "cache");
  await mkdir(cacheDir);
  await mkdir(OUT, { recursive: true });
  base = { settings: await fixtureSettings("script-kit"), cacheDir, stills: [60, 149], preview: null, timeoutMs: 240_000, run: { root: await makeStore(tmp), runId: "script-kit", attempt: 1 } };
}, T);
afterAll(async () => {
  if (tmp) await removeTmp(tmp);
});

async function part(name: string): Promise<LayoutFrame[]> {
  const dir = await copyFixture("script-kit", join(tmp, name));
  await writeFile(join(dir, "props.json"), JSON.stringify({ preset: "tech-neon", part: name }));
  const r = await renderVersion({ ...base, versionDir: dir, run: { ...base.run, runId: `script-kit-${name}` } });
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
  expect(r.browserLogs.filter((l) => l.startsWith("[error]"))).toEqual([]);
  for (const [k, f] of base.stills.entries()) await copyFile(r.stills[k]!, join(OUT, `${name}-${f}.png`));
  return r.browserLogs.filter((l) => l.includes(LAYOUT_TAG)).map((l) => JSON.parse(l.slice(l.indexOf(LAYOUT_TAG) + LAYOUT_TAG.length)) as LayoutFrame);
}

it("таймлайн одной вехой: ось во всю ширину с подписями лет, графика заметна", async () => {
  const frames = await part("timeline1");
  const last = frames.find((f) => f.frame === 149)!;
  const years = last.items.filter((i) => /^20\d\d$/.test(i.text)).map((i) => i.text);
  expect(years.length).toBeGreaterThanOrEqual(2);
  expect(last.areas!.graphic).toBeGreaterThan(0.08);
}, T);

it("таймлайн тремя вехами, сравнение и граф: рендер чистый, пустых контейнеров нет", async () => {
  for (const name of ["timeline3", "split", "flow"]) {
    const frames = await part(name);
    const last = frames.find((f) => f.frame === 149)!;
    expect(last.boxes, name).toBeDefined();
    expect(last.boxes!.filter((b) => !b.filled), name).toEqual([]);
  }
  const flow = (await part("flow")).find((f) => f.frame === 149)!;
  expect(flow.boxes!.filter((b) => b.kind === "node")).toHaveLength(5);
}, T);
