// doctor (`03` §7): проверка окружения перед запуском сервера и генерацией. Проверки — общие с
// API (`diagnostics/doctor-checks.ts`, Task 48). Строки: Node ≥ 22;
// `claude --version` и вход (короткий `claude -p` модели haiku без инструментов, стоимость
// < $0,01); ffmpeg/ffprobe, энкодеры libx264, aac, prores_ks и фильтры silencedetect, scdet; ASR
// (python mlx-audio, воркер ai-platform и его sha256, коммит, веса модели, порт 8780); `vision-detect`
// (Apple Vision, Task 30: собран ли `npm run build:vision`, отвечает ли `--version`); KB_ROOT/KB_SOURCE_ROOT; StorageGuard
// MS_DATA_DIR; Chrome Headless Shell (скачивается при отсутствии); `quick_check` studio.db;
// owner-lock свободен. Итог — таблица (или `--json`), код 1 при любой ошибке; `degraded`
// (нет vision-detect) и `warning` (хранилище на SSD вне папки материалов, S18; S19 — строка `deps`:
// Node, ffmpeg/ffprobe или python/веса ASR взяты не из `.deps`/папки материалов, а из nvm, PATH или
// прежних мест ai-platform — запасной путь до `./setup`) — предупреждения, код 0.
// `--init` создаёт хранилище, `--adopt` привязывает его к новому тому после переноса (вывод —
// StorageStatus в JSON). `--import-slice` (Q2): под owner lock открывает studio.db (миграции,
// сверка store_id), закрывает незакрытые версии, доводит прерванные rename и регистрирует
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  acquireOwnerLock,
  checkStorage,
  initStore,
  macosProbe,
  MaterialsPathError,
  assertSsdWriteAllowed,
  materialsRoot,
  StorageError,
  type StorageEnv,
  type StorageStatus,
  type VolumeProbe,
} from "@ms/core";
import { ensureRenderBrowser } from "@ms/render";
import { bindStoreId, quickCheck } from "../db/meta.js";
import { migrate } from "../db/migrate.js";
import { openDb } from "../db/open.js";
import { asrCapability } from "../media/asr-capability.js";
import { reconcileVersions } from "../scenes/import-slice.js";
import { SceneRepo } from "../scenes/repo.js";
import { relockVersions } from "../scenes/store.js";
import { type AsrCheck, type BrowserCheck, type CheckRow, doctorChecks, type VisionCheck, visionCheck } from "../diagnostics/doctor-checks.js";

export {
  type AsrCheck,
  type BrowserCheck,
  type CheckRow,
  checkVisionBin,
  LOGIN_MAX_USD,
  type VisionCheck,
  visionCheck,
} from "../diagnostics/doctor-checks.js";

const USAGE = "usage: doctor [--json] | --init | --adopt | --import-slice";

export async function runDoctor(
  argv: string[],
  env: StorageEnv & NodeJS.ProcessEnv,
  probe: VolumeProbe,
  browser: BrowserCheck = ensureRenderBrowser,
  asr: AsrCheck = (cfg) => asrCapability(cfg),
  vision: VisionCheck = visionCheck,
): Promise<{ code: number; output: string }> {
  const [mode, ...rest] = argv;
  if (mode === "--json" && rest.length === 0) return fullCheck(env, probe, browser, asr, vision, true);
  if (rest.length > 0 || (mode !== undefined && mode !== "--init" && mode !== "--adopt" && mode !== "--import-slice")) {
    return { code: 2, output: USAGE };
  }
  if (mode === undefined) return fullCheck(env, probe, browser, asr, vision, false);
  if (mode === "--import-slice") return importSlice(env, probe);

  const root = env.MS_DATA_DIR?.trim();
  if (!root) return report({ ok: false, reason: "env_missing", detail: "MS_DATA_DIR не задан" });
  // S18: на SSD материалов хранилище создаётся/привязывается только внутри папки материалов
  try {
    assertSsdWriteAllowed(root, env);
  } catch (e) {
    if (!(e instanceof MaterialsPathError)) throw e;
    const hint = (() => {
      try {
        return `; задайте MS_DATA_DIR="${join(materialsRoot(env), "store")}"`;
      } catch {
        return "";
      }
    })();
    return { code: 1, output: JSON.stringify({ ok: false, reason: "outside_materials", detail: `${e.message}${hint}` }, null, 2) };
  }
  try {
    await initStore(root, probe, { adopt: mode === "--adopt", allowSystemDisk: env.MS_ALLOW_SYSTEM_DISK === "1" });
  } catch (e) {
    if (e instanceof StorageError) return report({ ok: false, reason: e.reason, detail: e.detail });
    return { code: 1, output: String((e as Error).message) };
  }
  return report(await checkStorage(env, probe));
}

async function fullCheck(env: NodeJS.ProcessEnv, probe: VolumeProbe, browser: BrowserCheck, asr: AsrCheck, vision: VisionCheck, json: boolean): Promise<{ code: number; output: string }> {
  const { rows, storage } = await doctorChecks(env, probe, { browser, asr, vision });
  const ok = rows.every((r) => r.ok);
  const output = json ? JSON.stringify({ ok, checks: rows, storage }, null, 2) : table(rows, ok);
  return { code: ok ? 0 : 1, output };
}

function table(rows: CheckRow[], ok: boolean): string {
  const w = Math.max(...rows.map((r) => r.name.length));
  const lines = rows.map((r) => `${r.status.padEnd(10)} ${r.name.padEnd(w)}  ${r.detail}`);
  const degraded = rows.filter((r) => r.ok && r.status === "degraded").map((r) => r.name);
  const warnings = rows.filter((r) => r.ok && r.status === "warning").map((r) => r.name);
  const note = (degraded.length > 0 ? ` (с ограничениями: ${degraded.join(", ")})` : "") + (warnings.length > 0 ? ` (предупреждения: ${warnings.join(", ")})` : "");
  return [...lines, "", ok ? `doctor: всё в порядке${note}` : `doctor: есть проблемы (${rows.filter((r) => !r.ok).map((r) => r.name).join(", ")})`].join("\n");
}

async function importSlice(env: StorageEnv, probe: VolumeProbe): Promise<{ code: number; output: string }> {
  const status = await checkStorage(env, probe);
  if (!status.ok) return report(status);
  const { root } = status;
  let lock;
  try {
    lock = await acquireOwnerLock(root, "cli");
  } catch (e) {
    return { code: 1, output: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) };
  }
  try {
    const db = openDb(root);
    try {
      if (!quickCheck(db)) throw new Error("db: quick_check не прошёл — studio.db повреждена");
      const migration = await migrate(db, { log: () => undefined }); // путь копии — в отчёте (migration.backup)
      bindStoreId(db, status.marker);
      const relock = await relockVersions(root);
      const repo = new SceneRepo({ root, db, guard: () => checkStorage(env, probe, status.marker.store_id) });
      const imported = await reconcileVersions(repo, root);
      const ok = imported.skipped.length === 0 && imported.missing.broken.length === 0 && relock.broken.length === 0;
      return { code: ok ? 0 : 1, output: JSON.stringify({ ok, root, migration, relock, import: imported }, null, 2) };
    } finally {
      db.close();
    }
  } catch (e) {
    return { code: 1, output: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) };
  } finally {
    await lock.release();
  }
}

function report(status: StorageStatus): { code: number; output: string } {
  return { code: status.ok ? 0 : 1, output: JSON.stringify(status, null, 2) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, output } = await runDoctor(process.argv.slice(2), process.env, macosProbe);
  (code === 0 ? console.log : console.error)(output);
  process.exitCode = code;
}
