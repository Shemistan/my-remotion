// runVisualQA на фейковом рантайме: каталог QA вне draft, только копии кадров, роль и
// инструменты, missing_element. Реальный claude — в qa.e2e.test.ts.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { VisualQAOutput } from "@ms/contracts";
import { initStore } from "@ms/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../../src/agents/runtime.js";
import { loadConfig } from "../../src/config.js";
import { runVisualQA } from "../../src/qa/visual-agent.js";
import { beat, card, el, makeTmp, removeTmp, spec, style } from "./helpers.js";

let tmp: string;
let root: string;
let draft: string;
beforeEach(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, { volumeUuid: async () => "V", deviceId: async () => 2, systemDeviceId: async () => 1, freeBytes: async () => 1e12 }, {});
  draft = join(root, "workspace", "drafts", "run_X-a1");
  await mkdir(join(draft, "frames"), { recursive: true });
  for (const f of [15, 72, 99]) await writeFile(join(draft, "frames", `${f}.png`), card().png());
  await mkdir(join(draft, "src"));
  await writeFile(join(draft, "src", "Scene.tsx"), "export const Scene = () => null;");
});
afterEach(() => removeTmp(tmp));

const sp = spec({
  elements: [el("title", { role: "заголовок" }), el("line-pulse", { kind: "shape", role: "emphasis", entrance: "pop" })],
  beats: [beat("b0", 0, 40, ["title"]), beat("b1", 40, 100, ["line-pulse"], "final-emphasis")],
});

function fake(output: VisualQAOutput, seen: { task?: AgentTask<unknown>; files?: string[]; checklist?: string } = {}): AgentRuntimeAdapter {
  return {
    capabilities: async () => ({ available: true }),
    async run<I, O>(task: AgentTask<I>): Promise<AgentResult<O>> {
      seen.task = task as AgentTask<unknown>;
      const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [relative(task.workdir, join(d, e.name))]));
      seen.files = walk(task.workdir).sort();
      seen.checklist = readFileSync(join(task.workdir, "checklist.md"), "utf8");
      const now = new Date().toISOString();
      return { status: "completed", output: output as O, usage: { model: "fake", inputTokens: 1, outputTokens: 1, costUsd: 0.01 }, permissionDenials: [], stdoutPath: "", stderrPath: "", startedAt: now, finishedAt: now };
    },
  };
}

const out = (seen: VisualQAOutput["elements_seen"]): VisualQAOutput => ({
  gate: { visual: "pass", semantic: "pass", style: "pass" },
  issues: [],
  checked_frames: [15, 72],
  ocr: [],
  elements_seen: seen,
});

describe("runVisualQA", () => {
  it("роль visual_qa, только Read, модель из настроек; cwd — run/tmp/<runId>-a<attempt>/qa с копиями кадров", async () => {
    const seen: Parameters<typeof fake>[1] = {};
    const config = loadConfig({ MS_DATA_DIR: root });
    const r = await runVisualQA(
      { workdir: draft, frames: [15, 72], spec: sp, style: style(), brief: { prompt: "рост" }, runRef: { root, runId: "run_X", attempt: 1 }, signal: new AbortController().signal },
      { agents: fake(out([{ id: "title", frame: 15, seen: true }, { id: "line-pulse", frame: 72, seen: true }]), seen), config },
    );
    expect(r.status).toBe("completed");
    const t = seen.task!;
    expect(t).toMatchObject({ role: "visual_qa", tools: ["Read"], model: "sonnet", run: { root, runId: "run_X", attempt: 1 } });
    expect(t.workdir).toBe(join(root, "run", "tmp", "run_X-a1", "qa"));
    expect(t.limits).toEqual({ timeoutMs: config.agents.visual_qa.timeoutMs, maxBudgetUsd: config.agents.visual_qa.maxBudgetUsd });
    // только копии переданных кадров и данные проверки — без исходников сцены
    expect(seen.files).toEqual(["brief.json", "checklist.md", "frames/15.png", "frames/72.png", "spec.json", "style.json"]);
    expect(readFileSync(join(t.workdir, "frames", "15.png")).equals(readFileSync(join(draft, "frames", "15.png")))).toBe(true);
    for (const id of ["title", "line-pulse"]) expect(seen.checklist).toContain(`\`${id}\``);
    expect(seen.checklist).toContain("frames/72.png");
    expect(String(t.input)).toContain("checklist.md");
    // draft не тронут
    expect(readdirSync(join(draft, "frames")).sort()).toEqual(["15.png", "72.png", "99.png"]);
    expect(existsSync(join(draft, "qa"))).toBe(false);
  });

  it("повторный вызов в той же попытке: в frames/ только новые кадры", async () => {
    const config = loadConfig({ MS_DATA_DIR: root });
    const base = { workdir: draft, spec: sp, style: style(), brief: {}, runRef: { root, runId: "run_X", attempt: 1 }, signal: new AbortController().signal };
    const ok = out([{ id: "title", seen: true }, { id: "line-pulse", seen: true }]);
    await runVisualQA({ ...base, frames: [15, 72] }, { agents: fake(ok), config });
    const seen: Parameters<typeof fake>[1] = {};
    await runVisualQA({ ...base, frames: [99] }, { agents: fake(ok, seen), config });
    expect(seen.files!.filter((f) => f.startsWith("frames/"))).toEqual(["frames/99.png"]);
  });

  it("элемент seen: false → blocking missing_element, visual fail; не упомянутый — warning", async () => {
    const config = loadConfig({ MS_DATA_DIR: root });
    const input = { workdir: draft, frames: [15, 72], spec: sp, style: style(), brief: {}, runRef: { root, runId: "run_X", attempt: 1 }, signal: new AbortController().signal };
    const r = await runVisualQA(input, { agents: fake(out([{ id: "title", seen: true }, { id: "line-pulse", seen: false }])), config });
    expect(r.output!.gate.visual).toBe("fail");
    expect(r.output!.issues).toContainEqual(expect.objectContaining({ code: "missing_element", severity: "blocking", area: "line-pulse" }));

    const r2 = await runVisualQA(input, { agents: fake(out([{ id: "title", seen: true }])), config });
    expect(r2.output!.issues).toContainEqual(expect.objectContaining({ code: "missing_element", severity: "warning", area: "line-pulse" }));
    expect(r2.output!.gate.visual).toBe("warn");
  });

  it("кадра нет в draft — ошибка до вызова агента", async () => {
    const config = loadConfig({ MS_DATA_DIR: root });
    const input = { workdir: draft, frames: [5], spec: sp, style: style(), brief: {}, runRef: { root, runId: "run_X", attempt: 1 }, signal: new AbortController().signal };
    await expect(runVisualQA(input, { agents: fake(out([])), config })).rejects.toThrow(/5\.png/);
  });
});
