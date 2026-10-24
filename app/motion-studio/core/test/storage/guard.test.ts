import { existsSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, rename, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MARKER_FILE, checkStorage, initStore, isInconclusive, type StoreMarker } from "../../src/storage/guard.js";
import { GiB, fakeProbe, makeTmp, removeTmp } from "../helpers.js";

let tmp: string;
let root: string;
const probe = fakeProbe();
const sysProbe = fakeProbe({ dev: 1, sysDev: 1 });

async function marker(): Promise<StoreMarker> {
  return JSON.parse(await readFile(join(root, MARKER_FILE), "utf8")) as StoreMarker;
}

beforeEach(async () => {
  tmp = await makeTmp();
  root = join(tmp, "store");
});
afterEach(async () => {
  await chmod(root, 0o755).catch(() => undefined);
  await removeTmp(tmp);
});

describe("checkStorage", () => {
  beforeEach(async () => {
    await initStore(root, probe, { allowSystemDisk: true });
  });

  it("refuses without MS_DATA_DIR", async () =>
    expect(await checkStorage({}, probe)).toMatchObject({ ok: false, reason: "env_missing" }));

  it("refuses relative MS_DATA_DIR", async () =>
    expect(await checkStorage({ MS_DATA_DIR: "data/store" }, probe)).toMatchObject({
      ok: false,
      reason: "env_missing",
    }));

  it("does not create a missing root", async () => {
    expect(await checkStorage({ MS_DATA_DIR: join(tmp, "absent") }, probe)).toMatchObject({
      ok: false,
      reason: "not_found",
    });
    expect(existsSync(join(tmp, "absent"))).toBe(false);
  });

  it("returns marker and free space when healthy", async () => {
    const status = await checkStorage({ MS_DATA_DIR: root }, probe);
    expect(status).toEqual({ ok: true, root, marker: await marker(), freeBytes: 100 * GiB, dev: 2 });
  });

  it("leaves no files behind after the write test", async () => {
    await checkStorage({ MS_DATA_DIR: root }, probe);
    expect((await readdir(root)).sort()).toEqual([MARKER_FILE, "run"].sort());
  });

  it("reports missing marker", async () => {
    const bare = join(tmp, "bare");
    await mkdir(bare);
    expect(await checkStorage({ MS_DATA_DIR: bare }, probe)).toMatchObject({
      ok: false,
      reason: "marker_missing",
    });
  });

  it("reports unreadable marker as missing", async () => {
    await writeFile(join(root, MARKER_FILE), "{not json");
    expect(await checkStorage({ MS_DATA_DIR: root }, probe)).toMatchObject({
      ok: false,
      reason: "marker_missing",
    });
  });

  it("detects a different store_id", async () => {
    expect(await checkStorage({ MS_DATA_DIR: root }, probe, "other-store")).toMatchObject({
      ok: false,
      reason: "marker_mismatch",
    });
    const { store_id } = await marker();
    expect(await checkStorage({ MS_DATA_DIR: root }, probe, store_id)).toMatchObject({ ok: true });
  });

  it("detects another volume", async () => {
    expect((await marker()).volume_uuid).toBe("VOL-A");
    expect(await checkStorage({ MS_DATA_DIR: root }, fakeProbe({ uuid: "VOL-B" }))).toMatchObject({
      ok: false,
      reason: "volume_mismatch",
    });
  });

  it("rejects root on system volume unless allowed", async () => {
    expect(await checkStorage({ MS_DATA_DIR: root }, sysProbe)).toMatchObject({
      ok: false,
      reason: "system_volume",
    });
    expect(
      await checkStorage({ MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" }, sysProbe),
    ).toMatchObject({ ok: true });
  });

  it("reports a read-only root", async () => {
    await chmod(root, 0o555);
    expect(await checkStorage({ MS_DATA_DIR: root }, probe)).toMatchObject({
      ok: false,
      reason: "not_writable",
    });
  });

  it("reports low space", async () => {
    const small = fakeProbe({ free: 5 * GiB });
    expect(await checkStorage({ MS_DATA_DIR: root }, small)).toMatchObject({
      ok: false,
      reason: "low_space",
    });
    expect(await checkStorage({ MS_DATA_DIR: root, MS_MIN_FREE_GB: "4" }, small)).toMatchObject({
      ok: true,
    });
  });

  it("rejects a symlinked root", async () => {
    const link = join(tmp, "link");
    await symlink(root, link);
    expect(await checkStorage({ MS_DATA_DIR: link }, probe)).toMatchObject({
      ok: false,
      reason: "not_found",
      detail: expect.stringMatching(/симлинк/),
    });
  });

  // флейк storage-mode.test под нагрузкой: rename корня между шагами проверки давал
  // marker_missing / not_writable вместо not_found
  it("root vanishing mid-check (after the root step) is reported as not_found", async () => {
    const vanishing = { ...probe, volumeUuid: async () => {
      await rename(root, `${root}.gone`);
      return "VOL-A";
    } };
    try {
      expect(await checkStorage({ MS_DATA_DIR: root }, vanishing)).toMatchObject({ ok: false, reason: "not_found", detail: expect.stringContaining("not_writable") });
    } finally {
      // корень возвращаем при любом исходе: afterEach чистит tmp, следующие тесты ждут root
      if (existsSync(`${root}.gone`)) await rename(`${root}.gone`, root);
    }
  });

  it("system volume is conclusive even while the volume probe is failing", async () => {
    const broken = { ...sysProbe, volumeUuid: () => Promise.reject(new Error("diskutil failed")) };
    const st = await checkStorage({ MS_DATA_DIR: root }, broken);
    expect(st).toMatchObject({ ok: false, reason: "system_volume" });
    expect(isInconclusive(st)).toBe(false);
    // с явным разрешением системного диска сбой пробы по-прежнему неокончательный
    expect(await checkStorage({ MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" }, broken)).toMatchObject({ ok: false, reason: "volume_probe_failed" });
  });

  it("a failing volume probe (diskutil slow or silent) is an inconclusive failure, not volume_mismatch", async () => {
    const broken = { ...probe, volumeUuid: () => Promise.reject(new Error("diskutil failed")) };
    const st = await checkStorage({ MS_DATA_DIR: root }, broken);
    expect(st).toMatchObject({ ok: false, reason: "volume_probe_failed", detail: expect.stringMatching(/diskutil failed/), dev: 2 });
    expect(isInconclusive(st)).toBe(true);
  });

  it("classifies failures: only probe trouble and watch timeouts are inconclusive", async () => {
    const other = await checkStorage({ MS_DATA_DIR: root }, fakeProbe({ uuid: "VOL-B" }));
    expect(isInconclusive(other)).toBe(false);
    const gone = await checkStorage({ MS_DATA_DIR: join(tmp, "absent") }, probe);
    expect(isInconclusive(gone)).toBe(false);
    expect(isInconclusive({ ok: false, reason: "storage_watch_timeout", detail: "" })).toBe(true);
    expect(isInconclusive({ ok: false, reason: "marker_mismatch", detail: "" })).toBe(false);
    expect(isInconclusive(await checkStorage({ MS_DATA_DIR: root }, probe))).toBe(false);
  });

  it("reports the root st_dev in a passing status", async () => {
    expect(await checkStorage({ MS_DATA_DIR: root }, probe)).toMatchObject({ ok: true, dev: 2 });
  });

  it("a probe failure while the root vanishes is still a conclusive not_found", async () => {
    const vanishing = { ...probe, volumeUuid: async () => {
      await rename(root, `${root}.gone`);
      throw new Error("diskutil: no such volume");
    } };
    try {
      const st = await checkStorage({ MS_DATA_DIR: root }, vanishing);
      expect(st).toMatchObject({ ok: false, reason: "not_found" });
      expect(isInconclusive(st)).toBe(false);
    } finally {
      if (existsSync(`${root}.gone`)) await rename(`${root}.gone`, root);
    }
  });
});

describe("initStore", () => {
  it("creates root and marker", async () => {
    const m = await initStore(root, probe, {});
    expect(m).toMatchObject({ schema_version: 1, volume_uuid: "VOL-A" });
    expect(m.store_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await marker()).toEqual(m);
  });

  it("creates run/processes: Chrome's side registry needs it before the first render", async () => {
    await initStore(root, probe, {});
    expect(statSync(join(root, "run/processes")).isDirectory()).toBe(true);
  });

  it("initStore requires existing parent", async () => {
    const deep = join(tmp, "no/such/dir");
    await expect(initStore(deep, probe, {})).rejects.toThrow(/storage/);
    expect(existsSync(join(tmp, "no"))).toBe(false);
  });

  it("refuses system volume unless allowed, creating nothing", async () => {
    await expect(initStore(root, sysProbe, {})).rejects.toThrow(/storage/);
    expect(existsSync(root)).toBe(false);
    await expect(initStore(root, sysProbe, { allowSystemDisk: true })).resolves.toMatchObject({
      schema_version: 1,
    });
  });

  it("checks the existing root's device, not the parent's", async () => {
    await mkdir(root);
    // корень — точка монтирования внешнего тома, родитель — на системном
    const mounted = { ...sysProbe, deviceId: async (p: string) => (p === root ? 2 : 1) };
    await expect(initStore(root, mounted, {})).resolves.toMatchObject({ schema_version: 1 });

    const other = join(tmp, "other");
    await mkdir(other);
    // существующий корень на системном томе при внешнем родителе
    const internal = { ...probe, deviceId: async (p: string) => (p === other ? 1 : 2) };
    await expect(initStore(other, internal, {})).rejects.toThrow(/system_volume/);
    expect(existsSync(join(other, MARKER_FILE))).toBe(false);
  });

  it("refuses a symlinked root without writing the marker", async () => {
    const target = join(tmp, "target");
    await mkdir(target);
    await symlink(target, root);
    await expect(initStore(root, probe, {})).rejects.toThrow(/симлинк/);
    expect(existsSync(join(target, MARKER_FILE))).toBe(false);
  });

  it("leaves no temporary files next to the marker", async () => {
    await initStore(root, probe, {});
    await initStore(root, fakeProbe({ uuid: "VOL-B" }), { adopt: true });
    expect((await readdir(root)).sort()).toEqual([MARKER_FILE, "run"].sort());
  });

  it("refuses to re-initialize an existing store", async () => {
    const first = await initStore(root, probe, {});
    await expect(initStore(root, probe, {})).rejects.toThrow(/adopt/);
    expect(await marker()).toEqual(first);
  });

  it("adopt rewrites only volume_uuid", async () => {
    const before = await initStore(root, probe, {});
    const after = await initStore(root, fakeProbe({ uuid: "VOL-B" }), { adopt: true });
    expect(after).toEqual({ ...before, volume_uuid: "VOL-B" });
    expect(await marker()).toEqual(after);
  });

  it("adopt requires an existing marker", async () => {
    await mkdir(root);
    await expect(initStore(root, probe, { adopt: true })).rejects.toThrow(/storage/);
    expect(existsSync(join(root, MARKER_FILE))).toBe(false);
  });
});
