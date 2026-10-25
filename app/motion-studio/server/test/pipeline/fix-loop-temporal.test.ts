// Task 37′ fix I1: прозрачная видеосцена (`temporal` без `script`) — проверки по всей сцене
// (временной проход пробы, реестр финала: пустая карточка, подписи-заглушки) как у сцены
// сценария, но без строк сценария у Engineer; коды `skip` (пустая половина, герой) отброшены.
import { afterEach, beforeEach, expect, it } from "vitest";
import { type GenerationRequest, runGeneration } from "../../src/pipeline/generate.js";
import { TRANSPARENT_SKIP } from "../../src/pipeline/playground-generate.js";
import { directorOutput, fakeAgents, fakeRender, makeDeps, makeSkills, makeStore, makeTmp, removeTmp, settings } from "./helpers.js";

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
function request(temporal: boolean): GenerationRequest {
  const d = directorOutput();
  return {
    prompt: "тест", settings: s, qa: { allowRestricted: false },
    plan: async () => ({ kind: "plan", director: { selection: d.selection, rationale: d.rationale }, spec: d.spec, candidates: [] }),
    layout: { x: 0.05, y: 0.7, w: 0.9, h: 0.25 },
    ...(temporal ? { temporal: { window: { lead: 15, speech: s.duration_frames - 45, tail: 30 }, skip: TRANSPARENT_SKIP } } : {}),
  };
}

const line = [{ id: "scene#0", role: "scene", text: "Swiss Table", rect: { x: 700, y: 800, w: 500, h: 80 }, fontPx: 64, opacity: 1 }];

/** Рендер: в первой попытке на последнем кадре — `bad` (пустая карточка или «?» в карточках). */
function badFinal(bad: "empty" | "stub") {
  let renders = 0;
  return fakeRender({
    png: true,
    onCall: async (req) => {
      if (req.preview !== null) renders++;
    },
    layout: (_req, f) => (f === s.duration_frames - 1 && renders === 1 && bad === "stub"
      ? [...line, { id: "label:a:0", role: "label", text: "?", rect: { x: 120, y: 820, w: 40, h: 50 }, fontPx: 40, opacity: 1 }, { id: "label:b:1", role: "label", text: "?", rect: { x: 420, y: 820, w: 40, h: 50 }, fontPx: 40, opacity: 1 }]
      : line),
    probe: (_req, f) => {
      const last = f === s.duration_frames - 1 && renders === 1;
      if (last && bad === "empty") return { boxes: [{ id: "card::0", kind: "card", rect: { x: 100, y: 780, w: 300, h: 200 }, filled: false, graphic: false }], areas: { text: 0.05, graphic: 0.1 } };
      if (last && bad === "stub") return { boxes: [{ id: "card::0", kind: "card", rect: { x: 100, y: 780, w: 300, h: 200 }, filled: true, graphic: false }, { id: "card::1", kind: "card", rect: { x: 400, y: 780, w: 300, h: 200 }, filled: true, graphic: false }], areas: { text: 0.05, graphic: 0.1 } };
      return { boxes: [], areas: { text: 0.05, graphic: 0.1 } };
    },
  });
}

it("прозрачная видеосцена: пустая карточка в зоне → blocking empty_container, исправление Engineer; временной проход запрошен", async () => {
  const agents = fakeAgents({});
  const r0 = badFinal("empty");
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: r0.render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toMatch(/\[blocking\] empty_container/);
  expect(r0.calls.some((c) => c.sweep !== undefined)).toBe(true);
  // строк сценария (герой на 30–40 % кадра) у Engineer нет; герой и пустая половина — не замечания
  expect(agents.engineerCalls[0]!.input).not.toContain("30–40 % кадра");
  expect(r.qa?.issues.map((x) => x.code)).not.toEqual(expect.arrayContaining(["no_hero"]));
});

it("прозрачная видеосцена: «?» в карточках зоны → blocking placeholder_label", async () => {
  const agents = fakeAgents({});
  const r = await runGeneration(request(true), await makeDeps(root, skills, { agents, render: badFinal("stub").render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toMatch(/\[blocking\] placeholder_label/);
});

it("без temporal (до fix I1) реестр финала не проверяется — один вызов Engineer", async () => {
  const agents = fakeAgents({});
  const r0 = badFinal("empty");
  const r = await runGeneration(request(false), await makeDeps(root, skills, { agents, render: r0.render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
  expect(r0.calls.every((c) => c.sweep === undefined)).toBe(true);
});
