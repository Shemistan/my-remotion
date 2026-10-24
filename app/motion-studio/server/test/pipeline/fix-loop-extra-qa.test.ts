// Хук extraQa (S6): дополнительная проверка каждой попытки после программных проверок; её
// blocking — раунд исправления Engineer, как прочие. Без хука поведение прежнее.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { QAIssue } from "@ms/contracts";
import type { RenderRequest } from "@ms/render";
import { type GenerationRequest, runGeneration } from "../../src/pipeline/generate.js";
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
const opaque: QAIssue = { source: "programmatic", code: "overlay_opaque", severity: "blocking", frame: 150, description: "непрозрачно 97 %", fix_hint: "фон — только <Background>" };

function request(extraQa?: GenerationRequest["extraQa"]): GenerationRequest {
  const d = directorOutput();
  return {
    prompt: "тест",
    settings: s,
    qa: { allowRestricted: false },
    plan: async () => ({ kind: "plan", director: { selection: d.selection, rationale: d.rationale }, spec: d.spec, candidates: [] }),
    ...(extraQa ? { extraQa } : {}),
  };
}

it("blocking extraQa на попытке 1 → исправление Engineer, попытка 2 чистая → ready", async () => {
  const agents = fakeAgents({});
  const r0 = fakeRender({ png: true });
  const deps = await makeDeps(root, skills, { agents, render: r0.render });
  const seen: { versionDir: string; frames: number[]; transparent: unknown; outDir?: string }[] = [];
  let call = 0;
  const r = await runGeneration(request(async (v) => {
    call++;
    const rr = await v.renderStills([150], { style: { transparent: true } });
    const req = r0.calls.at(-1) as RenderRequest;
    seen.push({ versionDir: v.versionDir, frames: req.stills, transparent: (req.inputProps as { style: { transparent: unknown } }).style.transparent, ...(req.outDir ? { outDir: req.outDir } : {}) });
    expect(rr.ok).toBe(true);
    expect(v.spec.duration_frames).toBe(180);
    expect(v.settings.duration_frames).toBe(s.duration_frames);
    return call === 1 ? [opaque] : [];
  }), deps);
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(2);
  expect(call).toBe(2);
  // замечание дошло до Engineer подсказкой исправления
  expect(agents.engineerCalls[1]!.input).toContain("overlay_opaque");
  // кадр проверки — в своём каталоге run/tmp (не frames/ draft), и каталог убран
  expect(seen[0]).toMatchObject({ frames: [150], transparent: true });
  expect(seen[0]!.outDir).toContain(join(root, "run/tmp"));
  // M1: внутри каталога попытки run/tmp/<run>-a<n>/extra-* (уборка попытки забирает и его)
  expect(seen[0]!.outDir!.slice(join(root, "run/tmp").length)).toMatch(/^\/[^/]+-a\d+\/extra-[^/]+$/);
  expect(seen[0]!.outDir).not.toBe(seen[0]!.versionDir);
  expect(existsSync(seen[0]!.outDir!)).toBe(false);
  expect(seen[1]!.versionDir).toBe(seen[0]!.versionDir);
});

it("без extraQa — число вызовов Engineer и рендеров прежнее", async () => {
  const agents = fakeAgents({});
  const r0 = fakeRender({ png: true });
  const r = await runGeneration(request(), await makeDeps(root, skills, { agents, render: r0.render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
  expect(r0.calls).toHaveLength(1);
});

it("сбой самой проверки — предупреждение, не blocking", async () => {
  const agents = fakeAgents({});
  const r = await runGeneration(request(async () => {
    throw new Error("ffmpeg сломался");
  }), await makeDeps(root, skills, { agents, render: fakeRender({ png: true }).render }));
  expect(r.status).toBe("ready");
  expect(agents.engineerCalls).toHaveLength(1);
  expect(r.qa?.issues).toContainEqual(expect.objectContaining({ code: "extra_qa_failed", severity: "warning" }));
});
