import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMacosProbe, macosProbe, mountIdentity, mountPointOf } from "../../src/storage/probe-macos.js";
import { makeTmp, removeTmp } from "../helpers.js";

let tmp: string;
beforeEach(async () => {
  tmp = await makeTmp();
});
afterEach(() => removeTmp(tmp));

it("mountPointOf walks up to the volume root", async () => {
  expect(await mountPointOf("/")).toBe("/");
  const mp = await mountPointOf(tmp);
  expect(tmp.startsWith(mp === "/" ? "/" : mp + "/")).toBe(true);
  expect((await stat(mp)).dev).toBe((await stat(tmp)).dev);
});

it("deviceId and freeBytes read the real file system", async () => {
  expect(await macosProbe.deviceId(tmp)).toBe((await stat(tmp)).dev);
  expect(await macosProbe.freeBytes(tmp)).toBeGreaterThan(0);
});

describe.runIf(process.platform === "darwin")("on macOS", () => {
  it("volumeUuid resolves a nested path via diskutil", async () => {
    expect(await macosProbe.volumeUuid(tmp)).toMatch(/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/);
  });

  it("volumeUuid fails for a missing path", async () => {
    await expect(macosProbe.volumeUuid(join(tmp, "absent"))).rejects.toThrow();
  });
});

describe("createMacosProbe: VolumeUUID cached per mount and st_dev", () => {
  const PLIST = (uuid: string) => `<plist><dict><key>VolumeUUID</key>\n<string>${uuid}</string></dict></plist>`;
  const UUID = "DF07AEE5-03DA-4E40-9AF0-B1D03396D6BD";

  it("calls diskutil once per volume, then answers from the cache (nested paths too)", async () => {
    const diskutil = vi.fn(async () => PLIST(UUID));
    const probe = createMacosProbe({ diskutilInfo: diskutil });
    await mkdir(join(tmp, "a", "b"), { recursive: true });
    expect(await probe.volumeUuid(tmp)).toBe(UUID);
    expect(await probe.volumeUuid(join(tmp, "a", "b"))).toBe(UUID);
    expect(await probe.volumeUuid(tmp)).toBe(UUID);
    expect(diskutil).toHaveBeenCalledTimes(1);
    expect(diskutil).toHaveBeenCalledWith(await mountPointOf(tmp));
  });

  it("a slow diskutil delays only the first verification", async () => {
    const diskutil = vi.fn(() => new Promise<string>((r) => setTimeout(() => r(PLIST(UUID)), 300)));
    const probe = createMacosProbe({ diskutilInfo: diskutil });
    // параллельные первые проверки делят один вызов
    expect(await Promise.all([probe.volumeUuid(tmp), probe.volumeUuid(tmp)])).toEqual([UUID, UUID]);
    const t = Date.now();
    for (let i = 0; i < 20; i++) expect(await probe.volumeUuid(tmp)).toBe(UUID);
    expect(Date.now() - t).toBeLessThan(250);
    expect(diskutil).toHaveBeenCalledTimes(1);
  });

  it("a failed or empty diskutil answer is not cached", async () => {
    const diskutil = vi
      .fn<(mount: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Command failed: diskutil info -plist"))
      .mockResolvedValueOnce("<plist><dict/></plist>")
      .mockResolvedValue(PLIST(UUID));
    const probe = createMacosProbe({ diskutilInfo: diskutil });
    await expect(probe.volumeUuid(tmp)).rejects.toThrow(/Command failed/);
    await expect(probe.volumeUuid(tmp)).rejects.toThrow(/не вернул VolumeUUID/);
    expect(await probe.volumeUuid(tmp)).toBe(UUID);
    expect(await probe.volumeUuid(tmp)).toBe(UUID);
    expect(diskutil).toHaveBeenCalledTimes(3);
  });

  it("re-runs diskutil when the mount identity (st_dev) changes", async () => {
    let dev = "dev-1";
    const diskutil = vi.fn<(mount: string) => Promise<string>>().mockResolvedValueOnce(PLIST(UUID)).mockResolvedValue(PLIST("OTHER"));
    const probe = createMacosProbe({ diskutilInfo: diskutil, mountIdentity: async () => dev });
    expect(await probe.volumeUuid(tmp)).toBe(UUID);
    expect(await probe.volumeUuid(tmp)).toBe(UUID);
    dev = "dev-2";
    expect(await probe.volumeUuid(tmp)).toBe("OTHER");
    expect(diskutil).toHaveBeenCalledTimes(2);
  });

  it("the shared macosProbe identity includes st_dev of the mount root", async () => {
    const mp = await mountPointOf(tmp);
    expect(await mountIdentity(mp)).toContain(`dev=${(await stat(mp)).dev}`);
  });
});
