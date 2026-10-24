// Task 28: слияние предложений и повторный propose поверх решений человека.
import { describe, expect, it } from "vitest";
import { carryOver, mergeProposals } from "../../src/edit/merge.js";
import { F30, dec, w } from "./helpers.js";

const none = { decisions: [], reviews: [] };
const words = [w("w_000001", "я", 0, 200_000), w("w_000002", "я", 300_000, 500_000), w("w_000003", "думаю", 600_000, 1_000_000), w("w_000004", "так", 2_600_000, 3_000_000)];

describe("mergeProposals", () => {
  it("drop_cut агента: уверенность ≤ 0.3 и agent_note; вырезка остаётся предложением", () => {
    const m = mergeProposals([dec("d1", { reason: "pause" })], { decisions: [], reviews: [{ decision_id: "d1", verdict: "drop_cut", why: "пауза перед числом" }] }, []);
    expect(m[0]).toMatchObject({ status: "proposed", agent_note: "пауза перед числом" });
    expect(m[0]!.confidence).toBeLessThanOrEqual(0.3);
    const k = mergeProposals([dec("d1", { reason: "pause", confidence: 0.7 })], { decisions: [], reviews: [{ decision_id: "d1", verdict: "keep_cut", why: "затянуто" }] }, []);
    expect(k[0]).toMatchObject({ confidence: 0.7, agent_note: "агент за вырезку: затянуто" });
  });

  it("вердикт по несуществующему id — пропуск с уведомлением", () => {
    const unknown: string[] = [];
    const m = mergeProposals([dec("d1")], { decisions: [], reviews: [{ decision_id: "nope", verdict: "drop_cut", why: "x" }] }, [], { onUnknownReview: (id) => unknown.push(id) });
    expect(m).toHaveLength(1);
    expect(unknown).toEqual(["nope"]);
  });

  it("пересечение агента и детектора — одно объединение с обеими причинами", () => {
    const det = dec("rep_1", { reason: "repeat", source_start_us: 0, source_end_us: 300_000, start_word_id: "w_000001", end_word_id: "w_000001", explanation: "повтор «я»", confidence: 0.8 });
    const agt = dec("agt_1", { reason: "false_start", origin: "agent", source_start_us: 200_000, source_end_us: 600_000, start_word_id: "w_000002", end_word_id: "w_000002", explanation: "фальстарт", confidence: 0.6 });
    const m = mergeProposals([det], none, [agt], { words, fps: F30 });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({
      id: "rep_1", reason: "false_start", origin: "agent", status: "proposed", source_start_us: 0, source_end_us: 600_000,
      confidence: 0.8, explanation: "повтор «я»; фальстарт", start_word_id: "w_000001", end_word_id: "w_000002",
    });
  });

  it("пересечение разных детекторов (пауза внутри повтора) — объединение, причина смысловая; касание — не пересечение", () => {
    const rep = dec("rep_1", { reason: "repeat", source_start_us: 0, source_end_us: 300_000, start_word_id: "w_000001", end_word_id: "w_000001" });
    const pau = dec("pau_1", { reason: "pause", source_start_us: 200_000, source_end_us: 300_000 });
    const tail = dec("pau_2", { reason: "pause", source_start_us: 300_000, source_end_us: 400_000 });
    const m = mergeProposals([pau, rep, tail], none, [], { words, fps: F30 });
    expect(m.map((x) => [x.id, x.reason, x.source_start_us, x.source_end_us])).toEqual([["rep_1", "repeat", 0, 300_000], ["pau_2", "pause", 300_000, 400_000]]);
  });

  it("объединение без слов внутри — без якорей", () => {
    const a = dec("pau_1", { source_start_us: 1_100_000, source_end_us: 2_000_000 });
    const b = dec("pau_2", { source_start_us: 1_500_000, source_end_us: 2_500_000 });
    const m = mergeProposals([a, b], none, [], { words, fps: F30 });
    expect(m).toHaveLength(1);
    expect(m[0]!.start_word_id).toBeUndefined();
  });
});

describe("carryOver (повторный propose)", () => {
  it("отклонённое человеком не воскресает, принятое не дублируется, решения пользователя сохраняются", () => {
    const base = [
      dec("pau_r1_1", { status: "rejected", source_start_us: 1_100_000, source_end_us: 2_500_000 }),
      dec("rep_r1_1", { reason: "repeat", status: "accepted", source_start_us: 0, source_end_us: 300_000, start_word_id: "w_000001", end_word_id: "w_000001" }),
      dec("usr_r2_1", { reason: "manual", origin: "user", status: "accepted", source_start_us: 2_600_000, source_end_us: 3_000_000, start_word_id: "w_000004", end_word_id: "w_000004" }),
      dec("fil_r1_1", { reason: "filler", status: "proposed", source_start_us: 500_000, source_end_us: 600_000 }),
    ];
    const fresh = [
      dec("pau_r3_1", { source_start_us: 1_100_000, source_end_us: 2_500_000 }), // то же место, что отклонено
      dec("rep_r3_1", { reason: "repeat", source_start_us: 0, source_end_us: 300_000 }), // уже принято
      dec("agt_r3_1", { reason: "false_start", origin: "agent", source_start_us: 600_000, source_end_us: 1_000_000 }), // новое
    ];
    const r = carryOver(base, fresh, words, F30);
    expect(r.suppressed.map((x) => x.id)).toEqual(["pau_r3_1", "rep_r3_1"]);
    expect(r.decisions.map((x) => [x.id, x.status])).toEqual([["rep_r1_1", "accepted"], ["agt_r3_1", "proposed"], ["pau_r1_1", "rejected"], ["usr_r2_1", "accepted"]]);
  });

  it("то же предложение — прежний id (повтор без изменений даёт тот же документ)", () => {
    const base = [dec("pau_r1_1", { source_start_us: 1_100_000, source_end_us: 2_500_000 })];
    const r = carryOver(base, [dec("pau_r2_1", { source_start_us: 1_100_000, source_end_us: 2_500_000 })], words, F30);
    expect(r.decisions).toEqual(base);
  });

  it("частичное пересечение с отклонённым меньше половины — новое предложение остаётся", () => {
    const base = [dec("pau_r1_1", { status: "rejected", source_start_us: 1_000_000, source_end_us: 1_200_000 })];
    const r = carryOver(base, [dec("agt_r2_1", { origin: "agent", reason: "bad_take", source_start_us: 1_100_000, source_end_us: 2_000_000 })], words, F30);
    expect(r.decisions.map((x) => x.id)).toEqual(["pau_r1_1", "agt_r2_1"]);
    expect(r.suppressed).toEqual([]);
  });

  it("якоря решений пользователя пересчитываются по текущему транскрипту (удалённое слово)", () => {
    const base = [dec("usr_r1_1", { reason: "manual", origin: "user", status: "accepted", source_start_us: 0, source_end_us: 600_000, start_word_id: "w_000009", end_word_id: "w_000002" })];
    const r = carryOver(base, [], words, F30);
    expect(r.decisions[0]).toMatchObject({ start_word_id: "w_000001", end_word_id: "w_000002" });
  });
});
