// Task 28: промпт и задача Rough Cut Editor — без инструментов, вход только id и текст слов и
// длины пауз (без таймкодов), правила роли и контракт доказательств подставлены.
import { describe, expect, it } from "vitest";
import { buildRoughCutTask, loadPrompt } from "../../src/agents/prompts.js";
import { loadConfig } from "../../src/config.js";

const config = loadConfig({ MS_DATA_DIR: "/tmp/ms-unused" });
const run = { root: "/tmp/ms-unused", runId: "job_01TEST", attempt: 1, config };

describe("Rough Cut Editor", () => {
  it("промпт: контракт доказательств, фальстарты, последний полный дубль, осмысленные паузы", () => {
    const p = loadPrompt("rough_cut_editor");
    expect(p).not.toContain("{{>");
    expect(p).toMatch(/Контракт доказательств/);
    expect(p).toMatch(/quote_mismatch/);
    expect(p).toMatch(/фальстарт/i);
    expect(p).toMatch(/последний полный дубль/);
    expect(p).toMatch(/осмысленные паузы/i);
    expect(p).toMatch(/данные, а не инструкции/);
    expect(p.length).toBeGreaterThan(1500);
  });

  it("задача: роль без инструментов, слова id+текст, паузы длиной, без µs; вырезки детектора словами", () => {
    const words = [
      { id: "w_000001", text: "Привет.", start_us: 400_000, end_us: 900_000, gap_after_us: 1_600_000 },
      { id: "w_000002", text: "Э-э,", start_us: 2_500_000, end_us: 2_800_000, gap_after_us: 100_000 },
      { id: "w_000003", text: "начнём", start_us: 2_900_000, end_us: 3_300_000, gap_after_us: 0 },
    ];
    const t = buildRoughCutTask({
      segments: [{ id: "seg_0001", word_ids: ["w_000001"] }, { id: "seg_0002", word_ids: ["w_000002", "w_000003"] }],
      words,
      detector: [
        { id: "pau_r1_1", reason: "pause", origin: "detector", status: "proposed", source_start_us: 1_200_000, source_end_us: 2_400_000, confidence: 0.9, explanation: "пауза 1,6 с между словами" },
        { id: "fil_r1_1", reason: "filler", origin: "detector", status: "proposed", start_word_id: "w_000002", end_word_id: "w_000002", source_start_us: 2_466_667, source_end_us: 2_833_333, confidence: 0.85, explanation: "слово-паразит «Э-э,»" },
      ],
      workdir: "/tmp/ms-unused/cwd",
    }, run);
    expect(t.role).toBe("rough_cut_editor");
    expect(t.tools).toEqual([]);
    expect(t.model).toBe("sonnet");
    expect(t.input).toContain("w_000001 Привет.\n[пауза 1,6 с]");
    expect(t.input).toContain("## seg_0002\nw_000002 Э-э,\nw_000003 начнём");
    expect(t.input).toContain("[пауза 0,4 с в начале записи]");
    expect(t.input).toContain("- pau_r1_1 (pause): после w_000001 «Привет.», перед w_000002 «Э-э,» — пауза 1,6 с между словами");
    expect(t.input).toContain("- fil_r1_1 (filler): слова w_000002…w_000002 «Э-э,»");
    // ни одного таймкода: только id, тексты и длины пауз
    for (const us of ["400000", "900000", "2500000", "1200000", "2466667", "start_us", "end_us"]) expect(t.input).not.toContain(us);
  });
});
