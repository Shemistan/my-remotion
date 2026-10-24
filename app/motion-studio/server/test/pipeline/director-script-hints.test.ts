// S11: подсказки сцены сценария (`key_term_early`, `foreign_label`) дают Director ещё один
// раунд, даже без blocking; второй ответ хуже (blocking) — остаётся первый, принятый.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MotionSpec } from "@ms/contracts";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runGeneration, readKitApi } from "../../src/pipeline/generate.js";
import { directorStep, finaleLine, sceneStyle, scenePropsStyle, type ScriptHints } from "../../src/pipeline/steps.js";
import { directorOutput, fakeAgents, makeDeps, makeSkills, makeStore, makeTmp, removeTmp, settings } from "./helpers.js";

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

/** Ответ Director: число 256 досчитано к кадру 40, а звучит на 150. */
const early = () => {
  const out = directorOutput();
  out.spec.elements = [...out.spec.elements, { id: "num", kind: "number", role: "emphasis", entrance: "count", content: { to: 256 } }];
  out.spec.beats = [...out.spec.beats, { id: "b-count", kind: "count", start_frame: 0, end_frame: 40, action: "count", description: "", element_ids: ["num"] }];
  return out;
};
const uniform = () => {
  const out = directorOutput();
  out.spec.elements = ["a", "b", "c"].map((id) => ({ id, kind: "text" as const, role: "текст", entrance: "fade" as const, content: {} }));
  out.spec.beats = out.spec.beats.map((b) => ({ ...b, element_ids: ["a", "b", "c"] }));
  return out;
};

const hints: ScriptHints = { keyMoments: [{ text: "256", value: 256, frame: 150 }], sourceText: "рост пользователей один к двумстам пятидесяти шести" };

function run(agents: ReturnType<typeof fakeAgents>, script?: ScriptHints) {
  return makeDeps(root, skills, { agents }).then((deps) => runGeneration({
    prompt: "тест", settings: s,
    plan: async (rc) => {
      const style = sceneStyle(scenePropsStyle(s), s);
      const d = await directorStep(rc, { prompt: "тест", settings: s, candidates: [], patternTexts: [], kitApi: await readKitApi(), style, ...(script ? { scriptHints: script } : {}) });
      if (!d.ok) return { kind: "failed", stage: d.stage, message: d.message };
      return { kind: "plan", director: d.director, spec: d.spec, candidates: [] };
    },
  }, deps));
}

describe("directorStep: подсказки сцены сценария", () => {
  it("key_term_early без blocking — второй раунд Director с замечанием", async () => {
    let n = 0;
    const agents = fakeAgents({ director: async () => ({ output: ++n === 1 ? early() : directorOutput() }) });
    const r = await run(agents, hints);
    expect(r.status).toBe("ready");
    const directors = agents.tasks.filter((t) => t.role === "motion_director");
    expect(directors).toHaveLength(2);
    expect(String(directors[1]!.input)).toContain("key_term_early");
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.elements.map((e) => e.id)).not.toContain("num");
  });

  it("второй ответ с blocking — остаётся первый, подсказка — в предупреждениях", async () => {
    let n = 0;
    const agents = fakeAgents({ director: async () => ({ output: ++n === 1 ? early() : uniform() }) });
    const r = await run(agents, hints);
    expect(r.status).toBe("ready");
    expect(agents.tasks.filter((t) => t.role === "motion_director")).toHaveLength(2);
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.elements.map((e) => e.id)).toContain("num");
    expect(r.warnings.join("\n")).toContain("key_term_early");
  });

  it("не сцена сценария — один раунд, как раньше", async () => {
    const agents = fakeAgents({ director: async () => ({ output: early() }) });
    const r = await run(agents);
    expect(r.status).toBe("ready");
    expect(agents.tasks.filter((t) => t.role === "motion_director")).toHaveLength(1);
  });
});

describe("finaleLine: живой финал на герое (S11, ss_004)", () => {
  it("называет носителя — элементы фазы hold, движение заметное", () => {
    const sp = directorOutput().spec;
    const phased: MotionSpec = {
      ...sp,
      phases: [{ id: "act", role: "action", weight: 2, element_ids: ["chart"] }, { id: "hold", role: "hold", weight: 1, element_ids: ["chart", "title"], hold_mode: "now-pulse" }],
      beats: [{ ...sp.beats[1]!, phase: "act" }, { ...sp.beats[3]!, phase: "hold", kind: "hold" }],
    };
    const line = finaleLine(phased);
    expect(line).toContain("финал: hold_mode now-pulse, бит hold `b4`");
    expect(line).toContain("носитель — герой: chart, title");
    expect(finaleLine(sp)).not.toContain("носитель");
  });
});
