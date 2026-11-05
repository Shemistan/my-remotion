import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { ZodType } from "zod";
import { DEFAULT_WEIGHTS, DelegationState, normalizeWeights } from "../../src/agents/delegation.js";
import { RoutingRuntime, seqOf } from "../../src/agents/routing.js";
import type { AgentResult, AgentRuntimeAdapter, AgentTask, Role } from "../../src/agents/runtime.js";
import { Ok, makeTmp, removeTmp } from "./helpers.js";

type Status = AgentResult<unknown>["status"];

function fake(name: string, status: () => Status = () => "completed", kind: "cli" | "orphaned" = "cli"): AgentRuntimeAdapter & { calls: AgentTask<unknown>[] } {
  const calls: AgentTask<unknown>[] = [];
  return {
    calls,
    capabilities: async () => ({ available: true, version: name }),
    async run<I, O>(task: AgentTask<I>, schema: ZodType<O>): Promise<AgentResult<O>> {
      void schema;
      calls.push(task as AgentTask<unknown>);
      const st = status();
      return {
        status: st,
        ...(st === "completed" ? { output: { ok: true } as O } : { error: { kind, message: "boom" } }),
        usage: { model: name, inputTokens: 0, outputTokens: 0, costUsd: 0 },
        permissionDenials: [],
        stdoutPath: "",
        stderrPath: "",
        startedAt: "",
        finishedAt: "",
      };
    },
  };
}

const task = (role: Role, runId: string, seq = 1, attempt = 1, tools: AgentTask<unknown>["tools"] = []): AgentTask<string> => ({
  role,
  input: "x",
  inputRefs: [],
  workdir: "/w",
  tools,
  model: "opus",
  limits: { timeoutMs: 1000, maxBudgetUsd: 1 },
  idempotencyKey: `${runId}-a${attempt}-${role}-${seq}`,
  run: { root: "/r", runId, attempt },
});

const make = (level: number, codexStatus?: () => Status, kind?: "cli" | "orphaned") => {
  const claude = fake("claude");
  const codex = fake("codex", codexStatus, kind);
  const state = new DelegationState();
  const r = new RoutingRuntime({ claude, codex, state, policy: { enabled: true, level, allowUnverified: false }, weights: () => normalizeWeights(DEFAULT_WEIGHTS) });
  return { r, claude, codex, state };
};
const sig = () => new AbortController().signal;

it("seq from the idempotency key", () => {
  expect(seqOf(task("engineer", "run-1", 102))).toBe(102);
});

it("disabled policy: everything goes to Claude", async () => {
  const { r, claude, codex } = make(50);
  r.setPolicy({ enabled: false, level: 50, allowUnverified: false });
  for (let i = 0; i < 20; i++) await r.run(task("engineer", `run${i}`), Ok, sig());
  expect(codex.calls).toHaveLength(0);
  expect(claude.calls).toHaveLength(20);
});

it("level splits engineer first calls; fixes, retries and visual_qa always Claude", async () => {
  const { r, codex } = make(100);
  for (let i = 0; i < 50; i++) await r.run(task("engineer", `run${i}`), Ok, sig());
  expect(codex.calls.length).toBe(50);
  expect(r.route(task("engineer", "x", 101)).runtime).toBe("claude");
  expect(r.route(task("engineer", "x", 1, 2)).runtime).toBe("claude");
  expect(r.route(task("visual_qa", "x")).runtime).toBe("claude");
  expect(r.route(task("motion_director", "x")).runtime).toBe("claude");
  const half = make(30);
  let n = 0;
  for (let i = 0; i < 400; i++) if (half.r.route(task("engineer", `run${i}`)).runtime === "codex") n++;
  expect(n / 400).toBeGreaterThan(0.35);
  expect(n / 400).toBeLessThan(0.55);
});

it("toolless role: Codex failure falls back to Claude in the same call", async () => {
  const { r, claude, codex, state } = make(100, () => "failed");
  const res = await r.run(task("concept", "run1"), Ok, sig());
  expect(res.status).toBe("completed");
  expect(codex.calls).toHaveLength(1);
  expect(claude.calls).toHaveLength(1);
  expect(state.stats("concept").codex).toEqual({ n: 1, clean: 0 });
});

it("engineer: Codex failure restores the draft and reruns in Claude at once; orphaned never retried", async () => {
  const tmp = await makeTmp();
  try {
    const draft = join(tmp, "draft");
    await mkdir(draft);
    await writeFile(join(draft, "scaffold.txt"), "до");
    const claude = fake("claude");
    let seen = "";
    const codex = fake("codex", () => "failed");
    const run0 = codex.run.bind(codex);
    codex.run = async (t, s, g) => {
      await writeFile(join(draft, "scaffold.txt"), "испорчено");
      await writeFile(join(draft, "half.tsx"), "x");
      return run0(t, s, g);
    };
    const claudeRun = claude.run.bind(claude);
    claude.run = async (t, s, g) => {
      seen = (await readdir(draft)).sort().join(",") + ":" + (await readFile(join(draft, "scaffold.txt"), "utf8"));
      return claudeRun(t, s, g);
    };
    const r = new RoutingRuntime({ claude, codex, state: new DelegationState(), policy: { enabled: true, level: 100, allowUnverified: false }, weights: () => normalizeWeights(DEFAULT_WEIGHTS) });
    const t = { ...task("engineer", "run1", 1, 1, ["Read", "Write"]), workdir: draft };
    const res = await r.run(t, Ok, sig());
    expect(res.status).toBe("completed");
    expect(claude.calls).toHaveLength(1);
    expect(seen).toBe("scaffold.txt:до");
    expect((await readdir(tmp)).filter((n) => n.includes("codex-snap"))).toEqual([]);
  } finally {
    await removeTmp(tmp);
  }
  const o = make(100, () => "failed", "orphaned");
  expect((await o.r.run(task("concept", "run1"), Ok, sig())).error?.kind).toBe("orphaned");
  expect(o.claude.calls).toHaveLength(0);
});

it("a fix call marks the run's first engineer call dirty; repeated dirty runs pause engineer", async () => {
  const { r, state } = make(100);
  for (let i = 0; i < 9; i++) {
    await r.run(task("engineer", `run${i}`), Ok, sig());
    await r.run(task("engineer", `run${i}`, 101), Ok, sig());
  }
  expect(state.pausedRoles().has("engineer")).toBe(true);
  expect(r.plan().shares.engineer).toBe(0);
  expect(r.route(task("engineer", "fresh")).runtime).toBe("claude");
});

it("setPolicy applies on the next call", async () => {
  const { r, codex } = make(0);
  await r.run(task("concept", "a"), Ok, sig());
  expect(codex.calls).toHaveLength(0);
  r.setPolicy({ enabled: true, level: 100, allowUnverified: true });
  await r.run(task("motion_director", "b"), Ok, sig());
  expect(codex.calls).toHaveLength(1);
});

it("runtime modes: Claude is exclusive; Codex-only includes QA, fixes and retries", async () => {
  const { r, claude, codex } = make(100);
  r.setMode("claude-code");
  for (const t of [task("concept", "a"), task("visual_qa", "b"), task("engineer", "c", 101), task("engineer", "d", 1, 2)]) await r.run(t, Ok, sig());
  expect(claude.calls).toHaveLength(4);
  expect(codex.calls).toHaveLength(0);

  r.setMode("codex-only");
  for (const t of [task("concept", "e"), task("visual_qa", "f"), task("motion_director", "g"), task("engineer", "h", 101), task("engineer", "i", 1, 2)]) await r.run(t, Ok, sig());
  expect(codex.calls).toHaveLength(5);
  expect(claude.calls).toHaveLength(4);
  expect(r.getMode()).toBe("codex-only");
});

it("Codex-only returns a Codex failure and never falls back to Claude", async () => {
  const { r, claude, codex } = make(100, () => "failed");
  r.setMode("codex-only");
  const res = await r.run(task("concept", "quota"), Ok, sig());
  expect(res).toMatchObject({ status: "failed", error: { message: "boom" } });
  expect(codex.calls).toHaveLength(1);
  expect(claude.calls).toHaveLength(0);
});

it("setMode applies to the next call and capabilities follow the exclusive runtime", async () => {
  const { r, claude, codex } = make(100);
  r.setMode("claude-code");
  expect(await r.capabilities()).toMatchObject({ version: "claude" });
  await r.run(task("concept", "a"), Ok, sig());
  r.setMode("codex-only");
  expect(await r.capabilities()).toMatchObject({ version: "codex" });
  await r.run(task("concept", "b"), Ok, sig());
  expect(claude.calls).toHaveLength(1);
  expect(codex.calls).toHaveLength(1);
});
