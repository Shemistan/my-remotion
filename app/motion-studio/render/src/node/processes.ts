// Процессы рендера вне группы worker: Chrome Remotion запускает detached, в своей группе.
// Две защиты: запись Chrome в реестре (chrome-wrapper.sh) и поиск по пути run/tmp/.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { type ProcessRegistry, type TrackedProcess, isTrackedAlive, killGroup } from "@ms/core";

/** Префикс `cmd` записи Chrome в `run/processes/` (пишет chrome-wrapper.sh). */
export const BROWSER_CMD_PREFIX = "chrome-headless-shell (render)";

/** Префикс `cmd` записи Chrome конкретного рендера (`MS_RENDER_ID` у chrome-wrapper.sh). */
export const browserCmdPrefix = (renderId: string) => `${BROWSER_CMD_PREFIX} [render=${renderId}] `;

export interface Proc {
  pid: number;
  pgid: number;
}

function ps(args: string[]): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile("/bin/ps", args, { maxBuffer: 64 * 1024 * 1024 }, (e, out) => (e ? reject(e) : resolve(out))),
  );
}

let ownPgidCache: number | undefined;
async function ownPgid(): Promise<number> {
  ownPgidCache ??= Number((await ps(["-o", "pgid=", "-p", String(process.pid)])).trim());
  return ownPgidCache;
}

/**
 * Процессы, в командной строке которых есть `marker`. Без нас самих, без групп
 * с pgid ≤ 1 и без нашей собственной группы — их убивать нельзя ни при каком выводе ps.
 */
export async function findByMarker(marker: string): Promise<Proc[]> {
  const own = await ownPgid();
  const out = await ps(["-axww", "-o", "pid=,pgid=,command="]);
  // S20: маркер — с границы аргумента (начало, пробел, `=`, кавычка, `:`, `,`): путь, в который
  // корень лишь вложен (`/x/<root>/run/tmp/` другого хранилища), не совпадает
  const at = new RegExp(`(?:^|[\\s='":,])${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  const found: Proc[] = [];
  for (const line of out.split("\n")) {
    if (!line.includes(marker)) continue;
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m || !at.test(m[3]!)) continue;
    const p = { pid: Number(m[1]), pgid: Number(m[2]) };
    if (p.pid !== process.pid && p.pgid > 1 && p.pgid !== own) found.push(p);
  }
  return found;
}

async function waitGone(marker: string, ms: number): Promise<Proc[]> {
  const until = Date.now() + ms;
  let left = await findByMarker(marker);
  while (left.length > 0 && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 100));
    left = await findByMarker(marker);
  }
  return left;
}

/**
 * Убивает группы процессов с `marker` в командной строке: SIGTERM, через `graceMs` —
 * SIGKILL (graceMs = 0 — сразу SIGKILL), затем ждёт до `waitMs`. Возвращает выживших.
 */
export async function reapByMarker(marker: string, opts: { graceMs: number; waitMs: number }): Promise<Proc[]> {
  let left = await findByMarker(marker);
  if (left.length === 0) return [];
  if (opts.graceMs > 0) {
    for (const g of new Set(left.map((p) => p.pgid))) killGroup(g, "SIGTERM");
    left = await waitGone(marker, opts.graceMs);
  }
  for (const g of new Set(left.map((p) => p.pgid))) killGroup(g, "SIGKILL");
  return left.length === 0 ? [] : waitGone(marker, opts.waitMs);
}

/**
 * Восстановление после сбоя: всё, что запущено из `<root>/run/tmp/` (профиль Chrome,
 * временные файлы Remotion живут там), — остатки прежних рендеров. Вызывать ТОЛЬКО под
 * owner lock (ADR 0007): тогда живых рендеров другого владельца быть не может.
 * SIGTERM, через 5 с SIGKILL, ждём до 30 с; возвращает выживших.
 */
export function reapStrayRenderers(root: string, opts: { graceMs?: number; waitMs?: number } = {}): Promise<Proc[]> {
  return reapByMarker(join(root, "run", "tmp") + "/", { graceMs: opts.graceMs ?? 5000, waitMs: opts.waitMs ?? 30_000 });
}

/**
 * Записи Chrome попытки в боковом реестре (`run/processes/`, его пишет chrome-wrapper.sh:
 * Chrome запускает Remotion, до SQLite он не дотянется): живую группу добиваем SIGKILL,
 * `end` — только после подтверждённого исчезновения группы (как spawnTracked).
 * Возвращает записи, чьи группы не исчезли за `waitMs`, — они остаются для reapAttempt.
 */
export async function settleBrowserRecords(
  registry: ProcessRegistry,
  ref: { runId: string; attempt: number; renderId?: string },
  waitMs = 30_000,
): Promise<TrackedProcess[]> {
  // с renderId — только Chrome этого рендера: соседний дубль той же попытки рендерит параллельно
  const prefix = ref.renderId === undefined ? BROWSER_CMD_PREFIX : browserCmdPrefix(ref.renderId);
  const records = (await registry.live({ runId: ref.runId, attempt: ref.attempt })).filter((p) => p.cmd.startsWith(prefix));
  const left: TrackedProcess[] = [];
  for (const p of records) {
    if (await isTrackedAlive(p)) killGroup(p.pgid, "SIGKILL");
    const until = Date.now() + waitMs;
    while ((await isTrackedAlive(p)) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    if (await isTrackedAlive(p)) left.push(p);
    else await registry.end(p, { code: null, signal: "SIGKILL" });
  }
  return left;
}
