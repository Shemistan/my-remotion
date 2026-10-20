// H9: rename версии становится устойчивым до COMMIT — fsync каталогов versions/ и drafts/
// внутри commitVersionFiles, сразу после renameSync.
import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const events: string[] = [];
const fds = new Map<number, string>();
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    openSync: (path: string, ...rest: unknown[]) => {
      const fd = (fs.openSync as (...a: unknown[]) => number)(path, ...rest);
      fds.set(fd, String(path));
      return fd;
    },
    fsyncSync: (fd: number) => {
      events.push(`fsync ${fds.get(fd)}`);
      fs.fsyncSync(fd);
    },
    renameSync: (a: string, b: string) => {
      events.push(`rename ${a} -> ${b}`);
      fs.renameSync(a, b);
    },
  };
});

const { commitVersionFiles, createDraft, prepareVersion } = await import("../../src/scenes/store.js");
const { makeStore, removeStore } = await import("../db/helpers.js");
const { meta } = await import("./helpers.js");
const { sha256 } = await import("../../src/scenes/hash.js");

let s: Awaited<ReturnType<typeof makeStore>>;
beforeEach(async () => {
  s = await makeStore("ms-store-durable-");
});
afterEach(() => removeStore(s));

it("commitVersionFiles: fsync versions/ и drafts/ после rename, до возврата", async () => {
  const d = await createDraft(s.root, { runId: "job_1", attempt: 1, sceneId: "scn_A" });
  await mkdir(join(d.dir, "src"));
  await writeFile(join(d.dir, "src/Scene.tsx"), "x");
  await writeFile(join(d.dir, "preview.mp4"), "video");
  await writeFile(join(d.dir, "frames.png"), "png0");
  const m = { ...meta("scn_A"), qa_frames: [], qa_frames_sha256: [], preview: { path: "preview.mp4", sha256: sha256("video") } };
  const prepared = await prepareVersion(d, m, s.guard);
  const dir = join(prepared.versionsDir, "ver_D");
  events.length = 0;
  commitVersionFiles(prepared, { versionId: "ver_D", number: 1, dir });
  const renamed = events.findIndex((e) => e === `rename ${d.dir} -> ${dir}`);
  expect(renamed).toBeGreaterThanOrEqual(0);
  const after = events.slice(renamed + 1);
  expect(after).toContain(`fsync ${prepared.versionsDir}`);
  expect(after).toContain(`fsync ${dirname(d.dir)}`);
});
