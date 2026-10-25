// Маркер чистой остановки (Task 47): пишется при штатной остановке ядра, снимается при старте;
// нет маркера после прежнего запуска — старт после сбоя (`crashed: true`).
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { reapAttempt } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type BootOptions, type Core, bootCore } from "../../src/boot.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import { SHUTDOWN_MARKER, consumeShutdownMarker, writeShutdownMarker } from "../../src/recovery/shutdown-marker.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";

let s: TestStore;
let core: Core | undefined;
beforeEach(async () => { s = await makeStore("ms-shutdown-"); });
afterEach(async () => {
  await core?.close();
  core = undefined;
  await removeStore(s);
});

const opts = (): BootOptions => ({
  env: { MS_DATA_DIR: s.root }, kind: "server", probe, kb: {} as KnowledgeAdapter, agents: {} as AgentRuntimeAdapter,
  reap: (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 }), reapStrays: async () => [], handlers: {},
});

it("write → consume: true один раз, затем false", async () => {
  expect(consumeShutdownMarker(s.root)).toBe(false);
  await writeShutdownMarker(s.root);
  expect(existsSync(join(s.root, SHUTDOWN_MARKER))).toBe(true);
  expect(consumeShutdownMarker(s.root)).toBe(true);
  expect(consumeShutdownMarker(s.root)).toBe(false);
});

it("ядро: первый старт — не сбой; штатная остановка пишет маркер; без маркера — crashed", async () => {
  core = await bootCore(opts());
  expect(core.bootReport.crashed).toBe(false);
  await core.close();
  expect(existsSync(join(s.root, SHUTDOWN_MARKER))).toBe(true);
  core = await bootCore(opts());
  expect(core.bootReport.crashed).toBe(false);
  expect(existsSync(join(s.root, SHUTDOWN_MARKER))).toBe(false);
  await core.close();
  rmSync(join(s.root, SHUTDOWN_MARKER)); // как SIGKILL: close() не дошёл до маркера
  core = await bootCore(opts());
  expect(core.bootReport.crashed).toBe(true);
});
