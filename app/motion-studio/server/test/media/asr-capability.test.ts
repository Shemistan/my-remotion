// Task 26: доступность ASR — python, воркер, контракт (sha256), модель, том моделей, порт ai-platform.
import { describe, expect, it } from "vitest";
import type { AsrConfig } from "../../src/config.js";
import { type AsrCapabilityDeps, asrCapability, portBusy } from "../../src/media/asr-capability.js";
import { createServer } from "node:net";

const SHA = "a".repeat(64);
const cfg: AsrConfig = {
  python: "/py/bin/python", aiPlatformRoot: "/AIP", modelsDir: "/Volumes/Disk/local_models", model: "whisper-large-v3-turbo", language: "ru",
  expectedWorkerSha256: SHA, timeoutMs: 60_000, noOutputTimeoutMs: 10_000,
};
const present = new Set(["/py/bin/python", "/AIP/app/platform/aiplatform/montage/asr_worker.py", "/Volumes/Disk", "/Volumes/Disk/local_models",
  "/Volumes/Disk/local_models/asr/whisper-large-v3-turbo/config.json"]);
const deps = (o: Partial<AsrCapabilityDeps> = {}): AsrCapabilityDeps => ({
  exists: async (p) => present.has(p),
  sha256File: async () => SHA,
  gitHead: async () => "0456395abc",
  portBusy: async () => false,
  ...o,
});

describe("asrCapability", () => {
  it("всё на месте → available с sha256 воркера и коммитом ai-platform", async () => {
    expect(await asrCapability(cfg, deps())).toEqual({ available: true, workerSha256: SHA, commit: "0456395abc", gpuContention: false });
  });

  it("python не найден (реальная ФС)", async () => {
    expect((await asrCapability({ ...cfg, python: "/nope" })).reason).toBe("python_missing");
    expect((await asrCapability(cfg, deps({ exists: async (p) => p !== cfg.python && present.has(p) }))).reason).toBe("python_missing");
  });

  it("воркера нет → worker_missing; sha256 другой → asr_contract_changed с обоими хешами", async () => {
    expect((await asrCapability(cfg, deps({ exists: async (p) => !p.endsWith("asr_worker.py") && present.has(p) }))).reason).toBe("worker_missing");
    const r = await asrCapability(cfg, deps({ sha256File: async () => "deadbeef" }));
    expect(r).toMatchObject({ available: false, reason: "asr_contract_changed" });
    expect(r.available ? "" : r.detail).toMatch(/deadbeef/);
    expect(r.available ? "" : r.detail).toContain(SHA);
  });

  it("том моделей не смонтирован → models_volume_offline; модели нет → model_missing", async () => {
    expect((await asrCapability(cfg, deps({ exists: async (p) => !p.startsWith("/Volumes/Disk") && present.has(p) }))).reason).toBe("models_volume_offline");
    expect((await asrCapability(cfg, deps({ exists: async (p) => !p.endsWith("config.json") && present.has(p) }))).reason).toBe("model_missing");
    expect((await asrCapability({ ...cfg, model: "whisper-large-v3-mlx" }, deps())).reason).toBe("model_missing");
    // модель из входа задачи
    expect((await asrCapability(cfg, deps(), { model: "whisper-large-v3-mlx" })).reason).toBe("model_missing");
  });

  it("коммит не читается → unknown (контракт — sha256, не коммит); порт 8780 занят → gpuContention", async () => {
    expect(await asrCapability(cfg, deps({ gitHead: async () => { throw new Error("not a git repo"); }, portBusy: async () => true })))
      .toMatchObject({ available: true, commit: "unknown", gpuContention: true });
  });
});

describe("portBusy", () => {
  it("слушающий порт — занят, закрытый — свободен", async () => {
    const srv = createServer();
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const port = (srv.address() as { port: number }).port;
    expect(await portBusy(port)).toBe(true);
    await new Promise<void>((r) => srv.close(() => r()));
    expect(await portBusy(port)).toBe(false);
  });
});
