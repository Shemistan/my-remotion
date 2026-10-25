// Task 35′ (Phase 4–6 v2): контракты финала — настройки экспорта, размер, CRF, манифест и отчёт
// проверки (поля Task 44 редакции 2026-10-21), DTO API видеосцен, таймлайна и Phase 6.
import { describe, expect, it } from "vitest";
import {
  ApproveSceneBodySchema,
  FinalExportRequestSchema,
  FinalManifestSchema,
  FinalVerifyReportSchema,
  TimelineRevisionBodySchema,
  VideoGenerateBodySchema,
  crfFor,
  outputSize,
} from "../src/index.js";
import { F30, SHA, TS } from "./video-fixtures.js";

const req = { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 } as const;
const ref = { id: "x_1", revision: 1, hash: SHA };
const probe = { durationMs: 8500, width: 1920, height: 1080, fps: F30, codec: "h264", audioCodec: "aac", pixFmt: "yuv420p" };

describe("настройки экспорта финала", () => {
  it("FinalExportRequest: разрешение, качество, звук 192 кбит/с; fps — необязательно", () => {
    expect(FinalExportRequestSchema.safeParse(req).success).toBe(true);
    expect(FinalExportRequestSchema.safeParse({ ...req, fps: F30, resolution: "source" }).success).toBe(true);
    expect(FinalExportRequestSchema.safeParse({ ...req, resolution: "4k" }).success).toBe(false);
    expect(FinalExportRequestSchema.safeParse({ ...req, audio_bitrate_kbps: 320 }).success).toBe(false);
  });

  it("crfFor: 16 / 20 / 24", () => {
    expect([crfFor("high"), crfFor("standard"), crfFor("draft")]).toEqual([16, 20, 24]);
  });

  it("outputSize: по короткой стороне, чётные; source — как есть", () => {
    expect(outputSize({ width: 1080, height: 1920 }, "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(outputSize({ width: 3840, height: 2160 }, "720p")).toEqual({ width: 1280, height: 720 });
    expect(outputSize({ width: 1920, height: 1080 }, "2160p")).toEqual({ width: 3840, height: 2160 });
    expect(outputSize({ width: 1440, height: 1080 }, "720p")).toEqual({ width: 960, height: 720 });
    expect(outputSize({ width: 1918, height: 1078 }, "720p")).toEqual({ width: 1282, height: 720 });
    expect(outputSize({ width: 1918, height: 1078 }, "source")).toEqual({ width: 1918, height: 1078 });
  });
});

describe("манифест и проверка финала", () => {
  const report = {
    probe: [], duration: { expected_frames: 255, actual_us: 8_500_000, delta_frames: 0 },
    sync: [{ word_id: "w_000120", offset_us: 1_000 }],
    frames: [{ frame: 10, kind: "source", psnr_db: 42.5, offset: 0 }, { frame: 330, kind: "scene", clip_id: "clip_sp_001", psnr_db: 38, offset: "inconclusive" }],
    loudness: { source_lufs: -18.2, final_lufs: -18.3, delta_lu: -0.1, final_peak_db: -1.2, source_peak_db: -1.2 },
    verdict: "pass", failures: [],
  };
  it("FinalVerifyReport", () => {
    expect(FinalVerifyReportSchema.safeParse(report).success).toBe(true);
    expect(FinalVerifyReportSchema.safeParse({ ...report, verdict: "ok" }).success).toBe(false);
    expect(FinalVerifyReportSchema.safeParse({ ...report, frames: [{ frame: 1, kind: "source", psnr_db: 40, offset: "x" }] }).success).toBe(false);
  });
  it("FinalVerifyReport: необязательные поля Task 44 (fix 1) — U/V, замеры синхронности, статус, пропуски кадров, матрица", () => {
    const full = {
      ...report,
      sync: [{ word_id: "w_000120", offset_us: 1_000, corr: 0.93, energy: true }],
      frames: [{ frame: 10, kind: "source", psnr_db: 42.5, offset: 0, psnr_u_db: 44, psnr_v_db: 45 }],
      sync_check: { status: "unchecked", message: "нет опорных слов" },
      frames_skipped: [{ frame: 400, kind: "source", reason: "кадр вне последовательностей таймлайна" }],
      color_matrix: "bt709",
    };
    expect(FinalVerifyReportSchema.safeParse(full).success).toBe(true);
    expect(FinalVerifyReportSchema.safeParse({ ...full, sync_check: { status: "maybe" } }).success).toBe(false);
    expect(FinalVerifyReportSchema.safeParse({ ...full, color_matrix: "srgb" }).success).toBe(false);
  });

  it("FinalManifest", () => {
    const m = {
      schema_version: 1, export_id: "fx_1", project_id: "p1", timeline: { id: "tml_1", revision: 2, hash: SHA },
      inputs: { edl: ref, plan: ref, style: ref, media_sha256: SHA, master_sha256: SHA, audio_sha256: SHA, scenes: [{ clip_id: "clip_sp_001", version_id: "ver_a", manifest_sha256: SHA }] },
      request: req, output: { width: 1920, height: 1080, fps: F30, frames: 255 },
      render_env: { node: "22.21.1", remotion: "4.0.537", motion_kit: "0.5.9", chrome_headless_shell: "x", render_lock_sha256: SHA },
      inputs_hash: SHA, ffprobe: probe, verify: { verdict: "pass", report: "verify.json" }, created_at: TS,
    };
    const r = FinalManifestSchema.safeParse(m);
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
    expect(FinalManifestSchema.safeParse({ ...m, verify: { verdict: "pass", report: "other.json" } }).success).toBe(false);
  });
});

describe("DTO API", () => {
  it("тела запросов: generate, approve, ревизия таймлайна", () => {
    expect(VideoGenerateBodySchema.safeParse({ revision: 2 }).success).toBe(true);
    expect(VideoGenerateBodySchema.safeParse({ revision: 2, item_ids: [] }).success).toBe(false);
    expect(ApproveSceneBodySchema.safeParse({ version_id: "ver_1" }).success).toBe(true);
    expect(TimelineRevisionBodySchema.safeParse({ base_revision: 1, ops: [{ op: "move", clip_id: "c1", start_frame: 10 }] }).success).toBe(true);
    expect(TimelineRevisionBodySchema.safeParse({ base_revision: 1, ops: [{ op: "set_duration", clip_id: "c1", duration_frames: 10 }] }).success).toBe(false);
  });
});
