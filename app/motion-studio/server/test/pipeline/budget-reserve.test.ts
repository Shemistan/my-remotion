// S5-fix I7: резерв бюджета задачи под параллельные вызовы агентов (два дубля).
import { describe, expect, it } from "vitest";
import { BudgetExhausted, MIN_CALL_USD, RunCtx, type StepDeps } from "../../src/pipeline/steps.js";

const ctx = (maxCostUsd = 5) =>
  new RunCtx({ config: { scene: { maxCostUsd } } } as unknown as StepDeps, undefined, "/r", "run", 1, undefined);
const sig = () => new AbortController().signal;

describe("RunCtx.reserve", () => {
  it("хватает на лимит вызова — резерв на весь лимит; второй вызов при занятом остатке ждёт освобождения", async () => {
    const rc = ctx();
    rc.spent = 3;
    expect(await rc.reserve(2, sig())).toBe(2);
    expect(rc.reserved).toBe(2);
    let second: number | undefined;
    const p = rc.reserve(2, sig()).then((x) => (second = x));
    await new Promise((r) => setTimeout(r, 20));
    expect(second).toBeUndefined();
    // первый вызов стоил 1.2 и отпустил резерв: свободно 0.8 — меньше лимита, но никто не идёт
    rc.spent += 1.2;
    (rc as unknown as { unreserve(x: number): void }).unreserve(2);
    await p;
    expect(second).toBeCloseTo(0.8, 6);
    expect(rc.spent + rc.reserved).toBeLessThanOrEqual(5 + 1e-9);
  });

  it("остаток меньше MIN_CALL_USD и никто не идёт — BudgetExhausted (вызов не запускается)", async () => {
    const rc = ctx();
    rc.spent = 5 - MIN_CALL_USD / 2;
    await expect(rc.reserve(2, sig())).rejects.toBeInstanceOf(BudgetExhausted);
    expect(rc.reserved).toBe(0);
  });

  it("ожидание резерва прерывается сигналом", async () => {
    const rc = ctx();
    await rc.reserve(5, sig());
    const ac = new AbortController();
    const p = rc.reserve(1, ac.signal);
    ac.abort();
    await expect(p).rejects.toThrow(/не начат/);
  });

  it("call: отказ бюджета — budget в итоге, агент не вызывается", async () => {
    let called = 0;
    const agents = { capabilities: async () => ({ available: true }), run: async () => (called++, {}) };
    const rc = new RunCtx(
      { config: { scene: { maxCostUsd: 1 } }, agents, storage: async () => ({ ok: true, root: "/r", marker: {}, freeBytes: 1 }) } as unknown as StepDeps,
      undefined, "/r", "run", 1, undefined,
    );
    rc.spent = 0.9;
    const task = { role: "engineer", limits: { timeoutMs: 1, maxBudgetUsd: 2 } } as never;
    const r = await rc.call(task, {} as never);
    expect(r.budget).toMatch(/бюджет/);
    expect(r.error).toBeUndefined();
    expect(called).toBe(0);
  });
});
