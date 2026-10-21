import { stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { macosProbe, mountPointOf } from "../../src/storage/probe-macos.js";
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
