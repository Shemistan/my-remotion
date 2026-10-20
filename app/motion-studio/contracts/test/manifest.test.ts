import { describe, expect, it } from "vitest";
import { VersionManifestSchema, defaultSettings } from "../src/index.js";

const sha = "a".repeat(64);
function manifest(): Record<string, unknown> {
  return {
    schema_version: 1, version_id: "ver_1", scene_id: "scn_1", parent_version_id: null,
    number: 1, created_at: "2026-10-20T00:00:00.000Z", prompt: "p", edit_plan: null,
    settings: defaultSettings(),
    files: [{ path: "src/Scene.tsx", sha256: sha }],
    changed_files: ["src/Scene.tsx"],
    render_env: { remotion: "4.0.537", render_lock_sha256: sha, motion_kit: "0.1.0", chrome_headless_shell: "x", node: "22.21.1" },
    knowledge_refs: [], agent_runs: ["run_1"],
    qa: { technical: "pass", visual: "warn", semantic: "pass", style: "pass" },
    preview: { path: "preview.mp4", sha256: sha },
    status: "ready", qa_frames: [0, 90], qa_frames_sha256: [sha, sha],
  };
}
const ok = (m: unknown) => VersionManifestSchema.safeParse(m).success;

describe("VersionManifest", () => {
  it("корректный manifest", () => expect(ok(manifest())).toBe(true));
  it("failed с failure", () =>
    expect(ok({ ...manifest(), status: "failed", failure: { stage: "render", message: "x" }, preview: null })).toBe(true));
  it("failed допускает qa null и отсутствие qa", () => {
    const f: Record<string, unknown> = { ...manifest(), status: "failed", failure: { stage: "agent", message: "x" }, preview: null };
    expect(ok({ ...f, qa: null })).toBe(true);
    const noQa = { ...f };
    delete noQa.qa;
    expect(ok(noQa)).toBe(true);
  });
  it("ready без qa отвергается", () => {
    expect(ok({ ...manifest(), qa: null })).toBe(false);
    const noQa = manifest();
    delete noQa.qa;
    expect(ok(noQa)).toBe(false);
  });
  it("failed без failure отвергается", () => expect(ok({ ...manifest(), status: "failed" })).toBe(false));
  it("ready с failure отвергается", () =>
    expect(ok({ ...manifest(), failure: { stage: "a", message: "b" } })).toBe(false));
  it("ready без preview отвергается", () => expect(ok({ ...manifest(), preview: null })).toBe(false));
  it("неверная schema_version", () => expect(ok({ ...manifest(), schema_version: 2 })).toBe(false));
  it("qa_frames и qa_frames_sha256 разной длины", () =>
    expect(ok({ ...manifest(), qa_frames_sha256: [sha] })).toBe(false));
  it("плохой sha256", () =>
    expect(ok({ ...manifest(), files: [{ path: "a", sha256: "zz" }] })).toBe(false));
  it("неверный вердикт qa", () =>
    expect(ok({ ...manifest(), qa: { technical: "ok", visual: "warn", semantic: "pass", style: "pass" } })).toBe(false));
  it("number должен быть >= 1", () => expect(ok({ ...manifest(), number: 0 })).toBe(false));
});
