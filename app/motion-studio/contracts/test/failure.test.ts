import { describe, expect, it } from "vitest";
import { FailureStageSchema, JobErrorCodeSchema, VersionManifestSchema, defaultSettings, failureToJobErrorCode } from "../src/index.js";

const sha = "a".repeat(64);
const failedManifest = (stage: string) => ({
  schema_version: 1, version_id: "ver_1", scene_id: "scn_1", parent_version_id: null,
  number: 1, created_at: "2026-10-20T00:00:00.000Z", prompt: "p", edit_plan: null,
  settings: defaultSettings(), files: [], changed_files: [],
  render_env: { remotion: "4.0.537", render_lock_sha256: sha, motion_kit: "0.1.0", chrome_headless_shell: "x", node: "22.21.1" },
  knowledge_refs: [], agent_runs: [], qa: null, preview: null,
  status: "failed", failure: { stage, message: "x" }, qa_frames: [], qa_frames_sha256: [],
});

describe("FailureStage", () => {
  it("manifest принимает только этапы из словаря", () => {
    for (const st of FailureStageSchema.options) expect(VersionManifestSchema.safeParse(failedManifest(st)).success, st).toBe(true);
    expect(VersionManifestSchema.safeParse(failedManifest("agent")).success).toBe(false);
    expect(VersionManifestSchema.safeParse(failedManifest("ffprobe")).success).toBe(false);
  });

  it("failureToJobErrorCode: каждый этап → код JobError", () => {
    expect(failureToJobErrorCode("orphaned")).toBe("stale_process");
    expect(failureToJobErrorCode("storage")).toBe("storage_unavailable");
    expect(failureToJobErrorCode("budget")).toBe("budget");
    expect(failureToJobErrorCode("cancelled")).toBe("cancelled");
    expect(failureToJobErrorCode("interrupted")).toBe("interrupted");
    expect(failureToJobErrorCode("fenced_out")).toBe("fenced_out");
    for (const st of ["prepare", "director", "engineer", "static", "typecheck", "render", "probe", "publish"] as const) {
      expect(failureToJobErrorCode(st), st).toBe("pipeline");
    }
    for (const st of FailureStageSchema.options) expect(JobErrorCodeSchema.options).toContain(failureToJobErrorCode(st));
  });
});
