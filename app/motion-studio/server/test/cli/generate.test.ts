// CLI generate: аргументы, реакция на исходы старта и вывод. Старт идёт через bootCore; здесь он подменён шагами с теми же именами, что
// у bootCore (`steps().s.boot`), — проверяется реакция CLI на каждый исход. Настоящий
// bootCore + задача playground.generate — в generate-boot.test.ts.
import { describe, expect, it } from "vitest";
import { OwnerBusyError, type OwnerLock, StorageError, type StorageStatus, type TrackedProcess } from "@ms/core";
import { type CliCore, type CliResult, type CliSteps, parseArgs, runGenerate } from "../../src/cli/generate.js";

const OK: StorageStatus = { ok: true, root: "/store", marker: { schema_version: 1, store_id: "s", volume_uuid: "v", created_at: "" }, freeBytes: 1 };
const env = { MS_DATA_DIR: "/store" };

/** Шаги старта под именами среза; `boot` складывает из них поведение bootCore. */
interface FakeSteps {
  acquireLock(root: string): Promise<Pick<OwnerLock, "release">>;
  checkStorage(): Promise<StorageStatus>;
  leftoverRuns(): Promise<string[]>;
  reapStale(root: string, runId: string): Promise<{ clean: boolean; alive: TrackedProcess[] }>;
  reapStrays(): Promise<{ pid: number; pgid: number }[]>;
  sweep(): Promise<{ quarantined: string[]; skipped: string[] }>;
  relock(): Promise<{ relocked: string[]; broken: { dir: string; error: string }[] }>;
  ensureBrowser(): Promise<{ path: string }>;
  generate(): Promise<CliResult>;
}

function steps(over: Partial<FakeSteps> = {}) {
  const calls: string[] = [];
  const f: FakeSteps = {
    acquireLock: async () => {
      calls.push("lock");
      return { release: async () => void calls.push("release") };
    },
    checkStorage: async () => (calls.push("storage"), OK),
    leftoverRuns: async () => (calls.push("leftovers"), ["run_old"]),
    reapStale: async (_root, runId) => (calls.push(`reap:${runId}`), { clean: true, alive: [] }),
    reapStrays: async () => (calls.push("strays"), []),
    sweep: async () => (calls.push("sweep"), { quarantined: ["/store/workspace/drafts/run_old-a1"], skipped: [] }),
    relock: async () => (calls.push("relock"), { relocked: [], broken: [] }),
    ensureBrowser: async () => (calls.push("browser"), { path: "/chrome" }),
    generate: async (): Promise<CliResult> => {
      calls.push("generate");
      return { status: "ready", runId: "run_x", versionDir: "/v", previewPath: "/v/preview.mp4", costUsd: 1.5, engineerCalls: 1, warnings: ["w1"] };
    },
    ...over,
  };
  const s: CliSteps & FakeSteps = {
    ...f,
    // как bootCore: сбой шага после замка отпускает замок и бросает
    async boot(e): Promise<CliCore> {
      const lock = await s.acquireLock(e.MS_DATA_DIR!);
      try {
        const st = await s.checkStorage();
        if (!st.ok) throw new StorageError(st.reason, st.detail);
        const alive: TrackedProcess[] = [];
        for (const runId of await s.leftoverRuns()) alive.push(...(await s.reapStale("/store", runId)).alive);
        const strays = await s.reapStrays();
        const swept = await s.sweep();
        const relock = await s.relock();
        return {
          root: "/store",
          reaped: { alive, strays },
          boot: { swept, relock, reconcile: { imported: 0, skipped: [], missing: { restored: [], broken: [] } }, exports: { relocked: [], quarantined: [], missing: [], errors: [] } },
          close: () => lock.release(),
          generate: () => s.generate(),
        };
      } catch (err) {
        await lock.release();
        throw err;
      }
    },
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
  // Порядок шагов ниже задаёт фейковый boot этого файла, а не код: настоящий порядок
  // bootCore проверяет boot-order.test.ts. Здесь проверяется обвязка CLI: шаги после
  // загрузки (browser → generate), освобождение хранилища (release) и вывод.
  it("обвязка CLI (фейковый boot): browser и generate после загрузки, release в конце; печатает итог", async () => {
    const { s, calls } = steps();
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(0);
    expect(calls).toEqual(["lock", "storage", "leftovers", "reap:run_old", "strays", "sweep", "relock", "browser", "generate", "release"]);
    expect(o.err.join("\n")).toContain("abandoned");
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

  it("Chrome недоступен → отказ до генерации (до трат на агентов)", async () => {
    const { s, calls } = steps({ ensureBrowser: async () => { throw new Error("нет сети"); } });
    const o = io();
    expect(await runGenerate(["Рост"], env, o.io, s)).toBe(1);
    expect(o.err.join("\n")).toContain("doctor");
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
      generate: async () => ({ status: "failed", runId: "r", costUsd: 0, engineerCalls: 0, warnings: [], failure: { stage: "storage", message: "SSD" } }),
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
