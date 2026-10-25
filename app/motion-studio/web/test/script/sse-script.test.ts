// S9 (C12): событие задачи перечитывает состояние сценария (["script"]); прогресс — нет.
import { expect, it } from "vitest";
import { invalidateForEvent } from "../../src/api/sse.js";

it("событие задачи инвалидирует ['script'], прогресс — нет", () => {
  const calls: unknown[] = [];
  const client = { invalidateQueries: (f: unknown) => calls.push(f) };
  invalidateForEvent(client, { kind: "job", jobId: "job_1", eventKind: "completed" });
  expect(calls).toContainEqual({ queryKey: ["script"] });
  calls.length = 0;
  invalidateForEvent(client, { kind: "job", jobId: "job_1", eventKind: "progress" });
  expect(calls).not.toContainEqual({ queryKey: ["script"] });
});
