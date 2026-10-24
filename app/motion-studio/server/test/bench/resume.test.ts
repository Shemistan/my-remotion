// Продолжение прогона bench: сцена, упавшая на обрыве сети, генерируется заново, а настоящий
// провал пайплайна (QA, таймаут Engineer) остаётся результатом и идёт к судье.
import { describe, expect, it } from "vitest";
import { isTransientFailure } from "../../src/bench/resume.js";

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

  it("QA с сетевым словом в тексте проблемы (цитата лога) — всё равно результат", () => {
    expect(isTransientFailure({ stage: "qa", message: "QA: blocking: console_error: fetch failed: ETIMEDOUT в логе сцены" })).toBe(false);
  });

  it("S2-fix2 N2: сбой вызова Visual QA помечен transient там, где возник, — сбой среды", () => {
    const message = "Visual QA не дал оценки: failed (cli): API Error: Connection dropped (ECONNRESET) (вызовов: 2); без оценки по кадрам версия не ready";
    expect(isTransientFailure({ stage: "qa", message, transient: true })).toBe(true);
    expect(isTransientFailure({ stage: "qa", message })).toBe(false); // без пометки — результат
  });

  it("без описания сбоя — не сбой среды", () => {
    expect(isTransientFailure(undefined)).toBe(false);
    expect(isTransientFailure(null)).toBe(false);
    expect(isTransientFailure({})).toBe(false);
  });
});
