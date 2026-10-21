import { describe, expect, it } from "vitest";
import { ExportManifestSchema, ExportRequestSchema, ProbeResultSchema, defaultSettings } from "../src/index.js";

const sha = "b".repeat(64);
describe("export", () => {
  it("умолчания crf 18 и scale 1", () => expect(ExportRequestSchema.parse({ format: "mp4" })).toEqual({ format: "mp4", crf: 18, scale: 1 }));
  it("fps только из списка", () => {
    expect(ExportRequestSchema.safeParse({ format: "mp4", fps: 29 }).success).toBe(false);
    expect(ExportRequestSchema.safeParse({ format: "prores4444", fps: 60 }).success).toBe(true);
  });
  it("crf 14..28, scale 1 | 0.5", () => {
    expect(ExportRequestSchema.safeParse({ format: "mp4", crf: 13 }).success).toBe(false);
    expect(ExportRequestSchema.safeParse({ format: "mp4", crf: 28 }).success).toBe(true);
    expect(ExportRequestSchema.safeParse({ format: "mp4", scale: 0.75 }).success).toBe(false);
  });
  it("ProbeResult: audioCodec и pixFmt необязательны", () => {
    const p = { durationMs: 6000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264" };
    expect(ProbeResultSchema.safeParse(p).success).toBe(true);
    expect(ProbeResultSchema.safeParse({ ...p, audioCodec: "aac", pixFmt: "yuv420p" }).success).toBe(true);
  });
  it("ExportManifest", () => {
    const m = {
      schema_version: 1, export_id: "exp_1", version_id: "ver_1", version_manifest_sha256: sha, format: "mp4",
      request: { format: "mp4", crf: 18, scale: 1 }, settings: defaultSettings(),
      ffprobe: { durationMs: 6000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264" },
      sha256: sha,
      render_env: { remotion: "4.0.537", render_lock_sha256: sha, motion_kit: "0.1.0", chrome_headless_shell: "x", node: "22.21.1" },
      created_at: "2026-10-21T00:00:00.000Z",
    };
    expect(ExportManifestSchema.safeParse(m).success).toBe(true);
    expect(ExportManifestSchema.safeParse({ ...m, schema_version: 2 }).success).toBe(false);
  });
});
