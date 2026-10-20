import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VolumeProbe } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runDoctor } from "../../src/cli/doctor.js";

const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));
const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};

let tmp: string;
beforeEach(async () => {
  await mkdir(REPO_TMP, { recursive: true });
  tmp = await mkdtemp(join(REPO_TMP, "ms-server-test-"));
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

it("reports not_found with exit 1 and creates nothing", async () => {
  const root = join(tmp, "NoSuchDisk", "MotionStudio");
  const r = await runDoctor([], { MS_DATA_DIR: root }, probe);
  expect(r.code).toBe(1);
  expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "not_found" });
  expect(existsSync(join(tmp, "NoSuchDisk"))).toBe(false);
});

it("--init creates the store, then reports ok", async () => {
  const root = join(tmp, "store");
  const r = await runDoctor(["--init"], { MS_DATA_DIR: root }, probe);
  expect(r.code).toBe(0);
  expect(JSON.parse(r.output)).toMatchObject({ ok: true, root, marker: { volume_uuid: "VOL-A" } });
});

it("--init without MS_DATA_DIR fails with env_missing", async () => {
  const r = await runDoctor(["--init"], {}, probe);
  expect(r.code).toBe(1);
  expect(JSON.parse(r.output)).toMatchObject({ ok: false, reason: "env_missing" });
});

it("--init failure is reported as StorageStatus JSON, not thrown", async () => {
  const r = await runDoctor(["--init"], { MS_DATA_DIR: join(tmp, "no/such") }, probe);
  expect(r.code).toBe(1);
  expect(JSON.parse(r.output)).toMatchObject({
    ok: false,
    reason: "not_found",
    detail: expect.stringMatching(/родительский каталог/),
  });
});

it("rejects unknown arguments with exit 2", async () => {
  const r = await runDoctor(["--frobnicate"], {}, probe);
  expect(r.code).toBe(2);
  expect(r.output).toMatch(/--init/);
});
