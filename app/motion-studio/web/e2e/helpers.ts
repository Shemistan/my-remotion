// Общее для Playwright UI: пути, состояние засева, скриншоты (tmp/e2e-ui или evidence), запросы к API.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { APIRequestContext, Page } from "@playwright/test";
import { evidenceDirs } from "./evidence.js";

export const APP = fileURLToPath(new URL("../../", import.meta.url));
export const REPO = join(APP, "../..");
export const RUN_DIR = join(REPO, "tmp/ui-e2e");
export const STATE_FILE = join(RUN_DIR, "state.json");
/** Скриншоты: `tmp/e2e-ui/…`, с `MS_WRITE_EVIDENCE=1` — `docs/evidence/…` (S17b, `evidence.ts`). */
const DIRS = evidenceDirs(REPO, process.env.MS_WRITE_EVIDENCE);
export const EVIDENCE = DIRS.phase1;
/** Скриншоты Video Workspace (Task 29). */
export const EVIDENCE_VIDEO = DIRS.video;
/** Медиа-фикстуры (`scripts/make-media-fixtures.mjs`): корень импорта по пути в UI-e2e. */
export const MEDIA_FIXTURES = join(REPO, "tmp/media-fixtures");
/** Скриншоты анализа и визуального плана (Task 33): уменьшенные до 480 px (V4). */
export const EVIDENCE_PHASE3 = DIRS.phase3;
/** Скриншоты UI сценария (S8/S9): уменьшенные до 480 px, полные — tmp/ui-e2e/script-full/. */
export const EVIDENCE_SCRIPT = DIRS.script;
const SCRIPT_FULL = join(RUN_DIR, "script-full");

/** Скриншот UI сценария: полный — tmp/ui-e2e/script-full/, уменьшенный до 480 px — EVIDENCE_SCRIPT. */
export async function scriptShot(page: Page, name: string): Promise<string> {
  mkdirSync(SCRIPT_FULL, { recursive: true });
  mkdirSync(EVIDENCE_SCRIPT, { recursive: true });
  const full = join(SCRIPT_FULL, `${name}.png`);
  await page.screenshot({ path: full, fullPage: true });
  execFileSync("sips", ["--resampleWidth", "480", full, "--out", join(EVIDENCE_SCRIPT, `${name}.png`)], { stdio: "ignore" });
  return full;
}

/**
 * Ролик с лицом автора (`MS_TEST_TALKING_HEAD`, Task 33): абсолютный путь или путь от корня
 * репозитория; нет переменной или файла — `undefined`. Оригинал только читается (импорт копирует).
 */
export function talkingHead(): string | undefined {
  const v = process.env.MS_TEST_TALKING_HEAD;
  if (!v) return undefined;
  const p = isAbsolute(v) ? v : join(REPO, v);
  return existsSync(p) ? p : undefined;
}
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
  /** Сценарный проект (S9): принятые сцены плана, у первых двух — готовые версии. */
  script: { projectId: string; itemIds: string[]; sceneIds: string[] };
  /** Видеопроект со сценами плана (Task 40): у первых двух сцен — готовые версии v1. */
  videoScenes: { projectId: string; itemIds: string[]; sceneIds: string[] };
  /** Видеопроект для таймлайна и финала (Task 45): A, B, C у первых двух сцен, третья — без версии. */
  videoTimeline: { projectId: string; itemIds: string[]; sceneIds: string[] };
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
