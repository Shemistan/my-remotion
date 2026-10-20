import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type VolumeProbe, initStore } from "@ms/core";
import { z } from "zod";
import type { AgentTask } from "../../src/agents/runtime.js";

// tmp/ репозитория (в .gitignore): тесты пишут только сюда.
const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("../fixtures/", import.meta.url));

export const Ok = z.object({ ok: z.boolean() }).strict();

export const fx = (name: string): string => readFileSync(join(FIXTURES, "claude", name), "utf8");
export const bin = (name: string): string => join(FIXTURES, "bin", name);

export async function makeTmp(): Promise<string> {
  await mkdir(REPO_TMP, { recursive: true });
  return mkdtemp(join(REPO_TMP, "ms-agents-test-"));
}

export const removeTmp = (dir: string) => rm(dir, { recursive: true, force: true });

export function makeTask<I>(over: Partial<AgentTask<I>> & { input: I; run: AgentTask<I>["run"]; workdir: string }): AgentTask<I> {
  return {
    role: "motion_director",
    inputRefs: [],
    tools: [],
    model: "opus",
    limits: { timeoutMs: 60_000, maxBudgetUsd: 2 },
    idempotencyKey: `${over.run.runId}-a${over.run.attempt}`,
    ...over,
  };
}

// Хранилище в tmp: маркер нужен реестру `run/processes/`; том подменён.
const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};

export async function makeStore(tmp: string): Promise<string> {
  const root = join(tmp, "store");
  await initStore(root, probe, {});
  return root;
}
