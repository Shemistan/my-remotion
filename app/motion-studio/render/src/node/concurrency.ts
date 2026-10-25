// Параллельность Remotion (`concurrency` renderMedia/renderFrames, Task 49a). Рендеров раннер
// пускает до `limits.renders` сразу, у каждого свой Chrome: вкладок на рендер — половина ядер, но
// не больше 4 (иначе три параллельных рендера сцены душат Mac). `render.concurrency` в config.json
// задаёт число явно; сервер передаёт его сюда при старте (`configureRenderConcurrency`).
import { availableParallelism } from "node:os";

/** `cfg ?? min(4, max(1, floor(cpus / 2)))`. */
export function renderConcurrency(cpus: number, cfg?: number): number {
  if (cfg !== undefined) return cfg;
  return Math.min(4, Math.max(1, Math.floor(cpus / 2)));
}

let configured: number | undefined;

/** `render.concurrency` из конфигурации процесса (нет — умолчание по ядрам). */
export function configureRenderConcurrency(cfg: number | undefined): void {
  if (cfg !== undefined && (!Number.isInteger(cfg) || cfg < 1)) throw new Error(`render.concurrency должно быть целым >= 1: ${cfg}`);
  configured = cfg;
}

/** Параллельность рендера этого процесса: из конфигурации или по числу ядер. */
export function currentRenderConcurrency(): number {
  return renderConcurrency(availableParallelism(), configured);
}
