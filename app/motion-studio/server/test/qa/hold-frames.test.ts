// QA `frozen` на реальных кадрах финалов kit 0.5.x (hold engine): fixtures/hold-frames/
// <вариант>/{160,179}.png — кадры N−20 и N−1 галереи render/test/kit/hold.e2e.test.ts
// (носитель «граф», 1920×1080 → 640×360, ffmpeg area). Правильный финал каждого режима
// проходит; схема без hold (контроль) — застывшая, blocking. S3-fix: негатив «дышит только
// ореол узла» (`graph-none-emph`), светлый пресет (`*-light`), потоки с бита hold (`*-inhold`).
import { readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type HoldMode, type QAIssue, type Settings, defaultSettings } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { programmaticChecks } from "../../src/qa/programmatic.js";
import { Canvas, beat, el, makeTmp, removeTmp, renderResult, spec } from "./helpers.js";

const DIR = fileURLToPath(new URL("../fixtures/hold-frames/", import.meta.url));
const settings: Settings = { ...defaultSettings(), width: 640, height: 360, safe_area: { x: 0.06, y: 0.08 } };
/** Spec сцены со схемой и потоками; `mode` — hold_mode фазы hold (без него — старая spec: по умолчанию steady-flow). */
const specOf = (mode?: HoldMode, preset: "dark-premium" | "light-clean" = "dark-premium") => ({
  ...spec({
    elements: [el("graph", { kind: "graph", role: "схема", content: { flows: [{ edge: "e-store" }] } })],
    beats: [beat("build", 0, 104, ["graph"]), beat("hold", 128, 180, ["graph"], "hold")],
    ...(mode ? { phases: [{ id: "build", role: "action", weight: 3, element_ids: ["graph"] }, { id: "fin", role: "hold", weight: 1, element_ids: ["graph"], hold_mode: mode }] } : {}),
  }),
  style_preset: preset,
});

const presetOf = (variant: string) => (variant.endsWith("-light") ? "light-clean" : "dark-premium");

/** Строка пробы раскладки кадра 179: `holds` — режимы, которые ведёт hold engine (kit 0.5.2+). */
const probe = (holds: string[]) => `[log] [motion-kit:layout] ${JSON.stringify({ frame: 179, height: 360, items: [], ghosts: [], holds })}`;

/** `holds` — метки пробы (undefined — пробы нет: только пиксели). */
async function frozen(variant: string, mode?: HoldMode, holds?: string[]): Promise<QAIssue[]> {
  const at = (f: number) => ({ frame: f, path: `${DIR}${variant}/${f}.png` });
  const preset = presetOf(variant);
  const r = await programmaticChecks({
    frames: [at(160), at(179)], spec: specOf(mode, preset), settings: { ...settings, style_preset: preset }, style: resolveStyle({ preset, intensity: "balanced" }),
    render: renderResult(holds ? { browserLogs: [probe(holds)] } : {}), previewBytes: 1000, accentFrames: [at(160), at(179)],
  });
  return r.filter((i) => i.code === "frozen");
}

const BLOCKING = expect.objectContaining({ code: "frozen", severity: "blocking", area: "hold" });
// S3-fix2 I1: steady-flow, потоки кончились задолго до hold, дышит ореол узла — kit 0.5.3 метки не ставит
const CONTROLS = ["graph-none", "graph-none-light", "graph-none-emph", "graph-steady-flow-stale"];

describe("frozen на реальных финалах графа", () => {
  // контроль без hold и негатив «дышит только ореол узла» (motion-review-2 §4.3): при любом
  // режиме фазы hold — застывшая схема; проба знает, что hold engine финал не ведёт
  for (const v of CONTROLS) {
    it.each([undefined, "steady-flow", "now-pulse", "data-shimmer", "repeat-result"] as const)(`${v} (hold_mode %s, проба без hold): blocking`, async (mode) => {
      expect(await frozen(v, mode, [])).toContainEqual(BLOCKING);
    });
  }
  // и без пробы (старые логи): застывшие контроли ловят пиксели — тайловая мера на обоих пресетах
  it.each(["graph-none", "graph-none-light"])("%s без пробы: тайловая мера — blocking", async (v) => {
    expect(await frozen(v, "now-pulse")).toContainEqual(BLOCKING);
  });
  // предел пикселей, названный честно: дыхание ореола узла по кадрам N−20 / N−1 живо так же,
  // как волна now-pulse, — его отличает только проба (holds)
  it("graph-none-emph без пробы пикселями не ловится (предел меры)", async () => {
    expect(await frozen("graph-none-emph", "now-pulse")).toEqual([]);
  });

  const modes = readdirSync(DIR).filter((d) => !CONTROLS.includes(d)).sort();
  it("есть все режимы графа (тёмный и светлый пресет) и потоки с бита hold", () => {
    expect(modes).toEqual([
      "graph-data-shimmer", "graph-data-shimmer-light", "graph-now-pulse", "graph-now-pulse-light",
      "graph-repeat-result", "graph-repeat-result-light", "graph-steady-flow", "graph-steady-flow-inhold", "graph-steady-flow-light",
    ]);
  });
  const modeOf = (v: string) => v.replace("graph-", "").replace(/-(light|inhold)$/, "") as HoldMode;
  it.each(modes)("%s: финал режима живой — без frozen (с пробой и без)", async (v) => {
    expect(await frozen(v, modeOf(v), [modeOf(v)])).toEqual([]);
    expect(await frozen(v, modeOf(v))).toEqual([]);
  });
  it.each(modes)("%s: и в старой spec без фаз — без frozen", async (v) => {
    expect(await frozen(v, undefined, [modeOf(v)])).toEqual([]);
  });
});

describe("frozen: мера в коробке схемы и подсказка (S3-fix2)", () => {
  let tmp: string;
  beforeAll(async () => {
    tmp = await makeTmp();
  });
  afterAll(() => removeTmp(tmp));
  /** Схема (карточки) стоит, справа вне схемы бежит точка фона (частица, блик спотлайта). */
  const frame = (dotY: number) => new Canvas(640, 360, "#101010").rect(60, 80, 120, 70, "#3a4a6a").rect(220, 80, 120, 70, "#3a4a6a").rect(560, dotY, 14, 14, "#e8e8e8");
  async function run(layout: boolean, holds?: string[]) {
    const paths = [] as { frame: number; path: string }[];
    for (const [f, y] of [[160, 40], [179, 140]] as const) {
      const path = join(tmp, `m1-${f}.png`);
      await writeFile(path, frame(y).png());
      paths.push({ frame: f, path });
    }
    const sp = specOf("steady-flow");
    const graph = layout ? { ...sp.elements[0]!, layout: { x: 0, y: 0, w: 0.6, h: 0.7 } } : sp.elements[0]!;
    const r = await programmaticChecks({
      frames: paths, spec: { ...sp, elements: [graph] }, settings, style: resolveStyle({ preset: "dark-premium", intensity: "balanced" }),
      render: renderResult(holds ? { browserLogs: [probe(holds)] } : {}), previewBytes: 1000, accentFrames: paths,
    });
    return r.filter((i) => i.code === "frozen");
  }
  it("m1: живая точка фона вне схемы не оживляет застывшую схему — мера по раскладке графа", async () => {
    expect(await run(true)).toContainEqual(BLOCKING);
    expect(await run(true, ["steady-flow"])).toContainEqual(BLOCKING);
  });
  it("m1: без раскладки графа — весь кадр (как раньше)", async () => {
    expect(await run(false)).toEqual([]);
  });
  it("I1: подсказка steady-flow называет hold.edges", async () => {
    const [i] = await frozen("graph-none-emph", "steady-flow", []);
    expect(i!.fix_hint).toMatch(/hold\.edges/);
  });
});
