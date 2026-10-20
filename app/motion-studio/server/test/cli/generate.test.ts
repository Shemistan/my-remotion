// CLI generate: аргументы и порядок старта (owner lock → storage → reap → relock → generate).
import { describe, expect, it } from "vitest";
import { OwnerBusyError, type StorageStatus } from "@ms/core";
import { type CliSteps, parseArgs, runGenerate } from "../../src/cli/generate.js";
import type { GenerateResult } from "../../src/pipeline/generate.js";

const OK: StorageStatus = { ok: true, root: "/store", marker: { schema_version: 1, store_id: "s", volume_uuid: "v", created_at: "" }, freeBytes: 1 };
const env = { MS_DATA_DIR: "/store" };

function steps(over: Partial<CliSteps> = {}) {
  const calls: string[] = [];
  const s: CliSteps = {
    acquireLock: async () => {
      calls.push("lock");
      return { release: async () => void calls.push("release") };
    },
    checkStorage: async () => (calls.push("storage"), OK),
    leftoverRuns: async () => (calls.push("leftovers"), ["run_old"]),
    reapStale: async (_root, runId) => (calls.push(`reap:${runId}`), { clean: true, alive: [] }),
    reapStrays: async () => (calls.push("strays"), []),
    relock: async () => (calls.push("relock"), { relocked: [], broken: [] }),
    generate: async (): Promise<GenerateResult> => {
      calls.push("generate");
      return { status: "ready", runId: "run_x", versionDir: "/v", previewPath: "/v/preview.mp4", costUsd: 1.5, engineerCalls: 1, warnings: ["w1"], timings: {} };
    },
    ...over,
  };
  return { s, calls };
}

function io() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

describe("parseArgs", () => {
  it("запрос и флаги", () => {
    const r = parseArgs(["Рост", "--duration-frames", "240", "--aspect", "9:16", "--style", "tech-neon"]);
    expect(r).toMatchObject({ prompt: "Рост", settings: { duration_frames: 240, width: 1080, height: 1920, aspect_ratio: "9:16", style_preset: "tech-neon" } });
  });
  it("ошибки: нет запроса, неизвестный флаг, плохие значения", () => {
    expect(parseArgs([])).toBe("нет запроса");
    expect(parseArgs(["x", "--foo"])).toContain("--foo");
    expect(parseArgs(["x", "--aspect", "4:3"])).toContain("--aspect");
    expect(parseArgs(["x", "--duration-frames", "0"])).toContain("--duration-frames");
    expect(parseArgs(["x", "--style"])).toContain("нет значения");
  });
});

describe("runGenerate", () => {
  it("порядок: lock → storage → reap прогонов → strays → relock → generate → release; печатает итог", async () => {
    const { s, calls } = steps();
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(0);
    expect(calls).toEqual(["lock", "storage", "leftovers", "reap:run_old", "strays", "relock", "generate", "release"]);
    expect(o.out).toContain("status: ready");
    expect(o.out).toContain("preview: /v/preview.mp4");
    expect(o.out.join("\n")).toContain("cost: $1.50");
    expect(o.out).toContain("warning: w1");
  });

  it("owner_busy → код 1, дальше не идёт", async () => {
    const { s, calls } = steps({ acquireLock: async () => { throw new OwnerBusyError(42, { pid: 42, startedAt: "", kind: "cli" }); } });
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(1);
    expect(o.err.join("\n")).toContain("owner_busy");
    expect(calls).toEqual([]);
  });

  it("reap не чист → отказ с pid и командой, generate не зовётся, lock отпущен", async () => {
    const alive = [{ runId: "run_old", attempt: 1, pid: 777, pgid: 777, startedAt: "", cmd: "claude -p --restricted" }];
    const { s, calls } = steps({ reapStale: async () => ({ clean: false, alive }) });
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(1);
    expect(o.err.join("\n")).toMatch(/stale_process.*pid 777 \(claude -p --restricted\)/);
    expect(calls).not.toContain("generate");
    expect(calls.at(-1)).toBe("release");
  });

  it("живые процессы рендера → отказ с pid", async () => {
    const { s, calls } = steps({ reapStrays: async () => [{ pid: 9, pgid: 9 }] });
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(1);
    expect(o.err.join("\n")).toContain("pid 9");
    expect(calls).not.toContain("generate");
  });

  it("хранилище не в порядке → код 1 без генерации", async () => {
    const { s, calls } = steps();
    s.checkStorage = async () => (calls.push("storage"), { ok: false, reason: "not_found", detail: "нет SSD" });
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(1);
    expect(o.err.join("\n")).toContain("storage: not_found");
    expect(calls).toEqual(["lock", "storage", "release"]);
  });

  it("failed → код 1 и причина", async () => {
    const { s } = steps({
      generate: async () => ({ status: "failed", runId: "r", costUsd: 0, engineerCalls: 0, warnings: [], timings: {}, failure: { stage: "storage", message: "SSD" } }),
    });
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(1);
    expect(o.out).toContain("failure: storage: SSD");
  });

  it("без MS_DATA_DIR → код 1; без запроса → 2", async () => {
    const { s } = steps();
    expect(await runGenerate(["Рост"], {}, io().io, s)).toBe(1);
    expect(await runGenerate([], env, io().io, s)).toBe(2);
  });
});
