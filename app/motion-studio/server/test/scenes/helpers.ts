import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultSettings, type VersionManifest } from "@ms/contracts";
import { sha256 } from "../../src/scenes/hash.js";
import { createDraft, type Draft, type DraftRef, type PublishMeta } from "../../src/scenes/store.js";

export const SCENE_TSX = "export const Scene = () => null;\n";
export const RENDER_ENV = { remotion: "4.0.537", render_lock_sha256: "d".repeat(64), motion_kit: "0.1.0", chrome_headless_shell: "x", node: "22.21.1" };

export interface DraftFiles {
  scene?: string;
  props?: unknown;
  spec?: unknown;
  refs?: unknown[];
  preview?: string;
}

/** Draft с файлами версии: код, props, spec, settings, knowledge-refs, превью и кадр QA. */
export async function makeDraft(root: string, ref: DraftRef, files: DraftFiles = {}): Promise<Draft> {
  const d = await createDraft(root, ref);
  await mkdir(join(d.dir, "src"), { recursive: true });
  await mkdir(join(d.dir, "frames"), { recursive: true });
  await writeFile(join(d.dir, "src/Scene.tsx"), files.scene ?? SCENE_TSX);
  await writeFile(join(d.dir, "props.json"), JSON.stringify(files.props ?? { style: { palette_overrides: { accent: ["#4F7CFF"] } } }));
  await writeFile(join(d.dir, "spec.json"), JSON.stringify(files.spec ?? { title: "t", duration_frames: 180 }));
  await writeFile(join(d.dir, "settings.json"), JSON.stringify(defaultSettings()));
  await writeFile(join(d.dir, "knowledge-refs.json"), JSON.stringify(files.refs ?? []));
  await writeFile(join(d.dir, "preview.mp4"), files.preview ?? "video");
  await writeFile(join(d.dir, "frames/0.png"), "png0");
  return d;
}

export function meta(sceneId: string, over: Partial<PublishMeta> = {}, preview = "video"): PublishMeta {
  const failed = over.status === "failed";
  return {
    schema_version: 1,
    scene_id: sceneId,
    parent_version_id: null,
    prompt: "сцена",
    edit_plan: null,
    settings: defaultSettings(),
    changed_files: ["src/Scene.tsx", "props.json"],
    render_env: RENDER_ENV,
    knowledge_refs: [],
    agent_runs: [],
    qa: failed ? null : { technical: "pass", visual: "not_checked", semantic: "not_checked", style: "not_checked" },
    preview: failed ? null : { path: "preview.mp4", sha256: sha256(preview) },
    status: "ready",
    ...(failed ? { failure: { stage: "render", message: "упал" } } : {}),
    qa_frames: failed ? [] : [0],
    qa_frames_sha256: failed ? [] : [sha256("png0")],
    ...over,
  } as VersionManifest as PublishMeta;
}
