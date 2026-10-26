// Task 43: запрос рендера финала по ревизии таймлайна и настройкам — размер, CRF, 192 кбит/с, BT.709,
// стоп-кадры сцен для проверки; fps ≠ timeline_fps — последовательности, окна и props сцен в fps выхода.
import { describe, expect, it } from "vitest";
import { type EditedTimeline, type FinalExportRequest, type VideoTimelineDoc, buildTimeline, clipsToSequences } from "@ms/contracts";
import { FinalPropsError, finalOutput, finalProps, finalStillFrames } from "../../src/final/render.js";

const F30 = { num: 30, den: 1 };
const tl: EditedTimeline = buildTimeline(20_000_000, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
const H = "a".repeat(64);
const clip = (n: number, start: number, frames: number, transparent: boolean) => ({
  clip_id: `clip_sp_00${n}`, scene_id: `scn_00${n}`, item_id: `sp_00${n}`, version_id: `ver_${n}`, version_number: 1, include: "approved" as const,
  start_frame: start, duration_frames: frames,
  placement: { mode: transparent ? "overlay" : "fullscreen", zone: transparent ? "lower_third" : "full", rect: { x: 0, y: 0.7, w: 1, h: 0.3 }, transparent } as VideoTimelineDoc["scenes"][number]["placement"],
  z: transparent ? 1 : 0, anchors: [],
});
const doc: VideoTimelineDoc = {
  schema_version: 1, timeline_id: "tl_p1", revision: 1, fps: F30, duration_frames: 555,
  inputs: { media_sha256: H, edl: { id: "edl_1", revision: 1, hash: H }, plan: { id: "pln_1", revision: 1, hash: H }, style: { id: "sty_1", revision: 1, hash: H } },
  video: [{ idx: 0, from: 0, durationInFrames: 60, startFrom: 0 }, { idx: 1, from: 60, durationInFrames: 495, startFrom: 105 }],
  scenes: [clip(1, 120, 90, true), clip(2, 300, 60, false)], excluded: [], issues: [],
};
const props = (frames: number) => ({
  timing: { duration_frames: frames, beats: [{ id: "title", start_frame: 0, end_frame: frames }] },
  style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false }, content: { title: "x" },
});
const paths = {
  master: "/s/master.mp4", audio: "/s/edited-audio.wav", out: "/d/final.mp4", stillsDir: "/w/stills", cacheDir: "/s/cache", tl,
  versions: { ver_1: { dir: "/s/v1", props: props(90) }, ver_2: { dir: "/s/v2", props: props(60) } },
};
const env = { check: async () => [], timeoutMs: 7_200_000, run: { root: "/s", runId: "job_1", attempt: 1 } } as unknown as Parameters<typeof finalProps>[4];
const display = { width: 1280, height: 720 };
const std: FinalExportRequest = { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 };

describe("finalProps", () => {
  it("fps таймлайна: размер по настройкам, CRF по качеству, AAC 192, medium, BT.709; сцены и видео как в ревизии", () => {
    const r = finalProps(doc, std, paths, display, env);
    expect(r.props).toMatchObject({ width: 1920, height: 1080, fps: F30, duration_frames: 555, video: { path: "/s/master.mp4", sequences: doc.video }, audio: { path: "/s/edited-audio.wav" } });
    expect(r.props.scenes.map((s) => [s.clip_id, s.key, s.start_frame, s.duration_frames, s.transparent, s.z])).toEqual([
      ["clip_sp_001", "ver_1", 120, 90, true, 1], ["clip_sp_002", "ver_2", 300, 60, false, 0],
    ]);
    expect(r.versionDirs).toEqual({ ver_1: "/s/v1", ver_2: "/s/v2" });
    expect(r.output).toEqual({ path: "/d/final.mp4", codec: "h264", crf: 20, scale: 1, audioBitrateKbps: 192, x264Preset: "medium", colorSpace: "bt709" });
    expect(r.range).toBeUndefined();
    expect(r.stills).toEqual([165, 330]);
    expect(r.stillsDir).toBe("/w/stills");
    expect(r.timeoutMs).toBe(7_200_000);
    expect(finalProps(doc, { ...std, resolution: "source", quality: "high" }, paths, display, env).output).toMatchObject({ crf: 16 });
    expect(finalProps(doc, { ...std, resolution: "source" }, paths, display, env).props).toMatchObject({ width: 1280, height: 720 });
  });

  it("fps 60 при таймлайне 30: кадры ×2 по µs клипов, окна сцен по µs, props сцен масштабированы", () => {
    const r = finalProps(doc, { ...std, fps: { num: 60, den: 1 } }, paths, display, env);
    expect(r.props.duration_frames).toBe(1110);
    expect(r.props.fps).toEqual({ num: 60, den: 1 });
    expect(r.props.video.sequences).toEqual([{ idx: 0, from: 0, durationInFrames: 120, startFrom: 0 }, { idx: 1, from: 120, durationInFrames: 990, startFrom: 210 }]);
    expect(r.props.scenes.map((s) => [s.start_frame, s.duration_frames])).toEqual([[240, 180], [600, 120]]);
    expect((r.props.scenes[0]!.props.timing as { duration_frames: number }).duration_frames).toBe(180);
    expect(r.stills).toEqual([330, 660]);
    expect(finalOutput(doc, { ...std, fps: { num: 60, den: 1 } }, display)).toEqual({ width: 1920, height: 1080, fps: { num: 60, den: 1 }, frames: 1110 });
  });

  it("fps 25 при таймлайне 30: окно сцены = outFrame(start + dur) − outFrame(start), Σ последовательностей = кадрам выхода", () => {
    const tl2 = buildTimeline(20_000_000, [{ start_us: 2_000_000, end_us: 4_000_000 }], F30);
    const doc2: VideoTimelineDoc = { ...doc, duration_frames: 540, video: clipsToSequences(tl2), scenes: [clip(1, 6, 7, true)] };
    const r = finalProps(doc2, { ...std, fps: { num: 25, den: 1 } }, { ...paths, tl: tl2 }, display, env);
    expect(r.props.duration_frames).toBe(450);
    expect(r.props.video.sequences.reduce((n, q) => n + q.durationInFrames, 0)).toBe(450);
    // 6/30 с → кадр 5; 13/30 с → кадр 10: окно 5 кадров (round(7 · 25/30) дал бы 6)
    expect(r.props.scenes.map((s) => [s.start_frame, s.duration_frames])).toEqual([[5, 5]]);
  });

  it("fps ≠ timeline_fps: последовательности не покрывают кадры выхода → ошибка, а не тихий хвост", () => {
    // 18,5 с: при 25 fps последовательности дают 462 кадра, ролик — round(555 · 25/30) = 463
    expect(() => finalProps(doc, { ...std, fps: { num: 25, den: 1 } }, paths, display, env)).toThrow(/462 кадров, а ролик — 463/);
  });

  it("fps ≠ timeline_fps и props сцены вне ScenePropsBase → fps_change_unsupported", () => {
    const bad = { ...paths, versions: { ...paths.versions, ver_1: { dir: "/s/v1", props: { anything: 1 } } } };
    expect(() => finalProps(doc, { ...std, fps: { num: 60, den: 1 } }, bad, display, env)).toThrow(FinalPropsError);
    expect(() => finalProps(doc, std, bad, display, env)).not.toThrow();
  });

  it("стоп-кадры проверки: середины сцен в кадрах таймлайна и выхода", () => {
    expect(finalStillFrames(doc, F30)).toEqual({ frames: [165, 330], stills: [165, 330] });
    expect(finalStillFrames(doc, { num: 60, den: 1 })).toEqual({ frames: [165, 330], stills: [330, 660] });
  });
});
