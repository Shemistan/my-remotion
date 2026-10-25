// S17b: временной проход пробы — падение страницы («Page crashed!») даёт один повтор в новой
// странице; второй сбой (или сбой не страницы) — строка `[sweep-error]`, превью не роняется.
import { describe, expect, it } from "vitest";
import { SWEEP_ERROR_TAG, SWEEP_RETRY_TAG, runSweep } from "../src/node/sweep.js";

function fake(errors: (string | undefined)[]) {
  let calls = 0;
  const pass = async () => {
    const e = errors[calls++];
    if (e !== undefined) throw new Error(`${e}\n    at stack`);
  };
  return { pass, calls: () => calls };
}

describe("runSweep", () => {
  it("проход прошёл — один вызов, логов нет", async () => {
    const f = fake([undefined]);
    const logs: string[] = [];
    expect(await runSweep(f.pass, (l) => logs.push(l))).toBe("ok");
    expect(f.calls()).toBe(1);
    expect(logs).toEqual([]);
  });

  it("Page crashed! → маркер повтора и второй проход; повтор удался", async () => {
    const f = fake(["Page crashed!"]);
    const logs: string[] = [];
    expect(await runSweep(f.pass, (l) => logs.push(l))).toBe("retried");
    expect(f.calls()).toBe(2);
    expect(logs).toEqual([`${SWEEP_RETRY_TAG} Page crashed!`]);
  });

  it("повтор тоже упал — [sweep-error] с причиной, третьего прохода нет", async () => {
    const f = fake(["Page crashed!", "Target closed"]);
    const logs: string[] = [];
    expect(await runSweep(f.pass, (l) => logs.push(l))).toBe("failed");
    expect(f.calls()).toBe(2);
    expect(logs).toEqual([`${SWEEP_RETRY_TAG} Page crashed!`, `${SWEEP_ERROR_TAG} повтор: Target closed`]);
  });

  it("сбой не страницы (таймаут) — без повтора: [sweep-error] сразу", async () => {
    const f = fake(["A delayRender() was called but not cleared after 13000ms"]);
    const logs: string[] = [];
    expect(await runSweep(f.pass, (l) => logs.push(l))).toBe("failed");
    expect(f.calls()).toBe(1);
    expect(logs).toEqual([`${SWEEP_ERROR_TAG} A delayRender() was called but not cleared after 13000ms`]);
  });
});
