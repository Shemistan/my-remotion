// Фикстуры UI-тестов таймлайна и финала (Task 45): ревизия r2 из двух сцен (вторая — без C, с
// причиной), одна исключённая; экспорт финала с отчётом проверки.
import type { FinalExportDto, FinalVerifyReport, TimelineDto, VideoTimelineClip } from "@ms/contracts";
import { TS } from "../helpers.js";

const SHA = "a".repeat(64);
const F30 = { num: 30, den: 1 };

export const tclip = (n: number, over: Partial<VideoTimelineClip> = {}): VideoTimelineClip => ({
  clip_id: `clip_sp_00${n}`, scene_id: `scn_${n}`, item_id: `sp_00${n}`, version_id: `ver_${n}`, version_number: 1, include: "approved",
  start_frame: 300 * n, duration_frames: 90, placement: { mode: "overlay", zone: "lower_third", rect: { x: 0, y: 0.66, w: 1, h: 0.34 }, transparent: true }, z: 1,
  anchors: [{ word_id: `w_00000${n}`, text: `слово${n}`, frame: 300 * n + 30 }], version_frames: 90, ...over,
});

export function timelineDto(over: Partial<TimelineDto> = {}, docOver: Partial<TimelineDto["doc"]> = {}): TimelineDto {
  return {
    timeline_id: "tl_p1", revision: 2, fresh: true, reasons: [], job: null, preview_ready: false,
    doc: {
      schema_version: 1, timeline_id: "tl_p1", revision: 2, parent_revision: 1, fps: F30, duration_frames: 900,
      inputs: { media_sha256: SHA, edl: { id: "edl_1", revision: 3, hash: SHA }, plan: { id: "pln_1", revision: 4, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
      video: [{ idx: 0, from: 0, durationInFrames: 900, startFrom: 0 }],
      scenes: [tclip(1), tclip(2, { include: "override", override_reason: "черновик" })],
      excluded: [{ item_id: "sp_003", reason: "not_approved" }],
      issues: [],
      ...docOver,
    },
    ...over,
  };
}

export const VERIFY: FinalVerifyReport = {
  probe: [], duration: { expected_frames: 900, actual_us: 30_000_000, delta_frames: 0 },
  sync: [{ word_id: "w_000001", offset_us: 8_000 }, { word_id: "w_000002", offset_us: 120_000 }],
  frames: [{ frame: 45, kind: "source", psnr_db: 44.21, offset: 0 }, { frame: 330, kind: "scene", clip_id: "clip_sp_001", psnr_db: 39.5, offset: "inconclusive" }],
  loudness: { source_lufs: -16.1, final_lufs: -16.2, delta_lu: -0.1, final_peak_db: -1.5, source_peak_db: -1.4 },
  verdict: "fail", failures: ["sync"],
};

export function finalExport(over: Partial<FinalExportDto> = {}): FinalExportDto {
  return {
    id: "fin_1", timeline_id: "tl_p1", timeline_revision: 2, request: { resolution: "720p", quality: "draft", audio_bitrate_kbps: 192 },
    status: "failed_verification", verify: VERIFY, job: null, created_at: TS, bytes: 2_500_000,
    output: { width: 1280, height: 720, fps: F30, frames: 900 }, ...over,
  };
}
