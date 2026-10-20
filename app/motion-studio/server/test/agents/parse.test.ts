import { expect, it } from "vitest";
import { parseClaudeOutput } from "../../src/agents/claude-code.js";
import { Ok, fx } from "./helpers.js";

it("success: completed with output, usage from modelUsage and session id", () => {
  const r = parseClaudeOutput(fx("success.json"), Ok);
  expect(r).toMatchObject({ status: "completed", usage: { costUsd: expect.any(Number) } });
  expect(r.output).toEqual({ ok: true });
  expect(r.error).toBeUndefined();
  expect(r.usage.model).toBe("claude-haiku-5-5");
  expect(r.usage.costUsd).toBeCloseTo(0.0005019, 7);
  // входные токены — вместе с кэшем (2 + 1090 + 2324)
  expect(r.usage.inputTokens).toBe(3416);
  expect(r.usage.outputTokens).toBe(52);
  expect(r.permissionDenials).toEqual([]);
  expect(r.sessionId).toBe("230fe329-ed5e-4117-b674-e34407ab496a");
});

it("is_error: failed with kind cli and the CLI message", () => {
  const r = parseClaudeOutput(fx("is-error.json"), Ok);
  expect(r).toMatchObject({ status: "failed", error: { kind: "cli" } });
  expect(r.error!.message).toMatch(/529 Overloaded/);
  expect(r.output).toBeUndefined();
});

it("budget exhausted (real CLI output): failed with kind budget, cost kept", () => {
  const r = parseClaudeOutput(fx("budget.json"), Ok);
  expect(r).toMatchObject({ status: "failed", error: { kind: "budget" } });
  expect(r.usage.costUsd).toBeGreaterThan(0);
});

it("structured_output fails Zod: failed with kind schema", () => {
  const r = parseClaudeOutput(fx("schema-violation.json"), Ok);
  expect(r).toMatchObject({ status: "failed", error: { kind: "schema" } });
  expect(r.error!.message).toMatch(/ok/);
  expect(r.output).toBeUndefined();
});

it("no structured_output: failed with kind schema", () => {
  expect(parseClaudeOutput(fx("no-structured.json"), Ok)).toMatchObject({ status: "failed", error: { kind: "schema" } });
});

it("non-JSON or empty stdout: failed with kind cli and empty usage", () => {
  for (const out of ["", "not json", "[]", '{"type":"other"}']) {
    const r = parseClaudeOutput(out, Ok);
    expect(r).toMatchObject({ status: "failed", error: { kind: "cli" } });
    expect(r.usage).toEqual({ model: "", inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(r.permissionDenials).toEqual([]);
  }
});

it("permission denials are kept as-is", () => {
  const j = JSON.parse(fx("success.json"));
  j.permission_denials = [{ tool_name: "Read", tool_use_id: "t1", tool_input: { file_path: "/Users/x/.zshrc" } }];
  const r = parseClaudeOutput(JSON.stringify(j), Ok);
  expect(r.status).toBe("completed");
  expect(r.permissionDenials).toEqual(j.permission_denials);
});

it("model is the one with the largest cost in modelUsage", () => {
  const j = JSON.parse(fx("success.json"));
  j.modelUsage["claude-opus-x"] = { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.5 };
  const r = parseClaudeOutput(JSON.stringify(j), Ok);
  expect(r.usage.model).toBe("claude-opus-x");
  expect(r.usage.outputTokens).toBe(57);
});
