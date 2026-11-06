import { readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { ConceptOutputSchema, DirectorOutputSchema, EditPlanSchema, EngineerReportSchema, VisualQAOutputSchema, toJsonSchema } from "@ms/contracts";
import { CodexRuntime, buildCodexArgs, codexToolsNote, dropNulls, parseCodexOutput, toStrictSchema } from "../../src/agents/codex.js";
import { Ok, bin, makeStore, makeTask, makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let store: string;
let logRoot: string;
let workdir: string;
beforeEach(async () => {
  tmp = await makeTmp();
  store = await makeStore(tmp);
  logRoot = join(store, "logs", "agent-runs");
  workdir = join(tmp, "draft");
  await mkdir(workdir);
  await chmod(bin("fake-codex.sh"), 0o755);
});
afterEach(() => removeTmp(tmp));

const Opt = z.object({ ok: z.boolean(), note: z.string().optional() }).strict();
const runtime = () => new CodexRuntime({ bin: bin("fake-codex.sh"), logRoot, model: "gpt-5.5", reasoningEffort: "high", promptLoader: () => "СИСТЕМНЫЙ ПРОМПТ РОЛИ" });
const task = (over: Partial<Parameters<typeof makeTask>[0]> = {}) =>
  makeTask({ input: "Ответь ok=true", run: { root: store, runId: "run1", attempt: 1 }, workdir, ...over });

it("args: read-only sandbox without write tools, workspace-write for engineer, prompt via stdin", () => {
  const a = buildCodexArgs(task(), { schemaPath: "/s.json", lastPath: "/l.json", model: "gpt-5.5", reasoningEffort: "high" });
  expect(a.slice(0, 2)).toEqual(["exec", "--json"]);
  expect(a[a.indexOf("-s") + 1]).toBe("read-only");
  expect(a[a.indexOf("-C") + 1]).toBe(workdir);
  expect(a).toContain('model_reasoning_effort="high"');
  expect(a.at(-1)).toBe("-");
  const e = buildCodexArgs(task({ role: "engineer", tools: ["Read", "Write", "Edit"] }), { schemaPath: "/s.json", lastPath: "/l.json" });
  expect(e[e.indexOf("-s") + 1]).toBe("workspace-write");
  expect(e).not.toContain("-m");
  expect(() => buildCodexArgs(task({ tools: ["Bash" as never] }), { schemaPath: "/s", lastPath: "/l" })).toThrow(/allowlist/);
});

it("strict schema: every property required, optional ones nullable, nested objects too", () => {
  const s = toStrictSchema({
    type: "object",
    properties: { a: { type: "string" }, b: { type: "object", properties: { c: { type: "number" } } } },
    required: ["a"],
  }) as { required: string[]; additionalProperties: boolean; properties: Record<string, { anyOf: { required?: string[]; properties?: Record<string, { anyOf: unknown[] }> }[] }> };
  expect(s.required).toEqual(["a", "b"]);
  expect(s.additionalProperties).toBe(false);
  expect(s.properties.b!.anyOf[1]).toEqual({ type: "null" });
  expect(s.properties.b!.anyOf[0]!.required).toEqual(["c"]);
  expect(s.properties.b!.anyOf[0]!.properties!.c!.anyOf).toHaveLength(2);
  expect(dropNulls({ a: 1, b: null, c: [{ d: null, e: 2 }] })).toEqual({ a: 1, c: [{ e: 2 }] });
});

it("parse: usage from turn.completed, codex model prefix, null optional dropped", () => {
  const out = ['{"type":"thread.started","thread_id":"t9"}', '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":3}}'].join("\n");
  const p = parseCodexOutput(out, '{"ok":true,"note":null}', Opt, "gpt-5.5");
  expect(p.status).toBe("completed");
  expect(p.output).toEqual({ ok: true });
  expect(p.usage).toEqual({ model: "codex:gpt-5.5", inputTokens: 10, outputTokens: 3, costUsd: 0 });
  expect(p.sessionId).toBe("t9");
  expect(parseCodexOutput("", "нет", Ok, "").error?.kind).toBe("schema");
  expect(parseCodexOutput('{"type":"turn.failed","error":{"message":"quota"}}', undefined, Ok, "").error).toEqual({ kind: "cli", message: "quota" });
});

it("run: happy path through the fake CLI, prompt carries the role prompt and data, logs in the store", async () => {
  const r = await runtime().run(task({ input: { brief: "сцена" } }), Ok, new AbortController().signal);
  expect(r.status).toBe("completed");
  expect(r.output).toEqual({ ok: true });
  expect(r.usage.model).toBe("codex:gpt-5.5");
  expect(r.usage.costUsd).toBe(0);
  expect(r.stdoutPath.startsWith(logRoot)).toBe(true);
  const stdin = readFileSync(join(workdir, "stdin.txt"), "utf8");
  expect(stdin).toContain("СИСТЕМНЫЙ ПРОМПТ РОЛИ");
  expect(stdin).toContain('"brief": "сцена"');
  expect(stdin).toContain("Файлы не создавай");
  const schema = JSON.parse(readFileSync(join(r.stdoutPath, "..", "schema.json"), "utf8")) as { additionalProperties: boolean };
  expect(schema.additionalProperties).toBe(false);
});

it("strict schema: no free-form objects in agent contracts, the API rejects them", () => {
  const freeForm = (n: unknown): boolean => {
    if (Array.isArray(n)) return n.some(freeForm);
    if (n === null || typeof n !== "object") return false;
    const o = n as Record<string, unknown>;
    return (o.type === "object" && o.properties === undefined) || Object.values(o).some(freeForm);
  };
  for (const s of [ConceptOutputSchema, DirectorOutputSchema, EditPlanSchema, EngineerReportSchema, VisualQAOutputSchema]) {
    expect(freeForm(toStrictSchema(toJsonSchema(s)))).toBe(false);
  }
});

it("parse: a free-form object arrives as a JSON string and is decoded, also inside arrays and optionals", () => {
  const S = z.object({ items: z.array(z.object({ content: z.record(z.unknown()) })), extra: z.record(z.string()).optional() });
  const answer = JSON.stringify({ items: [{ content: JSON.stringify({ component: "Card", states: [{ on: 1 }] }) }], extra: '{"a":"b"}' });
  expect(parseCodexOutput("", answer, S, "m").output).toEqual({ items: [{ content: { component: "Card", states: [{ on: 1 }] } }], extra: { a: "b" } });
  const unset = JSON.stringify({ items: [], extra: null });
  expect(parseCodexOutput("", unset, S, "m").output).toEqual({ items: [] });
  const broken = JSON.stringify({ items: [{ content: "не json" }] });
  expect(parseCodexOutput("", broken, S, "m").error?.kind).toBe("schema");
});

it("tools note: translates Claude tool names into Codex tools", () => {
  const reader = codexToolsNote(["Read"]);
  expect(reader).toContain("view_image");
  expect(reader).toContain("только чтение");
  expect(reader).not.toContain("apply_patch");
  const engineer = codexToolsNote(["Read", "Write", "Edit", "Glob", "Grep"]);
  expect(engineer).toContain("apply_patch");
  expect(engineer).toContain("Glob и Grep");
  expect(engineer).not.toContain("только чтение");
  expect(codexToolsNote([])).toBe("Файлы не создавай и не меняй: ответ — только итоговый JSON.");
});

it("run: a role with Read gets the view_image instruction after its role prompt", async () => {
  await runtime().run(task({ tools: ["Read"] }), Ok, new AbortController().signal);
  const stdin = readFileSync(join(workdir, "stdin.txt"), "utf8");
  expect(stdin.indexOf("view_image")).toBeGreaterThan(stdin.indexOf("СИСТЕМНЫЙ ПРОМПТ РОЛИ"));
});

it("run: CLI failure is failed/cli with the turn error", async () => {
  await writeFile(join(workdir, "codex-mode.txt"), "fail");
  const r = await runtime().run(task(), Ok, new AbortController().signal);
  expect(r.status).toBe("failed");
  expect(r.error?.kind).toBe("cli");
  expect(r.error?.message).toContain("quota exceeded");
});

it("run: role profile overrides the global Codex model", async () => {
  const r = await new CodexRuntime({
    bin: bin("fake-codex.sh"), logRoot, model: "gpt-global", reasoningEffort: "high",
    agents: { engineer: { model: "gpt-engineer", reasoningEffort: "xhigh" } },
    promptLoader: () => "РОЛЬ",
  }).run(task({ role: "engineer", tools: ["Read", "Write"] }), Ok, new AbortController().signal);
  expect(r.usage.model).toBe("codex:gpt-engineer");
});

it("run: non-JSON final message is failed/schema; null optionals pass", async () => {
  await writeFile(join(workdir, "codex-mode.txt"), "badjson");
  expect((await runtime().run(task(), Ok, new AbortController().signal)).error?.kind).toBe("schema");
  await writeFile(join(workdir, "codex-mode.txt"), "nulls");
  const r = await runtime().run(task(), Opt, new AbortController().signal);
  expect(r.output).toEqual({ ok: true });
});

it("capabilities: version from --version; missing binary is unavailable", async () => {
  expect(await runtime().capabilities()).toMatchObject({ available: true, version: "0.165.0" });
  expect((await new CodexRuntime({ bin: join(tmp, "nope"), logRoot }).capabilities()).available).toBe(false);
});
