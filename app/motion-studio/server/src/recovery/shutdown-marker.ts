// Маркер чистой остановки (Task 47): ядро пишет его в конце штатного `close()` (SIGTERM/SIGINT,
// конец CLI), старт снимает. Старт без маркера после прежнего запуска — после сбоя (SIGKILL,
// паника, отключение питания): отчёт старта `crashed: true`, UI показывает баннер.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { safeMkdir } from "@ms/core";
import { fsyncWrite } from "../scenes/store.js";

export const SHUTDOWN_MARKER = "run/clean-shutdown.json";

export async function writeShutdownMarker(root: string, info: { pid?: number; kind?: string } = {}): Promise<void> {
  await safeMkdir(root, "run");
  await fsyncWrite(join(root, SHUTDOWN_MARKER), JSON.stringify({ at: new Date().toISOString(), pid: info.pid ?? process.pid, ...(info.kind ? { kind: info.kind } : {}) }) + "\n");
}

/** Был ли маркер (прежний запуск остановлен штатно); маркер снимается. */
export function consumeShutdownMarker(root: string): boolean {
  const p = join(root, SHUTDOWN_MARKER);
  if (!existsSync(p)) return false;
  rmSync(p, { force: true });
  return true;
}
