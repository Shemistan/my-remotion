---
тип: plan
статус: запланировано
обновлено: 2026-10-20
спека: 2026-10-20-motion-studio-phase1-rest.md
---

# Motion Playground MVP — остаток Phase 1: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** из вертикального среза (CLI `generate`, Task 1–10) сделать рабочий продукт Phase 1 (ТЗ §13): в браузерном UI пользователь создаёт проект, пишет запрос, получает настоящую Remotion-сцену с опорой на KB, смотрит превью, правит через чат, сравнивает и восстанавливает версии, видит QA и компоненты KB с лицензиями и экспортирует MP4 (и ProRes 4444 с альфой, если сцена прозрачная); задачи переживают перезапуск и отключение SSD по ADR 0006/0007. Приёмка — тесты 1–3 и тесты устойчивости из `docs/architecture/09-acceptance-tests.md` через UI на реальных моделях и рендере.

**Architecture:** к пакетам среза `@ms/contracts`, `@ms/core`, `@ms/render`, `server` добавляются: SQLite-схема и репозитории (`server/src/db`), Job Orchestrator с fencing-токеном и реестром `job_processes` (`server/src/jobs`), SceneRepo v2 поверх файлового SceneStore (`server/src/scenes`), QA по реальным кадрам (`server/src/qa`), пайплайны `playground.generate` / `playground.edit` / `scene.restore` / `scene.export` (`server/src/pipeline`), Control API на Fastify (`server/src/api`) и пакет `web` (React + Vite). motion-kit растёт до v0.2: StyleBible-система, хореография входов, камера, safe area, примитивы паттернов ТЗ §8.4. Движок сцен (`contracts` + `render`) по-прежнему не зависит от HTTP и БД.

**Tech Stack:** то же, что в срезе (Node 22.21.1, TS strict ESM, Vitest 3, ESLint 9, Zod 3, Remotion 4.0.537 pin, Claude Code CLI 2.1.x) плюс `better-sqlite3` (уже в `@ms/core`), Fastify 5 + `fastify-type-provider-zod` + `@fastify/static`, `pngjs` (MIT, разбор PNG для QA), `diff` (BSD-3, текстовый diff версий), React (та же точная версия, что в `render`) + Vite + TanStack Query 5, `@testing-library/react` + jsdom, Playwright. Точные версии новых пакетов фиксируются в lockfile при установке.

**Spec:** `docs/superpowers/specs/2026-10-20-ai-motion-studio-design.md` → `docs/architecture/01…09`, ADR 0001–0007 (приняты); начало — `docs/superpowers/plans/2026-10-20-motion-playground-mvp.md` (Task 1–10) и решения контроллера `.superpowers/sdd/2026-10-20-motion-playground-mvp/rulings.md` (R1–R4).

**Покрытие backlog `07` §3:** P1-03 + P1-11 (Task 11), P1-04 (Task 12, 13), P1-07+ (Task 14, 15), QA из P1-10/P1-12 (Task 16), P1-10 + P1-12 (Task 17), P1-13 (Task 18), P1-14 (Task 19), P1-15 + P1-17 (Task 20), P1-16 + P1-17 Jobs Monitor (Task 21), P1-18 (Task 22).

## Порядок и параллельность

```text
срез (Task 1–10)
  ├─▶ Task 11 ─▶ Task 12 ─▶ Task 13 ─┬─▶ Task 17 ─▶ Task 18 ─┐
  │                                   ├─▶ Task 19 ────────────┤
  │                                   └─▶ Task 20 ─▶ Task 21 ─┴─▶ Task 22
  └─▶ Task 14 ─┬─▶ Task 15 ───────────────▶ (Task 17)
               └─▶ Task 16 (нужен и Task 11) ─▶ (Task 17)
```

| Волна | Задачи | Можно параллельно |
|---|---|---|
| 1 | 11, 14 | да: разные пакеты (`server/src/db`, `contracts/src/*` новые файлы ↔ `render/src/motion-kit`, `contracts/src/motion-spec.ts`) |
| 2 | 12, 15, 16 | да: 12 — `server/src/jobs`; 15 — `render/src/motion-kit/components`; 16 — `server/src/qa` |
| 3 | 13 | — (меняет `@ms/core/run` и `jobs`) |
| 4 | 17, 19, 20 | да: разные пайплайны и `api/`; общий файл — только регистрация обработчиков `server/src/jobs/handlers.ts` (append-only) |
| 5 | 18, 21 | да |
| 6 | 22 | — |

Параллельные задачи — только в отдельных worktree; в одном worktree — строго по порядку.

## Global Constraints

- Всё из Global Constraints среза остаётся в силе (Node 22.21.1, точный pin Remotion 4.0.537, `MS_DATA_DIR` только через StorageGuard и `safeMkdir`, агенты только `claude -p --restricted …` без Bash и без bypass, модели `agents.<role>.model`, лимиты, детерминизм кода сцены, KB по умолчанию только `permissive`, запрет устаревшего `ai-platform/.../aiplatform/motion/` как кода и референса, KB-исходники только чтение).
- Решения контроллера R1–R4 действуют: storage и run-утилиты в `@ms/core`; Vitest `test.projects`; все команды через `scripts/with-node.sh`; коммиты без строк соавторства; ветки и `./finish` — контроллер.
- Сервер слушает только `127.0.0.1:8790`; `Host` ∈ {`127.0.0.1:8790`, `localhost:8790`}; мутирующие запросы — только с `Origin` `http://127.0.0.1:8790` или `http://localhost:8790`; нет авторизации, ролей, биллинга, облака, Redis, Docker, ORM.
- Порядок старта сервера (ADR 0007 п.5): owner-lock → StorageGuard → `studio.db` (миграции, сверка `store_id`) → разбор реестра процессов → восстановление задач → только затем захват новых задач и `listen`.
- Fencing: каждая запись результата задачи (публикация версии, экспорт, `output_refs_json`, сообщение ассистента) идёт в транзакции с проверкой `jobs.attempt = <attempt попытки>`; несовпадение — `fenced_out`, ничего не пишется, draft помечается `.quarantined`.
- Автоповтора без подтверждённого завершения процессов прежней попытки нет: иначе `blocked(stale_process)`; повтор `blocked` — только действием человека и только когда реестр не содержит живых процессов.
- Замок сцены: задачи `playground.generate`, `playground.edit`, `scene.restore` над одной сценой не выполняются одновременно (`scene_locks`); `scene.export` читает иммутабельную версию и замок не берёт.
- Лимиты по умолчанию (`03` §8): одновременно 2 агентных вызова, 1 рендер (Remotion concurrency 4); задач в работе — до 2; lease 30 с, heartbeat 10 с; `max_attempts` задачи 3 (перезапуски после прерывания); автоисправлений внутри попытки 2, общий счётчик для технического gate и визуального QA (`04` §2); бюджет `scene.maxCostUsd` $5 — на одну задачу генерации или правки.
- Качество анимации — главный приоритет: одна мысль в сцене, иерархия, типографическая шкала из StyleBible, safe area, разные входы для разных элементов (никаких одинаковых fade-in), easing и spring из StyleBible, ритм через биты и stagger, глубина через `elevation`/`depth`, камера только когда помогает смыслу и в пределах `camera.max_scale`. Проверяется в QA по реальным кадрам (Task 16), а не по коду.
- Контракт props сцены (Task 11, `ScenePropsBaseSchema`): тайминги битов и стиль сцена берёт из `props.timing` и `props.style` — иначе правки «медленнее на 25 %», «палитра из v1», «объёмнее» невозможны без переписывания кода.
- Любой сторонний код в сцене — только из `permissive` записей KB с `kb_id`, commit и лицензией в `knowledge-refs.json`; `EngineerReport.kb_ids_used` ⊆ выбранных; иначе — blocking. У каждого примитива motion-kit — строка в `PROVENANCE.md`.
- Строки интерфейса — только через `t(key)` из `web/src/i18n/ru.ts`; кириллица в `.tsx` вне словаря — ошибка проверки.
- Юнит-тесты могут использовать фейковые агенты и бинарники только для логики; e2e и приёмка — реальный `claude`, реальный `renderMedia`, реальный `ffprobe`; mock-результат не засчитывается. Цель `make e2e` не входит в `make check`.
- Тесты пишут только в `tmp/` репозитория или `os.tmpdir()`; реальное хранилище — только в e2e/приёмке: `MS_DATA_DIR="/Volumes/External SSD/MotionStudio"` (приёмка — отдельный стор `/Volumes/External SSD/MotionStudio-acceptance`, создаётся `doctor --init`).
- Evidence — `docs/evidence/phase-1/<test>/`; `preview.mp4` и экспорт копируются, только если ≤ 10 МБ, иначе — sha256, ffprobe и путь.

## Review Focus

1. Устаревшая попытка с живым процессом пытается опубликовать версию после старта новой попытки → отказ `fenced_out`, версия не появилась, draft `.quarantined` (Task 11, 12, 13).
2. Сервер убит `kill -9` во время рендера, дочерний процесс игнорирует SIGTERM → после рестарта задача не в `pending`; процесс убит SIGKILL → `pending`; не убиваемый (фейковый kill) → `blocked(stale_process)`, UI показывает PID и команду (Task 13, 21).
3. Две правки одной сцены отправлены подряд → вторая ждёт в `pending`, пока первая держит замок сцены; правка и откат — то же (Task 12, 22).
4. «Медленнее на 25 %» → `duration_frames` 180 → 240 и границы битов × 4/3 ± 1 кадр, палитра = токены v1, раскладка ± 2 % кадра (Task 11, 18).
5. QA ловит дефекты по пикселям, а не по коду: пустой кадр, застывшая анимация, текст за краем кадра, одинаковые входы всех элементов, перекрытие узлов (Task 16).
6. Чужая веб-страница шлёт `POST` на `127.0.0.1:8790` → 403; `Host: evil.example` → 403; хранилище недоступно → 503 на всё, кроме `/api/health` (Task 20).
7. Прозрачный экспорт сцены с непрозрачным фоном отклоняется понятной причиной, а не отдаёт «прозрачный» MOV с фоном (Task 19).

## Противоречия и пробелы спеки — на решение контроллера

| # | Где | Суть | Предложение по умолчанию (план исходит из него) |
|---|---|---|---|
| Q1 | срез Task 2 ↔ ADR 0007 п.3 | срез пишет реестр процессов в файлы `run/processes/`, ADR требует таблицу `job_processes` + копию в памяти | `ProcessRegistry` в `@ms/core` (файловая реализация — для CLI), `SqliteProcessRegistry` в server; `spawnTracked` получает `opts.registry` (по умолчанию файловый) — Task 13 |
| Q2 | срез Task 9 ↔ `05` §1 | срез пишет в проект `playground` без БД; P1-03 вводит `projects` | проект с `id = "playground"` создаётся миграцией; версии среза импортируются в БД командой `doctor --import-slice` (Task 11) |
| Q3 | ТЗ §6.4/§5 A9 ↔ кадровая анимация | выбор FPS экспорта меняет скорость кадро-зависимой сцены | FPS экспорта ∈ {24, 25, 30, 50, 60}: `props.timing` пересчитывается `scaleTiming(…, newFps/oldFps)` и композиция рендерится с новым fps; приёмка — только 30 (Task 19) |
| Q4 | ТЗ §6.4 `transparent_export` | ProRes с альфой требует сцену без фона на корне; в Playground почти все сцены с `Background` | `transparent_export` задаётся до генерации и передаётся Engineer; экспорт `prores4444` для версии без него — `transparent_unsupported` (Task 19) |
| Q5 | Test 3 «палитра из первой версии» | неудачные версии тоже получают номера (`05` §5) | «первая версия» = версия с `number = 1`; если она `failed`, Edit Planner берёт первую `ready` и пишет об этом в ответ |
| Q6 | `03` §3 React 19 ↔ срез «React из peer-зависимости Remotion» | две версии React в одном workspace поднимутся в корень и сломают бандл или UI | `web` использует ту же точную версию `react`/`react-dom`, что `render` |
| Q7 | `03` §6 Host/Origin только `:8790` ↔ Vite dev-сервер | в dev UI на другом порту получит 403 | dev — Vite в режиме middleware внутри Fastify (`vite.createServer({ server: { middlewareMode: true } })`), один порт 8790; отдельного allowlist для dev нет |
| Q8 | `07` P1-16 «E2E Playwright создать → правка → восстановить → экспорт» ↔ «mocks только в юнит-тестах» | UI-сценарий без реального агента был бы моком | Task 21: Playwright только по путям без LLM на реальных версиях из рукописных фикстур, отрендеренных реально; сценарии с генерацией и правкой — только в приёмке Task 22 с реальным Claude |
| Q9 | `05` §3 `scene_versions.status` содержит `draft` | draft-каталоги в БД не регистрируются (ADR 0007: draft на попытку) | `draft` в БД не используется; drafts видны только через `jobs` и файловую систему |
| Q10 | бюджет $5 «на одну генерацию сцены» | генерация теперь включает Concept и Visual QA (+2 вызова) | $5 — на задачу (`playground.generate` или `playground.edit`) целиком, включая QA; при исчерпании — `failure.stage = "budget"` |

---

### Task 11: Данные Phase 1 — контракты, SQLite, SceneRepo v2 (P1-02 расширение, P1-03, P1-11)

**Files:**
- Create: `app/motion-studio/contracts/src/{patterns.ts,concept.ts,qa.ts,edit.ts,jobs.ts,chat.ts,export.ts,scene-props.ts,api.ts}`
- Modify: `app/motion-studio/contracts/src/{manifest.ts,index.ts}`
- Create: `app/motion-studio/server/src/db/{open.ts,migrate.ts,meta.ts,tx.ts}`, `app/motion-studio/server/src/db/migrations/001_phase1.sql`, `app/motion-studio/server/src/db/repos/{projects,scenes,versions,chat,jobs,agent-runs,render-jobs,qa-reports,knowledge-refs,exports,component-tests,job-processes}.ts`
- Create: `app/motion-studio/server/src/scenes/{repo.ts,diff.ts,import-slice.ts}`
- Modify: `app/motion-studio/server/src/scenes/store.ts` — выделить `publishFiles(draft, destDir, meta, guard)` (синхронная часть: sha256, manifest, `renameSync`, `chmod -R a-w`); `publishVersion` среза остаётся обёрткой над ней
- Modify: `app/motion-studio/server/src/cli/doctor.ts` — `--import-slice`
- Test: `app/motion-studio/contracts/test/{concept,qa,edit,jobs,scene-props,export}.test.ts`, `app/motion-studio/server/test/db/{migrate,meta,repos}.test.ts`, `app/motion-studio/server/test/scenes/{repo,diff,import-slice}.test.ts`

**Interfaces:**
- Consumes: `Settings`, `MotionSpec`, `Beat`, `VersionManifestSchema`, `KnowledgeRefSchema`, `toJsonSchema` (Task 3); `StorageStatus`, `safeMkdir`, `StoreMarker` (Task 1); `createDraft`, `Draft`, `readVersion`, `quarantineDraft`, `newId` (Task 9)
- Produces (`@ms/contracts`):
  - `PATTERN_SLUGS = ["growth-decline","comparison","cause-effect","sequence-steps","system-structure","relationships","timeline","transformation","quantities","spatial","abstract-concepts","key-point-emphasis"] as const`; `PatternSlug`
  - `ConceptOutputSchema = { needs_clarification: { question: string; default_if_skipped: string }[] /* ≤ 3 */; concept: string; patterns: PatternSlug[] /* 1..3 */; kb_queries: { ru: string[] /* 1..5 */; en: string[] /* 0..5 */ }; composition_mode: "fullscreen" | "overlay" | "split_screen" | "pip" | "callout" | "none"; style_hint: { preset: StylePreset; palette_overrides?: Record<string, string> } }`
  - `VerdictSchema = "pass" | "warn" | "fail" | "not_checked"`; `QAIssueSchema = { source: "technical" | "programmatic" | "agent"; code: string; severity: "blocking" | "warning"; frame?: number; area?: string; description: string; fix_hint: string }`
  - `VisualQAOutputSchema = { gate: { visual: Verdict; semantic: Verdict; style: Verdict }; issues: Omit<QAIssue, "source">[]; checked_frames: number[]; ocr: { frame: number; texts: string[] }[] }`
  - `QAReportSchema = { gate: { technical; visual; semantic; style }: Verdict; issues: QAIssue[]; checked_frames: number[]; ocr: …; automated: true }`
  - `EditPlanSchema = { base_version_id: string; path: "param" | "spec" | "code"; changes: { target: string; kind: "param" | "spec" | "code"; description: string }[]; borrow: { from_version_id: string; what: "palette" | "typography" | "timing" | "layout" | "depth" }[]; preserve: ("composition" | "palette" | "timing" | "text")[]; timing_scale?: number /* (0.25, 4] */; param_patch?: { style?: Partial<ScenePropsStyle>; content?: Record<string, unknown> }; reply: string }` — `superRefine`: `path = "param"` ⇒ все `changes[].kind = "param"`
  - `ScenePropsBaseSchema = { timing: { duration_frames: number; beats: Pick<Beat, "id" | "start_frame" | "end_frame">[] }; style: ScenePropsStyle; content: Record<string, unknown> }`; `ScenePropsStyle = { preset: StylePreset; palette_overrides?: Record<string, string>; intensity: "calm" | "balanced" | "energetic"; depth: 0 | 1 | 2 | 3 /* по умолчанию 1 */; transparent: boolean }`
  - `scaleTiming<T extends { duration_frames: number; beats: { start_frame: number; end_frame: number }[] }>(t: T, factor: number): T` — `round` границ, последний бит кончается ровно на новой длительности
  - `JobStatusSchema = "pending" | "running" | "completed" | "failed" | "cancelled" | "awaiting_approval" | "awaiting_input" | "blocked"`; `JobTypeSchema = "playground.generate" | "playground.edit" | "scene.restore" | "scene.export"`; `JobSchema` — поля таблицы `jobs` (`05` §3); `JobErrorSchema = { code: "interrupted" | "stale_process" | "storage_unavailable" | "fenced_out" | "budget" | "cancelled" | "pipeline"; message: string; stage?: string; pids?: number[]; cmds?: string[] }`
  - `ChatMessageSchema = { id; scene_id; role: "user" | "assistant" | "system"; text; version_id?; job_id?; created_at }`
  - `ExportRequestSchema = { format: "mp4" | "prores4444"; fps?: 24 | 25 | 30 | 50 | 60; crf?: number /* 14..28, по умолчанию 18 */; scale?: 1 | 0.5 /* по умолчанию 1 */ }`; `ExportManifestSchema = { schema_version: 1; export_id; version_id; version_manifest_sha256; format; request: ExportRequest; settings: Settings; ffprobe: ProbeResult; sha256: string; render_env; created_at }`
  - `VersionManifestSchema` расширяется: `parent_version_id?`, `edit_plan?: EditPlan | { kind: "restore"; base_version_id: string }`, `changed_files: string[]`, `qa: QAReport["gate"]`, `preview?: { path: string; sha256: string }`, `agent_runs: string[]`, `job: { id: string; attempt: number }`
  - `api.ts`: DTO-схемы ответов и запросов Task 20 (`ProjectDto`, `SceneDto`, `VersionDto`, `JobDto`, `JobEventDto`, `CreateSceneBody`, `ChatBody`, `RestoreBody`, `JobInputBody`, `KbHitDto`, `AppSettingsDto`)
- Produces (server):
  - `openDb(root: string): Db` — `<root>/studio.db`; `journal_mode=WAL`, `synchronous=FULL`, `foreign_keys=ON`, `busy_timeout=5000`
  - `migrate(db: Db): { from: number; to: number }` — SQL-файлы по номеру, `PRAGMA user_version`; `001_phase1.sql` — все таблицы `05` §3 Phase 1 + `meta(key PK, value)`; в `projects` строка `playground` (`kind = "playground"`)
  - `bindStoreId(db: Db, marker: StoreMarker): void` — первый запуск пишет `meta.store_id`; расхождение — ошибка `store_mismatch`
  - `quickCheck(db: Db): boolean` — `PRAGMA quick_check = 'ok'`
  - репозитории — синхронные функции над `Db` (`better-sqlite3`), без ORM: `projects.create/get/list`, `scenes.create/get/listByProject/setCurrent`, `versions.insert/get/listByScene/nextNumber`, `chat.add/list`, `jobs.insert/get/update/list`, `agentRuns.insert/finish`, `renderJobs.insert`, `qaReports.insert`, `knowledgeRefs.insertMany`, `exports.insert/get`, `componentTests.upsert`, `jobProcesses.insert/end/listLive`
  - `class SceneRepo`: `constructor(deps: { root: string; db: Db; guard: () => Promise<StorageStatus> })`;
    - `createScene(projectId: string, input: { prompt: string; settings: Settings }): SceneRow` — пишет `brief.json` в `workspace/projects/<projectId>/scenes/<sceneId>/`
    - `publish(draft: Draft, meta: PublishMeta, fence: { jobId: string; attempt: number }): Promise<PublishedVersion>` — `await guard()`, затем одна транзакция `BEGIN IMMEDIATE`: `jobs.attempt = fence.attempt` (иначе `fenced_out`, `quarantineDraft`) → `nextNumber` → `publishFiles` в `workspace/projects/<projectId>/scenes/<sceneId>/versions/<ver>/` → `versions.insert`, `knowledgeRefs.insertMany` → `status = ready` ⇒ `scenes.current_version_id`; сбой вставки → обратный `renameSync`
    - `restore(sceneId: string, versionId: string, fence): Promise<PublishedVersion>` — копия файлов версии (кроме `manifest.json`) в новый draft, `parent_version_id = versionId`, `edit_plan = { kind: "restore", base_version_id }`, `prompt = "restore v<N>"`, становится `current`
    - `diff(aId: string, bId: string): Promise<VersionDiff>`; `VersionDiff = { settings: JsonChange[]; props: JsonChange[]; spec: JsonChange[]; files: { path: string; status: "added" | "removed" | "changed" | "same"; unified?: string }[] }`; `JsonChange = { path: string /* JSON Pointer */; before?: unknown; after?: unknown }`
    - `cleanupDrafts(live: { runId: string; attempt: number }[]): Promise<{ removed: string[]; kept: string[] }>` — удаляет drafts без живой попытки, кроме `.quarantined`
  - `importSliceVersions(repo: SceneRepo, root: string): Promise<{ imported: number }>` — версии `workspace/projects/playground/` без записи в БД регистрируются с проверкой sha256 (`readVersion`)

- [ ] **Step 1: Тесты контрактов (падают):**

```ts
expect(scaleTiming({ duration_frames: 180, beats: [b(0, 30), b(30, 120), b(120, 180)] }, 1 / 0.75))
  .toMatchObject({ duration_frames: 240, beats: [b(0, 40), b(40, 160), b(160, 240)] });
expect(scaleTiming({ duration_frames: 162, beats: [b(0, 25), b(20, 125), b(125, 162)] }, 2).beats[2].end_frame).toBe(324);
expect(EditPlanSchema.safeParse(plan({ path: "param", changes: [{ kind: "code" }] })).success).toBe(false);
expect(EditPlanSchema.safeParse(plan({ timing_scale: 0 })).success).toBe(false);
expect(ConceptOutputSchema.safeParse(concept({ patterns: ["made-up"] })).success).toBe(false);
expect(ScenePropsBaseSchema.parse(propsWithoutDepth).style.depth).toBe(1);
expect(ExportRequestSchema.parse({ format: "mp4" })).toEqual({ format: "mp4", crf: 18, scale: 1 });
expect(ExportRequestSchema.safeParse({ format: "mp4", fps: 29 }).success).toBe(false);
for (const s of [ConceptOutputSchema, VisualQAOutputSchema, EditPlanSchema]) expect(JSON.stringify(toJsonSchema(s))).not.toContain("$ref");
```

- [ ] **Step 2: Тесты БД и SceneRepo (падают),** корень в `tmp/`:

```ts
expect(migrate(db)).toEqual({ from: 0, to: 1 }); expect(migrate(db)).toEqual({ from: 1, to: 1 });
expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
expect(projects.get(db, "playground")).toMatchObject({ kind: "playground" });
bindStoreId(db, markerA); expect(() => bindStoreId(db, markerB)).toThrow(/store_mismatch/);
expect(() => jobs.insert(db, { ...job, idempotency_key: "k1" })).not.toThrow();
expect(() => jobs.insert(db, { ...job, id: "job_2", idempotency_key: "k1" })).toThrow(/UNIQUE/);
// fencing
jobs.update(db, "job_1", { attempt: 2 });
await expect(repo.publish(draftA1, meta, { jobId: "job_1", attempt: 1 })).rejects.toThrow(/fenced_out/);
expect(versions.listByScene(db, sceneId)).toHaveLength(0);
expect(existsSync(join(draftA1.dir, ".quarantined"))).toBe(true);
const v1 = await repo.publish(draftA2, meta, { jobId: "job_1", attempt: 2 });
expect(v1.manifest.number).toBe(1); expect(scenes.get(db, sceneId)!.current_version_id).toBe(v1.versionId);
const vf = await repo.publish(failedDraft, { ...meta, status: "failed" }, fence2);
expect(vf.manifest.number).toBe(2); expect(scenes.get(db, sceneId)!.current_version_id).toBe(v1.versionId);
const r = await repo.restore(sceneId, v1.versionId, fence3);
expect(r.manifest).toMatchObject({ number: 3, parent_version_id: v1.versionId, edit_plan: { kind: "restore" } });
expect(versions.listByScene(db, sceneId)).toHaveLength(3);                 // история не тронута
const d = await repo.diff(v1.versionId, v2Changed.versionId);
expect(d.props).toContainEqual({ path: "/style/palette_overrides/accent", before: "#4F7CFF", after: "#9B5CFF" });
expect(d.files.find(f => f.path === "src/Scene.tsx")!.status).toBe("changed");
expect((await repo.cleanupDrafts([])).kept).toEqual([draftA1.dir]);        // .quarantined остаётся
```

- [ ] **Step 3: Запустить** `./scripts/with-node.sh npx vitest run contracts server/test/db server/test/scenes` — FAIL.
- [ ] **Step 4: Реализовать.** Транзакция публикации синхронная (better-sqlite3), поэтому внутри неё только синхронные `fs`-вызовы; `await guard()` — до транзакции. `diff`: JSON — собственный обход с JSON Pointer; файлы `src/**` — `createTwoFilesPatch` из `diff`. `doctor --import-slice` вызывает `importSliceVersions`.
- [ ] **Step 5: Запустить** — PASS; `./check`; коммит `feat(motion-studio): контракты Phase 1, SQLite и SceneRepo`.

### Task 12: Job Orchestrator — очередь, lease, fencing, идемпотентность, замок сцены (P1-04, часть 1)

**Files:**
- Create: `app/motion-studio/server/src/jobs/{queue.ts,runner.ts,locks.ts,events.ts,limits.ts,semaphore.ts,handlers.ts,types.ts,clock.ts}`
- Test: `app/motion-studio/server/test/jobs/{queue,locks,runner,events,idempotency,cancel}.test.ts`

**Interfaces:**
- Consumes: `openDb`, `migrate`, репозитории `jobs`, `job_events`, `scene_locks` (Task 11); `JobSchema`, `JobType`, `JobStatus`, `JobError` (Task 11)
- Produces:
  - `enqueue(db: Db, req: { type: JobType; projectId: string; sceneId?: string; versionId?: string; parentJobId?: string; input: unknown; idempotencyKey: string; maxAttempts?: number /* 3 */ }): { job: Job; created: boolean }` — тот же ключ → существующая задача, `created: false`; `input_hash = sha256(type + canonicalJSON(input))`
  - `SCENE_WRITING_TYPES: readonly JobType[] = ["playground.generate", "playground.edit", "scene.restore"]`
  - `claimNext(db: Db, owner: string, now: number, busy: { running: number; maxRunning: number }): Claim | undefined` — транзакция `BEGIN IMMEDIATE`: самая старая `pending`, у которой (если тип пишет в сцену) свободен `scene_locks`; `status = running`, `attempt += 1`, `lease_owner`, `lease_until = now + 30_000`, `started_at`; замок сцены `INSERT` в той же транзакции; `Claim = { job: Job; attempt: number }`
  - `heartbeat(db, jobId, attempt, now): boolean` — продлевает lease, `false` при несовпадении `attempt` (fencing)
  - `fenceOk(db, jobId, attempt): boolean`
  - `finish(db, jobId, attempt, result: { status: "completed"; outputRefs: unknown } | { status: "failed" | "cancelled"; error: JobError } | { status: "awaiting_input"; questions: ConceptOutput["needs_clarification"] }): boolean` — проверка fencing в той же транзакции; снимает замок сцены (кроме `awaiting_input`: замок снимается, сцена свободна, задача ждёт)
  - `provideInput(db, jobId, answers: Record<string, string> | "skip"): Job` — `awaiting_input → pending`, ответы в `input_refs_json.answers`
  - `requestCancel(db, jobId): Job` — `pending` → сразу `cancelled`; `running` → `cancel_requested = 1` (раннер прерывает через `AbortSignal`)
  - `type JobHandler = (ctx: JobContext) => Promise<HandlerResult>`; `interface JobContext { db: Db; job: Job; attempt: number; signal: AbortSignal; run: { root: string; runId: string /* = job.id */; attempt: number }; emit(kind: string, message: string, data?: unknown): void; progress(p: number, stage: string): void; fenceOk(): boolean; agents: Semaphore /* 2 */; renders: Semaphore /* 1 */ }`
  - `class JobRunner`: `constructor(opts: { db: Db; root: string; owner: string; handlers: Partial<Record<JobType, JobHandler>>; clock?: Clock; maxRunning?: 2; pollMs?: 500; heartbeatMs?: 10_000 })`; `start(): void`; `stop(opts: { abortRunning: boolean }): Promise<void>`; `pause(): void` / `resume(): void` (для `storage_offline`); `running(): { jobId: string; attempt: number; controller: AbortController }[]`
  - `class Semaphore { constructor(n: number); acquire(signal?: AbortSignal): Promise<() => void> }`
  - `EventBus`: `emit(db, ev)` пишет `job_events` и рассылает подписчикам; `subscribe(sinceId: number, cb: (ev: JobEventDto) => void): () => void` — сначала догоняет из БД событиями с `id > sinceId`
  - `handlers.ts`: `registerHandlers(map)` — точка регистрации обработчиков пайплайнов (Task 17–19 дописывают по строке)

- [ ] **Step 1: Тесты (падают),** фейковые часы и обработчики:

```ts
const a = enqueue(db, req({ idempotencyKey: "k" })); const b = enqueue(db, req({ idempotencyKey: "k" }));
expect(b).toMatchObject({ created: false, job: { id: a.job.id } });
const c1 = claimNext(db, "srv", 0, idle)!; expect(c1).toMatchObject({ attempt: 1, job: { status: "running" } });
// две правки одной сцены: вторая не захватывается, пока первая держит замок
enqueue(db, edit("scn_1", "e1")); enqueue(db, edit("scn_1", "e2"));
expect(claimNext(db, "srv", 0, idle)!.job.idempotency_key).toBe("e1");
expect(claimNext(db, "srv", 0, idle)).toBeUndefined();
finish(db, e1.id, 1, { status: "completed", outputRefs: {} });
expect(claimNext(db, "srv", 0, idle)!.job.idempotency_key).toBe("e2");
// export той же сцены не ждёт замок
expect(claimNext(db, "srv", 0, idle)!.job.type).toBe("scene.export");
// fencing
db.prepare("UPDATE jobs SET attempt = 2 WHERE id = ?").run(c1.job.id);
expect(heartbeat(db, c1.job.id, 1, 10)).toBe(false);
expect(finish(db, c1.job.id, 1, { status: "completed", outputRefs: {} })).toBe(false);
expect(jobs.get(db, c1.job.id)!.status).toBe("running");
// cancel running → обработчик получает aborted signal, статус cancelled
// awaiting_input → provideInput → pending, ответы в input_refs_json
// лимиты: maxRunning 2 → третья задача не стартует, пока две идут
// Semaphore(1): второй acquire ждёт release; abort ожидания → reject
// EventBus: subscribe(5) получает события 6.. из БД, затем живые
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS. Раннер: цикл `claimNext` каждые `pollMs`; на задачу — `AbortController`, heartbeat-таймер; `cancel_requested` проверяется в heartbeat; исключение обработчика → `failed` с `error.code = "pipeline"`; `HandlerResult` пишется только через `finish` (fencing).
- [ ] **Step 5:** `./check`; коммит `feat(motion-studio): очередь задач с fencing и замком сцены`.

### Task 13: Изоляция попыток и восстановление после рестарта (P1-04, часть 2; ADR 0007 полностью)

**Files:**
- Create: `app/motion-studio/core/src/run/registry.ts`
- Modify: `app/motion-studio/core/src/run/{spawn-tracked.ts,processes.ts}` — реестр через интерфейс; `reapStale` среза становится обёрткой `reapAttempt(fileRegistry(root), { runId })`
- Create: `app/motion-studio/server/src/jobs/{process-registry.ts,recovery.ts,storage-mode.ts,retry.ts}`, `app/motion-studio/server/src/boot.ts`
- Modify: `app/motion-studio/server/src/cli/generate.ts` — через `bootCore({ kind: "cli" })`
- Create: `app/motion-studio/server/test/fixtures/bin/{orphan-render.sh}` (порождает внука, игнорирующего SIGTERM)
- Test: `app/motion-studio/core/test/run/registry.test.ts`, `app/motion-studio/server/test/jobs/{recovery,storage-mode,retry,boot-order}.test.ts`, `app/motion-studio/server/test/jobs/kill9.e2e.test.ts`

**Interfaces:**
- Consumes: `spawnTracked`, `TrackedProcess`, `procInfo`, `acquireOwnerLock`, `checkStorage`, `watchStorage`, `macosProbe` (Task 1–2); `quarantineDraft` (Task 9); `openDb`, `migrate`, `bindStoreId`, `quickCheck`, `SceneRepo.cleanupDrafts` (Task 11); `JobRunner`, `finish`, `enqueue` (Task 12)
- Produces (`@ms/core`):
  - `interface ProcessRegistry { add(p: TrackedProcess): Promise<void>; end(p: TrackedProcess, exit: { code: number | null; signal: string | null }): Promise<void>; live(filter?: { runId?: string; attempt?: number }): Promise<TrackedProcess[]> }`
  - `fileRegistry(root: string): ProcessRegistry` — поведение среза (`run/processes/*.json`)
  - `spawnTracked(..., opts: { …; registry?: ProcessRegistry })` — по умолчанию `fileRegistry(root)`; запись до начала работы, `end` только после выхода процесса
  - `reapAttempt(registry: ProcessRegistry, filter: { runId: string; attempt?: number }, opts?: { kill?: (pgid: number, sig: NodeJS.Signals) => void; termGraceMs?: 5000; waitMs?: 30_000 }): Promise<{ clean: boolean; alive: TrackedProcess[] }>` — запись с другим `startedAt` (pid переиспользован) считается мёртвой
- Produces (server):
  - `class SqliteProcessRegistry implements ProcessRegistry` — `job_processes` + копия в памяти; при закрытой БД (`storage_offline`) работает по копии в памяти и досинхронизирует `ended_at` после возврата
  - `recoverOnStart(deps: { db: Db; repo: SceneRepo; registry: ProcessRegistry; reap?: typeof reapAttempt }): Promise<RecoveryReport>`; `RecoveryReport = { requeued: string[]; failed: string[]; blocked: { jobId: string; pids: number[]; cmds: string[] }[]; draftsRemoved: string[] }` — для каждой `running`-задачи: `reapAttempt` → `clean` и `attempt < max_attempts` → `pending` (`error.code = "interrupted"` в журнале); `clean` и попытки исчерпаны → `failed(interrupted)`; не `clean` → `blocked(stale_process)` + `.quarantined` на draft попытки; затем `cleanupDrafts`
  - `class StorageSupervisor`: `constructor(deps: { check: () => Promise<StorageStatus>; runner: JobRunner; registry: SqliteProcessRegistry; reopen: () => Db; intervalMs?: 10_000 })`; `mode(): "online" | "storage_offline"`; при сбое: `runner.pause()`, abort всех попыток, закрыть БД; при возврате: `quickCheck` → reopen → тот же разбор, что `recoverOnStart`, причина `storage_unavailable` → `runner.resume()`
  - `retryJob(db, jobId, registry): Promise<Job>` — только `failed | cancelled | blocked`; при живых процессах прежней попытки → ошибка `stale_process_alive` с `pids`, `cmds`; иначе `pending` (без изменения `attempt` — его увеличит захват)
  - `bootCore(opts: { env: NodeJS.ProcessEnv; kind: "server" | "cli"; probe?: VolumeProbe; handlers?: …; log?: (step: string) => void }): Promise<Core>`; `Core = { root; config: AppConfig; db: Db; repo: SceneRepo; kb: KnowledgeAdapter; agents: AgentRuntimeAdapter; runner: JobRunner; storage: StorageSupervisor; registry: SqliteProcessRegistry; recovery: RecoveryReport; close(): Promise<void> }` — порядок шагов `log`: `owner_lock → storage → db → registry → recovery → runner`

- [ ] **Step 1: Тесты (падают):**

```ts
// порядок старта (ADR 0007 п.5)
const steps: string[] = []; await bootCore({ env, kind: "server", probe, log: s => steps.push(s) });
expect(steps).toEqual(["owner_lock", "storage", "db", "registry", "recovery", "runner"]);
// хранилище недоступно → owner-lock взят, БД не открыта, runner не стартовал
await expect(bootCore({ env: { MS_DATA_DIR: missing }, kind: "server", probe })).rejects.toThrow(/storage/);
expect(existsSync(join(missing, "studio.db"))).toBe(false);
// 09 §5 п.8: процесс прежней попытки игнорирует SIGTERM → убит SIGKILL → pending
seedRunning(db, "job_1", { attempt: 1 }); const pid = spawnOrphan(registry, { runId: "job_1", attempt: 1 });
expect((await recoverOnStart({ db, repo, registry })).requeued).toEqual(["job_1"]);
expect(await procInfo(pid)).toBeUndefined(); expect(jobs.get(db, "job_1")!.status).toBe("pending");
// не убивается (фейковый kill) → blocked, draft в карантине, без автоповтора
const rep = await recoverOnStart({ db, repo, registry, reap: (r, f) => reapAttempt(r, f, { kill: noop, waitMs: 50 }) });
expect(rep.blocked[0]).toMatchObject({ jobId: "job_1", pids: [pid] });
expect(jobs.get(db, "job_1")).toMatchObject({ status: "blocked", error_json: expect.stringContaining("stale_process") });
expect(existsSync(join(root, "workspace/drafts/job_1-a1/.quarantined"))).toBe(true);
expect(claimNext(db, "srv", 0, idle)).toBeUndefined();
await expect(retryJob(db, "job_1", registry)).rejects.toThrow(/stale_process_alive/);
// попытки исчерпаны → failed(interrupted)
// storage_offline: check начинает падать → runner.paused, controller.aborted, db закрыта; check снова ok → quick_check, задача pending с причиной storage_unavailable
// 09 §5 п.9: попытка 1 жива, задача захвачена попыткой 2 → publish попытки 1 → fenced_out (повтор Task 11 на уровне раннера)
```

- [ ] **Step 2: e2e `kill9.e2e.test.ts` (`make e2e`):** дочерний `node` запускает `bootCore` и задачу, чей обработчик стартует `orphan-render.sh` через `spawnTracked`; тест шлёт `kill -9` родителю → новый `bootCore` в том же `tmp`-хранилище берёт owner-lock (ядро сняло `fcntl`), `recovery.requeued` содержит задачу, внук мёртв; второй `bootCore` при живом первом → `owner_busy`.
- [ ] **Step 3–4:** FAIL → реализовать → PASS. CLI `generate` из среза переходит на `bootCore({ kind: "cli" })` + одна задача `playground.generate` в процессе (поведение и вывод CLI прежние).
- [ ] **Step 5:** `./check`; `make e2e` (только `kill9`); коммит `feat(motion-studio): изоляция попыток и восстановление задач`.

### Task 14: StyleBible-система и хореография движения motion-kit (P1-07 → v0.2, часть 1)

**Files:**
- Create: `app/motion-studio/render/src/motion-kit/style/{resolve.ts,contrast.ts,type-scale.ts,intensity.ts}`
- Create: `app/motion-studio/render/src/motion-kit/choreo/{enter.ts,stagger.ts,camera.ts,safe-area.ts,layout.ts}`, `app/motion-studio/render/src/motion-kit/components/{Camera,Parallax,SafeArea,Enter}.tsx`
- Modify: `app/motion-studio/render/src/motion-kit/{index.ts,presets.ts,API.md,PROVENANCE.md}`, `app/motion-studio/render/src/motion-kit/components/{Card,FlowGraph,KineticText,Background}.tsx` (читают `depth`, `amplitude`, типошкалу из `useStyle()`)
- Modify: `app/motion-studio/contracts/src/motion-spec.ts` — `Element.entrance` += `"mask" | "blur" | "pop" | "type"`; `Element.depth_layer?: 0 | 1 | 2`; `MotionSpec.camera?: { frame: number; scale: number; x: number; y: number }[]`
- Create: `app/motion-studio/render/test/fixtures/choreo-gallery/src/Scene.tsx`
- Test: `app/motion-studio/render/test/kit/{resolve,contrast,type-scale,enter,stagger,camera,layout,presets}.test.ts`, `app/motion-studio/render/test/kit/choreo.e2e.test.ts`

**Interfaces:**
- Consumes: `StyleBibleSchema`, `Settings`, `Beat` (Task 3); `presets`, `StyleProvider`, `useStyle`, `useBeat`, `beatProgress` (Task 6); `renderVersion`, `probeGate` (Task 4); `checkSceneSource` (Task 5)
- Produces (`@ms/motion-kit`, версия `0.2.0`):
  - `type ResolvedStyle = StyleBible & { amplitude: number; depth: 0 | 1 | 2 | 3; transparent: boolean }`
  - `resolveStyle(input: { preset: StylePreset; palette_overrides?: Record<string, string>; font?: string; intensity: Intensity; depth?: 0 | 1 | 2 | 3; transparent?: boolean; safe_area?: { x: number; y: number } }): ResolvedStyle` — интенсивность: `calm` — кадры `enter/exit/stagger × 1.25` (round), `amplitude 0.6`; `balanced` — `× 1`, `1.0`; `energetic` — `× 0.75`, `1.35`; `palette_overrides` только по известным ключам палитры
  - `contrastRatio(fg: string, bg: string): number` (WCAG 2.x); `relativeLuminance(hex: string): number`
  - `typeSize(style: ResolvedStyle, level: "display" | "h1" | "h2" | "body" | "caption", frameHeight: number): number` — доли высоты кадра `0.11 / 0.075 / 0.055 / 0.042 / 0.03`, `round`
  - `enterStyle(kind: EnterKind, p: number, o: { amplitude: number; distancePx: number; direction?: "up" | "down" | "left" | "right" }): React.CSSProperties` — `fade`: только `opacity`; `rise`: `translateY((1-p)·distance·amp)` + opacity; `scale`: `scale(0.92 + 0.08p)` при `amp=1`; `mask`: `clipPath inset`; `blur`: `filter blur((1-p)·12·amp px)`; `pop`: spring с overshoot из `style.motion.spring.pop`; `type`/`count`/`draw` — `{}` (обрабатывает компонент)
  - `<Enter kind beat index? total?>` — обёртка: stagger + `enterStyle` + easing `style.motion.easing.enter`; выход — `easing.exit` за `exit_frames` до конца бита, если `phase === "exit"`
  - `staggerBeat(beat: Pick<Beat, "start_frame" | "end_frame">, index: number, total: number, staggerFrames: number): Pick<Beat, "start_frame" | "end_frame">`
  - `cameraAt(frame: number, keys: { frame: number; scale: number; x: number; y: number }[], style: ResolvedStyle): { scale: number; x: number; y: number }` — интерполяция с `easing.emphasis`, `scale ≤ camera.max_scale`, `allow_zoom = false` ⇒ `scale = 1`; `<Camera keys>`; `<Parallax layer={0|1|2}>` — сдвиг слоя `× (1 + 0.15·layer)` от движения камеры, только при `camera.parallax`
  - `safeRect(settings: Pick<Settings, "width" | "height" | "safe_area">): { x: number; y: number; w: number; h: number }`; `<SafeArea>`; `useSafeArea()`
  - `gridColumns(style, rect, n): { x: number; w: number }[]`
  - `layoutLayered(nodes: { id: string; w: number; h: number }[], edges: { from: string; to: string }[], rect: Rect, gap: { x: number; y: number }): Record<string, Rect>` — слои по топологическому порядку слева направо, внутри слоя — по центру вертикали; без пересечений
- Пресеты: для всех трёх `contrastRatio(text, bg) ≥ 7`, `contrastRatio(muted, bg) ≥ 4.5`, `contrastRatio(accent[0], bg) ≥ 3`; `motion.spring.pop` с `damping` 12, `stiffness` 180, `mass` 0.8 (overshoot осознанный, ТЗ §8.2).

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
const base = presets["dark-premium"].motion;
expect(resolveStyle({ preset: "dark-premium", intensity: "calm" }).motion.enter_frames).toBe(Math.round(base.enter_frames * 1.25));
expect(resolveStyle({ preset: "dark-premium", intensity: "energetic" }).amplitude).toBe(1.35);
expect(resolveStyle({ preset: "dark-premium", intensity: "balanced", palette_overrides: { accent0: "#9B5CFF" } }).palette.accent[0]).toBe("#9B5CFF");
expect(() => resolveStyle({ preset: "dark-premium", intensity: "balanced", palette_overrides: { nope: "#000" } })).toThrow(/nope/);
expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
for (const p of Object.values(presets)) expect(contrastRatio(p.palette.text, p.palette.bg)).toBeGreaterThanOrEqual(7);
expect(typeSize(st, "body", 1080)).toBe(45); expect(typeSize(st, "display", 1080)).toBe(119);
expect(enterStyle("fade", 0.5, { amplitude: 1, distancePx: 40 })).toEqual({ opacity: 0.5 });
expect(enterStyle("rise", 0, { amplitude: 1, distancePx: 40 }).transform).toBe("translateY(40px)");
expect(staggerBeat({ start_frame: 0, end_frame: 30 }, 2, 4, 4)).toEqual({ start_frame: 8, end_frame: 30 });
expect(cameraAt(90, [{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 90, scale: 1.3, x: 0, y: 0 }], { ...st, camera: { allow_zoom: true, max_scale: 1.15, parallax: true } }).scale).toBe(1.15);
expect(safeRect({ width: 1920, height: 1080, safe_area: { x: 0.05, y: 0.05 } })).toEqual({ x: 96, y: 54, w: 1728, h: 972 });
const l = layoutLayered(agentNodes /* user, orch, tool1..3 */, agentEdges, safeRect(s1080), { x: 120, y: 48 });
expect(noOverlaps(Object.values(l))).toBe(true); expect(allInside(Object.values(l), safeRect(s1080))).toBe(true);
expect(l.tool1.x).toBe(l.tool3.x); expect(l.user.x).toBeLessThan(l.orch.x);
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать**; `checkSceneSource` на файлах kit возвращает `[]`; `API.md` — разделы «Стиль», «Входы», «Камера», «Safe area», «Раскладка» с правилом: соседние элементы — разные `kind` или сдвиг ≥ `stagger_frames`.
- [ ] **Step 4: Галерея `choreo-gallery` (e2e):** 1920×1080, 180 кадров, шесть элементов с разными входами (`rise`, `mask`, `blur`, `pop`, `type`, `draw`), медленный push-in камеры до 1.08, параллакс двух слоёв, `depth` 0→3 у четырёх карточек. Тест: `renderVersion` ok; кадры `[0, 12, 24, 45, 90, 179]`; `probeGate` пуст; попарные разности кадров 12/24 в областях элементов > 0 (разные фазы входа); повторный рендер — те же sha256.
- [ ] **Step 5: Просмотр кадров глазами** (Read PNG): входы различимы, нет одинакового fade, камера плавная, тени растут с `depth`, текст в safe area. Кадры — `docs/evidence/phase-1/kit-v0.2/choreo/`; итог — в `PROVENANCE.md` (`rendered: ok | issues`).
- [ ] **Step 6:** `./check`; `make e2e`; коммит `feat(motion-studio): StyleBible-система и хореография motion-kit`.

### Task 15: motion-kit v0.2 — примитивы паттернов ТЗ §8.4 (P1-07 → v0.2, часть 2)

**Files:**
- Create: `app/motion-studio/render/src/motion-kit/components/{BarChart,AreaChart,ComparisonSplit,Timeline,ProcessSteps,Callout,Highlight,CodeBlock,Particles}.tsx`
- Create: `app/motion-studio/render/src/motion-kit/{ticks.ts,bars.ts,code-tokens.ts,timeline-layout.ts}`
- Modify: `app/motion-studio/render/src/motion-kit/{index.ts,API.md,PROVENANCE.md}`
- Create: `app/motion-studio/render/test/fixtures/patterns-gallery/{comparison,timeline,process,code,emphasis}/src/Scene.tsx`
- Test: `app/motion-studio/render/test/kit/{ticks,bars,code-tokens,timeline-layout,provenance}.test.ts`, `app/motion-studio/render/test/kit/patterns.e2e.test.ts`

**Interfaces:**
- Consumes: всё из Task 14; `KnowledgeAdapter` (Task 8) — только в `provenance.test.ts`
- Produces (`@ms/motion-kit`):
  - `niceTicks(min: number, max: number, count: number): number[]`
  - `barLayout(values: number[], rect: Rect, gapRatio: number): Rect[]` — высота пропорциональна значению, базовая линия общая
  - `tokenizeCode(src: string, lang: "ts" | "py" | "json" | "bash"): { text: string; kind: "kw" | "str" | "num" | "com" | "id" | "punct" | "ws" }[]` — простой лексер без зависимостей; `typedTokens(tokens, p: number): typeof tokens` — по токенам, не по буквам
  - `timelineLayout(n: number, rect: Rect, orientation: "h" | "v"): { x: number; y: number }[]`
  - Компоненты (props — в `API.md`): `BarChart { bars: { label; value }[]; beat; highlight?: number; locale }` — рост с stagger и подписями `AnimatedNumber`; `AreaChart` (расширение `LineChart`: заливка с маской); `ComparisonSplit { left; right; beat; divider: "vs" | "line" }` — встречные входы; `Timeline { items: { label; date }[]; beat; orientation }` — рисование оси + вехи с `pop`; `ProcessSteps { steps: string[]; beat; connector: "arrow" | "line" }` — номера, коннекторы `draw`; `Callout { target: Rect; label; beat }` — линия-указатель + кольцо; `Highlight { children; beat; mode: "marker" | "underline" | "glow" }` — для key-point-emphasis; `CodeBlock { code; lang; beat; highlightLines?: number[] }` — набор по токенам, моноширинный шрифт из StyleBible; `Particles { count; seed; beat; layer }` — только `random(seed)`, слой глубины
- `PROVENANCE.md`: строка на каждый компонент: `kb_id` (существующий в `knowledge/capabilities.jsonl` или `own`), repo, commit из `knowledge/repositories.json`, лицензия, что взято, `rendered`. Код из restricted/unknown не копируется.

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
expect(niceTicks(0, 1_000_000, 5)).toEqual([0, 200_000, 400_000, 600_000, 800_000, 1_000_000]);
expect(niceTicks(0, 7, 4)).toEqual([0, 2, 4, 6, 8]);
const bars = barLayout([10, 40, 100], { x: 0, y: 0, w: 300, h: 100 }, 0.25);
expect(bars.map(b => b.h)).toEqual([10, 40, 100]); expect(new Set(bars.map(b => b.y + b.h)).size).toBe(1);
expect(tokenizeCode("const x = 42; // hi", "ts").map(t => t.kind)).toEqual(["kw", "ws", "id", "ws", "punct", "ws", "num", "punct", "ws", "com"]);
expect(typedTokens(tokenizeCode("a b", "ts"), 0.34).map(t => t.text).join("")).toBe("a");
expect(timelineLayout(3, { x: 0, y: 0, w: 1000, h: 100 }, "h").map(p => p.x)).toEqual([0, 500, 1000]);
// provenance.test.ts: каждый экспорт components/* есть в PROVENANCE.md; kb_id ∈ KB или "own"; license_class === "permissive"; commit === repositories.json
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать**; `checkSceneSource` на kit — `[]`.
- [ ] **Step 4: e2e галереи паттернов:** пять сцен 1920×1080 по 150 кадров (сравнение «Было / Стало», таймлайн из 4 вех, процесс из 4 шагов, код 8 строк TS, акцент «главная мысль» с `Highlight`), подписи на кириллице; для каждой — `renderVersion` ok, кадры `[0, 30, 75, 120, 149]`, `probeGate` пуст, кадры 30 и 120 различаются.
- [ ] **Step 5: Просмотр кадров глазами;** кадры — `docs/evidence/phase-1/kit-v0.2/patterns/`; `rendered` в `PROVENANCE.md`.
- [ ] **Step 6:** `./check`; `make e2e`; коммит `feat(motion-studio): примитивы паттернов motion-kit v0.2`.

### Task 16: Технический и визуальный QA по реальным кадрам

**Files:**
- Create: `app/motion-studio/server/src/qa/{frames.ts,image.ts,programmatic.ts,spec-checks.ts,visual-agent.ts,report.ts}`
- Create: `app/motion-studio/prompts/visual-qa.md`
- Create: `app/motion-studio/server/test/fixtures/qa-scenes/{clipped-text,blank,frozen,uniform-fade}/{src/Scene.tsx,props.json,settings.json,spec.json}`
- Test: `app/motion-studio/server/test/qa/{frames,image,programmatic,spec-checks,report}.test.ts`, `app/motion-studio/server/test/qa/qa.e2e.test.ts`

**Interfaces:**
- Consumes: `MotionSpec`, `Settings`, `QAReport`, `QAIssue`, `VisualQAOutputSchema` (Task 3, 11); `ResolvedStyle`, `resolveStyle`, `contrastRatio`, `safeRect` (Task 14); `RenderResult`, `renderVersion`, `probeGate` (Task 4); `AgentRuntimeAdapter`, `AppConfig` (Task 7)
- Produces:
  - `selectQaFrames(spec: MotionSpec): number[]` — вход первого бита `min(b0.end_frame, b0.start_frame + 15)`, середины битов `floor((s+e)/2)`, конец бита с элементом `role = "emphasis"` минус 1, последний кадр `duration_frames - 1`; уникальные, по возрастанию, не более 8 (лишние середины прореживаются равномерно)
  - `loadPng(path: string): Promise<Img>`; `Img = { width: number; height: number; data: Uint8Array /* RGBA */ }`
  - `lumaStats(img): { mean: number; std: number }` (относительная яркость 0..1); `frameDelta(a: Img, b: Img): number` (средняя абсолютная разница 0..1); `backgroundEstimate(img): [r, g, b]` (медиана четырёх угловых патчей 8×8); `inkFraction(img, region: Rect, bg, threshold: 0.12): number`
  - `programmaticChecks(input: { frames: { frame: number; path: string }[]; spec: MotionSpec; settings: Settings; style: ResolvedStyle; render: RenderResult; previewBytes: number }): Promise<QAIssue[]>` — коды и пороги:
    - `blank` (blocking): `std < 0.01` на кадре внутри бита;
    - `frozen` (warning): соседние QA-кадры из разных битов `frameDelta < 0.002`; все кадры попарно `< 0.002` — blocking;
    - `clipping` (blocking): `inkFraction` полосы 2 px по краю кадра > 0.01;
    - `safe_area` (warning): `inkFraction` поля вне `safeRect` > 0.005;
    - `contrast` (blocking): `contrastRatio(text, bg) < 4.5` или `muted` < 3 по разрешённой палитре;
    - `network` (blocking): строка `browserLogs` с `net::`/`http://`/`https://`; `console_error` (warning) — иные ошибки консоли;
    - `preview_size` (blocking): 0 байт; (warning) > 50 МБ
  - `specChecks(spec: MotionSpec, settings: Settings): QAIssue[]` — `uniform_entrance`: ≥ 3 элементов и у всех один `entrance` → blocking, один вид у > 60 % → warning; `overlap`: пересечение `layout` элементов одного уровня > 1 % площади кадра → blocking; `outside_safe_area`: `layout` вне safe area → warning; `no_emphasis`: нет элемента `role = "emphasis"` и нет бита с `action` содержащим `emphasis`/`accent` → warning
  - `runVisualQA(input: { workdir: string; frames: number[]; spec; style; brief; runRef; signal }, deps: { agents: AgentRuntimeAdapter; config: AppConfig }): Promise<AgentResult<VisualQAOutput>>` — роль `visual_qa`, `tools: ["Read"]`, cwd = draft; в `qa/` draft-каталога кладутся `frames/*.png`, `spec.json`, `style.json`, `brief.json`, `checklist.md`
  - `mergeQA(parts: { technical: QAIssue[]; programmatic: QAIssue[]; agent?: VisualQAOutput }): QAReport` — `technical`: `fail` при blocking technical, иначе `pass`; `visual`: худшее из programmatic и агента; `semantic`/`style` — от агента или `not_checked`; `automated: true`
  - `qaBlocks(report: QAReport): boolean` — есть blocking или любой gate `fail`
  - `fixHints(report: QAReport): string` — текст для Engineer: код, кадр, область, `fix_hint`
- `prompts/visual-qa.md`: чек-лист по ТЗ §8.1–8.5 и `06` §6 — иерархия, одна мысль, обрезка и safe area, перекрытия, контраст, размер текста, разные входы, ритм битов по кадрам, соответствие смыслу запроса и стилю; для каждого числа и подписи — OCR в `ocr[]`; только наблюдения по кадрам, без догадок о коде.

- [ ] **Step 1: Юнит-тесты (падают)** на синтетических PNG 192×108 (`pngjs`):

```ts
expect(selectQaFrames(spec162 /* биты [0,25],[20,125],[125,162] */)).toEqual([12, 15, 72, 143, 161]);
expect(selectQaFrames(specWithEmphasis /* 180, emphasis-бит [150,180] */)).toContain(179);
expect(selectQaFrames(spec20beats).length).toBeLessThanOrEqual(8);
expect((await lumaStats(solid("#000000"))).std).toBeLessThan(0.01);
expect(issues(await programmaticChecks(withFrames([solid("#101010")])))).toContain("blank");
expect(issues(await programmaticChecks(withFrames([rectTouchingRightEdge])))).toContain("clipping");
expect(issues(await programmaticChecks(withFrames([same, same], { beats: 2 })))).toContain("frozen");
expect(issues(await programmaticChecks(withLogs(["Failed to load https://cdn.x/y.png net::ERR"])))).toContain("network");
expect(specChecks(specAll("fade", 4), s).map(i => [i.code, i.severity])).toContainEqual(["uniform_entrance", "blocking"]);
expect(specChecks(specOverlapping, s).map(i => i.code)).toContain("overlap");
expect(mergeQA({ technical: [], programmatic: [warn("safe_area")], agent: agentPass }).gate).toEqual({ technical: "pass", visual: "warn", semantic: "pass", style: "pass" });
expect(qaBlocks(mergeQA({ technical: [], programmatic: [block("clipping")] }))).toBe(true);
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать.**
- [ ] **Step 4: e2e (`make e2e`):** фикстуры рендерятся реально (`renderVersion`), затем QA: `clipped-text` → `clipping`; `blank` → `blank`; `frozen` → `frozen` blocking; `uniform-fade` → `uniform_entrance` blocking. Visual QA агент (реальный `claude`, модель `sonnet`) на кадрах `kit-gallery`: `status: "completed"`, `checked_frames` ⊆ переданных, `ocr` содержит «Рост пользователей»; на `clipped-text`: `gate.visual !== "pass"`. Стоимость — в отчёт задачи.
- [ ] **Step 5:** `./check`; коммит `feat(motion-studio): технический и визуальный QA по кадрам`.

### Task 17: Пайплайн `playground.generate` с ролями Concept, Motion Director, Engineer (P1-10, P1-12)

**Files:**
- Create: `app/motion-studio/prompts/{concept.md,partials/quality-rubric.md,partials/scene-contract.md}`
- Modify: `app/motion-studio/prompts/{motion-director.md,engineer.md}` (переписываются под v0.2 и рубрику качества)
- Create: `app/motion-studio/server/src/agents/prompts.ts`
- Create: `app/motion-studio/server/src/pipeline/{playground-generate.ts,steps.ts,fix-loop.ts,kb-select.ts,provenance.ts,record.ts}`
- Modify: `app/motion-studio/server/src/pipeline/generate.ts` (срез: `generateScene` становится обёрткой над шагами), `app/motion-studio/server/src/jobs/handlers.ts`
- Test: `app/motion-studio/server/test/agents/prompts.test.ts`, `app/motion-studio/server/test/pipeline/{playground-generate,fix-loop,kb-select,provenance,checkpoints}.test.ts`, `app/motion-studio/server/test/pipeline/concept.e2e.test.ts`, `app/motion-studio/server/test/pipeline/generate-job.e2e.test.ts`

**Interfaces:**
- Consumes: `bootCore`, `Core`, `JobHandler`, `JobContext`, `finish`, `SceneRepo.publish` (Task 11–13); `selectQaFrames`, `programmaticChecks`, `specChecks`, `runVisualQA`, `mergeQA`, `qaBlocks`, `fixHints` (Task 16); `resolveStyle` (Task 14); `KnowledgeAdapter.search/getVisualPatterns/copyRefs` (Task 8); `prepareRefs`, `canSpend` (Task 10); `checkSceneSource`, `typecheckVersion` (Task 5); `renderVersion`, `probeGate`, `ffprobe` (Task 4); `ConceptOutputSchema`, `DirectorOutputSchema`, `EngineerReportSchema`, `ScenePropsBaseSchema` (Task 3, 11)
- Produces:
  - `loadPrompt(role: Role): string` — подставляет `{{> quality-rubric}}`, `{{> scene-contract}}`; неизвестный partial — ошибка
  - `buildConceptTask(i: { prompt: string; settings: Settings; answers?: Record<string, string> }, run): AgentTask<ConceptInput>` — вход: запрос, настройки, 12 паттернов с однострочным описанием из `knowledge/patterns/README.md`
  - `buildDirectorTask(i: { prompt; settings; concept: ConceptOutput; candidates: CapabilityView[]; patternTexts: string[]; kitApi: string; style: ResolvedStyle; base?: { spec: MotionSpec; props: unknown }; editPlan?: EditPlan }, run): AgentTask<…>`
  - `buildEngineerTask(i: { draftDir: string; fix?: string }, run): AgentTask<…>` — `tools: ["Read","Write","Edit","Glob","Grep"]`, `permission-mode acceptEdits`
  - `selectCandidates(kb: KnowledgeAdapter, prompt: string, concept: ConceptOutput, limit = 12): SearchHit[]` — объединение `kb.search` по запросу и всем `kb_queries.ru/en` с `patterns` из Concept; дедуп по `id` с максимальным `score`; фильтры по умолчанию (permissive, native/adaptable)
  - `provenanceGate(report: EngineerReport, refs: KnowledgeRef[], kb: KnowledgeAdapter, allowRestricted: boolean): QAIssue[]` — `kb_ids_used` вне `knowledge-refs.json` → blocking `provenance`; `license_class !== "permissive"` без разрешения → blocking `license`
  - `playgroundGenerate: JobHandler` — вход `{ sceneId: string; prompt: string; settings: Settings; allowRestricted?: boolean }`; порядок: storage → Concept (если `needs_clarification` не пуст и нет `answers` → `awaiting_input`, вопросы — сообщения `system` в чате) → `selectCandidates` → Motion Director → `createDraft(<jobId>-a<attempt>)` → `spec.json`, `settings.json`, `style.json` (`resolveStyle`), `knowledge-refs.json` → `prepareRefs` → Engineer → технический gate (`check`, `typecheck`, `provenanceGate`, `ScenePropsBaseSchema.parse(props.json)`, `render` со `stills = selectQaFrames(spec)`, `probeGate`) → `programmaticChecks` + `specChecks` + `runVisualQA` → `qaBlocks` ⇒ Engineer с `fixHints`; один счётчик исправлений `maxAutoFixes` (2) на технический gate и QA → `repo.publish` (`ready` или `failed`) → `record`
  - `recordRun(db, jobId, parts)` — `agent_runs` (модель из `modelUsage`, стоимость, токены, `permission_denials`), `render_jobs`, `qa_reports`, `knowledge_refs`, `component_tests` (`rendered-ok` для `kb_id` с `strategy ∈ {reuse, adapt}` в `ready`-версии, `rendered-failed` — в `failed`), сообщение `assistant` в чат: номер версии, концепция, использованные компоненты, итог QA
  - Чекпоинты: результаты Concept и Director пишутся в `jobs.output_refs_json.steps.{concept,director} = { input_hash, path }` (`workspace/agent-runs/<run>/output.json`); новая попытка с тем же `input_hash` переиспользует их (`04` §6)
- Промпты (ТЗ §8, `06` §3, official skills, API motion-kit v0.2; без ссылок на устаревший `aiplatform/motion`):
  - `quality-rubric.md` (общий для Director, Engineer, Visual QA): одна главная мысль; не больше трёх уровней иерархии; размеры текста только из `typeSize` (body ≥ 4 % высоты); всё в safe area; у соседних элементов разные входы или сдвиг ≥ `stagger_frames`; никаких одинаковых fade-in; движение — easing/spring из StyleBible, `linear` только для прогресса рисования; ключевая информация держится ≥ 20 % длительности; в последних 15 % — выход или успокоение; камера — не больше одного плавного движения, `scale ≤ camera.max_scale`, только если помогает смыслу; глубина — `depth`/`elevation` и слои параллакса; акцентный цвет — у одного объекта в момент времени.
  - `scene-contract.md`: `props.json` проходит `ScenePropsBaseSchema`; тайминги битов только из `props.timing`, стиль только через `resolveStyle(props.style)` и `<StyleProvider>`; при `props.style.transparent` — без фона на корне; импорт только из allowlist; предпочитать motion-kit; код из `refs/kb` — адаптировать на кадры.
  - `concept.md`: уточнять только то, без чего сцену не сделать; иначе — defaults настроек; RU и EN ключи поиска; 1–3 паттерна.
  - `motion-director.md`: spec с битами, `entrance` для каждого элемента, `layout` в долях кадра без пересечений, `camera` по необходимости, выбор компонентов только из кандидатов с обоснованием и стратегией.

- [ ] **Step 1: Юнит-тесты (падают),** фейковые агенты и рендер — только логика:

```ts
expect(loadPrompt("engineer")).toContain("ScenePropsBaseSchema"); expect(loadPrompt("engineer")).not.toContain("{{>");
for (const f of globSync("prompts/**/*.md")) expect(readFileSync(f, "utf8")).not.toMatch(/aiplatform|ai-platform\/.*motion/);
expect(selectCandidates(kb, test2Prompt, conceptT2).map(h => h.view.id)).toContain("magicui/animated-beam");
// Concept просит уточнение → awaiting_input, вопрос в чате; provideInput("skip") → pending → completed
// технический gate 1 раз fail + QA 1 раз blocking → Engineer вызван 3 раза, версия ready
// tech fail × 3 → Engineer 3 вызова, версия failed, не current
// бюджет: Concept 0.5 + Director 2 + Engineer 2 + QA 0.6 = 5.1 → следующий вызов не делается, failure.stage "budget"
// Engineer использует kb_id вне knowledge-refs → blocking "provenance" → исправление
// чекпоинт: задача прервана после Director → новая попытка: Concept и Director не вызываются, Engineer вызывается
// устаревшая попытка (attempt 1) публикует после захвата попыткой 2 → fenced_out, версий 0, draft .quarantined
// record: agent_runs 4 строки, render_jobs ≥ 1, qa_reports 1, component_tests для adapt-записей
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать.** CLI `generate` из среза работает через этот обработчик.
- [ ] **Step 4: e2e Concept (`make e2e`):** реальный `claude` (`sonnet`): Test 1 → `patterns` пересекается с `["growth-decline","quantities"]`, `needs_clarification` пуст; Test 2 → содержит `system-structure`; англоязычный «Animated architecture of an AI agent with light pulses» → `kb_queries.ru` не пуст.
- [ ] **Step 5: e2e задачи (`make e2e`)** на `MS_DATA_DIR="/Volumes/External SSD/MotionStudio"`: `bootCore` + `enqueue("playground.generate")` с промптами Test 1 и Test 2 дословно → `completed`, версия `ready`; проверки [A] из `09` §2–3:

```ts
expect(m.knowledge_refs.length).toBeGreaterThan(0); expect(m.qa.technical).toBe("pass");
// Test 1
expect(spec.beats.some(b => /chart|graph|график/i.test(b.action))).toBe(true);
expect(mean(await Promise.all(frames.map(f => lumaStats(f).then(s => s.mean))))).toBeLessThan(0.25);
expect(ocrTexts(qa, firstNumberFrame)).toContainEqual(expect.stringMatching(/10\s?000/));
expect(ocrTexts(qa, lastFrame)).toContainEqual(expect.stringMatching(/1\s?000\s?000/));
// Test 2
expect(spec.elements.filter(e => e.kind === "card" || e.role.startsWith("node")).length).toBeGreaterThanOrEqual(5);
expect(specChecks(spec, settings).filter(i => i.code === "overlap")).toEqual([]);
expect(refs.some(r => kb.getCapability(r.kb_id)!.patterns.includes("system-structure"))).toBe(true);
```

- [ ] **Step 6: Просмотр кадров глазами** обеих сцен по рубрике качества; замечания — конкретно (кадр, элемент, что не так) в отчёт задачи; если сцена проходит gate, но визуально слабая — правка промптов и повтор (не более 2 итераций в задаче, остальное — в отчёт). Evidence — `docs/evidence/phase-1/pipeline/{test1,test2}/`.
- [ ] **Step 7:** `./check`; коммит `feat(motion-studio): пайплайн playground.generate`.

### Task 18: Пайплайн `playground.edit`, восстановление и сравнение версий (P1-13)

**Files:**
- Create: `app/motion-studio/prompts/edit-planner.md`
- Create: `app/motion-studio/server/src/pipeline/{playground-edit.ts,scene-restore.ts,history.ts,param-edit.ts,preserve.ts}`
- Modify: `app/motion-studio/server/src/agents/prompts.ts` (`buildEditPlannerTask`), `app/motion-studio/server/src/jobs/handlers.ts`
- Test: `app/motion-studio/server/test/pipeline/{param-edit,preserve,history,playground-edit,scene-restore}.test.ts`, `app/motion-studio/server/test/pipeline/edit.e2e.test.ts`

**Interfaces:**
- Consumes: `EditPlanSchema`, `scaleTiming`, `ScenePropsBaseSchema` (Task 11); `SceneRepo.publish/restore/diff` (Task 11); `JobHandler` (Task 12); шаги, `recordRun`, QA и fix-loop из Task 16–17; `resolveStyle` (Task 14)
- Produces:
  - `versionHistoryDigest(db, sceneId): HistoryEntry[]`; `HistoryEntry = { version_id; number; status; parent_version_id?; prompt; palette: Record<string, string> /* resolved */; depth; duration_frames; qa: QAReport["gate"]; created_at }`
  - `buildEditPlannerTask(i: { message: string; current: { version_id; spec; props }; history: HistoryEntry[] }, run)` — роль `edit_planner`, без инструментов; правило в промпте: «медленнее на N %» → `timing_scale = 1/(1 − N/100)`, «быстрее на N %» → `1/(1 + N/100)`; «первая версия» → `number = 1` (если `failed` — первая `ready`, с пояснением в `reply`)
  - `applyParamEdit(base: { spec: MotionSpec; props: ScenePropsBase }, plan: EditPlan, history: HistoryEntry[]): { spec: MotionSpec; props: ScenePropsBase; changed: string[] }` — `timing_scale` → `scaleTiming` для `spec` и `props.timing`; `borrow palette` → `props.style.preset` и `palette_overrides` = разрешённая палитра версии-донора; `param_patch.style.depth` и пр.
  - `checkPreserve(base: MotionSpec, next: MotionSpec, baseProps, nextProps, preserve: EditPlan["preserve"], tol = 0.02): QAIssue[]` — `composition`: `layout.x/y` элементов с тем же `id` ± 2 % кадра (blocking `composition_changed`); `palette`: токены равны; `text`: `content` текстовых элементов равен
  - `playgroundEdit: JobHandler` — вход `{ sceneId; messageId; baseVersionId? /* по умолчанию current */ }`; Edit Planner → `path = "param"`: `applyParamEdit` в draft-копии базы (без Engineer) → render → QA; иначе Motion Director (база + план) → Engineer (правит копию `src/` базы) → gate → QA; в обоих случаях `checkPreserve`; публикация с `parent_version_id = base`, `edit_plan`, `changed_files`; ответ `reply` в чат
  - `sceneRestore: JobHandler` — вход `{ sceneId; versionId }` → `repo.restore` без LLM и без рендера, если `render_env.render_lock_sha256` совпадает с текущим; иначе — повторный рендер копии и пометка в manifest
- Сравнение (`repo.diff`) — без задачи, синхронно через API (Task 20).

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
const r = applyParamEdit({ spec: spec180, props: props180 }, plan({ path: "param", timing_scale: 1 / 0.75, borrow: [{ from_version_id: v1.id, what: "palette" }], param_patch: { style: { depth: 2 } } }), history);
expect(r.spec.duration_frames).toBe(240); expect(r.props.timing.duration_frames).toBe(240);
expect(r.props.style.palette_overrides).toEqual(history[0].palette); expect(r.props.style.depth).toBe(2);
expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.03 }), p, p, ["composition"])[0]).toMatchObject({ code: "composition_changed", severity: "blocking" });
expect(checkPreserve(spec180, moved(spec180, "orch", { x: +0.015 }), p, p, ["composition"])).toEqual([]);
// path "param" → Engineer не вызывается, рендер вызывается 1 раз
// path "code" → Director и Engineer получают базу = указанная версия, не current
// восстановление: v3 с parent v1, current = v3, versions 3 → 4 строки истории не потеряны
// правка при failed v1: «палитра из первой версии» → берётся первая ready, reply объясняет
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS.
- [ ] **Step 4: e2e (`make e2e`),** реальные модели: сцена из Test 2 (Task 17) → правка «сделай всё в фиолетовых тонах» → v2 → промпт Test 3 дословно → v3. Проверки [A] `09` §4:

```ts
expect(v3.manifest.parent_version_id).toBe(v2.versionId);
expect(Math.abs(v3.spec.duration_frames - Math.round(v2.spec.duration_frames / 0.75))).toBeLessThanOrEqual(1);
v3.spec.beats.forEach((b, i) => expect(Math.abs(b.end_frame - Math.round(v2.spec.beats[i].end_frame / 0.75))).toBeLessThanOrEqual(1));
expect(resolved(v3).palette).toEqual(resolved(v1).palette);
expect(depthOrMaxElevation(v3)).toBeGreaterThan(depthOrMaxElevation(v2));
expect(checkPreserve(v2.spec, v3.spec, v2.props, v3.props, ["composition"])).toEqual([]);
expect(v3.manifest.qa.technical).toBe("pass");
for (const v of [v1, v2]) expect((await readVersion(v.dir)).files.length).toBeGreaterThan(0);
```

- [ ] **Step 5:** просмотр кадров hold v2/v3 рядом (композиция, тени, палитра); evidence — `docs/evidence/phase-1/pipeline/test3/`; `./check`; коммит `feat(motion-studio): правки через чат и восстановление версий`.

### Task 19: Экспорт сцены — MP4 H.264/AAC и ProRes 4444 с альфой (P1-14)

**Files:**
- Create: `app/motion-studio/render/src/node/{export-version.ts,export-gate.ts,alpha.ts}`
- Modify: `app/motion-studio/render/src/node/{worker.ts,entry.ts,ffprobe.ts}` — режим `export`; fps композиции из запроса; `ProbeResult` += `audioCodec?: string; pixFmt?: string`
- Create: `app/motion-studio/server/src/pipeline/scene-export.ts`; Modify `app/motion-studio/server/src/jobs/handlers.ts`
- Create: `app/motion-studio/render/test/fixtures/transparent-scene/{src/Scene.tsx,props.json,settings.json}`
- Test: `app/motion-studio/render/test/{export-gate,alpha}.test.ts`, `app/motion-studio/render/test/export.e2e.test.ts`, `app/motion-studio/server/test/pipeline/scene-export.test.ts`

**Interfaces:**
- Consumes: `renderVersion`-инфраструктура, `writeEntry`, `contentKey`, `ffprobe` (Task 4); `spawnTracked` + `ProcessRegistry` (Task 13); `ExportRequest`, `ExportManifestSchema`, `scaleTiming`, `ScenePropsBaseSchema` (Task 11); `SceneRepo`, `exports` repo (Task 11); `JobHandler` (Task 12)
- Produces (`@ms/render`):
  - `exportVersion(req: { versionDir: string; settings: Settings; request: ExportRequest; cacheDir: string; outPath: string; timeoutMs: number /* 1_800_000 */; run: RunRef; registry?: ProcessRegistry }, signal?: AbortSignal): Promise<{ ok: boolean; probe?: ProbeResult; error?: { stage: "bundle" | "media" | "probe" | "timeout" | "aborted" | "unsupported"; message: string } }>` — `mp4`: `codec: "h264"`, `crf`, `audioCodec: "aac"`, `enforceAudioTrack: true`, `scale`; `prores4444`: `codec: "prores"`, `proResProfile: "4444"`, `pixelFormat: "yuva444p10le"`, `imageFormat: "png"`, `.mov`; fps ≠ fps версии → props с `scaleTiming(…, fps/oldFps)` и композиция с новым fps (Q3)
  - `exportGate(probe: ProbeResult, request: ExportRequest, settings: Settings): string[]` — пусто = pass: `mp4` → `codec h264`, `audioCodec aac`, размеры `width·scale × height·scale`, fps, длительность ± 1 кадр; `prores4444` → `codec prores`, `pixFmt yuva444p10le`
  - `alphaAtCorner(movPath: string, frame: number): Promise<number>` — `ffmpeg -vf select=eq(n\,<frame>) -frames:v 1 -pix_fmt rgba` → PNG → альфа пикселя (2, 2)
- Produces (server):
  - `sceneExport: JobHandler` — вход `{ versionId; request: ExportRequest }`; `prores4444` при `props.style.transparent !== true` → `failed` с `error.code = "pipeline"`, `stage: "unsupported"`, сообщение «версия сделана с непрозрачным фоном; включите прозрачный экспорт до генерации» (Q4); рендер в `drafts/<job>-a<attempt>/` → `exportGate` (+ `alphaAtCorner === 0` для ProRes) → транзакция с fencing: `renameSync` в `workspace/projects/<p>/exports/<export-id>/scene.{mp4,mov}` + `export-manifest.json`, `chmod -R a-w`, строка `exports`

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
const s = { ...defaultSettings(), duration_frames: 180 };
const ok = { durationMs: 6000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac" };
expect(exportGate(ok, { format: "mp4", crf: 18, scale: 1 }, s)).toEqual([]);
expect(exportGate({ ...ok, audioCodec: undefined }, { format: "mp4", crf: 18, scale: 1 }, s)[0]).toMatch(/audio/);
expect(exportGate({ ...ok, codec: "prores", pixFmt: "yuv422p10le" }, { format: "prores4444", crf: 18, scale: 1 }, s)[0]).toMatch(/yuva444p10le/);
// sceneExport: prores для непрозрачной версии → failed "unsupported", файлов в exports/ нет
// устаревшая попытка → fenced_out, exports/ пуст
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS.
- [ ] **Step 4: e2e (`make e2e`):** версия `kit-gallery` (1920×1080, 30 fps) → `mp4` → `exportGate` пуст, ffprobe: `h264`, `aac`, 1920×1080, 30/1; повторный экспорт той же версии → та же длительность и размеры (`09` §1 п.5); `fps: 60` → длительность прежняя ± 1 кадр, fps 60/1; `transparent-scene` → `prores4444` → `pixFmt yuva444p10le`, `alphaAtCorner(…, 30) === 0`. Время экспорта — в README пакета.
- [ ] **Step 5:** `./check`; коммит `feat(motion-studio): экспорт MP4 и ProRes 4444`.

### Task 20: Control API (Fastify), точка входа сервера, doctor (P1-15, P1-17)

**Files:**
- Create: `app/motion-studio/server/src/api/{app.ts,security.ts,errors.ts,sse.ts,range.ts,dev-vite.ts}`, `app/motion-studio/server/src/api/routes/{health,projects,scenes,versions,chat,jobs,exports,kb,settings,events}.ts`
- Create: `app/motion-studio/server/src/main.ts`
- Modify: `app/motion-studio/server/src/cli/doctor.ts` (полный набор), `app/motion-studio/package.json` (скрипты `dev`, `start`, `build`), `app/motion-studio/README.md` (запуск)
- Test: `app/motion-studio/server/test/api/{security,projects,scenes,versions,jobs,range,sse,storage-offline,kb,settings}.test.ts`, `app/motion-studio/server/test/cli/doctor.test.ts`

**Interfaces:**
- Consumes: `Core`, `bootCore` (Task 13); `enqueue`, `requestCancel`, `provideInput`, `EventBus` (Task 12); `retryJob`, `StorageSupervisor.mode` (Task 13); `SceneRepo` (Task 11); DTO из `contracts/src/api.ts` (Task 11); `KnowledgeAdapter` (Task 8); `loadConfig` (Task 7)
- Produces:
  - `buildApp(core: Core, opts: { port: 8790; webDist?: string; dev?: boolean }): Promise<FastifyInstance>` — `fastify-type-provider-zod`, тело и ответы валидируются схемами `@ms/contracts`
  - Безопасность (`security.ts`, хук `onRequest`): `Host` ∉ {`127.0.0.1:8790`, `localhost:8790`} → 403 `forbidden_host`; метод ∉ {GET, HEAD} и `Origin` ∉ {`http://127.0.0.1:8790`, `http://localhost:8790`} (или отсутствует) → 403 `forbidden_origin`; `storage_offline` → 503 `{ error: "storage_offline", message }` на всё, кроме `GET /api/health`
  - `Idempotency-Key` обязателен на POST, создающих задачи (иначе 400 `idempotency_key_required`); повтор → тот же `job.id`, 200 вместо 202
  - Маршруты (`/api`):
    - `GET /health` → `{ storage: "online" | "storage_offline"; claude: Capability; chrome: Capability; ffmpeg: Capability; owner: { pid; kind } }`
    - `GET /projects`, `POST /projects { title; settings? }`, `GET /projects/:id` (сцены с текущими версиями, последние экспорты)
    - `POST /projects/:id/scenes { prompt; settings; allowRestricted? }` → 202 `{ scene; job }` (`playground.generate`)
    - `GET /scenes/:id` → сцена, версии (`HistoryEntry[]`), активная задача
    - `GET /versions/:id` → manifest, spec, props, settings, qa, knowledge-refs (с `license_class`, `repository_url`, `commit`), `render_env_mismatch: boolean`
    - `GET /versions/:id/preview.mp4`, `GET /versions/:id/frames/:frame.png` — файлы только по id из БД, путь клиента не принимается; `Range` → 206, `Content-Range`, `Accept-Ranges: bytes`
    - `GET /versions/:a/diff/:b` → `VersionDiff`
    - `GET /scenes/:id/messages`, `POST /scenes/:id/messages { text; baseVersionId? }` → 202 `{ message; job }` (`playground.edit`)
    - `POST /scenes/:id/restore { versionId }` → 202 (`scene.restore`)
    - `POST /scenes/:id/render { settingsPatch }` → 202 (`playground.edit` с готовым `EditPlan` `path: "param"`, без Edit Planner) — кнопка Render после смены параметров
    - `POST /versions/:id/exports ExportRequest` → 202; `GET /exports/:id`; `GET /exports/:id/file` (Range, `Content-Disposition: attachment`)
    - `GET /jobs?status=&sceneId=`, `GET /jobs/:id` (с событиями и `processes` для `blocked`), `POST /jobs/:id/cancel`, `POST /jobs/:id/retry` (409 `stale_process_alive` с `pids`, `cmds`), `POST /jobs/:id/input { answers } | { skip: true }`
    - `GET /events?since=<id>` — SSE: `id:`, `event: job`, `data: JobEventDto`; `Last-Event-ID`; комментарий-heartbeat каждые 15 с
    - `GET /kb/search?q=&patterns=&kinds=&allowRestricted=` → `KbHitDto[]` (top 30); `GET /kb/:id` → `CapabilityView` + карточка (markdown)
    - `GET /settings`, `PUT /settings` — `$MS_DATA_DIR/config.json` (модели ролей, лимиты, `defaults: Settings`), валидация `loadConfig`
  - `main.ts`: `bootCore({ kind: "server" })` → `buildApp` → `listen({ host: "127.0.0.1", port: 8790 })`; SIGTERM/SIGINT → `runner.stop({ abortRunning: true })` → закрытие БД → release lock; `--dev` — Vite middleware (Q7), иначе статика `web/dist`
  - `doctor` (полный, `03` §7): Node ≥ 22; `claude --version` и вход (`claude -p` с `--tools ""`, модель `haiku`, стоимость < $0.01); `ffmpeg`/`ffprobe` версии и энкодеры `libx264`, `aac`, `prores_ks`; `KB_ROOT`/`KB_SOURCE_ROOT`; StorageGuard; Chrome Headless Shell; `quick_check` БД; owner-lock свободен; итоговая таблица и код выхода 1 при любой ошибке; `--json`

- [ ] **Step 1: Тесты (падают),** `app.inject`, `Core` на `tmp/` с фейковыми обработчиками задач (только контракт API):

```ts
expect((await inj("POST", "/api/projects", { host: "evil.example:8790" })).statusCode).toBe(403);
expect((await inj("POST", "/api/projects", { origin: "https://evil.example" })).statusCode).toBe(403);
expect((await inj("POST", "/api/projects", { origin: undefined })).statusCode).toBe(403);
expect((await inj("POST", "/api/projects", okHeaders, { title: "Тест" })).statusCode).toBe(201);
expect((await inj("POST", `/api/projects/${p}/scenes`, okHeaders, body)).statusCode).toBe(400);   // нет Idempotency-Key
const a = await inj("POST", `/api/projects/${p}/scenes`, { ...okHeaders, "idempotency-key": "k1" }, body);
const b = await inj("POST", `/api/projects/${p}/scenes`, { ...okHeaders, "idempotency-key": "k1" }, body);
expect([a.statusCode, b.statusCode]).toEqual([202, 200]); expect(b.json().job.id).toBe(a.json().job.id);
const r = await inj("GET", `/api/versions/${v}/preview.mp4`, { range: "bytes=0-99" });
expect(r.statusCode).toBe(206); expect(r.headers["content-range"]).toMatch(/^bytes 0-99\/\d+$/); expect(r.rawPayload.length).toBe(100);
expect((await inj("GET", `/api/versions/${v}/frames/..%2F..%2Fmanifest.json.png`)).statusCode).toBe(404);
storageGoesOffline(); expect((await inj("GET", "/api/projects")).statusCode).toBe(503);
expect((await inj("GET", "/api/health")).json().storage).toBe("storage_offline");
// retry blocked с живым процессом → 409 stale_process_alive, pids
// SSE: подписка since=0 получает события задачи по порядку id; переподключение с Last-Event-ID без дублей
// kb/search?q=счётчик → только permissive; allowRestricted=true → есть restricted с license_class
// PUT /settings с agents.engineer.model "sonnet" → GET возвращает; невалидное → 400 с путём поля
// doctor: фейковый PATH без claude → строка claude "missing", код 1; без MS_DATA_DIR → env_missing
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS.
- [ ] **Step 4: Ручная проверка:** `npm run doctor` на реальном хранилище — всё `ok`; `npm start` → `curl -H 'Host: 127.0.0.1:8790' 127.0.0.1:8790/api/health`; `lsof -iTCP:8790 -sTCP:LISTEN` показывает только `127.0.0.1`.
- [ ] **Step 5:** `./check`; коммит `feat(motion-studio): Control API, точка входа сервера и doctor`.

### Task 21: Web UI Playground на русском (P1-16, Jobs Monitor из P1-17)

**Files:**
- Create: `app/motion-studio/web/{package.json,tsconfig.json,vite.config.ts,index.html,playwright.config.ts}`
- Create: `app/motion-studio/web/src/{main.tsx,App.tsx,router.ts,theme.css}`, `app/motion-studio/web/src/i18n/{ru.ts,index.ts}`, `app/motion-studio/web/src/api/{client.ts,sse.ts,queries.ts}`
- Create: `app/motion-studio/web/src/pages/{Dashboard,Playground,KnowledgeBrowser,JobsMonitor,AppSettings}.tsx`
- Create: `app/motion-studio/web/src/components/{Player,SettingsForm,Chat,VersionHistory,VersionCompare,ComponentsPanel,QAPanel,JobStatus,SceneTimeline,ExportDialog,StorageBanner,ClarifyQuestions}.tsx`
- Modify: `app/motion-studio/package.json` (workspace `web`), `app/motion-studio/Makefile` (`check` включает тесты `web`; `e2e-ui` — Playwright)
- Test: `app/motion-studio/web/test/{i18n,player-math,settings-form,chat,version-compare,qa-panel,components-panel,job-status}.test.tsx`, `app/motion-studio/web/e2e/{dashboard,versions,export,kb,jobs}.spec.ts`, `app/motion-studio/web/e2e/seed.ts`

**Interfaces:**
- Consumes: API и DTO Task 20 (`@ms/contracts`); `SettingsSchema`, `defaultSettings`, `frameToUs` (Task 3); `SceneRepo`, `bootCore` — только в `e2e/seed.ts`
- Produces:
  - `ru: Record<string, string>` (плоские ключи `section.key`), `t(key: keyof typeof ru, params?: Record<string, string | number>): string`
  - `api` — типизированный клиент: `fetch` с `Origin` браузера, `Idempotency-Key = crypto.randomUUID()` на создающие POST; ошибка 503 → `StorageBanner`
  - `useEvents()` — `EventSource('/api/events?since=…')`, инвалидирует запросы TanStack Query по `job_id`/`scene_id`
  - `frameToTime(frame: number, fps: Fps): number = (frame + 0.5) * fps.den / fps.num`; `timeToFrame(t: number, fps: Fps): number = Math.floor(t * fps.num / fps.den)`
  - Экраны (ТЗ §6.2, §11.1):
    - **Dashboard:** проекты, статусы активных задач, последние экспорты, «Новый проект».
    - **Playground:** слева — `Chat` (сообщения пользователя, ассистента и системы; уточняющие вопросы Concept с ответом или «пропустить»), `VersionHistory` (v1…vN, статус, родитель, «Открыть», «Восстановить», «Сравнить»), `ComponentsPanel` (компоненты KB: `kb_id`, repo, commit, лицензия, `license_class`, стратегия; компоненты motion-kit), параметры (`SettingsForm`, ТЗ §6.4), `JobStatus` (этап, прогресс, журнал, cancel/retry; для `blocked` — PID и команда, текст «повтор после завершения процесса»). Справа — `Player` (`<video>` превью: play/pause, seek, шаг ±1 кадр, номер кадра, aspect ratio, FPS, длительность), фон и тема, кнопки «Рендер» (при изменённых параметрах) и «Экспорт» (`ExportDialog`: MP4 / ProRes 4444 — недоступен с подсказкой, если версия непрозрачна; FPS, качество). Снизу — `SceneTimeline`: биты текущей версии, маркеры QA-кадров (клик → seek), полоса версий. `QAPanel`: четыре gate, проблемы с кадром (клик → seek), миниатюры кадров, пометка «автоматическая оценка, решение за вами». `render_env_mismatch` — предупреждение «рендер в другом окружении». Ошибка рендера — ошибка с логами, без превью (ТЗ §11.3).
    - **VersionCompare:** два синхронизированных `<video>` рядом, общий seek; diff `settings`/`props`/`spec` (JSON Pointer, было → стало) и файлов `src/` (unified).
    - **KnowledgeBrowser:** поиск, фильтры паттернов и видов, переключатель «показывать restricted/unknown», бейджи лицензии и совместимости, карточка компонента.
    - **JobsMonitor:** список задач с фильтром статуса, прогресс, ошибка, cancel/retry.
    - **AppSettings:** модели ролей, лимиты, настройки сцены по умолчанию.
  - `e2e/seed.ts`: `seedScene(core, fixtureDirs: string[]): Promise<{ sceneId; versionIds }>` — публикует версии из рукописных фикстур (`kit-gallery`, `choreo-gallery`) с реальным рендером через `renderVersion` и `SceneRepo.publish` (Q8)

- [ ] **Step 1: Юнит-тесты (падают),** Vitest + jsdom + `@testing-library/react`, API — фейковый `fetch` (только UI-логика):

```ts
for (const f of globSync("web/src/**/*.tsx")) expect(stripImports(readFileSync(f, "utf8"))).not.toMatch(/[А-Яа-яЁё]/);
expect(usedKeys("web/src").filter(k => !(k in ru))).toEqual([]);
expect(frameToTime(12, { num: 30, den: 1 })).toBeCloseTo(0.41667, 4);
expect(timeToFrame(frameToTime(179, { num: 30000, den: 1001 }), { num: 30000, den: 1001 })).toBe(179);
// Player: «следующий кадр» на кадре 10 → currentTime = frameToTime(11)
// SettingsForm: fps 0 → сообщение t("settings.errors.fps"); 9:16 → 1080×1920
// Chat: отправка → POST /messages с Idempotency-Key; вопросы Concept показываются с кнопкой «Пропустить»
// QAPanel: issue frame 72 → клик вызывает seek(72); подпись «автоматическая оценка»
// ComponentsPanel: restricted-компонент помечен бейджем, commit укорочен до 7 символов
// JobStatus: blocked → PID, команда, кнопка «Повторить» отключена при живом процессе
// ExportDialog: версия без transparent → ProRes недоступен с подсказкой
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать.**
- [ ] **Step 4: Playwright (`make e2e-ui`),** реальный сервер `npm start` на `tmp`-хранилище с `MS_ALLOW_SYSTEM_DISK=1`, версии из `seed.ts` (реальный рендер, без LLM):
  - `dashboard.spec`: создать проект → он в списке; баннер при 503.
  - `versions.spec`: открыть сцену с двумя версиями → проиграть v1 и v2, шаг кадра меняет счётчик на 1; «Сравнить» → два плеера и diff `props`; «Восстановить v1» → появилась v3 с родителем v1, v1 и v2 на месте.
  - `export.spec`: «Экспорт» MP4 → задача → «Скачать»; файл проходит `ffprobe` (1920×1080, `h264`, `aac`).
  - `kb.spec`: поиск «счётчик» → `remotion-bits/animated-counter` с лицензией MIT; карточка открывается.
  - `jobs.spec`: экспорт с `hang-scene`-версией → «Отменить» → `cancelled`; ошибка рендера показана с логами, превью нет.
  Скриншоты ключевых экранов — `docs/evidence/phase-1/ui/`.
- [ ] **Step 5: Просмотр скриншотов глазами:** раскладка ТЗ §6.2, все подписи на русском, нет обрезанных строк.
- [ ] **Step 6:** `./check`; коммит `feat(motion-studio): UI Motion Playground`.

### Task 22: Приёмка Phase 1 через UI с реальными Claude Code и рендером (P1-18)

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance/{global-setup.ts,helpers.ts,test1-data-storytelling.spec.ts,test2-technical-explainer.spec.ts,test3-iterative-editing.spec.ts,restart.spec.ts,resilience.spec.ts,mvp-criteria.spec.ts}`, `app/motion-studio/web/playwright.acceptance.config.ts`
- Create: `app/motion-studio/scripts/{collect-evidence.mjs,kb-hashes.mjs}`
- Create: `docs/evidence/phase-1/{test1,test2,test3,restart,resilience,mvp-criteria}/…`, `docs/evidence/phase-1/REPORT.md`
- Modify: `app/motion-studio/Makefile` (`acceptance`), `app/motion-studio/README.md` (как запустить приёмку и сколько стоит)

**Interfaces:**
- Consumes: всё из Task 1–21
- Produces:
  - `global-setup.ts`: `MS_DATA_DIR="/Volumes/External SSD/MotionStudio-acceptance"`; если каталога нет — `npm run doctor -- --init`; `npm run doctor` обязан пройти; `kb-hashes.mjs before` — sha256 выборки 200 файлов `templates/`, `official_skills/` и всех `knowledge/*`; запуск `npm start` (production-сборка `web`)
  - `helpers.ts`: `generateViaUi(page, prompt): Promise<{ sceneId; versionId }>` (ожидание по SSE до 30 мин), `chatEditViaUi(page, text)`, `exportViaUi(page, format)`, `killServer(signal: "SIGKILL")`, `startServer()`, `collect(sceneId, dest)`
  - `collect-evidence.mjs <versionId|exportId> <dest>`: `preview.mp4` и экспорт (≤ 10 МБ, иначе sha256 + ffprobe), `frames/*.png`, `qa.json`, `manifest.json`, `knowledge-refs.json`, `spec.json`, журнал задачи (`job_events`), `agent_runs` (модель, стоимость, токены), скриншоты UI
  - `REPORT.md`: таблица каждого пункта `09` §1–5 → [A] pass/fail со ссылкой на файл evidence или [H] с результатом просмотра человеком; стоимость по тестам и итог; время; известные ограничения; что требует утверждения (ТЗ §16 п.8)

- [ ] **Step 1: Test 1 (`test1-data-storytelling.spec.ts`):** Dashboard → новый проект «Приёмка» → Playground → промпт Test 1 дословно → «Сгенерировать» → `completed`; в UI: плеер играет, длительность = настройкам; `ComponentsPanel` показывает ≥ 1 запись KB с commit и лицензией; `QAPanel` — `technical: pass`. Проверки [A] `09` §2 по файлам версии (как в Task 17 Step 5) + стабильность: повторный `renderVersion` копии версии → sha256 трёх ключевых PNG совпадают. «Экспорт» MP4 → скачанный файл: `h264`, `aac`, 1920×1080, 30/1. Evidence — `docs/evidence/phase-1/test1/`.
- [ ] **Step 2: Test 2:** промпт Test 2 дословно; [A] из `09` §3: ≥ 5 узлов с ролями пользователь/оркестратор/3 инструмента, биты упорядочены (запрос → оркестратор → инструменты → обратно), `PulseAlongPath` в `kit_components_used` или `magicui/animated-beam` в knowledge-refs, позиция импульса меняется между соседними кадрами (`frameDelta` двух кадров бита импульса > 0.002 в ROI ребра), refs из паттерна `system-structure`, `overlap` отсутствует. Evidence — `test2/`.
- [ ] **Step 3: Test 3:** в той же сцене через чат «сделай всё в фиолетовых тонах» → v2; затем промпт Test 3 дословно → v3. [A] как в Task 18 Step 4; в UI история показывает v1–v3, каждая открывается и проигрывается; «Сравнить v2 ↔ v3» показывает `/timing/duration_frames` 180 → 240. Evidence — `test3/` (кадры hold v1/v2/v3 рядом).
- [ ] **Step 4: Перезапуск (`restart.spec.ts`, `09` §1 п.5):** `killServer("SIGKILL")` → `startServer()` → открыть сцену Test 2: все версии на месте, sha256 файлов версий не изменились; повторный экспорт v3 → та же длительность и размеры, что у экспорта до перезапуска.
- [ ] **Step 5: Устойчивость (`resilience.spec.ts`, `09` §5):**
  1. генерация, `SIGKILL` сервера во время рендера → после старта задача `pending` и доведена до `completed` либо `failed(interrupted)` с кнопкой «Повторить»; другая сцена не затронута;
  2. повторный POST с тем же `Idempotency-Key` (через `page.request`) → тот же `job.id`;
  3. версия со сломанным кодом (`hang-scene` через `seedScene`) → экспорт `failed` с логами, превью не подменено; следующая задача в очереди выполняется;
  4. `MS_DATA_DIR` переименован во время работы → баннер «Хранилище недоступно», API 503, задачи не стартуют, в исходном пути ничего не создано; переименование обратно → работа продолжается;
  5. второй `npm start` при живом первом → выход с `owner_busy`; после `kill -9` первого — стартует;
  6. `SIGKILL` сервера при живом рендере с фикстурой, игнорирующей SIGTERM → задача не `pending`, пока процесс жив; после его завершения — `pending`;
  7. две правки одной сцены подряд → вторая `pending`, пока первая `running`; правка и «Восстановить» — так же;
  8. устаревшая попытка → `fenced_out` (через тестовый обработчик в процессе сервера с `MS_TEST_HOOKS=1`; хук включается только переменной и не регистрирует маршрутов).
  Пункт «физическое отключение SSD» (`09` §5 п.6) — [H]: инструкция в `REPORT.md`, результат записывает человек.
- [ ] **Step 6: Критерии MVP (`mvp-criteria.spec.ts`, `09` §1):** п.1–4 по версиям Test 1–3; п.6 — `kb-hashes.mjs after` совпадает с `before`.
- [ ] **Step 7: Просмотр глазами [H]:** все ключевые кадры Test 1–3 по рубрике качества (иерархия, разные входы, ритм, глубина, читаемость, safe area); замечания — в `REPORT.md` с кадром и элементом; ничего не подгонять под тест.
- [ ] **Step 8:** `./check`; коммит `test(motion-studio): приёмка Phase 1 и evidence`; итог человеку по ТЗ §16 п.8: реализовано, тесты, известные ограничения, стоимость прогонов, что требует утверждения.

---

## Self-review (выполнен)

- Покрытие ТЗ §13 Phase 1: job API и AgentRuntimeAdapter (Task 12, 13, 20; адаптер — срез), KnowledgeAdapter и выбор компонентов (срез, Task 17), typed Motion Spec и сцена (срез, Task 14, 15, 17), изолированный рендер и превью (срез, Task 19), чат-правки (Task 18), иммутабельные версии, восстановление и сравнение (Task 11, 18, 21), экспорт MP4 (+ ProRes) (Task 19), UI: проект, промпт, плеер, версии, чат, настройки, компоненты KB, QA, статус, i18n ru (Task 21), технический QA и ограниченные retry (Task 16, 17). Приёмка — Task 22.
- ADR 0007 целиком: owner-lock (срез), группы процессов и реестр `job_processes` (Task 13), draft на попытку и fencing `jobs.attempt` (Task 11–13), корректное завершение (Task 13), восстановление после рестарта (Task 13), запрет автоповтора — `blocked(stale_process)` (Task 13, 20, 21), карантин (Task 11, 13), замок сцены (Task 12). Тесты `09` §5 п.1–10 — Task 12, 13, 22.
- Качество анимации: StyleBible-система, интенсивность, типошкала, контраст, разные входы, камера, параллакс, safe area, раскладка без пересечений (Task 14), примитивы паттернов ТЗ §8.4 (Task 15), рубрика качества в промптах (Task 17), QA по реальным пикселям и агент по кадрам (Task 16), просмотр глазами в Task 14, 15, 17, 18, 22.
- Интерфейсы среза потребляются по точным именам: `checkStorage`, `safeMkdir`, `watchStorage`, `acquireOwnerLock`, `spawnTracked`, `reapStale`, `procInfo`, `renderVersion`, `probeGate`, `ffprobe`, `writeEntry`, `contentKey`, `checkSceneSource`, `typecheckVersion`, `presets`, `useStyle`, `useBeat`, `beatProgress`, `ClaudeCodeRuntime`, `loadConfig`, `buildClaudeArgs`, `KnowledgeAdapter`, `createDraft`, `publishVersion`, `quarantineDraft`, `readVersion`, `newId`, `generateScene`, `prepareRefs`, `canSpend`. Изменения сигнатур среза: `spawnTracked` (+`opts.registry`, Q1), `ProbeResult` (+`audioCodec`, `pixFmt`), `Element.entrance` (+4 вида) — все обратно совместимы.
- Устаревший `aiplatform/motion` не упоминается как источник; в Task 17 — тест, что промпты его не содержат.
- Вне Phase 1: импорт видео, ASR, rough cut, таймлайн проекта, approvals A/B/C, overlay/PiP, `@remotion/player` в браузере, ОС-изоляция Chrome (`sandbox-exec`) — исследование остаётся в рисках `08` R5.
