// Наборы bench: explainer (12 сцен, средние и правило --compare) и отдельный набор пользователя
// (6 кейсов иллюстративной анимации). Выбор набора не должен менять explainer-набор.
import { describe, expect, it } from "vitest";
import { EXPLAINER_SET, HELD_OUT, USER_DURATION_FRAMES, parseSetName, setItems } from "../../src/bench/sets.js";
import { USER_CASES } from "../../src/bench/user-cases.js";

describe("parseSetName", () => {
  it("по умолчанию — explainer", () => {
    expect(parseSetName(undefined)).toBe("explainer");
    expect(parseSetName("explainer")).toBe("explainer");
    expect(parseSetName("user")).toBe("user");
  });

  it("неизвестный набор — ошибка с перечнем", () => {
    expect(() => parseSetName("illustrative")).toThrow(/explainer, user/);
  });
});

describe("setItems", () => {
  it("explainer — прежние 12 сцен в прежнем порядке, 5 отложенных, длительность по умолчанию", () => {
    const items = setItems("explainer");
    expect(items.map((i) => i.id)).toEqual([
      "test1", "test2", "gen-compare", "gen-timeline", "gen-cache", "held-mobile", "held-queue",
      "bench-funnel", "bench-oauth", "bench-cdn", "bench-budget", "bench-abtest",
    ]);
    expect(items.every((i) => i.scene === i.id && i.prompt === EXPLAINER_SET[i.id] && i.duration_frames === undefined)).toBe(true);
    expect([...HELD_OUT]).toEqual(["bench-funnel", "bench-oauth", "bench-cdn", "bench-budget", "bench-abtest"]);
  });

  it("user — шесть кейсов user-01…user-06, 60 с, дословный промпт без «Особенно оценивай»", () => {
    const items = setItems("user");
    expect(items.map((i) => i.id)).toEqual(["user-01", "user-02", "user-03", "user-04", "user-05", "user-06"]);
    expect(USER_DURATION_FRAMES).toBe(1800);
    expect(items.every((i) => i.duration_frames === USER_DURATION_FRAMES)).toBe(true);
    expect(items[0]!.prompt.startsWith("Создай красивую, эмоциональную, цельную рисованную 2D motion-анимацию.")).toBe(true);
    expect(items[0]!.prompt.endsWith("- 90–100%: наезд камеры и надпись «ShemDev».")).toBe(true);
    for (const i of items) expect(i.prompt).not.toMatch(/Особенно оценивай|Готовый промпт/);
    expect(USER_CASES.map((c) => c.slug)).toEqual(["gray-to-color", "paper-crane", "one-light", "seed", "melody", "after-rain"]);
    expect(USER_CASES.every((c) => c.focus.length > 0)).toBe(true);
  });

  it("наборы не пересекаются: user-сцены не отложенные и не в explainer", () => {
    for (const i of setItems("user")) {
      expect(HELD_OUT.has(i.scene)).toBe(false);
      expect(EXPLAINER_SET[i.id]).toBeUndefined();
    }
  });

  it("--only выбирает внутри набора; чужие id — ошибка", () => {
    expect(setItems("user", ["user-02", "user-05"]).map((i) => i.id)).toEqual(["user-02", "user-05"]);
    expect(setItems("explainer", ["test1"]).map((i) => i.id)).toEqual(["test1"]);
    expect(() => setItems("user", ["test1"])).toThrow(/нет таких сцен в наборе user: test1/);
    expect(() => setItems("explainer", ["user-01"])).toThrow(/нет таких сцен в наборе explainer/);
  });
});
