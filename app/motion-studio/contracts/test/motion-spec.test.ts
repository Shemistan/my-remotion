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
  it("layout не должен выходить за кадр", () => {
    const s = baseSpec();
    s.elements[1]!.layout = { x: 0.5, y: 0, w: 0.6, h: 0.5 };
    expect(ok(s)).toBe(false);
    const t = baseSpec();
    t.elements[1]!.layout = { x: 0, y: 0.7, w: 0.5, h: 0.4 };
    expect(ok(t)).toBe(false);
  });
  it("palette_overrides: неизвестный ключ отвергается", () =>
    expect(ok({ ...baseSpec(), palette_overrides: { primary: "#fff" } })).toBe(false));
  it("пустые elements/beats отвергаются", () => {
    expect(ok({ ...baseSpec(), elements: [] })).toBe(false);
    expect(ok({ ...baseSpec(), beats: [] })).toBe(false);
  });
  it("лишнее поле отвергается", () => expect(ok({ ...baseSpec(), extra: 1 })).toBe(false));
  it("palette_overrides необязателен", () =>
    expect(ok({ ...baseSpec(), palette_overrides: { accent: ["#ff0000"], bg: "#000" } })).toBe(true));
  it("входы v0.2 (mask, blur, pop, type) и слой глубины 0..2", () => {
    for (const entrance of ["mask", "blur", "pop", "type"]) {
      const s = baseSpec();
      (s.elements[0] as Record<string, unknown>).entrance = entrance;
      (s.elements[0] as Record<string, unknown>).depth_layer = 2;
      expect(ok(s), entrance).toBe(true);
    }
    const t = baseSpec();
    (t.elements[0] as Record<string, unknown>).depth_layer = 3;
    expect(ok(t)).toBe(false);
  });
  it("camera: ключи { frame, scale, x, y }, необязательна", () => {
    expect(ok({ ...baseSpec(), camera: [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 90, scale: 1.08, x: -40, y: 12 }] })).toBe(true);
    expect(ok({ ...baseSpec(), camera: [{ frame: -1, scale: 1, x: 0, y: 0 }] })).toBe(false);
    expect(ok({ ...baseSpec(), camera: [{ frame: 0, scale: 0, x: 0, y: 0 }] })).toBe(false);
    // отъезд (scale < 1) не поддерживается: открылись бы края кадра
    expect(ok({ ...baseSpec(), camera: [{ frame: 0, scale: 0.9, x: 0, y: 0 }] })).toBe(false);
    expect(ok({ ...baseSpec(), camera: [{ frame: 0, scale: 1, x: 0, y: 0, rot: 5 }] })).toBe(false);
  });
});

describe("выходы агентов", () => {
  const selection = { items: [{ kb_id: "a/b", strategy: "reuse", why: "x", files_to_copy: [] }] };
  it("DirectorOutput", () => {
    const composition = { archetype: "split", idea: "график справа, число слева", focus: "число", transitions: "линия ведёт к числу" };
    expect(DirectorOutputSchema.safeParse({ spec: baseSpec(), composition, selection, rationale: "r" }).success).toBe(true);
    expect(DirectorOutputSchema.safeParse({ spec: baseSpec(), selection, rationale: "r" }).success).toBe(false);
    expect(DirectorOutputSchema.safeParse({ spec: baseSpec(), composition: { ...composition, archetype: "grid" }, selection, rationale: "r" }).success).toBe(false);
    expect(DirectorOutputSchema.safeParse({ spec: baseSpec(), selection }).success).toBe(false);
  });
  it("composition: режим заголовка и фон сцены (вариант, фокус за героем, seed)", () => {
    const composition = { archetype: "split", idea: "i", focus: "f", transitions: "t" };
    const ok = (c: unknown) => DirectorOutputSchema.safeParse({ spec: baseSpec(), composition: c, selection, rationale: "r" }).success;
    expect(ok({ ...composition, title_mode: "kicker", background: { variant: "blueprint", focus: { x: 0.7, y: 0.4 } } })).toBe(true);
    for (const m of ["none", "kicker", "statement", "integrated", "strip"]) expect(ok({ ...composition, title_mode: m }), m).toBe(true);
    for (const v of ["aurora", "spotlight", "blueprint", "grid", "paper", "solid"]) expect(ok({ ...composition, background: { variant: v } }), v).toBe(true);
    expect(ok({ ...composition, background: { seed: "scn_1" } })).toBe(true);
    expect(ok({ ...composition, title_mode: "banner" })).toBe(false);
    expect(ok({ ...composition, background: { variant: "stars" } })).toBe(false);
    expect(ok({ ...composition, background: { variant: "aurora", focus: { x: 1.2, y: 0.5 } } })).toBe(false);
    expect(ok({ ...composition, background: { variant: "aurora", blur: 3 } })).toBe(false);
  });
  it("ComponentSelection: неверная strategy", () => {
    expect(ComponentSelectionSchema.safeParse({ items: [{ ...selection.items[0], strategy: "copy" }] }).success).toBe(false);
  });
  it("EngineerReport", () => {
    expect(EngineerReportSchema.safeParse({ files_written: ["src/Scene.tsx"], kit_components_used: [], kb_ids_used: [], notes: "" }).success).toBe(true);
    expect(EngineerReportSchema.safeParse({ files_written: "x" }).success).toBe(false);
  });
  it("KnowledgeRef: неверный license_class", () => {
    const ref = { kb_id: "a/b", repository: "r", repository_url: "https://x", commit: "abc", license: "MIT", license_class: "free", strategy: "adapt", source_paths: [] };
    expect(KnowledgeRefSchema.safeParse(ref).success).toBe(false);
  });
  it("KnowledgeRef", () => {
    const ref = { kb_id: "a/b", repository: "r", repository_url: "https://x", commit: "abc", license: "MIT", license_class: "permissive", strategy: "adapt", source_paths: ["a"] };
    expect(KnowledgeRefSchema.safeParse(ref).success).toBe(true);
    expect(KnowledgeRefSchema.safeParse({ ...ref, commit: undefined }).success).toBe(false);
  });
});
