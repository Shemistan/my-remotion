import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VolumeProbe } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { runDoctor } from "../../src/cli/doctor.js";
import { openDb } from "../../src/db/open.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import { publishVersion, writeBrief } from "../../src/scenes/store.js";
import { unlockTree } from "../db/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";

const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));
const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};
// Браузер подменён: настоящий ensureRenderBrowser качает Chrome (проверяется в e2e render).
const browser = async () => ({ path: "/fake/chrome-headless-shell" });

let tmp: string;
beforeEach(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-server-test-"));
});
afterEach(async () => {
  await unlockTree(tmp); // опубликованные версии read-only
  await rm(tmp, { recursive: true, force: true });
});

it("reports not_found with exit 1 and creates nothing", async () => {
  const root = join(tmp, "NoSuchDisk", "MotionStudio");
  const r = await runDoctor([], { MS_DATA_DIR: root }, probe, browser);
  expect(r.code).toBe(1);
  expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "not_found" });
  expect(existsSync(join(tmp, "NoSuchDisk"))).toBe(false);
});

it("--init creates the store, then reports ok", async () => {
  const root = join(tmp, "store");
  const r = await runDoctor(["--init"], { MS_DATA_DIR: root }, probe, browser);
  expect(r.code).toBe(0);
  expect(JSON.parse(r.output)).toMatchObject({ ok: true, root, marker: { volume_uuid: "VOL-A" } });
});

it("--init without MS_DATA_DIR fails with env_missing", async () => {
  const r = await runDoctor(["--init"], {}, probe, browser);
  expect(r.code).toBe(1);
  expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "env_missing" });
});

it("--init failure is reported as StorageStatus JSON, not thrown", async () => {
  const r = await runDoctor(["--init"], { MS_DATA_DIR: join(tmp, "no/such") }, probe, browser);
  expect(r.code).toBe(1);
  expect(JSON.parse(r.output)).toMatchObject({
    ok: false,
    reason: "not_found",
    detail: expect.stringMatching(/родительский каталог/),
  });
});

it("rejects unknown arguments with exit 2", async () => {
  const r = await runDoctor(["--frobnicate"], {}, probe, browser);
  expect(r.code).toBe(2);
  expect(r.output).toMatch(/--init/);
});

it("reports the render browser and fails when it is unavailable", async () => {
  const root = join(tmp, "store");
  await runDoctor(["--init"], { MS_DATA_DIR: root }, probe, browser);
  const ok = await runDoctor([], { MS_DATA_DIR: root }, probe, browser);
  expect(ok.code).toBe(0);
  expect(JSON.parse(ok.output)).toMatchObject({ ok: true, browser: { ok: true, path: "/fake/chrome-headless-shell" } });

  const broken = async () => {
    throw new Error("download blocked");
  };
  const bad = await runDoctor([], { MS_DATA_DIR: root }, probe, broken);
  expect(bad.code).toBe(1);
  expect(JSON.parse(bad.output)).toMatchObject({ ok: true, browser: { ok: false, error: "download blocked" } });
});

it("--import-slice регистрирует версии среза в studio.db", async () => {
  const root = join(tmp, "store");
  await runDoctor(["--init"], { MS_DATA_DIR: root }, probe, browser);
  const status = { ok: true as const, root, marker: {} as never, freeBytes: 1 };
  await writeBrief(root, "scn_S", { prompt: "срез", settings: defaultSettings(), created_at: "2026-10-20T00:00:00.000Z" });
  const v = await publishVersion(await makeDraft(root, { runId: "run_1", attempt: 1, sceneId: "scn_S" }), meta("scn_S"), async () => status);

  const r = await runDoctor(["--import-slice"], { MS_DATA_DIR: root }, probe, browser);
  expect(r.code).toBe(0);
  expect(JSON.parse(r.output)).toMatchObject({ ok: true, import: { imported: 1, skipped: [] } });
  const db = openDb(root);
  try {
    expect(versions.get(db, v.versionId)).toMatchObject({ number: 1, status: "ready" });
    expect(scenes.get(db, "scn_S")!.current_version_id).toBe(v.versionId);
  } finally {
    db.close();
  }
  const again = await runDoctor(["--import-slice"], { MS_DATA_DIR: root }, probe, browser);
  expect(JSON.parse(again.output)).toMatchObject({ ok: true, import: { imported: 0 } });
});

it("--import-slice без хранилища — отказ без создания БД", async () => {
  const root = join(tmp, "nope");
  const r = await runDoctor(["--import-slice"], { MS_DATA_DIR: root }, probe, browser);
  expect(r.code).toBe(1);
  expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "not_found" });
  expect(existsSync(root)).toBe(false);
});
