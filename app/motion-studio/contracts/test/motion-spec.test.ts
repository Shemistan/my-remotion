import { describe, expect, it } from "vitest";
import {
  ComponentSelectionSchema, DirectorOutputSchema, EngineerReportSchema,
  KnowledgeRefSchema, MotionSpecSchema,
} from "../src/index.js";
import { baseSpec, specWith } from "./fixtures.js";

const ok = (v: unknown) => MotionSpecSchema.safeParse(v).success;

describe("MotionSpec", () => {
  it("корректная спека проходит", () => expect(ok(baseSpec())).toBe(true));
  it("бит за пределами длительности", () =>
    expect(ok(specWith({ duration_frames: 100, beats: [{ start_frame: 90, end_frame: 120 }] }))).toBe(false));
  it("пустой бит (start == end)", () =>
    expect(ok(specWith({ beats: [{ start_frame: 10, end_frame: 10 }] }))).toBe(false));
  it("бит с end < start", () =>
    expect(ok(specWith({ beats: [{ start_frame: 20, end_frame: 10 }] }))).toBe(false));
  it("неизвестный element_id", () =>
    expect(ok(specWith({ beats: [{ element_ids: ["nope"] }] }))).toBe(false));
  it("дубли id элементов", () => {
    const s = baseSpec();
    s.elements.push({ ...s.elements[0]! });
    expect(ok(s)).toBe(false);
  });
  it("дубли id битов", () => {
    const s = baseSpec();
    s.beats[1]!.id = s.beats[0]!.id;
    expect(ok(s)).toBe(false);
  });
  it("неизвестный kind / entrance", () => {
    const s = baseSpec();
    (s.elements[0] as Record<string, unknown>).kind = "video";
    expect(ok(s)).toBe(false);
    const t = baseSpec();
    (t.elements[0] as Record<string, unknown>).entrance = "spin";
    expect(ok(t)).toBe(false);
  });
  it("layout вне долей кадра", () => {
    const s = baseSpec();
    s.elements[1]!.layout = { x: 0, y: 0, w: 1.5, h: 1 };
    expect(ok(s)).toBe(false);
  });
  it("пустые elements/beats отвергаются", () => {
    expect(ok({ ...baseSpec(), elements: [] })).toBe(false);
    expect(ok({ ...baseSpec(), beats: [] })).toBe(false);
  });
  it("лишнее поле отвергается", () => expect(ok({ ...baseSpec(), extra: 1 })).toBe(false));
  it("palette_overrides необязателен", () =>
    expect(ok({ ...baseSpec(), palette_overrides: { accent: "#ff0000" } })).toBe(true));
});

describe("выходы агентов", () => {
  const selection = { items: [{ kb_id: "a/b", strategy: "reuse", why: "x", files_to_copy: [] }] };
  it("DirectorOutput", () => {
    expect(DirectorOutputSchema.safeParse({ spec: baseSpec(), selection, rationale: "r" }).success).toBe(true);
    expect(DirectorOutputSchema.safeParse({ spec: baseSpec(), selection }).success).toBe(false);
  });
  it("ComponentSelection: неверная strategy", () => {
    expect(ComponentSelectionSchema.safeParse({ items: [{ ...selection.items[0], strategy: "copy" }] }).success).toBe(false);
  });
  it("EngineerReport", () => {
    expect(EngineerReportSchema.safeParse({ files_written: ["src/Scene.tsx"], kit_components_used: [], kb_ids_used: [], notes: "" }).success).toBe(true);
    expect(EngineerReportSchema.safeParse({ files_written: "x" }).success).toBe(false);
  });
  it("KnowledgeRef", () => {
    const ref = { kb_id: "a/b", repository: "r", repository_url: "https://x", commit: "abc", license: "MIT", license_class: "permissive", strategy: "adapt", source_paths: ["a"] };
    expect(KnowledgeRefSchema.safeParse(ref).success).toBe(true);
    expect(KnowledgeRefSchema.safeParse({ ...ref, commit: undefined }).success).toBe(false);
  });
});
