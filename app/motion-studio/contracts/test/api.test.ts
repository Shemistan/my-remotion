import { describe, expect, it } from "vitest";
import { CreateProjectBodySchema, HistoryEntrySchema, KbHitDtoSchema, RenderBodySchema, VersionDiffSchema } from "../src/index.js";

describe("CreateProjectBody", () => {
  it("kind необязателен; video — видеопроект (Task 29)", () => {
    expect(CreateProjectBodySchema.safeParse({ title: "p" }).success).toBe(true);
    expect(CreateProjectBodySchema.safeParse({ title: "p", kind: "video" }).success).toBe(true);
    expect(CreateProjectBodySchema.safeParse({ title: "p", kind: "playground" }).success).toBe(true);
    expect(CreateProjectBodySchema.safeParse({ title: "p", kind: "audio" }).success).toBe(false);
  });
});

describe("api DTO", () => {
  it("HistoryEntry: палитра разрешённая (StyleBible.palette)", () => {
    const e = {
      version_id: "ver_1", number: 1, status: "ready", parent_version_id: null, prompt: "p",
      palette: { bg: "#000", surface: "#111", text: "#fff", muted: "#888", accent: ["#4F7CFF"], positive: "#0f0", negative: "#f00" },
      depth: 1, duration_frames: 180, qa: { technical: "pass", visual: "not_checked", semantic: "not_checked", style: "not_checked" },
      created_at: "2026-10-21T00:00:00.000Z",
    };
    expect(HistoryEntrySchema.safeParse(e).success).toBe(true);
    expect(HistoryEntrySchema.safeParse({ ...e, palette: { accent: ["#fff"] } }).success).toBe(false);
  });
  it("VersionDiff", () => {
    const d = { settings: [], props: [{ path: "/style/palette_overrides/accent/0", before: "#4F7CFF", after: "#9B5CFF" }], spec: [], files: [{ path: "src/Scene.tsx", status: "changed", unified: "@@" }] };
    expect(VersionDiffSchema.safeParse(d).success).toBe(true);
  });
  it("KbHitDto", () => {
    const h = { id: "k", name: "n", kind: "component", patterns: [], license: "MIT", license_class: "permissive", compatibility: "ok", repository_url: "u", commit: "c", score: 1 };
    expect(KbHitDtoSchema.safeParse(h).success).toBe(true);
  });
  it("RenderBody: частичный патч настроек", () => {
    expect(RenderBodySchema.safeParse({ settings_patch: { duration_frames: 240 } }).success).toBe(true);
    expect(RenderBodySchema.safeParse({ settings_patch: { duration_frames: -1 } }).success).toBe(false);
    expect(RenderBodySchema.safeParse({ settings_patch: { nope: 1 } }).success).toBe(false);
  });
});
