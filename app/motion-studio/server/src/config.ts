// Настройки приложения: значения по умолчанию (Global Constraints плана) +
// переопределения из `$MS_DATA_DIR/config.json` + env.
//
// Приоритет источников (фактическое правило кода):
// - `kb.root`/`kb.sourceRoot` и пути `asr.*`: config.json > env (`KB_ROOT`, `KB_SOURCE_ROOT`,
//   `AIP_MONTAGE_ASR_PYTHON`, `AI_PLATFORM_ROOT`, `AIP_MODELS_DIR`) > умолчание (S19: зависимости
//   проекта в `.deps/`, веса — в папке материалов; прежние места этой машины — запасной путь);
// - второй дубль: env (`MS_SECOND_TAKE`, `MS_SECOND_TAKE_THRESHOLD`, для bench A/B) > config.json > умолчание;
// - остальное (агенты, лимиты, сцена, media, roughcut, planning, analysis, video, final, watchdog,
//   cache, render): config.json > умолчание, env не читается.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JobTypeSchema, type Settings, SettingsSchema, defaultSettings } from "@ms/contracts";
import { MATERIALS_ROOT, SSD_ROOT, depsRoots, materialsRoot } from "@ms/core";
import { EXPORT_TIMEOUT_MS } from "@ms/render";
import { z } from "zod";
import { MAX_CALL_BUDGET_USD, MODEL_RE, ROLES, type Role } from "./agents/runtime.js";
import { AGENT_CALLS, MAX_RUNNING, RENDERS } from "./jobs/limits.js";

export interface AgentSettings {
  model: string;
  timeoutMs: number;
  maxBudgetUsd: number;
}

/**
 * Второй дубль (S5): первая оценённая попытка ниже `threshold` по `overall` и бюджет
 * позволяет — ещё один проход Engineer параллельно с исправлениями первого дубля.
 * `revise` — доработка лучшей попытки по трём слабым осям оценки с их кадрами;
 * `fresh` — новый дубль с другим кадрированием (archetype); `off` — без него.
 * `fixes` — исправлений технического gate и QA внутри второго дубля.
 * По умолчанию `off` (2026-10-31): дорабатывать сцену решает человек кнопкой «Улучшить»
 * (`POST /api/scenes/:id/improve`); технические исправления первого дубля остаются автоматическими.
 */
export interface SecondTake {
  mode: "revise" | "fresh" | "off";
  threshold: number;
  fixes: number;
}
const SECOND_TAKE_MODES = ["revise", "fresh", "off"] as const;
const SecondTakeSchema = z.object({ mode: z.enum(SECOND_TAKE_MODES), threshold: z.number().min(1).max(10), fixes: z.number().int().min(0).max(3) }).partial().strict();
const SECOND_TAKE: SecondTake = { mode: "off", threshold: 6.5, fixes: 1 };

/**
 * Лимиты раннера (`03` §8, M12): задач в работе, мест семафоров агентов и рендеров, таймаут
 * экспорта. Умолчания — по коду (S5: агенты 5, рендеры 2), не 2/2/1 из исходного плана.
 * Новые значения действуют после перезапуска сервера.
 */
export interface Limits {
  maxRunning: number;
  agentCalls: number;
  renders: number;
  exportTimeoutMs: number;
}
const LIMITS: Limits = { maxRunning: MAX_RUNNING, agentCalls: AGENT_CALLS, renders: RENDERS, exportTimeoutMs: EXPORT_TIMEOUT_MS };
const Count = z.number().int().min(1).max(32);
/** Потолок таймаута экспорта: 4 ч (по умолчанию 30 мин). */
const EXPORT_TIMEOUT_MAX_MS = 4 * 60 * 60_000;
const LimitsSchema = z.object({ maxRunning: Count, agentCalls: Count, renders: Count, exportTimeoutMs: z.number().int().min(10_000).max(EXPORT_TIMEOUT_MAX_MS) }).partial().strict();

/**
 * ASR (Task 26, S19): CLI-воркер подпроцессом — копия `asr_worker.py` ai-platform в
 * `tools/asr-worker/` (решение 1а: ai-platform на новой машине не нужен). Умолчания: python
 * `.deps/asr-venv`, веса — `<папка материалов>/models`; переопределяются env
 * (`AIP_MONTAGE_ASR_PYTHON`, `AI_PLATFORM_ROOT`, `AIP_MODELS_DIR`) или config.json.
 * `aiPlatformRoot` (совместимость) — воркер берётся из ai-platform. Контракт — sha256 воркера.
 */
export interface AsrConfig {
  python: string;
  /** Абсолютный путь `asr_worker.py`. */
  worker: string;
  /** Задан (env/config.json) — воркер из этого checkout ai-platform. */
  aiPlatformRoot?: string;
  modelsDir: string;
  model: (typeof ASR_MODELS)[number];
  language: string;
  expectedWorkerSha256: string;
  timeoutMs: number;
  noOutputTimeoutMs: number;
}
export const ASR_MODELS = ["whisper-large-v3-turbo", "whisper-large-v3-mlx"] as const;
/**
 * sha256 `asr_worker.py` ai-platform — закреплённый контракт CLI и вывода (Global Constraints
 * Phase 2–3; файл не менялся с коммита e3024ac). Сверено 2026-10-24 на HEAD ai-platform
 * `ASR_WORKER_VERIFIED_COMMIT`: другой sha256 → `asr_contract_changed`.
 */
export const ASR_WORKER_SHA256 = "59b7e03bf5a8b7f940b2607d357528e7120f5bb6bbe98efa70de4b39bdce1073";
/** HEAD ai-platform, на котором сверен контракт воркера (справочно: коммит — не контракт, sha256 — да). */
export const ASR_WORKER_VERIFIED_COMMIT = "3a2513a79736c1a910075418cb0d3b7098eee416";
/** Последний коммит ai-platform, менявший `asr_worker.py`, — источник копии (S19). */
export const ASR_WORKER_SOURCE_COMMIT = "e3024ac8ff250a02bf21a8229c4c1706c40ffd44";
/** Путь воркера внутри ai-platform (для `aiPlatformRoot`). */
export const AIP_WORKER_REL = "app/platform/aiplatform/montage/asr_worker.py";

/** Импорт исходника (V2): корни для импорта по пути, прокси, шаг миниатюр. */
export interface MediaConfig {
  importRoots: string[];
  proxyShortSide: number;
  thumbEveryUs: number;
}
/** Детекторы чернового монтажа (Task 28). */
export interface RoughcutConfig {
  pauseMinUs: number;
  keepAfterWordUs: number;
  sentenceKeepAfterUs: number;
  keepBeforeWordUs: number;
  fillerPadUs: number;
  loudDbfs: number;
  fadeUs: number;
}
/** Проверки визуального плана (Task 32). */
export interface PlanningConfig {
  maxCoverage: number;
  maxFullscreenCoverage: number;
  minGapUs: number;
  minSceneUs: number;
  maxSceneUs: number;
  padPreUs: number;
  padPostUs: number;
  faceMargin: number;
  faceOverlapMax: number;
}
/** Бюджет задачи анализа Phase 2–3 (V9). */
export interface AnalysisConfig {
  maxCostUsd: number;
  /** Окно занятости кадра по времени в анализе видеоряда (Task 30), µs. */
  occupancyWindowUs: number;
}

/** Умолчания `roughcut` (детекторы и превью чернового монтажа, Task 28). */
export const ROUGHCUT_DEFAULTS: RoughcutConfig = { pauseMinUs: 800_000, keepAfterWordUs: 100_000, sentenceKeepAfterUs: 300_000, keepBeforeWordUs: 100_000, fillerPadUs: 50_000, loudDbfs: -30, fadeUs: 8_000 };
const PLANNING: PlanningConfig = { maxCoverage: 0.4, maxFullscreenCoverage: 0.25, minGapUs: 1_500_000, minSceneUs: 1_500_000, maxSceneUs: 12_000_000, padPreUs: 200_000, padPostUs: 300_000, faceMargin: 0.25, faceOverlapMax: 0.02 };
const Us = z.number().int().min(0);
const Share = z.number().min(0).max(1);
const AsrFileSchema = z.object({
  python: z.string().min(1), aiPlatformRoot: z.string().min(1), modelsDir: z.string().min(1), model: z.enum(ASR_MODELS),
  language: z.string().min(1), expectedWorkerSha256: z.string().regex(/^[0-9a-f]{64}$/),
  timeoutMs: z.number().int().positive(), noOutputTimeoutMs: z.number().int().positive(),
}).partial().strict();
const MediaFileSchema = z.object({ importRoots: z.array(z.string().min(1)), proxyShortSide: z.number().int().min(144).max(2160), thumbEveryUs: z.number().int().positive() }).partial().strict();
const RoughcutFileSchema = z.object({
  pauseMinUs: Us, keepAfterWordUs: Us, sentenceKeepAfterUs: Us, keepBeforeWordUs: Us, fillerPadUs: Us, loudDbfs: z.number().max(0), fadeUs: Us,
}).partial().strict();
const PlanningFileSchema = z.object({
  maxCoverage: Share, maxFullscreenCoverage: Share, minGapUs: Us, minSceneUs: Us, maxSceneUs: Us, padPreUs: Us, padPostUs: Us, faceMargin: Share, faceOverlapMax: Share,
}).partial().strict();
const AnalysisFileSchema = z.object({ maxCostUsd: z.number().positive().max(MAX_CALL_BUDGET_USD), occupancyWindowUs: z.number().int().min(500_000).max(60_000_000) }).partial().strict();

/**
 * Phase 4–6 (Task 35′): превью сцены в контексте — поля вокруг сцены, кадров (`video`); финал —
 * таймаут рендера и CRF CFR-мастера (`final`, F1); сторож прогресса — порог без прогресса по типу
 * задачи, мс (`watchdog`, Task 49a; нет типа — сторож его не трогает); кэш кадров и мастеров —
 * потолок, байт (`cache`); рендер — параллельность Remotion (`render.concurrency`, нет — по умолчанию Remotion).
 */
export interface VideoConfig { contextPadFrames: number }
export interface FinalConfig { timeoutMs: number; masterCrf: number }
export interface WatchdogConfig { noProgressMs: Record<string, number> }
export interface CacheConfig { maxBytes: number }
export interface RenderConfig { concurrency?: number }
const VIDEO: VideoConfig = { contextPadFrames: 30 };
const FINAL: FinalConfig = { timeoutMs: 7_200_000, masterCrf: 12 };
const CACHE: CacheConfig = { maxBytes: 20 * 1024 ** 3 };
const VideoFileSchema = z.object({ contextPadFrames: z.number().int().min(0).max(600) }).partial().strict();
const FinalFileSchema = z.object({ timeoutMs: z.number().int().min(60_000).max(24 * 60 * 60_000), masterCrf: z.number().int().min(0).max(51) }).partial().strict();
// ключи — только типы задач (zod 3: record по enum — частичный; опечатка в типе — отказ, а не тихий пропуск)
const WatchdogFileSchema = z.object({ noProgressMs: z.record(JobTypeSchema, z.number().int().positive()) }).partial().strict();
const CacheFileSchema = z.object({ maxBytes: z.number().int().min(0) }).partial().strict();
const RenderFileSchema = z.object({ concurrency: z.number().int().min(1).max(16) }).partial().strict();

/** Порт Control API по умолчанию; хост — только 127.0.0.1 (`main.ts`), в config.json его нет. */
export const DEFAULT_PORT = 8790;
/** `server.port` (S17b): непривилегированный порт; `host` и другие ключи — отказ (strict). */
const ServerFileSchema = z.object({ port: z.number().int().min(1024).max(65535) }).partial().strict();

export interface AppConfig {
  dataDir: string;
  /** Control API: порт (хост не настраивается — только 127.0.0.1). */
  server: { port: number };
  claudeBin: string;
  agentRuntime: "claude-code";
  agents: Record<Role, AgentSettings>;
  scene: { maxCostUsd: number; maxAutoFixes: number; secondTake: SecondTake };
  kb: { root: string; sourceRoot: string };
  limits: Limits;
  /** Настройки новой сцены по умолчанию (форма в UI). */
  defaults: Settings;
  asr: AsrConfig;
  media: MediaConfig;
  roughcut: RoughcutConfig;
  planning: PlanningConfig;
  analysis: AnalysisConfig;
  video: VideoConfig;
  final: FinalConfig;
  watchdog: WatchdogConfig;
  cache: CacheConfig;
  render: RenderConfig;
}

const OPUS_ROLES: readonly Role[] = ["motion_director", "engineer"];
/** Роли малой модели (S15b): сверка текста со фрагментом — дешёвый вызов на каждую попытку. */
const SMALL_ROLES: readonly Role[] = ["fragment_fit"];
const AGENT_TIMEOUT_MS = 20 * 60_000;
const AGENT_BUDGET_USD = 2;

// Корень репозитория: server/src → ../../../..
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url)).replace(/\/$/, "");
// Исходники KB лежат в main checkout; из worktree — это путь до `.claude/worktrees/`.
const MAIN_CHECKOUT = REPO_ROOT.split("/.claude/worktrees/")[0]!;
/** Копия воркера ASR в проекте (S19, `tools/asr-worker/README.md`). */
export const ASR_WORKER_COPY = join(REPO_ROOT, "app/motion-studio/tools/asr-worker/asr_worker.py");
/** Прежние места этой машины (до `./setup`): окружение mlx-audio ai-platform и его веса. */
export const LEGACY_ASR_PYTHON = (home: string): string => join(home, ".local/share/montage/mlx-audio-0.5.8/.venv/bin/python");
export const LEGACY_MODELS_DIR = `${SSD_ROOT}/local_models`;

/** Проверка существования путей для умолчаний (подменяется в тестах). */
export interface PathProbe {
  exists(path: string): boolean;
}
const fsProbe: PathProbe = { exists: existsSync };

const AgentOverride = z
  .object({
    model: z.string().regex(MODEL_RE, "имя модели: латиница, цифры, . - [ ]"),
    timeoutMs: z.number().int().positive(),
    maxBudgetUsd: z.number().positive().max(MAX_CALL_BUDGET_USD),
  })
  .partial()
  .strict();

const FileSchema = z
  .object({
    claudeBin: z.string().min(1),
    agentRuntime: z.literal("claude-code"),
    agents: z.object(Object.fromEntries(ROLES.map((r) => [r, AgentOverride.optional()]))).strict(),
    scene: z.object({ maxCostUsd: z.number().positive(), maxAutoFixes: z.number().int().min(0), secondTake: SecondTakeSchema }).partial().strict(),
    kb: z.object({ root: z.string().min(1), sourceRoot: z.string().min(1) }).partial().strict(),
    limits: LimitsSchema,
    defaults: SettingsSchema,
    asr: AsrFileSchema,
    media: MediaFileSchema,
    roughcut: RoughcutFileSchema,
    planning: PlanningFileSchema,
    analysis: AnalysisFileSchema,
    server: ServerFileSchema,
    video: VideoFileSchema,
    final: FinalFileSchema,
    watchdog: WatchdogFileSchema,
    cache: CacheFileSchema,
    render: RenderFileSchema,
  })
  .partial()
  .strict();
type FileConfig = z.infer<typeof FileSchema>;

/**
 * Тело `PUT /api/settings` (ревью Task 20, F2): из браузера меняются только модели ролей, лимиты
 * (с потолками) и настройки новой сцены. `claudeBin`, `kb.*`, `agentRuntime`, `scene.*` (бюджет
 * сцены, второй дубль) и бюджеты/таймауты ролей — только правкой config.json руками: иначе
 * same-origin баг UI запустил бы произвольный бинарник или снял бы денежный предохранитель.
 */
export const SettingsPutSchema = z
  .object({
    agents: z.object(Object.fromEntries(ROLES.map((r) => [r, z.object({ model: z.string().regex(MODEL_RE, "имя модели: латиница, цифры, . - [ ]") }).strict().optional()]))).strict(),
    limits: LimitsSchema,
    defaults: SettingsSchema,
  })
  .partial()
  .strict();

/** Ошибки `config.json` по полям (`PUT /settings` → 400 с путём поля); пусто — годится. */
export function configFileIssues(fileJson: unknown): { path: string; message: string }[] {
  const parsed = FileSchema.safeParse(fileJson ?? {});
  return parsed.success ? [] : parsed.error.issues.map((i) => ({ path: i.path.join(".") || "<root>", message: i.message }));
}

/** `fileJson` — разобранный `$MS_DATA_DIR/config.json` (см. `readConfigFile`). */
export function loadConfig(env: NodeJS.ProcessEnv, fileJson?: unknown, probe: PathProbe = fsProbe): AppConfig {
  const dataDir = env.MS_DATA_DIR?.trim();
  if (!dataDir) throw new Error("config: MS_DATA_DIR не задан");
  const parsed = FileSchema.safeParse(fileJson ?? {});
  if (!parsed.success) {
    const where = configFileIssues(fileJson).map((i) => `${i.path}: ${i.message}`).join("; ");
    throw new Error(`config: config.json не годится: ${where}`);
  }
  const file: FileConfig = parsed.data;
  const fileAgents = (file.agents ?? {}) as Partial<Record<Role, Partial<AgentSettings>>>;

  const agents = Object.fromEntries(
    ROLES.map((role) => {
      const base: AgentSettings = {
        model: OPUS_ROLES.includes(role) ? "opus" : SMALL_ROLES.includes(role) ? "haiku" : "sonnet",
        timeoutMs: AGENT_TIMEOUT_MS,
        maxBudgetUsd: AGENT_BUDGET_USD,
      };
      // Script Director по умолчанию — модель и лимиты Visual Planner (спека сценария §6.1)
      const inherit = role === "script_director" ? fileAgents.visual_planner : undefined;
      return [role, { ...base, ...inherit, ...fileAgents[role] }];
    }),
  ) as Record<Role, AgentSettings>;

  return {
    dataDir,
    server: { port: file.server?.port ?? DEFAULT_PORT },
    claudeBin: file.claudeBin ?? "claude",
    agentRuntime: "claude-code",
    agents,
    scene: {
      maxCostUsd: file.scene?.maxCostUsd ?? 5,
      maxAutoFixes: file.scene?.maxAutoFixes ?? 2,
      secondTake: { ...SECOND_TAKE, ...file.scene?.secondTake, ...secondTakeEnv(env) },
    },
    kb: {
      root: file.kb?.root ?? env.KB_ROOT ?? join(REPO_ROOT, "knowledge"),
      sourceRoot: file.kb?.sourceRoot ?? env.KB_SOURCE_ROOT ?? MAIN_CHECKOUT,
    },
    limits: { ...LIMITS, ...file.limits },
    defaults: file.defaults ?? defaultSettings(),
    ...videoConfig(env, file, probe),
    video: { ...VIDEO, ...file.video },
    final: { ...FINAL, ...file.final },
    watchdog: { noProgressMs: { ...file.watchdog?.noProgressMs } },
    cache: { ...CACHE, ...file.cache },
    render: { ...file.render },
  };
}

const env1 = (env: NodeJS.ProcessEnv, k: string): string | undefined => env[k]?.trim() || undefined;

/**
 * Разделы Phase 2–3: config.json > env > умолчания (как `kb`). Пути (`asr.python`,
 * `asr.aiPlatformRoot`, `asr.modelsDir`, `media.importRoots`) после раскрытия `~` / `~/…`
 * (домашний каталог из `HOME`) обязаны быть абсолютными — относительный путь зависел бы от
 * cwd процесса. Перекрёстные проверки планирования — после слияния всех источников.
 */
function videoConfig(env: NodeJS.ProcessEnv, file: FileConfig, probe: PathProbe): Pick<AppConfig, "asr" | "media" | "roughcut" | "planning" | "analysis"> {
  const home = env1(env, "HOME") ?? homedir();
  const asr: AsrConfig = {
    python: defaultAsrPython(env, home, probe),
    worker: ASR_WORKER_COPY,
    modelsDir: defaultModelsDir(env, file.asr?.model ?? "whisper-large-v3-turbo", probe),
    model: "whisper-large-v3-turbo",
    language: "ru",
    expectedWorkerSha256: ASR_WORKER_SHA256,
    timeoutMs: 14_400_000,
    noOutputTimeoutMs: 1_800_000,
    ...definedOnly({ python: env1(env, "AIP_MONTAGE_ASR_PYTHON"), aiPlatformRoot: env1(env, "AI_PLATFORM_ROOT"), modelsDir: env1(env, "AIP_MODELS_DIR") }),
    ...file.asr,
  };
  for (const k of ["python", "modelsDir"] as const) asr[k] = absPath(`asr.${k}`, asr[k], home);
  if (asr.aiPlatformRoot !== undefined) {
    asr.aiPlatformRoot = absPath("asr.aiPlatformRoot", asr.aiPlatformRoot, home);
    asr.worker = join(asr.aiPlatformRoot, AIP_WORKER_REL);
  }
  const media: MediaConfig = { importRoots: [SSD_ROOT, join(home, "Movies")], proxyShortSide: 720, thumbEveryUs: 2_000_000, ...file.media };
  media.importRoots = media.importRoots.map((p, i) => absPath(`media.importRoots[${i}]`, p, home));
  const planning: PlanningConfig = { ...PLANNING, ...file.planning };
  if (planning.minSceneUs > planning.maxSceneUs) {
    throw new Error(`config: planning.minSceneUs (${planning.minSceneUs}) больше planning.maxSceneUs (${planning.maxSceneUs})`);
  }
  if (planning.maxFullscreenCoverage > planning.maxCoverage) {
    throw new Error(`config: planning.maxFullscreenCoverage (${planning.maxFullscreenCoverage}) больше planning.maxCoverage (${planning.maxCoverage})`);
  }
  return {
    asr,
    media,
    roughcut: { ...ROUGHCUT_DEFAULTS, ...file.roughcut },
    planning,
    analysis: { maxCostUsd: 3, occupancyWindowUs: 4_000_000, ...file.analysis },
  };
}

/**
 * python ASR: `.deps/asr-venv` с штампом полной установки `.ms-lock` (его пишет `./setup` после
 * `uv pip sync` и проверки импорта), иначе прежнее окружение ai-platform, если есть.
 */
function defaultAsrPython(env: NodeJS.ProcessEnv, home: string, probe: PathProbe): string {
  const venvs = depsRoots(env, REPO_ROOT).map((r) => join(r, "asr-venv"));
  const ready = venvs.find((v) => probe.exists(join(v, ".ms-lock")));
  if (ready) return join(ready, "bin/python");
  const legacy = LEGACY_ASR_PYTHON(home);
  return probe.exists(legacy) ? legacy : join(venvs[0]!, "bin/python");
}

/** Веса модели готовы: `config.json` и файл весов (`./setup` переносит каталог целиком после проверки). */
const modelReady = (modelsDir: string, model: string, probe: PathProbe): boolean => {
  const dir = join(modelsDir, "asr", model);
  return probe.exists(join(dir, "config.json")) && ["weights.safetensors", "weights.npz"].some((w) => probe.exists(join(dir, w)));
};

/**
 * Веса ASR для модели `asr.model`: `<папка материалов>/models`, если там она готова; иначе прежний
 * `local_models`, если она есть там (так модель не из `./setup` берётся оттуда); иначе папка материалов.
 */
function defaultModelsDir(env: NodeJS.ProcessEnv, model: string, probe: PathProbe): string {
  // неверный MS_MATERIALS_ROOT покажет doctor (строка materials); веса — по умолчанию
  const models = join(materialsRootOr(env), "models");
  if (modelReady(models, model, probe)) return models;
  return modelReady(LEGACY_MODELS_DIR, model, probe) ? LEGACY_MODELS_DIR : models;
}

function materialsRootOr(env: NodeJS.ProcessEnv): string {
  try {
    return materialsRoot(env);
  } catch {
    return MATERIALS_ROOT;
  }
}

/** `~` и `~/…` → домашний каталог; результат — абсолютный путь, иначе ошибка (`~user` не поддерживается). */
function absPath(field: string, p: string, home: string): string {
  const out = p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p;
  if (!isAbsolute(out)) throw new Error(`config: ${field} должен быть абсолютным путём (допускается ~/…): ${JSON.stringify(p)}`);
  return out;
}

function definedOnly<T extends Record<string, string | undefined>>(o: T): Partial<Record<keyof T, string>> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<Record<keyof T, string>>;
}

/** `MS_SECOND_TAKE=revise|fresh|off` — режим второго дубля поверх config.json (bench A/B). */
function secondTakeEnv(env: NodeJS.ProcessEnv): Partial<SecondTake> {
  const out: Partial<SecondTake> = {};
  const v = env.MS_SECOND_TAKE?.trim();
  if (v) {
    if (!(SECOND_TAKE_MODES as readonly string[]).includes(v)) throw new Error(`config: MS_SECOND_TAKE — одно из ${SECOND_TAKE_MODES.join(", ")}: ${v}`);
    out.mode = v as SecondTake["mode"];
  }
  // `MS_SECOND_TAKE_THRESHOLD` — порог overall (1–10) для A/B
  const t = env.MS_SECOND_TAKE_THRESHOLD?.trim();
  if (t) {
    const n = Number(t);
    if (!Number.isFinite(n) || n < 1 || n > 10) throw new Error(`config: MS_SECOND_TAKE_THRESHOLD — число 1–10: ${t}`);
    out.threshold = n;
  }
  return out;
}

/** Читает `<dataDir>/config.json`; нет файла — `undefined`, битый JSON — ошибка. */
export async function readConfigFile(dataDir: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(join(dataDir, "config.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`config: config.json — не JSON: ${(e as Error).message}`, { cause: e });
  }
}
