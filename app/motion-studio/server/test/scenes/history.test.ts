// versionHistoryDigest (минимум для Task 18; Task 20 переиспользует в GET /scenes/:id):
// палитра — разрешённая (resolveStyle), глубина и длительность — из props по контракту,
// у версии среза — из spec и settings (depth 1, M18).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HistoryEntrySchema, defaultSettings } from "@ms/contracts";
import { resolveStyle } from "@ms/render";
import * as versions from "../../src/db/repos/versions.js";
import { versionHistoryDigest } from "../../src/scenes/history.js";
import { type JobsEnv, setupDb, teardownDb } from "../jobs/helpers.js";
import { props180, spec180 } from "../pipeline/edit-fixtures.js";

let env: JobsEnv;
beforeEach(async () => {
  env = await setupDb("ms-history-");
});
afterEach(() => teardownDb(env));

function addVersion(id: string, number: number, files: Record<string, unknown>, over: Partial<versions.VersionRow> = {}) {
  const path = `workspace/projects/playground/scenes/scn_1/versions/${id}`;
  mkdirSync(join(env.s.root, path), { recursive: true });
  for (const [name, v] of Object.entries(files)) writeFileSync(join(env.s.root, path, name), JSON.stringify(v));
  versions.insert(env.db, {
    id, scene_id: "scn_1", parent_version_id: null, number, status: "ready", prompt: `p${number}`, edit_plan: null,
    settings: defaultSettings(), path, manifest_sha256: "0".repeat(64), created_by_job_id: null, created_at: `2026-10-23T1${number}:00:00.000Z`, ...over,
  });
}

describe("versionHistoryDigest", () => {
  it("props по контракту: палитра resolveStyle(props.style), depth и длительность из props; qa из manifest", () => {
    const purple = { accent: ["#a06bff"], bg: "#120a1f" };
    addVersion("ver_1", 1, {
      "spec.json": spec180,
      "props.json": { ...props180, timing: { ...props180.timing, duration_frames: 180 }, style: { ...props180.style, depth: 2, palette_overrides: purple } },
      "manifest.json": { qa: { technical: "pass", visual: "warn", semantic: "pass", style: "pass" } },
    });
    const [h] = versionHistoryDigest(env.db, env.s.root, "scn_1");
    expect(HistoryEntrySchema.parse(h)).toEqual(h);
    expect(h).toMatchObject({ version_id: "ver_1", number: 1, status: "ready", depth: 2, duration_frames: 180, qa: { visual: "warn" }, prompt: "p1" });
    expect(h!.palette).toEqual(resolveStyle({ preset: "dark-premium", intensity: "balanced", palette_overrides: purple }).palette);
  });

  it("версия среза (props не ScenePropsBase): палитра из spec, depth 1, длительность из settings; failed и без файлов — тоже в истории", () => {
    addVersion("ver_1", 1, { "spec.json": { ...spec180, style_preset: "tech-neon", palette_overrides: { bg: "#000000" } }, "props.json": { nodes: 5 } }, { settings: { ...defaultSettings(), duration_frames: 150 } });
    addVersion("ver_2", 2, {}, { status: "failed" });
    const h = versionHistoryDigest(env.db, env.s.root, "scn_1");
    expect(h.map((x) => [x.number, x.status])).toEqual([[1, "ready"], [2, "failed"]]);
    expect(h[0]).toMatchObject({ depth: 1, duration_frames: 150, qa: null });
    expect(h[0]!.palette).toEqual(resolveStyle({ preset: "tech-neon", intensity: "balanced", palette_overrides: { bg: "#000000" } }).palette);
    // без файлов — палитра пресета настроек
    expect(h[1]!.palette).toEqual(resolveStyle({ preset: "dark-premium", intensity: "balanced" }).palette);
  });
});
