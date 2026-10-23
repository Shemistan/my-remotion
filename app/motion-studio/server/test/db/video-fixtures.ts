import type { MediaAsset } from "@ms/contracts";

export const SHA = "a".repeat(64);

/** Исходник видеопроекта `p1` для тестов репозиториев. */
export function asset(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "med_1",
    project_id: "p1",
    original_name: "talk.mov",
    rel_path: "workspace/projects/p1/source/med_1/original.mov",
    sha256: SHA,
    size_bytes: 1000,
    probe: {
      container: "mov,mp4",
      duration_us: 10_000_000,
      size_bytes: 1000,
      start_time_us: 0,
      video: {
        codec: "h264", width: 1920, height: 1080, display_width: 1920, display_height: 1080, rotation: 0,
        r_frame_rate: { num: 30, den: 1 }, avg_frame_rate: { num: 30, den: 1 }, pix_fmt: "yuv420p",
      },
      audio: { codec: "aac", sample_rate: 48_000, channels: 2 },
      vfr: false,
      timeline_fps: { num: 30, den: 1 },
    },
    status: "ready",
    import: { method: "path", source_path: "/Volumes/X/talk.mov", cloned: true },
    created_at: new Date().toISOString(),
    ...over,
  };
}
