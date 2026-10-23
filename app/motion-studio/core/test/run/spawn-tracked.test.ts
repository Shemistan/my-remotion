// spawnTracked (Task 13): хвост stdout/stderr ограничен, реестр получает `end` с итогом.
import { afterEach, beforeEach, expect, it } from "vitest";
import { join } from "node:path";
import { type TrackedProcess, fileProcessRegistry } from "../../src/run/processes.js";
import { spawnTracked } from "../../src/run/spawn-tracked.js";
import { initStore } from "../../src/storage/guard.js";
import { fakeProbe, makeTmp, removeTmp } from "../helpers.js";

let tmp: string;
let root: string;

beforeEach(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
  await initStore(root, fakeProbe(), {});
});
afterEach(async () => {
  await removeTmp(tmp);
});

const opts = () => ({ cwd: tmp, env: process.env, signal: new AbortController().signal });

it("stdout/stderr keep only the tail up to maxOutputChars with a truncation mark", async () => {
  // 50 000 символов в stdout, 30 000 в stderr; хвост — 1000
  const script = 'i=0; while [ $i -lt 500 ]; do printf "%099d\\n" $i; printf "%099d\\n" $i >&2; i=$((i+1)); done; echo END; echo ERR-END >&2';
  const res = await spawnTracked(root, { runId: "run1", attempt: 1 }, "/bin/sh", ["-c", script], { ...opts(), maxOutputChars: 1000 });
  expect(res.code).toBe(0);
  expect(res.stdout).toMatch(/^…\[обрезано \d+ символов\]\n/);
  expect(res.stdout.endsWith("END\n")).toBe(true);
  expect(res.stdout.length).toBeLessThan(1100);
  expect(res.stderr).toMatch(/^…\[обрезано \d+ символов\]\n/);
  expect(res.stderr.endsWith("ERR-END\n")).toBe(true);
  // обрезано ровно лишнее: метка + 1000 символов хвоста
  const cut = Number(/обрезано (\d+)/.exec(res.stdout)![1]);
  expect(cut + 1000).toBe(500 * 100 + 4);
});

it("default cap is 8 MiB per stream: small output is untouched", async () => {
  const res = await spawnTracked(root, { runId: "run1", attempt: 1 }, "/bin/sh", ["-c", "echo hi"], opts());
  expect(res.stdout).toBe("hi\n");
});

it("ref may carry a registry (RenderRequest.run / AgentTask.run): it is not written into the record", async () => {
  const reg = fileProcessRegistry(root);
  const seen: TrackedProcess[] = [];
  const registry = {
    add: async (p: TrackedProcess) => {
      seen.push(p);
      await reg.add(p);
    },
    end: (p: TrackedProcess, e: { code: number | null; signal: string | null }) => reg.end(p, e),
    live: reg.live,
  };
  const ref = { runId: "run1", attempt: 3, root, registry };
  const res = await spawnTracked(root, ref, "/bin/sh", ["-c", "exit 0"], { ...opts(), registry });
  expect(res.code).toBe(0);
  expect(Object.keys(seen[0]!).sort()).toEqual(["attempt", "cmd", "pgid", "pid", "runId", "startedAt"]);
  expect(seen[0]).toMatchObject({ runId: "run1", attempt: 3 });
  expect(await reg.live()).toEqual([]);
});

it("M14: исключение в onStdout не роняет процесс и не теряет вывод", async () => {
  let calls = 0;
  const res = await spawnTracked(root, { runId: "run1", attempt: 1 }, "/bin/sh", ["-c", "echo a; sleep 0.05; echo b"], {
    ...opts(),
    onStdout: () => {
      calls++;
      throw new Error("наблюдатель упал");
    },
  });
  expect(res.code).toBe(0);
  expect(res.stdout).toBe("a\nb\n");
  expect(calls).toBeGreaterThanOrEqual(1);
});
