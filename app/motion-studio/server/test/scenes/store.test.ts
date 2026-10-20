import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, type VersionManifest } from "@ms/contracts";
import { initStore, type StorageStatus, type VolumeProbe } from "@ms/core";
import { newId } from "../../src/scenes/ids.js";
import { sha256 } from "../../src/scenes/hash.js";
import {
  createDraft, publishVersion, quarantineDraft, readVersion, writeBrief, type Draft,
} from "../../src/scenes/store.js";

const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));
const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};
const okGuard = async (): Promise<StorageStatus> => ({ ok: true, root, marker: {} as never, freeBytes: 1 });
const offlineGuard = async (): Promise<StorageStatus> => ({ ok: false, reason: "not_found", detail: "SSD отключён" });

let tmp: string;
let root: string;
const sceneText = "export const Scene = () => null;\n";
const hex = "a".repeat(64);

function meta(sceneId: string, over: Partial<VersionManifest> = {}) {
  return {
    schema_version: 1 as const,
    scene_id: sceneId,
    parent_version_id: null,
    prompt: "тест",
    edit_plan: null,
    settings: defaultSettings(),
    changed_files: [],
    render_env: { remotion: "4.0.537", render_lock_sha256: hex, motion_kit: "1", chrome_headless_shell: "x", node: "22" },
    knowledge_refs: [],
    agent_runs: [],
    qa: { technical: "pass", visual: "pass", semantic: "pass", style: "pass" },
    preview: { path: "preview.mp4", sha256: sha256("video") },
    status: "ready" as const,
    qa_frames: [],
    qa_frames_sha256: [],
    ...over,
  } as Parameters<typeof publishVersion>[1];
}

async function fill(d: Draft) {
  await mkdir(join(d.dir, "src"), { recursive: true });
  await writeFile(join(d.dir, "src/Scene.tsx"), sceneText);
  await writeFile(join(d.dir, "props.json"), "{}");
  await writeFile(join(d.dir, "preview.mp4"), "video");
}
async function mk(sceneId: string, attempt = 1, parent?: string) {
  const d = await createDraft(root, { runId: newId("run"), attempt, sceneId, parentVersionId: parent });
  await fill(d);
  return d;
}

async function unlock(dir: string) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { await chmod(p, 0o755); await unlock(p); } else await chmod(p, 0o644);
  }
  await chmod(dir, 0o755).catch(() => undefined);
}

beforeEach(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-scenes-test-"));
  root = join(tmp, "store");
  await initStore(root, probe, {});
});
afterEach(async () => {
  await unlock(tmp);
  await rm(tmp, { recursive: true, force: true });
});

describe("ids", () => {
  it("префикс, ULID, безопасный для имён файлов и монотонный", () => {
    const ids = Array.from({ length: 200 }, () => newId("scn"));
    for (const id of ids) expect(id).toMatch(/^scn_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(new Set(ids).size).toBe(200);
    expect([...ids].sort()).toEqual(ids);
    expect(newId("ver").startsWith("ver_")).toBe(true);
    expect(newId("run")).toMatch(/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/);
  });
});

describe("SceneStore", () => {
  it("публикация: draft исчезает, версия неизменяема, manifest сверяется", async () => {
    const draft = await mk("scn_A");
    const v = await publishVersion(draft, meta("scn_A"), okGuard);
    expect(existsSync(draft.dir)).toBe(false);
    expect(v.dir).toBe(join(root, "workspace/projects/playground/scenes/scn_A/versions", v.versionId));
    await expect(writeFile(join(v.dir, "props.json"), "{}")).rejects.toMatchObject({ code: "EACCES" });
    await expect(writeFile(join(v.dir, "new.txt"), "x")).rejects.toMatchObject({ code: "EACCES" });
    const m = await readVersion(v.dir);
    expect(m.files.find((f) => f.path === "src/Scene.tsx")!.sha256).toBe(sha256(sceneText));
    expect(m.files.some((f) => f.path === "manifest.json")).toBe(false);
    expect(v.manifest.number).toBe(1);
    expect(v.versionId).toMatch(/^ver_/);
  });

  it("повторный createDraft той же попытки — ошибка", async () => {
    const ref = { runId: "run_X", attempt: 1, sceneId: "scn_A" };
    await createDraft(root, ref);
    await expect(createDraft(root, ref)).rejects.toThrow(/exists/);
    await expect(createDraft(root, { ...ref, attempt: 2 })).resolves.toBeDefined();
  });

  it("небезопасные идентификаторы отклоняются", async () => {
    await expect(createDraft(root, { runId: "../x", attempt: 1, sceneId: "scn_A" })).rejects.toThrow();
    await expect(createDraft(root, { runId: "run_1", attempt: 1, sceneId: "a/b" })).rejects.toThrow();
  });

  it("хранилище недоступно: storage_unavailable, draft цел", async () => {
    const d = await mk("scn_A");
    await expect(publishVersion(d, meta("scn_A"), offlineGuard)).rejects.toThrow(/storage_unavailable/);
    expect(existsSync(d.dir)).toBe(true);
    expect(existsSync(join(d.dir, "src/Scene.tsx"))).toBe(true);
  });

  it("повторная проверка прямо перед rename: отказ второго вызова оставляет draft", async () => {
    const d = await mk("scn_A");
    let n = 0;
    const flaky = async () => (++n === 1 ? okGuard() : offlineGuard());
    await expect(publishVersion(d, meta("scn_A"), flaky)).rejects.toThrow(/storage_unavailable/);
    expect(existsSync(d.dir)).toBe(true);
    expect(existsSync(join(root, "workspace/projects/playground/scenes/scn_A/versions"))).toBe(false);
    // после возвращения хранилища публикация проходит
    await expect(publishVersion(d, meta("scn_A"), okGuard)).resolves.toBeDefined();
  });

  it("number считает ready и failed версии", async () => {
    const v1 = await publishVersion(await mk("scn_A", 1), meta("scn_A"), okGuard);
    const v2 = await publishVersion(
      await mk("scn_A", 2),
      meta("scn_A", { status: "failed", qa: undefined, preview: null, failure: { stage: "render", message: "x" } }),
      okGuard,
    );
    const v3 = await publishVersion(await mk("scn_A", 3), meta("scn_A"), okGuard);
    expect([v1, v2, v3].map((v) => v.manifest.number)).toEqual([1, 2, 3]);
    const other = await publishVersion(await mk("scn_B", 1), meta("scn_B"), okGuard);
    expect(other.manifest.number).toBe(1);
  });

  it("createDraft с parentVersionId копирует файлы родителя записываемыми", async () => {
    const d = await mk("scn_A");
    await writeFile(join(d.dir, "spec.json"), "{}");
    await writeFile(join(d.dir, "settings.json"), "{}");
    await writeFile(join(d.dir, "preview.mp4"), "video");
    const v = await publishVersion(d, meta("scn_A"), okGuard);
    const child = await createDraft(root, { runId: newId("run"), attempt: 1, sceneId: "scn_A", parentVersionId: v.versionId });
    expect(child.parentVersionId).toBe(v.versionId);
    expect(await readFile(join(child.dir, "src/Scene.tsx"), "utf8")).toBe(sceneText);
    expect(existsSync(join(child.dir, "props.json"))).toBe(true);
    expect(existsSync(join(child.dir, "spec.json"))).toBe(true);
    expect(existsSync(join(child.dir, "settings.json"))).toBe(true);
    expect(existsSync(join(child.dir, "preview.mp4"))).toBe(false);
    expect(existsSync(join(child.dir, "manifest.json"))).toBe(false);
    await writeFile(join(child.dir, "src/Scene.tsx"), "changed");
    await writeFile(join(child.dir, "src/New.tsx"), "x");
    await writeFile(join(child.dir, "props.json"), "{}");
  });

  it("createDraft с несуществующим родителем — ошибка, draft не создаётся", async () => {
    await expect(
      createDraft(root, { runId: "run_P", attempt: 1, sceneId: "scn_A", parentVersionId: "ver_NOPE" }),
    ).rejects.toThrow();
    expect(existsSync(join(root, "workspace/drafts/run_P-a1"))).toBe(false);
  });

  it("карантинный draft не публикуется", async () => {
    const d = await mk("scn_A");
    await quarantineDraft(d, "оркестратор упал");
    const q = JSON.parse(await readFile(join(d.dir, ".quarantined"), "utf8"));
    expect(q.reason).toBe("оркестратор упал");
    expect(Number.isNaN(Date.parse(q.at))).toBe(false);
    await expect(publishVersion(d, meta("scn_A"), okGuard)).rejects.toThrow(/quarantined/);
    expect(existsSync(d.dir)).toBe(true);
    expect(existsSync(join(root, "workspace/projects/playground/scenes/scn_A/versions"))).toBe(false);
  });

  it("brief.json пишется в каталог сцены", async () => {
    await writeBrief(root, "scn_A", { prompt: "p", settings: defaultSettings(), created_at: "2026-10-20T00:00:00.000Z" });
    const b = JSON.parse(await readFile(join(root, "workspace/projects/playground/scenes/scn_A/brief.json"), "utf8"));
    expect(b.prompt).toBe("p");
  });

  describe("readVersion отвергает неполные и испорченные версии", () => {
    it("каталог без manifest.json (сбой до записи)", async () => {
      const dir = join(root, "workspace/projects/playground/scenes/scn_A/versions/ver_HALF");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "props.json"), "{}");
      await expect(readVersion(dir)).rejects.toThrow();
    });
    it("подмена содержимого", async () => {
      const v = await publishVersion(await mk("scn_A"), meta("scn_A"), okGuard);
      await chmod(join(v.dir, "props.json"), 0o644);
      await writeFile(join(v.dir, "props.json"), '{"x":1}');
      await expect(readVersion(v.dir)).rejects.toThrow(/sha256/);
    });
    it("лишний файл", async () => {
      const v = await publishVersion(await mk("scn_A"), meta("scn_A"), okGuard);
      await chmod(v.dir, 0o755);
      await writeFile(join(v.dir, "extra.txt"), "x");
      await expect(readVersion(v.dir)).rejects.toThrow(/extra\.txt/);
    });
    it("пропавший файл", async () => {
      const v = await publishVersion(await mk("scn_A"), meta("scn_A"), okGuard);
      await chmod(v.dir, 0o755);
      await chmod(join(v.dir, "src"), 0o755);
      await rm(join(v.dir, "src/Scene.tsx"));
      await expect(readVersion(v.dir)).rejects.toThrow(/Scene\.tsx/);
    });
    it("версия, переименованная, но не закрытая chmod (сбой после rename), читается", async () => {
      const v = await publishVersion(await mk("scn_A"), meta("scn_A"), okGuard);
      await unlock(v.dir);
      await expect(readVersion(v.dir)).resolves.toBeDefined();
    });
  });
});
