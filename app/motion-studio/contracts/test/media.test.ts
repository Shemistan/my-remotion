import { describe, expect, it } from "vitest";
import { MediaAssetSchema, MediaManifestSchema, ProbeSummarySchema } from "../src/index.js";
import { NTSC, SHA, TS } from "./video-fixtures.js";

function probe(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    container: "mov,mp4,m4a,3gp,3g2,mj2", duration_us: 61_061_000, size_bytes: 123_456_789, start_time_us: 0,
    video: {
      codec: "hevc", width: 3840, height: 2160, display_width: 2160, display_height: 3840, rotation: 90,
      r_frame_rate: NTSC, avg_frame_rate: { num: 1199, den: 40 }, pix_fmt: "yuv420p10le", bit_depth: 10,
    },
    audio: { codec: "aac", sample_rate: 48_000, channels: 2 },
    vfr: false, timeline_fps: NTSC,
    ...over,
  };
}

function asset(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "med_1", project_id: "prj_1", original_name: "clip.mov", rel_path: "workspace/projects/prj_1/source/med_1/original.mov",
    sha256: SHA, size_bytes: 123_456_789, probe: probe(), status: "ready",
    import: { method: "path", source_path: "/Volumes/External SSD/clip.mov", cloned: true }, created_at: TS,
    ...over,
  };
}

describe("media", () => {
  it("ProbeSummary", () => {
    expect(ProbeSummarySchema.safeParse(probe()).success).toBe(true);
    expect(ProbeSummarySchema.safeParse(probe({ audio: undefined })).success).toBe(true);
    expect(ProbeSummarySchema.safeParse(probe({ duration_us: -1 })).success).toBe(false);
    expect(ProbeSummarySchema.safeParse(probe({ video: { ...(probe().video as object), rotation: 45 } })).success).toBe(false);
  });

  it("ProbeSummary: начало потоков (необязательно, µs от начала файла как у ffprobe)", () => {
    const v = { ...(probe().video as object), start_time_us: 500_000 };
    const a = { ...(probe().audio as object), start_time_us: 0 };
    expect(ProbeSummarySchema.safeParse(probe({ video: v, audio: a })).success).toBe(true);
    expect(ProbeSummarySchema.safeParse(probe({ video: { ...v, start_time_us: 0.5 } })).success).toBe(false);
  });

  it("MediaAsset", () => {
    expect(MediaAssetSchema.safeParse(asset()).success).toBe(true);
    expect(MediaAssetSchema.safeParse(asset({ import: { method: "upload", cloned: false } })).success).toBe(true);
    expect(MediaAssetSchema.safeParse(asset({ sha256: "xyz" })).success).toBe(false);
    expect(MediaAssetSchema.safeParse(asset({ status: "importing" })).success).toBe(false);
  });

  it("MediaManifest", () => {
    const m = {
      schema_version: 1, asset: asset(),
      derivatives: [{ kind: "proxy", path: "proxy.mp4", sha256: SHA, params: { height: 720, crf: 23 } }],
    };
    expect(MediaManifestSchema.safeParse(m).success).toBe(true);
    expect(MediaManifestSchema.safeParse({ ...m, derivatives: [{ ...m.derivatives[0], kind: "gif" }] }).success).toBe(false);
    expect(MediaManifestSchema.safeParse({ ...m, schema_version: 2 }).success).toBe(false);
  });
});
