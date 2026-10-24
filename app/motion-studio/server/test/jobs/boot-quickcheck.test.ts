// Ревью Task 24, M9: quick_check — до миграций. Повреждённую базу migrate не трогает и
// резервную копию поверх неё не делает.
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { reapAttempt } from "@ms/core";
import { openDb } from "../../src/db/open.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { bootCore } from "../../src/boot.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";

vi.mock("../../src/db/meta.js", async (orig) => ({ ...(await orig<typeof import("../../src/db/meta.js")>()), quickCheck: () => false }));

const sql = (f: string) => readFileSync(new URL(`../../src/db/migrations/${f}`, import.meta.url), "utf8");

let s: TestStore;
beforeEach(async () => { s = await makeStore("ms-jobs-bootqc-"); });
afterEach(async () => { await removeStore(s); });

it("quick_check не прошёл — boot падает до migrate: версия базы прежняя, копии нет", async () => {
  const db = openDb(s.root);
  db.exec(sql("001_phase1.sql"));
  db.pragma("user_version = 1");
  db.exec(sql("002_resource_locks.sql"));
  db.pragma("user_version = 2");
  db.close();
  const reap = (async () => ({ clean: true, alive: [] })) as unknown as typeof reapAttempt;
  await expect(bootCore({
    env: { MS_DATA_DIR: s.root }, kind: "server", probe, kb: {} as KnowledgeAdapter, agents: {} as AgentRuntimeAdapter, reap,
  })).rejects.toThrow(/quick_check/);
  const after = openDb(s.root);
  try {
    expect(after.pragma("user_version", { simple: true })).toBe(2);
  } finally {
    after.close();
  }
  expect(readdirSync(s.root).filter((n) => n.startsWith("studio.db.bak-"))).toEqual([]);
});
