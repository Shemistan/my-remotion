import { readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { CodexRuntime, buildCodexArgs, dropNulls, parseCodexOutput, toStrictSchema } from "../../src/agents/codex.js";
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

it("run: CLI failure is failed/cli with the turn error", async () => {
  await writeFile(join(workdir, "codex-mode.txt"), "fail");
  const r = await runtime().run(task(), Ok, new AbortController().signal);
  expect(r.status).toBe("failed");
  expect(r.error?.kind).toBe("cli");
  expect(r.error?.message).toContain("quota exceeded");
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
