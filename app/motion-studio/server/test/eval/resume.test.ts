// Продолжение прогона eval: сцена, упавшая на обрыве сети, генерируется заново, а настоящий
// провал пайплайна (QA, таймаут Engineer) остаётся результатом и идёт к судье.
import { describe, expect, it } from "vitest";
import { isTransientFailure } from "../../src/eval/resume.js";

describe("isTransientFailure", () => {
  it("обрыв соединения с API — сбой среды", () => {
    expect(isTransientFailure({ stage: "engineer", message: "вызов Engineer завершился failed (cli): success: API Error: Connection dropped (ECONNRESET)" })).toBe(true);
    expect(isTransientFailure({ message: "Concept: failed (cli): fetch failed: ETIMEDOUT" })).toBe(true);
    expect(isTransientFailure({ message: "socket hang up" })).toBe(true);
  });

  it("провал пайплайна — результат сцены", () => {
    expect(isTransientFailure({ stage: "qa", message: "QA: blocking после 2 исправлений: clipping (кадр 152)" })).toBe(false);
    expect(isTransientFailure({ stage: "engineer", message: "вызов Engineer завершился timeout (timeout): таймаут 600000 мс" })).toBe(false);
  });

  it("без описания сбоя — не сбой среды", () => {
    expect(isTransientFailure(undefined)).toBe(false);
    expect(isTransientFailure(null)).toBe(false);
    expect(isTransientFailure({})).toBe(false);
  });
});
