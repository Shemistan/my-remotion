import { execFile } from "node:child_process";
import { realpath, stat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import type { VolumeProbe } from "./guard.js";

const run = promisify(execFile);

/** Точка монтирования тома, на котором лежит `path`: поднимаемся, пока st_dev тот же. */
export async function mountPointOf(path: string): Promise<string> {
  let current = await realpath(path);
  const dev = (await stat(current)).dev;
  for (;;) {
    const parent = dirname(current);
    if (parent === current || (await stat(parent)).dev !== dev) return current;
    current = parent;
  }
}

/**
 * Системный том. На macOS пользовательские данные (/Users, /private/tmp) лежат на
 * томе Data, а не на запечатанном "/", поэтому сравниваем с ним, если он есть.
 */
async function systemDev(): Promise<number> {
  try {
    return (await stat("/System/Volumes/Data")).dev;
  } catch {
    return (await stat("/")).dev;
  }
}

export const macosProbe: VolumeProbe = {
  async volumeUuid(path) {
    // diskutil принимает точку монтирования, а не произвольный подкаталог.
    const mount = await mountPointOf(path);
    const { stdout } = await run("diskutil", ["info", "-plist", mount]);
    const uuid = /<key>VolumeUUID<\/key>\s*<string>([^<]+)<\/string>/.exec(stdout)?.[1];
    if (!uuid) throw new Error(`diskutil не вернул VolumeUUID для ${mount}`);
    return uuid;
  },
  async deviceId(path) {
    return (await stat(path)).dev;
  },
  systemDeviceId: systemDev,
  async freeBytes(path) {
    const s = await statfs(path);
    return s.bavail * s.bsize;
  },
};
