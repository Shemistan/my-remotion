// S15b: смысл props.json попытки по фрагменту (хук extraQa сцены сценария): противоречие —
// blocking fragment_mismatch для Engineer, исправляется один раз (FIX_ONCE); сомнение в
// отношении — три кадра и вопрос модели, «нет» — warning relation_not_shown.
import { afterEach, beforeEach, expect, it } from "vitest";
import { type GenerationRequest, runGeneration } from "../../src/pipeline/generate.js";
import { fragmentFitAttempt } from "../../src/qa/fragment-fit.js";
import { GOOD_SCENE, contractProps, directorOutput, fakeAgents, fakeRender, makeDeps, makeSkills, makeStore, makeTmp, removeTmp, settings } from "./helpers.js";

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
const fragment = { quote: "рост пользователей в двести пятьдесят шесть раз", purpose: "показать рост", key_terms: [{ text: "рост" }], data: [{ label: "рост", value: 256, quote: "двести пятьдесят шесть" }] };

/** Engineer пишет props.json со строкой на экране «Рост». */
const engineer = async (task: { workdir: string }) => ({
  files: { "src/Scene.tsx": GOOD_SCENE, "props.json": JSON.stringify({ ...(JSON.parse(await contractProps(task.workdir)) as object), content: { title: { text: "Рост" } } }) },
});

function request(extraQa: GenerationRequest["extraQa"]): GenerationRequest {
  const d = directorOutput();
  return {
    prompt: "тест", settings: s, qa: { allowRestricted: false }, script: true, extraQa,
    plan: async () => ({ kind: "plan", director: { selection: d.selection, rationale: d.rationale }, spec: d.spec, candidates: [] }),
  };
}

it("противоречие в props.json — blocking fragment_mismatch, Engineer исправляет один раз; повтор — warning", async () => {
  const agents = fakeAgents({
    engineer,
    fragmentFit: async (task) => (task.tools.includes("Read")
      ? { output: { shown: "yes", reason: "видно" } }
      : { output: { claims: [{ element_id: "title", text: "Рост", verdict: "contradicts", reason: "во фрагменте рост в 256 раз" }], relation: { expected: "рост в 256 раз", shown: "рост", match: "no" } } }),
  });
  const r0 = fakeRender({ png: true });
  const r = await runGeneration(request((v) => fragmentFitAttempt(v, fragment, { lead: 15, speech: 135 })), await makeDeps(root, skills, { agents, render: r0.render }));
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.engineerCalls[1]!.input).toContain("fragment_mismatch");
  // второй раз то же противоречие — warning (FIX_ONCE), сцена не крутит раунды
  expect(r.status).toBe("ready");
  expect(r.qa?.issues).toContainEqual(expect.objectContaining({ code: "fragment_mismatch", severity: "warning" }));
  // сомнение в отношении — модель спрошена по кадрам (Read), отношение видно — без замечания
  expect(agents.tasks.some((t) => t.role === "fragment_fit" && t.tools.includes("Read"))).toBe(true);
  expect(r.qa?.issues.some((x) => x.code === "relation_not_shown")).toBe(false);
});

it("отношение не показано по кадрам — warning relation_not_shown; модель уверена — кадров не снимает", async () => {
  const agents = fakeAgents({
    engineer,
    fragmentFit: async (task) => (task.tools.includes("Read")
      ? { output: { shown: "no", reason: "только подписи" } }
      : { output: { claims: [], relation: { expected: "рост в 256 раз", shown: "заголовок", match: "unsure" } } }),
  });
  const r0 = fakeRender({ png: true });
  const r = await runGeneration(request((v) => fragmentFitAttempt(v, fragment, { lead: 15, speech: 135 }, 120)), await makeDeps(root, skills, { agents, render: r0.render }));
  expect(r.status).toBe("ready");
  expect(r.qa?.issues).toContainEqual(expect.objectContaining({ code: "relation_not_shown", severity: "warning" }));
  // кадры: середина речи (15 + 67), пик payoff 120, финал N−1
  expect(r0.calls.some((c) => JSON.stringify(c.stills) === JSON.stringify([82, 120, s.duration_frames - 1]))).toBe(true);
  expect(agents.tasks.filter((t) => t.role === "fragment_fit")).toHaveLength(2);

  const sure = fakeAgents({ engineer, fragmentFit: async () => ({ output: { claims: [], relation: { expected: "рост", shown: "рост", match: "yes" } } }) });
  const r1 = fakeRender({ png: true });
  await runGeneration(request((v) => fragmentFitAttempt(v, fragment)), await makeDeps(root, skills, { agents: sure, render: r1.render }));
  expect(sure.tasks.filter((t) => t.role === "fragment_fit")).toHaveLength(1);
  expect(r1.calls).toHaveLength(1);
});

it("вопрос по кадрам кэшируется по версии, вопросу и кадрам: второй раунд с теми же кадрами модель не спрашивает (ревью S15b, M-4)", async () => {
  const agents = fakeAgents({
    engineer,
    fragmentFit: async (task) => (task.tools.includes("Read")
      ? { output: { shown: "no", reason: "только подписи" } }
      : { output: { claims: [{ element_id: "title", text: "Рост", verdict: "contradicts", reason: "во фрагменте рост в 256 раз" }], relation: { expected: "рост в 256 раз", shown: "рост", match: "unsure" } } }),
  });
  const r0 = fakeRender({ png: true });
  const r = await runGeneration(request((v) => fragmentFitAttempt(v, fragment, { lead: 15, speech: 135 })), await makeDeps(root, skills, { agents, render: r0.render }));
  // два раунда Engineer — два прохода хука; текст (A) уже в кэше, вопрос по кадрам (B) — один
  expect(agents.engineerCalls).toHaveLength(2);
  expect(agents.tasks.filter((t) => t.role === "fragment_fit" && !t.tools.includes("Read"))).toHaveLength(1);
  expect(agents.tasks.filter((t) => t.role === "fragment_fit" && t.tools.includes("Read"))).toHaveLength(1);
  // ответ из кэша — то же замечание
  expect(r.qa?.issues).toContainEqual(expect.objectContaining({ code: "relation_not_shown", severity: "warning" }));
});
