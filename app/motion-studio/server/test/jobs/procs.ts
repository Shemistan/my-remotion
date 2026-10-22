// Настоящие процессы для тестов восстановления (Task 13): без моков kill и ps.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ProcessRegistry, type TrackedProcess, procInfo } from "@ms/core";

export const ORPHAN_RENDER = fileURLToPath(new URL("../fixtures/bin/orphan-render.sh", import.meta.url));

/** Группы, которые тест мог оставить; `killLeftovers` добивает их в afterEach. */
const groups = new Set<number>();

export function track(pgid: number): void {
  // kill(-0) / kill(-1) — своя группа или все процессы: такой pid — ошибка теста
  if (!Number.isInteger(pgid) || pgid <= 1) throw new Error(`track: недопустимый pid ${pgid}`);
  groups.add(pgid);
}

/** pid из файла фикстуры: только целое > 1, иначе ещё не записан. */
export function readPid(file: string): number | undefined {
  if (!existsSync(file)) return undefined;
  const n = Number(readFileSync(file, "utf8").trim());
  return Number.isInteger(n) && n > 1 ? n : undefined;
}

export function killLeftovers(): void {
  for (const g of groups) {
    try {
      process.kill(-g, "SIGKILL");
    } catch {
      // уже нет
    }
  }
  groups.clear();
}

/**
 * Добивает (SIGKILL, вместе с группой) процессы, в командной строке которых есть `dir`:
 * фикстуры, запущенные дочерним «сервером» мимо `track()`. Без этого упавший до `track()`
 * тест оставлял `orphan-render.sh` и его внука жить вечно.
 * `dir` — абсолютный каталог теста (не короче 16 знаков); совпадение — по границе пути
 * (`dir/…`, `dir` в конце аргумента), чтобы пустая или короткая строка не задела все процессы.
 */
export function killStrays(dir: string): void {
  const base = dir.replace(/\/+$/, "");
  if (!isAbsolute(base) || base.length < 16) throw new Error(`killStrays: недопустимый каталог «${dir}»`);
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hit = new RegExp(`${esc}(?:/|\\s|$)`);
  const ps = execFileSync("ps", ["-axo", "pid=,pgid=,command="], { encoding: "utf8" });
  for (const line of ps.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m || !hit.test(m[3]!)) continue;
    const pid = Number(m[1]);
    const pgid = Number(m[2]);
    if (pid === process.pid || pid <= 1) continue;
    // группа — только своя у фикстуры (detached): лидер группы и есть этот процесс
    for (const target of pgid === pid ? [-pgid, pid] : [pid]) {
      try {
        process.kill(target, "SIGKILL");
      } catch {
        // уже нет
      }
    }
  }
}

export async function waitFor<T>(fn: () => T | undefined | Promise<T | undefined>, what: string, ms = 10_000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() > until) throw new Error(`не дождались: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

export interface Orphan {
  /** Лидер группы (bash фикстуры): его pid и группа — в записи реестра. */
  pid: number;
  /** Внук, игнорирующий SIGTERM. */
  grandchild: number;
  record: TrackedProcess;
}

/**
 * «Процесс прежней попытки»: `orphan-render.sh` в своей группе (внук игнорирует SIGTERM),
 * запущенный мимо spawnTracked (сервер, который его запускал, уже мёртв), но записанный в
 * реестр — как после `kill -9` сервера во время рендера.
 */
export async function spawnOrphan(registry: ProcessRegistry, ref: { runId: string; attempt: number }, dir: string): Promise<Orphan> {
  const pidFile = join(dir, `${ref.runId}-a${ref.attempt}-${Date.now()}.pid`);
  const child = spawn(ORPHAN_RENDER, [pidFile], { detached: true, stdio: "ignore" });
  child.unref();
  const pid = child.pid!;
  track(pid);
  const startedAt = (await procInfo(pid))!.startedAt;
  const record: TrackedProcess = { runId: ref.runId, attempt: ref.attempt, pid, pgid: pid, startedAt, cmd: `${ORPHAN_RENDER} ${pidFile}` };
  await registry.add(record);
  const grandchild = await waitFor(() => readPid(pidFile), "pid внука");
  if (!(await procInfo(grandchild))) throw new Error(`внук ${grandchild} не найден`);
  return { pid, grandchild, record };
}
