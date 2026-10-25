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

// S15a (kit 0.5.6): скученные вехи, одна веха с подписью своего года, метр сравнения, лента
// шагов в двух копиях под clipPath (проба видит один текст) и приглушение dimBefore
const overlapping = (f: LayoutFrame) => {
  const out: string[] = [];
  const area = (b: { w: number; h: number }) => b.w * b.h;
  for (let i = 0; i < f.items.length; i++) {
    for (let j = i + 1; j < f.items.length; j++) {
      const [a, b] = [f.items[i]!, f.items[j]!];
      if (a.el !== undefined && a.el === b.el) continue;
      const w = Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w) - Math.max(a.rect.x, b.rect.x);
      const h = Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h) - Math.max(a.rect.y, b.rect.y);
      if (w > 0 && h > 0 && (w * h) / Math.min(area(a.rect), area(b.rect)) >= 0.2) out.push(`${a.text} / ${b.text}`);
    }
  }
  return out;
};

it("S15a: скученные вехи 1990/2020/2022/2024 — подписи не налезают; одна веха — год подписан", async () => {
  const crowded = (await part("timelineCrowded")).find((f) => f.frame === 149)!;
  expect(overlapping(crowded)).toEqual([]);
  const one = (await part("timeline1")).find((f) => f.frame === 149)!;
  expect(one.items.map((i) => i.text)).toContain("2025");
}, T);

it("S15a: метр сравнения — панели с графикой; две копии шагов под clipPath — без призраков; dimBefore чистый", async () => {
  const split = (await part("splitMetric")).find((f) => f.frame === 149)!;
  expect(split.boxes!.filter((b) => b.kind === "panel").map((b) => b.graphic)).toEqual([true, true]);
  for (const f of await part("stepsClip")) expect(f.ghosts, `кадр ${f.frame}`).toEqual([]);
  const dim = (await part("stepsDim")).find((f) => f.frame === 149)!;
  expect(dim.ghosts).toEqual([]);
  // подпись шага — один DOM-элемент (строки переноса — тот же ключ el), не две копии
  expect(new Set(dim.items.filter((i) => i.text === "Рост при обходе").map((i) => i.el)).size).toBe(1);
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
