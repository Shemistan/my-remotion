// S14: приём сцены сценария проверяется до рендера — код Engineer без ключевого компонента
// приёма (`TECHNIQUES[t].kit`) уходит на исправление (`technique_not_realized`, этап static),
// а не только пакетным предупреждением после генерации. Последний вызов — предупреждение.
import { afterEach, beforeEach, expect, it } from "vitest";
import { type GenerationRequest, runGeneration } from "../../src/pipeline/generate.js";
import { GOOD_SCENE, directorOutput, fakeAgents, fakeRender, makeDeps, makeSkills, makeStore, makeTmp, removeTmp, settings } from "./helpers.js";

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
const SPLIT_SCENE = `import { AbsoluteFill } from "remotion";
import { ComparisonSplit } from "@ms/motion-kit";
export const Scene = () => (
  <AbsoluteFill>
    <ComparisonSplit left={{ label: "Было", title: "Старая map" }} right={{ label: "Стало", title: "Swiss Table" }} beat={{ start_frame: 0, end_frame: 60 }} divider="line" />
  </AbsoluteFill>
);
`;

function request(extra: Partial<GenerationRequest> = {}): GenerationRequest {
  const d = directorOutput();
  return {
    prompt: "тест",
    settings: s,
    qa: { allowRestricted: false },
    plan: async () => ({ kind: "plan", director: { selection: d.selection, rationale: d.rationale }, spec: d.spec, candidates: [] }),
    ...extra,
  };
}

it("код без компонента приёма → исправление до рендера; со вторым вызовом — ready", async () => {
  const agents = fakeAgents({ engineer: async (_t, n) => ({ files: { "src/Scene.tsx": n === 1 ? GOOD_SCENE : SPLIT_SCENE } }) });
  const r0 = fakeRender({ png: true });
  const r = await runGeneration(request({ script: true, technique: "split-versus" }), await makeDeps(root, skills, { agents, render: r0.render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toContain("technique_not_realized");
  expect(agents.engineerCalls[1]!.input).toContain("ComparisonSplit");
  // первый код до рендера не дошёл
  expect(r0.calls).toHaveLength(1);
});

it("S15a: компонент приёма импортирован, но в JSX не стоит — тоже technique_not_realized", async () => {
  const importedOnly = GOOD_SCENE.replace(/^/, 'import { ComparisonSplit } from "@ms/motion-kit";\nvoid ComparisonSplit;\n');
  const agents = fakeAgents({ engineer: async (_t, n) => ({ files: { "src/Scene.tsx": n === 1 ? importedOnly : SPLIT_SCENE } }) });
  const r = await runGeneration(request({ script: true, technique: "split-versus" }), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toContain("technique_not_realized");
});

it("S15a: компонент приёма под своим именем (import … as) в JSX — реализован", async () => {
  const aliased = SPLIT_SCENE.replace('import { ComparisonSplit } from "@ms/motion-kit";', 'import { ComparisonSplit as Split } from "@ms/motion-kit";').replace("<ComparisonSplit ", "<Split ");
  const agents = fakeAgents({ engineer: async () => ({ files: { "src/Scene.tsx": aliased } }) });
  const r = await runGeneration(request({ script: true, technique: "split-versus" }), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
});

it("задача Engineer сцены сценария называет приём и его компонент", async () => {
  const agents = fakeAgents({ engineer: async () => ({ files: { "src/Scene.tsx": SPLIT_SCENE } }) });
  const r = await runGeneration(request({ script: true, technique: "split-versus" }), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
  expect(agents.engineerCalls[0]!.input).toMatch(/приём.*ComparisonSplit/);
});

it("последний вызов без компонента приёма — предупреждение, сцена не падает", async () => {
  const agents = fakeAgents({ engineer: async () => ({ files: { "src/Scene.tsx": GOOD_SCENE } }) });
  const deps = await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render });
  const r = await runGeneration(request({ script: true, technique: "split-versus" }), deps);
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls.length).toBeGreaterThan(1);
  expect(r.warnings.join("\n")).toContain("technique_not_realized");
});

it("без приёма — как раньше: один вызов Engineer", async () => {
  const agents = fakeAgents({});
  const r = await runGeneration(request(), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
});
