import { execFile } from "node:child_process";

export interface ProcInfo {
  pid: number;
  /** Время старта процесса из `ps -o lstart=`; вместе с pid отличает процесс от его тёзки. */
  startedAt: string;
}

/** Сведения о живом процессе или `undefined`, если процесса с таким pid нет. */
export function procInfo(pid: number): Promise<ProcInfo | undefined> {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    execFile("ps", ["-o", "lstart=", "-p", String(pid)], (err, stdout) => {
      const startedAt = stdout.trim();
      // ps завершается с кодом 1 и пустым выводом, если процесса нет
      if (startedAt) return resolve({ pid, startedAt });
      if (!err || typeof err.code === "number") return resolve(undefined);
      reject(err);
    });
  });
}

/** Жив ли именно тот процесс: pid существует и время старта совпадает. */
export async function sameProcessAlive(p: ProcInfo): Promise<boolean> {
  return (await procInfo(p.pid))?.startedAt === p.startedAt;
}
