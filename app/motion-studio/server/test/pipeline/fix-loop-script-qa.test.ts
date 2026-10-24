// S14: QA сцены сценария по кадрам — пустой контейнер в финале (реестр kit 0.5.5) и два
// акцента сразу (Visual QA `accent_conflict`) исправляются циклом Engineer; у Playground — как
// раньше (accent_conflict — предупреждение, реестр контейнеров не проверяется).
import { afterEach, beforeEach, expect, it } from "vitest";
import type { VisualQAOutput } from "@ms/contracts";
import { type GenerationRequest, runGeneration } from "../../src/pipeline/generate.js";
import { directorOutput, fakeAgents, fakeRender, makeDeps, makeSkills, makeStore, makeTmp, removeTmp, settings, visualOutput } from "./helpers.js";

let tmp: string;
let root: string;
let skills: string;
beforeEach(async () => {
  tmp = await makeTmp();
  root = await makeStore(tmp);
  skills = await makeSkills(tmp);
});
afterEach(() => removeTmp(tmp));

const s = settings();
function request(script: boolean): GenerationRequest {
  const d = directorOutput();
  return {
    prompt: "тест", settings: s, qa: { allowRestricted: false },
    plan: async () => ({ kind: "plan", director: { selection: d.selection, rationale: d.rationale }, spec: d.spec, candidates: [] }),
    ...(script ? { script: true } : {}),
  };
}

/** Рендер: в первой попытке на последнем кадре — пустая карточка. */
function emptyCardRender() {
  let renders = 0;
  const r = fakeRender({
    png: true,
    onCall: async () => {
      renders++;
    },
    layout: () => [{ id: "scene#0", role: "scene", text: "Swiss Table", rect: { x: 700, y: 200, w: 500, h: 80 }, fontPx: 64, opacity: 1 }],
    probe: (_req, f) => (f === s.duration_frames - 1 && renders === 1 ? { boxes: [{ id: "card::0", kind: "card", rect: { x: 100, y: 600, w: 300, h: 200 }, filled: false, graphic: false }], areas: { text: 0.05, graphic: 0.3 } } : { boxes: [], areas: { text: 0.05, graphic: 0.3 } }),
  });
  return r;
}

it("сцена сценария: пустая карточка в финале → исправление Engineer, вторая попытка ready", async () => {
  const agents = fakeAgents({});
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: emptyCardRender().render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toContain("empty_container");
});

it("Playground: реестр контейнеров не проверяется — один вызов Engineer", async () => {
  const agents = fakeAgents({});
  const r = await runGeneration(request(false), await makeDeps(root, skills, { agents, render: emptyCardRender().render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
});

const conflict = (frames: number[], spec: Parameters<typeof visualOutput>[1], n: number): Partial<{ output: VisualQAOutput }> => {
  const ok = visualOutput(frames, spec);
  return n === 1
    ? { output: { ...ok, gate: { ...ok.gate, visual: "warn" }, issues: [{ code: "accent_conflict", severity: "warning", frame: 170, area: "герой и карточки", description: "светятся герой и три карточки", fix_hint: "оставь свечение только у героя" }] } }
    : { output: ok };
};

it("сцена сценария: accent_conflict Visual QA — исправляемый (blocking), Engineer получает его", async () => {
  const agents = fakeAgents({ visualQa: async (f, sp, n) => conflict(f, sp, n) });
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toMatch(/\[blocking\] accent_conflict/);
});

it("Playground: accent_conflict — предупреждение, без исправления", async () => {
  const agents = fakeAgents({ visualQa: async (f, sp, n) => conflict(f, sp, n) });
  const r = await runGeneration(request(false), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
});
