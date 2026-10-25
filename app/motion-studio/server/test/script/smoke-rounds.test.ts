// Раунды Engineer по кодам blocking для smoke json (ревью S15b, M-2).
import { expect, it } from "vitest";
import { roundsByCode } from "./smoke-rounds.js";

it("s15b сц. 5: один QA-дубль (вызов 2) и вызов Engineer 3 после него — dead_air стоил раунд Engineer; починка typecheck до QA — ничей раунд", () => {
  const r = roundsByCode({
    engineer_calls: 3,
    attempts: [{ take: 1, call: 2, blocking: ["text_overlap", "dead_air", "empty_container"] }],
    timings: { engineer_1: 1, static: 1, typecheck: 1, engineer_2: 1, render_2: 1, engineer_3: 1 },
  });
  expect(r.engineer_rounds_by_code).toEqual({ text_overlap: 1, dead_air: 1, empty_container: 1 });
  expect(r).toMatchObject({ engineer_calls: 3, attempts: 1 });
});

it("правка после QA и её починка typecheck — два раунда на код; последний QA без следующего вызова — не раунд; дубль 2 — свои вызовы", () => {
  const r = roundsByCode({
    engineer_calls: 7,
    attempts: [
      { take: 1, call: 1, blocking: ["dead_air"] },
      { take: 1, call: 3, blocking: ["dead_air", "empty_half"] },
      { take: 1, call: 4, blocking: ["empty_half"] },
      { take: 2, call: 1, blocking: ["ghost_text"] },
      { take: 2, call: 2, blocking: [] },
    ],
    timings: { engineer_1: 1, engineer_2: 1, engineer_3: 1, engineer_4: 1, t2_engineer_1: 1, t2_engineer_2: 1, t2_engineer_3: 1 },
  });
  // dead_air: вызовы 2–3 после попытки 1 и 4 после попытки 3; empty_half: 4 (после попытки 4 вызовов нет)
  expect(r.engineer_rounds_by_code).toEqual({ dead_air: 3, empty_half: 1, ghost_text: 1 });
  expect(r.attempts_by_code).toEqual({ dead_air: 2, empty_half: 2, ghost_text: 1 });
});
