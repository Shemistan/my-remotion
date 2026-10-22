// QA `frozen` на реальных кадрах финалов kit 0.5.0 (hold engine): fixtures/hold-frames/
// <вариант>/{160,179}.png — кадры N−20 и N−1 галереи render/test/kit/hold.e2e.test.ts
// (носитель «граф», 1920×1080 → 640×360, ffmpeg area). Правильный финал каждого режима
// проходит; схема без hold (контроль) — застывшая, blocking.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type HoldMode, type QAIssue, type Settings, defaultSettings } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
import { describe, expect, it } from "vitest";
import { programmaticChecks } from "../../src/qa/programmatic.js";
import { beat, el, renderResult, spec } from "./helpers.js";

const DIR = fileURLToPath(new URL("../fixtures/hold-frames/", import.meta.url));
const settings: Settings = { ...defaultSettings(), width: 640, height: 360, safe_area: { x: 0.06, y: 0.08 } };
/** Spec сцены со схемой и потоками; `mode` — hold_mode фазы hold (без него — старая spec: по умолчанию steady-flow). */
const specOf = (mode?: HoldMode) => spec({
  elements: [el("graph", { kind: "graph", role: "схема", content: { flows: [{ edge: "e-store" }] } })],
  beats: [beat("build", 0, 104, ["graph"]), beat("hold", 128, 180, ["graph"], "hold")],
  ...(mode ? { phases: [{ id: "build", role: "action", weight: 3, element_ids: ["graph"] }, { id: "fin", role: "hold", weight: 1, element_ids: ["graph"], hold_mode: mode }] } : {}),
});

async function frozen(variant: string, mode?: HoldMode): Promise<QAIssue[]> {
  const at = (f: number) => ({ frame: f, path: `${DIR}${variant}/${f}.png` });
  const r = await programmaticChecks({
    frames: [at(160), at(179)], spec: specOf(mode), settings, style: resolveStyle({ preset: "dark-premium", intensity: "balanced" }),
    render: renderResult(), previewBytes: 1000, accentFrames: [at(160), at(179)],
  });
  return r.filter((i) => i.code === "frozen");
}

describe("frozen на реальных финалах графа", () => {
  it.each([undefined, "steady-flow", "now-pulse", "data-shimmer"] as const)("контроль без hold (hold_mode %s): схема застыла — blocking", async (mode) => {
    expect(await frozen("graph-none", mode)).toContainEqual(expect.objectContaining({ code: "frozen", severity: "blocking", area: "hold" }));
  });

  const modes = readdirSync(DIR).filter((d) => d !== "graph-none");
  it("есть все режимы, кроме settle-push (у графа он — камера)", () => {
    expect(modes.sort()).toEqual(["graph-data-shimmer", "graph-now-pulse", "graph-repeat-result", "graph-steady-flow"]);
  });
  it.each(modes)("%s: финал режима живой — без frozen", async (v) => {
    expect(await frozen(v, v.replace("graph-", "") as HoldMode)).toEqual([]);
  });
  it.each(["graph-repeat-result", "graph-steady-flow"])("%s: и в старой spec без фаз (порог потоков) — без frozen", async (v) => {
    expect(await frozen(v)).toEqual([]);
  });
});
