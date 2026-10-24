// S11 → S14: подсказки сцены сценария (`foreign_label`, `placeholder_label`, `empty_container`)
// дают Director ещё один раунд, даже без blocking; второй ответ хуже (blocking) — остаётся
// первый, принятый. `key_term_early` раунда не стоит — раскрытие под слово ставят якоря планировщика.
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
/** Ответ Director с подписями-заглушками: три узла «вопрос» (ss_005 смоука S11). */
const stub = () => {
  const out = directorOutput();
  out.spec.elements = [...out.spec.elements, ...["q1", "q2", "q3"].map((id) => ({ id, kind: "card" as const, role: "узел", entrance: "rise" as const, content: { label: "вопрос" } }))];
  out.spec.beats = out.spec.beats.map((b, k) => (k === 0 ? { ...b, element_ids: [...b.element_ids, "q1", "q2", "q3"] } : b));
  return out;
};
const uniform = () => {
  const out = directorOutput();
  out.spec.elements = ["a", "b", "c"].map((id) => ({ id, kind: "text" as const, role: "текст", entrance: "fade" as const, content: {} }));
  out.spec.beats = out.spec.beats.map((b) => ({ ...b, element_ids: ["a", "b", "c"] }));
  return out;
};

const hints: ScriptHints = { keyMoments: [{ text: "256", value: 256, frame: 150 }], sourceText: "рост пользователей один к двумстам пятидесяти шести" };

function run(agents: ReturnType<typeof fakeAgents>, script?: ScriptHints, cp?: { jobId: string }) {
  return makeDeps(root, skills, { agents }).then((deps) => runGeneration({
    prompt: "тест", settings: s,
    plan: async (rc) => {
      const style = sceneStyle(scenePropsStyle(s), s);
      const d = await directorStep(rc, { prompt: "тест", settings: s, candidates: [], patternTexts: [], kitApi: await readKitApi(), style, ...(script ? { scriptHints: script } : {}) }, cp);
      if (!d.ok) return { kind: "failed", stage: d.stage, message: d.message };
      return { kind: "plan", director: d.director, spec: d.spec, candidates: [] };
    },
  }, deps));
}

describe("directorStep: подсказки сцены сценария", () => {
  it("подписи-заглушки без blocking — второй раунд Director с замечанием", async () => {
    let n = 0;
    const agents = fakeAgents({ director: async () => ({ output: ++n === 1 ? stub() : directorOutput() }) });
    const r = await run(agents, hints);
    expect(r.status).toBe("ready");
    const directors = agents.tasks.filter((t) => t.role === "motion_director");
    expect(directors).toHaveLength(2);
    expect(String(directors[1]!.input)).toContain("placeholder_label");
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.elements.map((e) => e.id)).not.toContain("q1");
  });

  // S14: key_term_early — только предупреждение (раскрытие под слово — якоря планировщика)
  it("раннее раскрытие числа — без второго раунда, предупреждение в версии", async () => {
    const agents = fakeAgents({ director: async () => ({ output: early() }) });
    const r = await run(agents, hints);
    expect(r.status).toBe("ready");
    expect(agents.tasks.filter((t) => t.role === "motion_director")).toHaveLength(1);
    expect(r.warnings.join("\n")).toContain("key_term_early");
  });

  it("второй ответ с blocking — остаётся первый, подсказка — в предупреждениях", async () => {
    let n = 0;
    const agents = fakeAgents({ director: async () => ({ output: ++n === 1 ? stub() : uniform() }) });
    const r = await run(agents, hints);
    expect(r.status).toBe("ready");
    expect(agents.tasks.filter((t) => t.role === "motion_director")).toHaveLength(2);
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.elements.map((e) => e.id)).toContain("q1");
    expect(r.warnings.join("\n")).toContain("placeholder_label");
  });

  // S11-fix I1: предупреждение не превращается в провал — любой сбой второго раунда оставляет первый ответ
  it("второй раунд упал (отказ агента) — сцена идёт с ответом первого раунда", async () => {
    let n = 0;
    const agents = fakeAgents({ director: async () => (++n === 1 ? { output: stub() } : { status: "failed", error: { kind: "timeout", message: "таймаут" } }) });
    const r = await run(agents, hints);
    expect(r.status).toBe("ready");
    expect(agents.tasks.filter((t) => t.role === "motion_director")).toHaveLength(2);
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.elements.map((e) => e.id)).toContain("q1");
    expect(r.warnings.join("\n")).toMatch(/оставлен ответ первого раунда/);
  });

  it("второй ответ с другой длительностью — сцена идёт с ответом первого раунда", async () => {
    let n = 0;
    const agents = fakeAgents({
      director: async () => {
        if (++n === 1) return { output: stub() };
        const out = directorOutput();
        out.spec.duration_frames = s.duration_frames + 30;
        return { output: out };
      },
    });
    const r = await run(agents, hints);
    expect(r.status).toBe("ready");
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.elements.map((e) => e.id)).toContain("q1");
  });

  // S11-fix I3: чекпоинт хранит уже принятый ответ — повтор задачи не гоняет раунд подсказок заново
  it("повтор задачи (ответ из чекпоинта) — без второго раунда по подсказкам", async () => {
    let n = 0;
    const first = fakeAgents({ director: async () => ({ output: ++n === 1 ? stub() : uniform() }) });
    expect((await run(first, hints, { jobId: "job_s11" })).status).toBe("ready");
    const again = fakeAgents({ director: async () => ({ output: directorOutput() }) });
    const r = await run(again, hints, { jobId: "job_s11" });
    expect(r.status).toBe("ready");
    expect(again.tasks.filter((t) => t.role === "motion_director")).toHaveLength(0);
    const spec = JSON.parse(readFileSync(join(r.versionDir!, "spec.json"), "utf8")) as MotionSpec;
    expect(spec.elements.map((e) => e.id)).toContain("q1");
  });

  // S11-fix I2a: короткий термин (< 4 букв) — только подсказка, не повод для раунда
  it("ранний короткий термин — подсказка без второго раунда", async () => {
    const short = () => {
      const out = directorOutput();
      out.spec.elements = [...out.spec.elements, { id: "word", kind: "text", role: "emphasis", entrance: "mask", content: { text: "нет" } }];
      out.spec.beats = [...out.spec.beats, { id: "b-acc", kind: "accent", start_frame: 0, end_frame: 20, action: "emphasis", description: "", element_ids: ["word"] }];
      return out;
    };
    const agents = fakeAgents({ director: async () => ({ output: short() }) });
    const r = await run(agents, { keyMoments: [{ text: "нет", frame: 150 }] });
    expect(r.status).toBe("ready");
    expect(agents.tasks.filter((t) => t.role === "motion_director")).toHaveLength(1);
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
  // S11-fix M7: только у сцены сценария и ровно один носитель — первый emphasis/number фазы hold
  it("называет одного носителя — первый emphasis/number фазы hold, только у сцены сценария", () => {
    const sp = directorOutput().spec;
    const phased: MotionSpec = {
      ...sp,
      elements: [...sp.elements, { id: "num", kind: "number", role: "label", entrance: "count", content: { to: 3 } }, { id: "acc", kind: "text", role: "emphasis", entrance: "mask", content: { text: "итог" } }],
      phases: [{ id: "act", role: "action", weight: 2, element_ids: ["chart"] }, { id: "hold", role: "hold", weight: 1, element_ids: ["chart", "title", "num", "acc"], hold_mode: "now-pulse" }],
      beats: [{ ...sp.beats[1]!, phase: "act" }, { ...sp.beats[3]!, phase: "hold", kind: "hold" }],
    };
    const line = finaleLine(phased, true);
    expect(line).toContain("финал: hold_mode now-pulse, бит hold `b4`");
    expect(line).toContain("носитель — герой: num");
    expect(line).not.toMatch(/герой: [^—]*acc/);
    expect(finaleLine(phased)).not.toContain("носитель");
    expect(finaleLine(phased, false)).not.toContain("носитель");
    // в hold нет ни числа, ни акцента — носителя не называем
    expect(finaleLine({ ...phased, phases: [phased.phases![0]!, { ...phased.phases![1]!, element_ids: ["chart", "title"] }] }, true)).not.toContain("носитель");
  });
});
