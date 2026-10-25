// Task 26: прогресс воркера ASR (`PROGRESS <процент> <этап>` в stdout) — построчно из кусков.
import { describe, expect, it } from "vitest";
import { ProgressParser, parseProgress } from "../../src/media/asr-adapter.js";

describe("parseProgress", () => {
  it("строка прогресса → процент и этап; прочее — undefined", () => {
    expect(parseProgress("PROGRESS 42.5 кусок 2 из 3")).toEqual({ percent: 42.5, stage: "кусок 2 из 3" });
    expect(parseProgress("PROGRESS 0.0 загрузка модели")).toEqual({ percent: 0, stage: "загрузка модели" });
    expect(parseProgress("  PROGRESS 100 \r")).toEqual({ percent: 100, stage: "" });
    expect(parseProgress("PROGRESS 250 x")).toEqual({ percent: 100, stage: "x" });
    expect(parseProgress("loading weights")).toBeUndefined();
    expect(parseProgress("PROGRESS -5 x")).toBeUndefined();
    expect(parseProgress("PROGRESS NaN x")).toBeUndefined();
  });
});

describe("ProgressParser", () => {
  it("куски stdout с разрывом посреди строки", () => {
    const seen: [number, string][] = [];
    const p = new ProgressParser((pct, st) => seen.push([pct, st]));
    p.push("PROGRESS 0.0 загр");
    p.push("узка модели\nшум\nPROGRESS 50.0 кусок 1 из 2\nPROG");
    p.push("RESS 100.0 кусок 2 из 2\n");
    expect(seen).toEqual([[0, "загрузка модели"], [50, "кусок 1 из 2"], [100, "кусок 2 из 2"]]);
  });
});
