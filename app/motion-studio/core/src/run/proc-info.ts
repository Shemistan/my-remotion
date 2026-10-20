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
export function procInfo(pid: number): Promise<ProcInfo | undefined> {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(undefined);
  const env = { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" };
  return new Promise((resolve, reject) => {
    execFile("ps", ["-o", "lstart=", "-p", String(pid)], { env }, (err, stdout, stderr) => {
      const startedAt = stdout.trim();
      if (!err && startedAt) return resolve({ pid, startedAt });
      if (err?.code === 1 && !startedAt) return resolve(undefined);
      reject(new Error(`procInfo(${pid}): ps не сработал: ${err?.message ?? "пустой вывод"} ${stderr}`.trim()));
    });
  });
}

/** Жив ли именно тот процесс: pid существует и время старта совпадает. */
export async function sameProcessAlive(p: ProcInfo): Promise<boolean> {
  return (await procInfo(p.pid))?.startedAt === p.startedAt;
}
