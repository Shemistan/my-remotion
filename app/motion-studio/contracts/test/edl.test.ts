import { describe, expect, it } from "vitest";
import { EditDecisionSchema, EdlOpSchema, EdlRevisionDocSchema, acceptedCuts, buildTimeline } from "../src/index.js";
import { F30, NTSC, SHA, dec } from "./video-fixtures.js";

function edl(decisions: unknown[]): Record<string, unknown> {
  return {
    schema_version: 1, edl_id: "edl_1", revision: 1, media_id: "med_1", media_sha256: SHA, transcript_id: "tr_1",
    timeline_fps: NTSC, decisions,
  };
}

describe("edl", () => {
  it("EditDecision", () => {
    expect(EditDecisionSchema.safeParse(dec()).success).toBe(true);
    expect(EditDecisionSchema.safeParse(dec({ confidence: 1.2 })).success).toBe(false);
    expect(EditDecisionSchema.safeParse(dec({ confidence: -0.1 })).success).toBe(false);
    expect(EditDecisionSchema.safeParse(dec({ reason: "silence" })).success).toBe(false);
    expect(EditDecisionSchema.safeParse(dec({ source_start_us: 5, source_end_us: 5 })).success).toBe(false);
    expect(EditDecisionSchema.safeParse(dec({ start_word_id: "w_000001", end_word_id: "w_000003", origin: "agent", agent_note: "дубль" })).success).toBe(true);
    // слова — либо оба, либо ни одного
    expect(EditDecisionSchema.safeParse(dec({ start_word_id: "w_000001" })).success).toBe(false);
  });

  it("EdlRevisionDoc: уникальные id решений", () => {
    expect(EdlRevisionDocSchema.safeParse(edl([dec(), dec({ id: "cut_002" })])).success).toBe(true);
    expect(EdlRevisionDocSchema.safeParse(edl([dec(), dec()])).success).toBe(false);
    expect(EdlRevisionDocSchema.safeParse({ ...edl([]), ops: [{ op: "add_cut_range", source_start_us: 1, source_end_us: 2 }] }).success).toBe(true);
  });

  it("EdlOp", () => {
    expect(EdlOpSchema.safeParse({ op: "set_status", decision_id: "cut_001", status: "accepted" }).success).toBe(true);
    expect(EdlOpSchema.safeParse({ op: "set_status", decision_id: "cut_001", status: "proposed" }).success).toBe(false);
    expect(EdlOpSchema.safeParse({ op: "add_cut", start_word_id: "w_000001", end_word_id: "w_000002" }).success).toBe(true);
    expect(EdlOpSchema.safeParse({ op: "add_cut_range", source_start_us: 3, source_end_us: 2 }).success).toBe(false);
    expect(EdlOpSchema.safeParse({ op: "remove", decision_id: "cut_001" }).success).toBe(true);
  });

  it("acceptedCuts: только принятые, по возрастанию", () => {
    const d = EdlRevisionDocSchema.parse(edl([
      dec({ id: "c3", status: "accepted", source_start_us: 7_000_000, source_end_us: 7_500_000 }),
      dec({ id: "c1", status: "proposed" }),
      dec({ id: "c2", status: "rejected", source_start_us: 5_000_000, source_end_us: 6_000_000 }),
      dec({ id: "c4", status: "accepted", source_start_us: 2_000_000, source_end_us: 3_500_000 }),
    ]));
    expect(acceptedCuts(d)).toEqual([{ start_us: 2_000_000, end_us: 3_500_000 }, { start_us: 7_000_000, end_us: 7_500_000 }]);
    expect(acceptedCuts(EdlRevisionDocSchema.parse(edl([])))).toEqual([]);
    expect(buildTimeline(10_000_000, acceptedCuts(d), F30).duration_us).toBe(8_000_000);
  });
});
