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
 * diskutil на отключающемся диске может повиснуть, а под нагрузкой (параллельные рендеры и
 * агенты) отвечает секундами: H2 намерил до 7,6 с при 60 параллельных проверках, и прежние
 * 5 с давали ложный `storage_unavailable`. Зовётся теперь только при первой сверке тома
 * (и при смене устройства), поэтому бюджет щедрый; он меньше дедлайна сторожа (3 × 10 с),
 * чтобы отказ diskutil пришёл своей причиной, а не `storage_watch_timeout`.
 */
export const DISKUTIL_TIMEOUT_MS = 20_000;

async function diskutilInfo(mount: string): Promise<string> {
  const { stdout } = await run("diskutil", ["info", "-plist", mount], {
    timeout: DISKUTIL_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return stdout;
}

/**
 * Опознание смонтированного тома без diskutil: точка монтирования, st_dev и время
 * создания её корня. Тот же диск после переподключения часто получает тот же st_dev;
 * другой том на том же пути и с тем же st_dev выдаёт своё время создания корня.
 */
export async function mountIdentity(mount: string): Promise<string> {
  const st = await stat(mount);
  return `${mount}\0dev=${st.dev}\0ino=${st.ino}\0birth=${st.birthtimeMs}`;
}

export interface MacosProbeOptions {
  /** `diskutil info -plist <mount>` → stdout (подмена в тестах). */
  diskutilInfo?: (mount: string) => Promise<string>;
  /** Ключ кэша VolumeUUID для точки монтирования (подмена в тестах). */
  mountIdentity?: (mount: string) => Promise<string>;
}

/**
 * Системный том. На macOS пользовательские данные (/Users, /private/tmp) лежат на
 * томе Data, а не на запечатанном "/", поэтому сравниваем с ним, если он есть.
 * Ограничение: это одно устройство. Другие тома внутреннего диска (второй APFS-том
 * того же контейнера, разделы) за системные не считаются — защита ловит главный
 * сценарий «диск отключён, путь ушёл на системный том», а не любой внутренний том.
 */
async function systemDev(): Promise<number> {
  try {
    return (await stat("/System/Volumes/Data")).dev;
  } catch {
    return (await stat("/")).dev;
  }
}

/**
 * Проба macOS. VolumeUUID кэшируется на сессию процесса по опознанию тома
 * (`mountIdentity`: точка монтирования + st_dev + корень): diskutil зовётся при первой
 * сверке и снова — только когда опознание сменилось. Живость между сверками проверяют
 * дешёвые вызовы checkStorage (stat корня, маркер, пробная запись, statfs). Неудачный
 * ответ diskutil не кэшируется; параллельные первые сверки делят один вызов.
 */
export function createMacosProbe(opts: MacosProbeOptions = {}): VolumeProbe {
  const info = opts.diskutilInfo ?? diskutilInfo;
  const identity = opts.mountIdentity ?? mountIdentity;
  const cache = new Map<string, Promise<string>>();

  const lookup = async (mount: string): Promise<string> => {
    const stdout = await info(mount);
    const uuid = /<key>VolumeUUID<\/key>\s*<string>([^<]+)<\/string>/.exec(stdout)?.[1];
    if (!uuid) throw new Error(`diskutil не вернул VolumeUUID для ${mount}`);
    return uuid;
  };

  return {
    async volumeUuid(path) {
      // diskutil принимает точку монтирования, а не произвольный подкаталог.
      const mount = await mountPointOf(path);
      const key = await identity(mount);
      let pending = cache.get(key);
      if (!pending) {
        pending = lookup(mount);
        cache.set(key, pending);
        pending.catch(() => {
          if (cache.get(key) === pending) cache.delete(key);
        });
      }
      return pending;
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
}

export const macosProbe: VolumeProbe = createMacosProbe();
