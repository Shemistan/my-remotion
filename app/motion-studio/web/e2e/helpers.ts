// Общее для Playwright UI: пути, состояние засева, скриншоты в evidence, запросы к API.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Page } from "@playwright/test";

export const APP = fileURLToPath(new URL("../../", import.meta.url));
export const REPO = join(APP, "../..");
export const RUN_DIR = join(REPO, "tmp/ui-e2e");
export const STATE_FILE = join(RUN_DIR, "state.json");
export const EVIDENCE = join(REPO, "docs/evidence/phase-1/ui");
/** Скриншоты Video Workspace (Task 29). */
export const EVIDENCE_VIDEO = join(REPO, "docs/evidence/phase-2/ui");
/** Медиа-фикстуры (`scripts/make-media-fixtures.mjs`): корень импорта по пути в UI-e2e. */
export const MEDIA_FIXTURES = join(REPO, "tmp/media-fixtures");
export const PORT = 8790;

export interface SeededScene {
  sceneId: string;
  versionIds: string[];
}

export interface E2EState {
  root: string;
  serverPid: number;
  serverLog: string;
  projectId: string;
  versions: SeededScene;
  prores: SeededScene;
  failed: SeededScene;
}

export function state(): E2EState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as E2EState;
}

export async function shot(page: Page, name: string, dir: string = EVIDENCE): Promise<void> {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
}

/** Ждёт условия по `GET /api/health` (поллинг; хранилище проверяется раз в 10 с). */
export async function waitHealth(request: APIRequestContext, storage: "online" | "storage_offline", timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const r = await request.get("/api/health").catch(() => null);
    if (r?.ok() && (await r.json()).storage === storage) return;
    if (Date.now() > until) throw new Error(`health: нет ${storage} за ${timeoutMs} мс`);
    await new Promise((res) => setTimeout(res, 1000));
  }
}
