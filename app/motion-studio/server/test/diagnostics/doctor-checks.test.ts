// runDoctor: общий для CLI и API отчёт doctor; `fast` — без платного входа Claude и без
// скачивания Chrome; в сервере база и owner-lock — свои (lock занят этим сервером — не ошибка).
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { DoctorReportDtoSchema } from "@ms/contracts";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runDoctor } from "../../src/diagnostics/doctor-checks.js";
import { REPO_TMP, makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { openDb } from "../../src/db/open.js";

let tmp: string;
let s: TestStore;
beforeEach(async () => {
  mkdirSync(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-doctor-checks-"));
  s = await makeStore("ms-doctor-store-");
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
  await removeStore(s);
});

/** Фейковые claude/ffmpeg/ffprobe; claude -p оставляет метку (платный вход). */
function fakeBin(): string {
  const dir = join(tmp, "bin");
  mkdirSync(dir, { recursive: true });
  const scripts: Record<string, string> = {
    claude: [
      "#!/bin/sh",
      'if [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi',
      `echo login > "${join(tmp, "login-called")}"`,
      `echo '{"type":"result","is_error":false,"result":"ok","total_cost_usd":0.002}'`,
    ].join("\n"),
    ffmpeg: ["#!/bin/sh", 'if [ "$1" = "-version" ]; then echo "ffmpeg version 7.1.1"; exit 0; fi', 'echo " V....D libx264  x"; echo " A....D aac  x"; echo " V....D prores_ks  x"'].join("\n"),
    ffprobe: ["#!/bin/sh", 'echo "ffprobe version 7.1.1"'].join("\n"),
  };
  for (const [name, text] of Object.entries(scripts)) {
    writeFileSync(join(dir, name), text + "\n");
    chmodSync(join(dir, name), 0o755);
  }
  return dir;
}

const deps = {
  browser: async () => ({ path: "/fake/chrome" }),
  findBrowser: () => "/fake/chrome-found",
  asr: async () => ({ available: true as const, workerSha256: "a".repeat(64), commit: "0456395abcdef", gpuContention: false }),
  vision: async () => ({ ok: true, status: "ok", detail: "vision-detect 1" }),
};

it("fast: строки node, claude, ffmpeg, storage, chrome, asr, vision, db; вход Claude не вызывается", async () => {
  const env = { PATH: fakeBin(), HOME: tmp, MS_DATA_DIR: s.root, MS_DEPS_DIR: join(tmp, "deps") };
  const r = await runDoctor({ fast: true, env, probe, deps });
  expect(DoctorReportDtoSchema.parse(r)).toBeTruthy();
  expect(r.rows.map((c) => c.name)).toEqual(expect.arrayContaining(["node", "claude", "ffmpeg", "storage", "chrome", "asr", "vision", "db"]));
  expect(r.rows.find((c) => c.name === "claude_login")).toMatchObject({ ok: true, status: "skipped" });
  expect(r.rows.find((c) => c.name === "chrome")).toMatchObject({ ok: true, detail: "/fake/chrome-found" });
  expect(existsSync(join(tmp, "login-called"))).toBe(false);
  expect(r.ok).toBe(r.rows.every((c) => c.ok));
});

it("полный: вход Claude вызывается, Chrome — через ensure", async () => {
  const env = { PATH: fakeBin(), HOME: tmp, MS_DATA_DIR: s.root, MS_DEPS_DIR: join(tmp, "deps") };
  const r = await runDoctor({ env, probe, deps });
  expect(r.rows.find((c) => c.name === "claude_login")).toMatchObject({ ok: true, status: "ok" });
  expect(existsSync(join(tmp, "login-called"))).toBe(true);
  expect(r.rows.find((c) => c.name === "chrome")).toMatchObject({ detail: "/fake/chrome" });
});

it("в сервере: своя база (quick_check) и owner-lock этого сервера — ok; детали без секретов", async () => {
  const db = openDb(s.root);
  try {
    const env = { PATH: fakeBin(), HOME: tmp, MS_DATA_DIR: s.root, MS_DEPS_DIR: join(tmp, "deps"), ANTHROPIC_API_KEY: "sk-ant-api03-NOPE" };
    const r = await runDoctor({ fast: true, env, probe, deps: { ...deps, vision: async () => ({ ok: false, status: "error", detail: "ANTHROPIC_API_KEY=sk-ant-api03-NOPE" }) }, db });
    expect(r.rows.find((c) => c.name === "db")).toMatchObject({ ok: true, detail: "quick_check ok" });
    expect(r.rows.find((c) => c.name === "owner_lock")).toMatchObject({ ok: true });
    expect(JSON.stringify(r)).not.toMatch(/sk-ant-/);
  } finally {
    db.close();
  }
});
