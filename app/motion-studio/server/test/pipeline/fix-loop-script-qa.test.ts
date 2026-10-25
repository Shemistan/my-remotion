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

/** Проба kit 0.5.6: в кадрах `on` светятся `n` акцентов сразу (data-ms-accent > 0.5). */
const accentRender = (on: (f: number, call: number) => boolean, n = 2) => {
  let call = 0;
  return fakeRender({
    png: true,
    onCall: async (req) => {
      if (req.preview !== null) call++;
    },
    layout: () => [{ id: "scene#0", role: "scene", text: "Swiss Table", rect: { x: 700, y: 200, w: 500, h: 80 }, fontPx: 64, opacity: 1 }],
    probe: (_req, f) => ({ accents: on(f, call) ? Array.from({ length: n }, (_, k) => ({ id: `span::${k}`, level: 0.9 })) : [{ id: "span::0", level: 0.9 }] }),
  });
};

it("сцена сценария: accent_conflict Visual QA, подтверждённый пробой (≥ 2 акцента в ≥ 2 кадрах) — blocking, Engineer получает его", async () => {
  const agents = fakeAgents({ visualQa: async (f, sp, n) => conflict(f, sp, n) });
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: accentRender((_f, call) => call === 1).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toMatch(/\[blocking\] accent_conflict/);
});

it("S15a: accent_conflict без подтверждения пробой (один акцент в кадре) — предупреждение, без исправления", async () => {
  const agents = fakeAgents({ visualQa: async (f, sp, n) => conflict(f, sp, n) });
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: accentRender(() => false).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
});

it("S15a: accent_conflict — не больше одного исправления: повтор после него — предупреждение", async () => {
  const agents = fakeAgents({ visualQa: async (f, sp) => conflict(f, sp, 1) });
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: accentRender(() => true).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(r.qa?.issues.find((x) => x.code === "accent_conflict")?.severity).toBe("warning");
});

it("S15a: blocking с тем же ключом и кадрами после исправления 1 — второго раунда нет, warning", async () => {
  const agents = fakeAgents({});
  const render = fakeRender({
    png: true,
    layout: () => [{ id: "scene#0", role: "scene", text: "Swiss Table", rect: { x: 700, y: 200, w: 500, h: 80 }, fontPx: 64, opacity: 1 }],
    probe: (_req, f) => (f === s.duration_frames - 1 ? { boxes: [{ id: "card::0", kind: "card", rect: { x: 100, y: 600, w: 300, h: 200 }, filled: false, graphic: false }], areas: { text: 0.05, graphic: 0.3 } } : { boxes: [], areas: { text: 0.05, graphic: 0.3 } }),
  });
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: render.render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  const empty = r.qa?.issues.find((x) => x.code === "empty_container");
  expect(empty?.severity).toBe("warning");
  expect(empty?.description).toMatch(/повтор после исправления/);
});

it("Playground: accent_conflict — предупреждение, без исправления", async () => {
  const agents = fakeAgents({ visualQa: async (f, sp, n) => conflict(f, sp, n) });
  const r = await runGeneration(request(false), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
});
