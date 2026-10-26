import { execFile } from "node:child_process";

export interface ProcInfo {
  pid: number;
  /**
   * Время старта процесса из `ps -o lstart=` в `LC_ALL=C`, `TZ=UTC` — одинаково для
   * любого вызывающего (сервер и CLI могут жить в разных локалях и поясах). Вместе с pid
   * отличает процесс от его тёзки.
   */
  startedAt: string;
}

/**
 * Сведения о живом процессе или `undefined`, если процесса с таким pid нет
 * (ps завершился с кодом 1 и пустым выводом). Любой другой сбой ps — исключение:
 * «не смогли проверить» не должно выглядеть как «процесса нет».
 */
export async function procInfo(pid: number): Promise<ProcInfo | undefined> {
  const out = await ps(pid, "lstart=", "procInfo");
  return out === undefined ? undefined : { pid, startedAt: out };
}

/** Живой процесс с родителем (S20): `ppid` — кто его запустил (1 — осиротел, родитель умер). */
export interface ProcParent extends ProcInfo {
  ppid: number;
}

/**
 * `ps -o ppid=,lstart=` — родитель и время старта (формат времени как у `procInfo`);
 * `undefined` — процесса нет. Сбой ps — исключение, как у `procInfo`.
 */
export async function procParent(pid: number): Promise<ProcParent | undefined> {
  const out = await ps(pid, "ppid=,lstart=", "procParent");
  if (out === undefined) return undefined;
  const m = /^(\d+)\s+(\S.*)$/.exec(out);
  if (!m) throw new Error(`procParent(${pid}): ps дал неразборчивый вывод: ${JSON.stringify(out)}`);
  return { pid, ppid: Number(m[1]), startedAt: m[2]! };
}

/** Вывод `ps -o <fields> -p <pid>` без пробелов по краям; `undefined` — процесса нет. */
function ps(pid: number, fields: string, who: string): Promise<string | undefined> {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(undefined);
  const env = { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" };
  return new Promise((resolve, reject) => {
    execFile("ps", ["-o", fields, "-p", String(pid)], { env }, (err, stdout, stderr) => {
      const out = stdout.trim();
      if (!err && out) return resolve(out);
      if (err?.code === 1 && !out) return resolve(undefined);
      reject(new Error(`${who}(${pid}): ps не сработал: ${err?.message ?? "пустой вывод"} ${stderr}`.trim()));
    });
  });
}

let selfCache: Promise<ProcInfo | undefined> | undefined;
/** Этот процесс (`procInfo(process.pid)`, кэш): «владелец — мы» = тот же pid и время старта. */
export function selfInfo(): Promise<ProcInfo | undefined> {
  selfCache ??= procInfo(process.pid).catch((e: unknown) => {
    selfCache = undefined;
    throw e;
  });
  return selfCache;
}

/** Жив ли именно тот процесс: pid существует и время старта совпадает. */
export async function sameProcessAlive(p: ProcInfo): Promise<boolean> {
  return (await procInfo(p.pid))?.startedAt === p.startedAt;
}
