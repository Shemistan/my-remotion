// DTO версии для юнит-тестов UI.
import { type HistoryEntry, defaultSettings } from "@ms/contracts";
import { TS } from "./helpers.js";

const SHA = "a".repeat(64);

export function versionDto(id: string, n: number, over: Record<string, unknown> = {}) {
  return {
    manifest: {
      schema_version: 1, version_id: id, scene_id: "s1", parent_version_id: null, number: n, created_at: TS, prompt: "сцена",
      edit_plan: null, settings: defaultSettings(), files: [], changed_files: [],
      render_env: { remotion: "4.0.537", render_lock_sha256: SHA, motion_kit: "x", chrome_headless_shell: "x", node: "22" },
      knowledge_refs: [], agent_runs: [], qa: { technical: "pass", visual: "pass", semantic: "pass", style: "pass" },
      preview: { path: "preview.mp4", sha256: SHA }, status: "ready", qa_frames: [0], qa_frames_sha256: [SHA],
    },
    spec: { beats: [{ id: "intro", start_frame: 0, end_frame: 60 }, { id: "hold", start_frame: 60, end_frame: 180 }] },
    props: {},
    settings: defaultSettings(),
    qa: null,
    knowledge_refs: [],
    render_env_mismatch: false,
    kit_components: [],
    unreadable_files: [],
    generation: null,
    ...over,
  };
}

export function historyEntry(id: string, n: number, over: Record<string, unknown> = {}): HistoryEntry {
  return {
    version_id: id, number: n, status: "ready", parent_version_id: null, prompt: `промпт ${n}`,
    palette: { bg: "#000", surface: "#111", text: "#fff", muted: "#888", accent: ["#4F7CFF"], positive: "#0f0", negative: "#f00" },
    depth: 1, duration_frames: 180, qa: { technical: "pass", visual: "pass", semantic: "pass", style: "pass" }, created_at: TS, ...over,
  } as HistoryEntry;
}
