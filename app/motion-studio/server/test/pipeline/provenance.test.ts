// provenanceGate: kb_ids_used ⊆ knowledge-refs.json, и только permissive без разрешения.
import { describe, expect, it } from "vitest";
import type { EngineerReport, KnowledgeRef } from "@ms/contracts";
import { provenanceGate } from "../../src/pipeline/provenance.js";
import { fakeKb, view } from "./helpers.js";

const ref = (kb_id: string, license_class: KnowledgeRef["license_class"] = "permissive"): KnowledgeRef => ({
  kb_id, repository: "r", repository_url: "u", commit: "abc", license: "MIT", license_class, strategy: "adapt", source_paths: [],
});
const report = (ids: string[]): EngineerReport => ({ files_written: [], kit_components_used: [], kb_ids_used: ids, notes: "" });
const kb = fakeKb([view({ id: "fake/line-chart" }), view({ id: "fake/gpl", license_class: "restricted", license: "GPL-3.0" })]);

describe("provenanceGate", () => {
  it("kb_ids_used из knowledge-refs и permissive — без замечаний", () => {
    expect(provenanceGate(report(["fake/line-chart"]), [ref("fake/line-chart")], kb, false)).toEqual([]);
    expect(provenanceGate(report([]), [ref("fake/line-chart")], kb, false)).toEqual([]);
  });

  it("kb_id вне knowledge-refs.json → blocking provenance", () => {
    const r = provenanceGate(report(["fake/line-chart", "made/up"]), [ref("fake/line-chart")], kb, false);
    expect(r).toEqual([expect.objectContaining({ source: "technical", code: "provenance", severity: "blocking", area: "made/up" })]);
  });

  it("license_class не permissive без разрешения → blocking license; с разрешением — допустимо", () => {
    const refs = [ref("fake/gpl", "restricted")];
    expect(provenanceGate(report(["fake/gpl"]), refs, kb, false)).toEqual([expect.objectContaining({ code: "license", severity: "blocking", area: "fake/gpl" })]);
    expect(provenanceGate(report(["fake/gpl"]), refs, kb, true)).toEqual([]);
  });
});
