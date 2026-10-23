import type { MediaAsset, StyleBible } from "@ms/contracts";

export const SHA = "a".repeat(64);

/** Полная StyleBible (resolved ревизии стиля проекта). */
export function styleBible(): StyleBible {
  return {
    id: "dark-premium", name: "Dark premium",
    palette: { bg: "#0b0d12", surface: "#151922", text: "#f4f6fb", muted: "#8b93a7", accent: ["#6ea8ff", "#b28cff"], positive: "#3ddc97", negative: "#ff5d73" },
    typography: {
      display: { family: "Manrope", weight: 700 }, body: { family: "Inter", weight: 400 }, mono: { family: "JetBrains Mono" },
      scale: [14, 18, 24, 36, 56], tracking: { display: -0.02, body: 0 },
    },
    grid: { columns: 12, gutter: 24, safe_area: { x: 0.05, y: 0.05 } },
    surfaces: { radius: [8, 16], elevation: ["0 8px 24px rgba(0,0,0,.35)"] },
    motion: {
      intensity: "balanced",
      easing: { enter: [0.16, 1, 0.3, 1], exit: [0.7, 0, 0.84, 0], emphasis: [0.34, 1.56, 0.64, 1] },
      spring: { soft: { damping: 20, stiffness: 120, mass: 1 } },
      stagger_frames: 4, enter_frames: 18, exit_frames: 12,
    },
    camera: { allow_zoom: true, max_scale: 1.1, parallax: false },
  };
}

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
