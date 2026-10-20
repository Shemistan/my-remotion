---
тип: plan
статус: запланировано
обновлено: 2026-10-20
спека: 2026-10-20-ai-motion-studio-design.md
---

# Motion Playground MVP — вертикальный срез: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** текстовый запрос → Knowledge Base → Claude Code → Remotion → реальный MP4: из CLI получить настоящую Remotion-сцену, прошедшую технические проверки и сохранённую как воспроизводимая версия с `preview.mp4`.

**Architecture:** npm-workspace `app/motion-studio/` из трёх пакетов: `contracts` (Zod-схемы), `render` (Remotion 4.0.537 + motion-kit + рендер в дочернем процессе), `server` (StorageGuard, owner-lock и реестр процессов, KnowledgeAdapter, AgentRuntimeAdapter, static check, файловый SceneStore, пайплайн и CLI). В срезе нет БД, очереди задач и UI — это следующие задачи Phase 1 (`docs/architecture/07-implementation-roadmap.md` §3).

**Tech Stack:** Node 22, TypeScript 5 (strict, ESM), Vitest, ESLint 9 (flat config), Zod 3 + zod-to-json-schema, Remotion 4.0.537 (`remotion`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/fonts`), React (версия из peer-зависимости Remotion 4.0.537), TypeScript compiler API, OFL-шрифты с кириллицей (woff2 в `render/fonts/`), Claude Code CLI 2.1.x.

**Spec:** `docs/superpowers/specs/2026-10-20-ai-motion-studio-design.md` → `docs/architecture/01…09`, ADR 0001–0007 (приняты).

**Порядок = утверждённая последовательность:** P1-01 + P1-19 (Task 1, 2) → P1-02 (Task 3) → P1-05 (Task 4) → P1-06 (Task 5) → P1-07 (Task 6) → P1-08 (Task 7) → P1-09 (Task 8) → P1-20 (Task 9, 10).

## Global Constraints

- Node `22.21.1` (`.nvmrc`); `remotion`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/fonts` закреплены **точно** на `4.0.537`; `@remotion/cli` не ставится; lockfile коммитится.
- npm workspaces поднимают зависимости в `app/motion-studio/node_modules`; бандлер и typecheck сцен берут модули оттуда, а границу импорта сцены держит static check (Task 5), а не раскладка `node_modules`.
- `MS_DATA_DIR` обязателен; значения по умолчанию нет; корень создаёт только `doctor --init`; подкаталоги данных — только через `safeMkdir`; данные приложения (версии, кэш, логи, `run/`) пишутся только в `MS_DATA_DIR`. Вне его: `tmp/` репозитория в тестах, evidence в `docs/evidence/`, Chrome Headless Shell в `node_modules`.
- Рекомендуемое значение для этой машины: `/Volumes/External SSD/MotionStudio`.
- Хранилище проверяется перед запуском, перед каждым вызовом агента и рендером, перед публикацией и каждые 10 с во время дочерних процессов (сторож прерывает их через `AbortSignal`).
- ADR 0007 (принято) в срезе: один владелец `run/owner.lock`; каждый дочерний процесс — своя группа и запись в `run/processes/`; draft на попытку `workspace/drafts/<run_id>-a<attempt>/`; повторный запуск того же прогона при живом процессе прежней попытки запрещён.
- Агенты: только `claude -p --restricted --strict-mcp-config --no-session-persistence --output-format json --json-schema …`; никогда `bypassPermissions` и `--dangerously-skip-permissions`; Bash агенту не даётся.
- Модели по умолчанию: `motion_director` и `engineer` — `opus`, остальные роли — `sonnet`; ключ настройки `agents.<role>.model`.
- Лимиты по умолчанию: `maxBudgetUsd` на вызов 2; `scene.maxCostUsd` 5 (ориентир для тестов, не лимит подписки); автоисправлений на попытку 2; таймаут агента 10 мин; таймаут рендера превью 5 мин.
- Сцена по умолчанию: 1920×1080, fps 30/1, 180 кадров, превью в масштабе 0.5, H.264 CRF 23.
- Код сцены: анимация только от `useCurrentFrame()`; `interpolate` с `clamp`; без CSS transition/animation, таймеров, `Math.random`, `Date.now`, сети; разные элементы — разные входы.
- KB по умолчанию отдаёт только `license_class = "permissive"`; restricted/unknown — по явному флагу.
- Mock-рендер и заранее подготовленные ролики не засчитываются как результат; фейковые агенты и бинарники допустимы только в юнит-тестах логики.
- Устаревший `ai-platform/.../aiplatform/motion/` не используется ни как код, ни как референс (роли, промпты, пайплайны, рендер).
- Исходники KB (`templates/`, `official_skills/` main checkout) — только чтение; `KB_SOURCE_ROOT` настраивается.
- Порядок работы: каждая задача — ветка `motion-studio/p1-xx-<slug>` от `staging`; `./check` → коммит `тип(область): …` → `./finish`.

## Review Focus

1. SSD отключён во время рендера → сторож прерывает рендер, публикации нет, на системный диск ничего не записано, CLI завершается с `storage` (тесты в Task 1 и Task 10).
2. Агент импортирует библиотеку, которой нет в allowlist (`framer-motion`, `gsap`) → static check отклоняет до бандла с понятной причиной (Task 5); пайплайн отдаёт причину Engineer на исправление (Task 10).
3. Англоязычный запрос к русскоязычной KB → находит релевантное через синонимы (Task 8: `kinetic typography`).
4. Сцена вешает рендер (`delayRender` без `continueRender`) → таймаут, группа процессов убита, `failed` с логами (Task 4).
5. Второй запуск `generate`, пока первый жив или его дочерний процесс ещё работает → отказ без порчи данных (Task 2, Task 10).

---

### Task 1: Каркас workspace и StorageGuard (P1-01, P1-19)

**Files:**
- Create: `app/motion-studio/{package.json,.nvmrc,.gitignore,tsconfig.base.json,vitest.workspace.ts,eslint.config.js,Makefile,README.md}`
- Create: `app/motion-studio/scripts/with-node.sh` — выполняет команду в Node из `.nvmrc` через `nvm exec`; без nvm — ошибка с подсказкой
- Create: `app/motion-studio/server/{package.json,tsconfig.json}`
- Create: `app/motion-studio/server/src/storage/{guard.ts,probe-macos.ts,safe-mkdir.ts,watch.ts}`
- Create: `app/motion-studio/server/src/cli/doctor.ts`
- Test: `app/motion-studio/server/test/storage/{guard,safe-mkdir,watch}.test.ts`

**Interfaces:**
- Produces:
  - `interface StoreMarker { schema_version: 1; store_id: string; volume_uuid: string; created_at: string }`
  - `type StorageFailure = "env_missing" | "not_found" | "marker_missing" | "marker_mismatch" | "volume_mismatch" | "system_volume" | "not_writable" | "low_space"`
  - `type StorageStatus = { ok: true; root: string; marker: StoreMarker; freeBytes: number } | { ok: false; reason: StorageFailure; detail: string }`
  - `interface VolumeProbe { volumeUuid(path: string): Promise<string>; deviceId(path: string): Promise<number>; systemDeviceId(): Promise<number>; freeBytes(path: string): Promise<number> }`
  - `type StorageEnv = { MS_DATA_DIR?: string; MS_ALLOW_SYSTEM_DISK?: string; MS_MIN_FREE_GB?: string }` (порог по умолчанию 10)
  - `checkStorage(env: StorageEnv, probe: VolumeProbe, expectedStoreId?: string): Promise<StorageStatus>`
  - `initStore(root: string, probe: VolumeProbe, opts: { adopt?: boolean; allowSystemDisk?: boolean }): Promise<StoreMarker>` — `mkdir` корня без `recursive`; родитель обязан существовать
  - `safeMkdir(root: string, rel: string): Promise<string>` — отказывает, если `root` или маркер отсутствуют; `rel` не может выходить за `root`
  - `watchStorage(check: () => Promise<StorageStatus>, intervalMs: number): { signal: AbortSignal; stop(): void; lastFailure(): StorageStatus | undefined }`
  - `macosProbe: VolumeProbe` — `diskutil info -plist` → `VolumeUUID`; `fs.stat().dev`; `fs.statfs()` → `bavail * bsize`
  - `Makefile`: `check` = lint + typecheck + test (зовётся `./check` репозитория), `e2e` = интеграционные тесты с сетью и рендером

- [ ] **Step 1: Каркас.** `package.json` (`private`, `"type": "module"`, workspaces `contracts`, `render`, `server`, `engines.node: ">=22"`), tsconfig.base (strict, `module: NodeNext`, `target: ES2022`), Vitest workspace, ESLint flat config (typescript-eslint recommended), `.gitignore`: `node_modules/`, `dist/`.
- [ ] **Step 2: Тесты (падают).** Фейковый `VolumeProbe`, каталоги в `tmp/`:

```ts
it("refuses without MS_DATA_DIR", async () =>
  expect(await checkStorage({}, probe)).toMatchObject({ ok: false, reason: "env_missing" }));
it("does not create a missing root", async () => {
  expect(await checkStorage({ MS_DATA_DIR: join(tmp, "absent") }, probe)).toMatchObject({ ok: false, reason: "not_found" });
  expect(existsSync(join(tmp, "absent"))).toBe(false);
});
it("rejects root on system volume unless allowed", async () => {
  expect(await checkStorage({ MS_DATA_DIR: root }, sysProbe)).toMatchObject({ ok: false, reason: "system_volume" });
  expect(await checkStorage({ MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" }, sysProbe)).toMatchObject({ ok: true });
});
it("detects another volume", ...)        // marker.volume_uuid "A", probe → "B" → volume_mismatch
it("reports low space", ...)             // freeBytes 5 GiB при пороге 10 → low_space
it("initStore requires existing parent", ...) // join(tmp, "no/such/dir") → reject; ничего не создано
it("adopt rewrites only volume_uuid", ...)    // store_id прежний
it("safeMkdir refuses when root vanished", async () => {
  await rename(root, root + ".gone");
  await expect(safeMkdir(root, "cache/bundles")).rejects.toThrow(/storage/);
  expect(existsSync(root)).toBe(false);
});
it("safeMkdir refuses path escape", ...) // rel "../x" → reject
it("watchStorage aborts on first failure", async () => {
  const w = watchStorage(failingOnSecondCall, 20);
  await sleep(60);
  expect(w.signal.aborted).toBe(true); expect(w.lastFailure()).toMatchObject({ ok: false });
});
```

- [ ] **Step 3: Запустить** `./scripts/with-node.sh npx vitest run server/test/storage` — FAIL (модулей нет).
- [ ] **Step 4: Реализовать.** `doctor`: печатает `StorageStatus`; `--init` / `--adopt` → `initStore` с `macosProbe`; код выхода 1 при `ok: false`.
- [ ] **Step 5: Запустить** — PASS. Ручная проверка: `MS_DATA_DIR=/Volumes/NoSuchDisk/MotionStudio npm run doctor` → `not_found`, каталог не создан.
- [ ] **Step 6:** `npm install` создаёт lockfile; `./check` зелёный; коммит `feat(motion-studio): каркас workspace и StorageGuard`; `./finish`.

### Task 2: Owner-lock и реестр процессов (P1-19, ADR 0007)

**Files:**
- Create: `app/motion-studio/server/src/run/{owner-lock.ts,processes.ts,spawn-tracked.ts,proc-info.ts}`
- Create: `app/motion-studio/server/test/fixtures/bin/{ignore-term.sh,sleepy.sh}`
- Test: `app/motion-studio/server/test/run/{owner-lock,processes}.test.ts`

**Interfaces:**
- Consumes: `safeMkdir` (Task 1)
- Produces:
  - `interface ProcInfo { pid: number; startedAt: string }`; `procInfo(pid: number): Promise<ProcInfo | undefined>` — `ps -o lstart= -p <pid>`; `undefined`, если процесса нет
  - `acquireOwnerLock(root: string, kind: "server" | "cli"): Promise<{ release(): Promise<void> }>` — блокировка ОС на `run/owner.lock`: better-sqlite3, `PRAGMA locking_mode=EXCLUSIVE` + `BEGIN EXCLUSIVE` (POSIX `fcntl`, ядро снимает при смерти процесса); `run/owner.json` `{ pid, startedAt, kind }` — диагностика; занято → ошибка `owner_busy` с pid из `owner.json`
  - `interface TrackedProcess { runId: string; attempt: number; pid: number; pgid: number; startedAt: string; cmd: string }`
  - `spawnTracked(root: string, ref: { runId: string; attempt: number }, cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal; stdin?: string; killGraceMs?: number }): Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>` — `detached: true` (своя группа); запись `run/processes/<runId>-a<attempt>-<pid>.json` до начала работы; по `signal` — SIGTERM на группу, через `killGraceMs` (5000) SIGKILL на группу; запись удаляется только после выхода процесса
  - `reapStale(root: string, runId: string): Promise<{ clean: boolean; alive: TrackedProcess[] }>` — для записей прогона: мёртвые (или с другим `startedAt`) удаляются; живые получают SIGTERM → 5 с → SIGKILL → ожидание до 30 с; `clean: false`, если кто-то остался жив

- [ ] **Step 1: Тесты (падают):**

```ts
const a = await acquireOwnerLock(root, "cli");
await expect(acquireOwnerLock(root, "cli")).rejects.toThrow(/owner_busy/);
await a.release(); await expect(acquireOwnerLock(root, "cli")).resolves.toBeDefined();
// блокировка из другого процесса: дочерний node держит lock → owner_busy; kill -9 ребёнка → lock свободен
// без release: процесс-владелец убит SIGKILL — следующий захват успешен (ядро сняло fcntl-lock)
// группа процессов убивается целиком: sleepy.sh запускает дочерний sleep
const ctrl = new AbortController(); const p = spawnTracked(root, ref, sleepy, [], { ...o, signal: ctrl.signal });
ctrl.abort(); await p; expect(await procInfo(grandchildPid)).toBeUndefined();
expect(readdirSync(join(root, "run/processes"))).toEqual([]);
// процесс, игнорирующий SIGTERM, убивается SIGKILL
// reapStale: живой процесс из «прошлой» попытки → после reap мёртв, clean: true
// reapStale с фейковым kill, который не убивает → clean: false, alive.length === 1
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5:** `./check`; коммит `feat(motion-studio): owner-lock и реестр процессов`; `./finish`.

### Task 3: Контракты (P1-02)

**Files:**
- Create: `app/motion-studio/contracts/{package.json,tsconfig.json}`
- Create: `app/motion-studio/contracts/src/{index.ts,time.ts,settings.ts,style.ts,motion-spec.ts,selection.ts,agents.ts,manifest.ts,json-schema.ts}`
- Test: `app/motion-studio/contracts/test/{time,settings,motion-spec,json-schema,manifest}.test.ts`

**Interfaces:**
- Produces (пакет `@ms/contracts`):
  - `Fps = { num: number; den: number }`; `usToFrame(us: number, fps: Fps): number` (floor); `frameToUs(frame: number, fps: Fps): number` (round)
  - `SettingsSchema` (ТЗ §6.4): `aspect_ratio` `"16:9" | "9:16" | "1:1"`, `width`, `height`, `fps`, `duration_frames`, `style_preset` `"dark-premium" | "light-clean" | "tech-neon"`, `color_palette?`, `font?`, `animation_intensity` `"calm" | "balanced" | "energetic"`, `background`, `transparent_export`, `safe_area { x, y }` (доли кадра); `defaultSettings(): Settings` по Global Constraints
  - `StyleBibleSchema` — поля из `docs/architecture/06-motion-engine.md` §4
  - `MotionSpecSchema = { title, purpose, duration_frames, fps, style_preset, palette_overrides?, elements: Element[], beats: Beat[] }`; `Beat = { id, start_frame, end_frame, action, description, element_ids: string[] }`; `Element = { id, kind: "text" | "number" | "chart" | "graph" | "card" | "shape" | "group", role, entrance: "rise" | "fade" | "scale" | "slide" | "draw" | "count" | "none", content: Record<string, unknown>, layout?: { x, y, w, h } }` (layout — доли кадра)
  - `ComponentSelectionSchema = { items: { kb_id: string; strategy: "reuse" | "adapt" | "build"; why: string; files_to_copy: string[] }[] }`
  - `DirectorOutputSchema = { spec: MotionSpec; selection: ComponentSelection; rationale: string }`
  - `EngineerReportSchema = { files_written: string[]; kit_components_used: string[]; kb_ids_used: string[]; notes: string }`
  - `KnowledgeRefSchema = { kb_id, repository, repository_url, commit, license, license_class, strategy, source_paths: string[] }`
  - `VersionManifestSchema` — поля из `05-data-model.md` §4 плюс `status: "ready" | "failed"`, `failure?: { stage: string; message: string }`, `qa_frames: number[]`, `qa_frames_sha256: string[]`
  - `toJsonSchema(schema: ZodTypeAny): object` — `$refStrategy: "none"`, `additionalProperties: false`

- [ ] **Step 1: Тесты (падают):**

```ts
expect(usToFrame(1_000_000, { num: 30000, den: 1001 })).toBe(29);
expect(frameToUs(30, { num: 30, den: 1 })).toBe(1_000_000);
expect(defaultSettings()).toMatchObject({ width: 1920, height: 1080, fps: { num: 30, den: 1 }, duration_frames: 180 });
expect(MotionSpecSchema.safeParse(specWith({ duration_frames: 100, beats: [{ start_frame: 90, end_frame: 120 }] })).success).toBe(false);
expect(MotionSpecSchema.safeParse(specWith({ beats: [{ start_frame: 10, end_frame: 10 }] })).success).toBe(false);
expect(MotionSpecSchema.safeParse(specWith({ beats: [{ element_ids: ["nope"] }] })).success).toBe(false);
const js = toJsonSchema(DirectorOutputSchema);
expect(JSON.stringify(js)).not.toContain("$ref");
expect(js).toMatchObject({ type: "object", required: expect.arrayContaining(["spec", "selection", "rationale"]) });
```

- [ ] **Step 2–4:** FAIL → реализовать (кросс-полевые проверки через `superRefine`) → PASS. **Step 5:** `./check`; коммит `feat(motion-studio): контракты сцены и агентов`; `./finish`.

### Task 4: Render-пакет и рендер версии (P1-05)

**Files:**
- Create: `app/motion-studio/render/{package.json,tsconfig.json}`
- Create: `app/motion-studio/render/src/node/{entry.ts,render-version.ts,worker.ts,ffprobe.ts,browser.ts}`
- Create: `app/motion-studio/render/test/fixtures/{hello-scene,hang-scene}/{src/Scene.tsx,props.json,settings.json}`
- Modify: `app/motion-studio/server/src/cli/doctor.ts` (проверка браузера)
- Test: `app/motion-studio/render/test/probe-gate.test.ts`, `app/motion-studio/render/test/render.e2e.test.ts`

**Interfaces:**
- Consumes: `Settings`, `Fps` (Task 3); `spawnTracked` (Task 2); `safeMkdir` (Task 1)
- Produces (пакет `@ms/render`):
  - `ensureRenderBrowser(): Promise<{ path: string }>` — `ensureBrowser()` из `@remotion/renderer`
  - `contentKey(versionDir: string): Promise<string>` — sha256 содержимого `src/**` и `props.json` (не пути)
  - `writeEntry(versionDir: string, cacheDir: string, settings: Settings): Promise<string>` — `<cacheDir>/entries/<contentKey>/index.tsx`: `registerRoot` с одной `<Composition id="Scene">`, компонент из `<versionDir>/src/Scene.tsx`, `defaultProps` из `props.json`
  - `interface RenderRequest { versionDir: string; settings: Settings; cacheDir: string; stills: number[]; preview: { scale: number; crf: number }; timeoutMs: number; run: { root: string; runId: string; attempt: number } }`
  - `interface RenderResult { ok: boolean; stills: string[]; previewPath?: string; probe?: ProbeResult; browserLogs: string[]; error?: { stage: "bundle" | "still" | "media" | "probe" | "timeout" | "aborted"; message: string } }`
  - `renderVersion(req: RenderRequest, signal?: AbortSignal): Promise<RenderResult>` — `worker.ts` через `spawnTracked`; кадры → `<versionDir>/frames/<n>.png`, превью → `<versionDir>/preview.mp4`; результат воркера — JSON последней строкой stdout; таймаут и `signal` → убийство группы
  - `ffprobe(path: string): Promise<ProbeResult>`; `ProbeResult = { durationMs: number; width: number; height: number; fps: Fps; codec: string }`
  - `probeGate(probe: ProbeResult, settings: Settings, scale: number): string[]` — пусто = pass; длительность ± 1 кадр
- Бандл: `bundle({ entryPoint, outDir: <cacheDir>/bundles/<contentKey>, webpackOverride })`; `webpackOverride`: `resolve.alias["@ms/motion-kit"]` → `render/src/motion-kit`.

- [ ] **Step 1: Зависимости** с точными версиями (Global Constraints); `react`/`react-dom` — версия из peer-зависимости Remotion 4.0.537, точно. `npm run doctor` вызывает `ensureRenderBrowser()`; если sandbox блокирует загрузку — остановиться и записать блок в отчёт.
- [ ] **Step 2: Юнит-тест `probeGate` (падает):**

```ts
const s = { ...defaultSettings(), duration_frames: 60 };
const p = { durationMs: 2000, width: 960, height: 540, fps: { num: 30, den: 1 }, codec: "h264" };
expect(probeGate(p, s, 0.5)).toEqual([]);
expect(probeGate({ ...p, durationMs: 2100 }, s, 0.5)).toHaveLength(1);
expect(probeGate({ ...p, width: 1920, height: 1080 }, s, 0.5)[0]).toMatch(/width/);
```

- [ ] **Step 3: e2e-тесты (падают), цель `make e2e`.** `hello-scene` — рукописная тестовая сцена (`interpolate` по кадру), 640×360, 60 кадров:

```ts
const r = await renderVersion({ versionDir: hello, settings: s640, cacheDir, stills: [0, 30, 59], preview: { scale: 1, crf: 23 }, timeoutMs: 120_000, run });
expect(r.ok).toBe(true); expect(r.stills).toHaveLength(3);
expect(probeGate(r.probe!, s640, 1)).toEqual([]);
const r2 = await renderVersion({ ...req, versionDir: copyOf(hello) });
expect(sha256(r2.stills[1])).toBe(sha256(r.stills[1]));          // детерминизм, тот же contentKey
const h = await renderVersion({ ...req, versionDir: hang, stills: [0], timeoutMs: 15_000 });
expect(h).toMatchObject({ ok: false, error: { stage: "timeout" } });
expect(readdirSync(join(run.root, "run/processes"))).toEqual([]); // группа убита
```

- [ ] **Step 4: Реализовать** `browser.ts`, `entry.ts`, `worker.ts` (bundle → `selectComposition` → `renderStill` по кадрам → `renderMedia` `h264`, `crf`, `scale`; `onBrowserLog` → `browserLogs`), `render-version.ts`, `ffprobe.ts` (системный `ffprobe -v error -print_format json -show_streams -show_format`).
- [ ] **Step 5: Запустить** `make check` и `make e2e` — PASS; время первого и повторного рендера — в README пакета.
- [ ] **Step 6:** `./check`; коммит `feat(motion-studio): render-пакет Remotion 4.0.537`; `./finish`.

### Task 5: Статическая проверка кода сцены (P1-06)

**Files:**
- Create: `app/motion-studio/server/src/scenes/{static-check.ts,typecheck.ts}`
- Create: `app/motion-studio/server/test/fixtures/bad-scenes/*.tsx` (одно нарушение на файл)
- Test: `app/motion-studio/server/test/scenes/{static-check,typecheck}.test.ts`

**Interfaces:**
- Produces:
  - `type RuleId = "import-not-allowed" | "dynamic-import" | "forbidden-global" | "forbidden-css-animation" | "outside-src"`
  - `interface Violation { rule: RuleId; file: string; line: number; message: string }` — `message` по-русски, пригоден для агента
  - `checkSceneSource(files: { path: string; text: string }[]): Violation[]` — TypeScript compiler API, код не выполняется
  - `typecheckVersion(versionDir: string): Promise<{ file: string; line: number; message: string }[]>` — `ts.createProgram` с `paths["@ms/motion-kit"]` → `render/src/motion-kit`, типы из `app/motion-studio/node_modules`
- Allowlist импорта: `react`, `react/jsx-runtime`, `remotion`, `@remotion/fonts`, `@ms/motion-kit`, относительные пути внутри `src/`.
- Запрещённые глобалы: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `eval`, `Function`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now`, `Math.random`, `process`, `require`, `globalThis`, `localStorage`, `navigator`.
- CSS: ключи `transition`, `animation` в объектах `style`; `className` с `animate-` или `transition`.

- [ ] **Step 1: Тесты (падают):**

```ts
expect(rules(check("import { motion } from 'framer-motion'"))).toEqual(["import-not-allowed"]);
expect(rules(check("import gsap from 'gsap'"))).toEqual(["import-not-allowed"]);
expect(rules(check("import z from 'zod'"))).toEqual(["import-not-allowed"]);      // поднятый в корень пакет
expect(rules(check("const m = await import('./x')"))).toEqual(["dynamic-import"]);
expect(rules(check("const r = Math.random()"))).toEqual(["forbidden-global"]);
expect(rules(check("fetch('https://x')"))).toEqual(["forbidden-global"]);
expect(rules(check("<div style={{ transition: 'all 1s' }} />"))).toEqual(["forbidden-css-animation"]);
expect(rules(check("<div className=\"animate-pulse\" />"))).toEqual(["forbidden-css-animation"]);
expect(rules(check("import x from '../../outside'"))).toEqual(["outside-src"]);
expect(check(okScene)).toEqual([]);   // useCurrentFrame + interpolate + random('seed') + @ms/motion-kit
expect(await typecheckVersion(helloScene)).toEqual([]);
expect(await typecheckVersion(typeErrorScene)).toHaveLength(1);
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5:** `./check`; коммит `feat(motion-studio): статическая проверка кода сцены`; `./finish`.

### Task 6: motion-kit v0.1 (P1-07)

**Files:**
- Create: `app/motion-studio/render/src/motion-kit/{index.ts,tokens.ts,presets.ts,fonts.ts,beat.ts,easing.ts,geometry.ts,format.ts}`
- Create: `app/motion-studio/render/src/motion-kit/components/{Background,AnimatedNumber,LineChart,FlowGraph,PulseAlongPath,Card,KineticText}.tsx`
- Create: `app/motion-studio/render/src/motion-kit/{API.md,PROVENANCE.md}`
- Create: `app/motion-studio/render/fonts/{Inter,Manrope,JetBrainsMono}-*.woff2`, `app/motion-studio/render/fonts/OFL.txt`, `app/motion-studio/scripts/sync-fonts.mjs` (копирует latin+cyrillic woff2 из devDependencies `@fontsource/*` в `render/fonts/`; результат коммитится)
- Create: `app/motion-studio/render/test/fixtures/kit-gallery/src/Scene.tsx`
- Test: `app/motion-studio/render/test/kit/{format,beat,geometry}.test.ts`, `app/motion-studio/render/test/kit/gallery.e2e.test.ts`

**Interfaces:**
- Consumes: `StyleBible`, `Beat` (Task 3); `renderVersion`, `probeGate` (Task 4); `checkSceneSource` (Task 5)
- Produces (импорт `@ms/motion-kit`):
  - `presets: Record<"dark-premium" | "light-clean" | "tech-neon", StyleBible>`; `<StyleProvider style>`, `useStyle(): StyleBible`
  - `ensureFonts(): void` — `loadFont` из `@remotion/fonts` с `url` на файлы `render/fonts/` (импорт woff2 как ассета webpack)
  - `beatProgress(frame: number, beat: Pick<Beat, "start_frame" | "end_frame">, easing?: EasingFn): number` (0..1, clamp); `useBeat(beat): { progress: number; phase: "before" | "enter" | "hold" | "exit" | "after" }`
  - `formatNumber(value: number, opts: { locale: "ru" | "en"; compact?: boolean; decimals?: number }): string`
  - `cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point`; `pathLUT(segments: CubicSegment[], samples: number): { points: Point[]; lengths: number[] }`; `pointAtLength(lut, s: number): Point`
  - Компоненты, props — в `API.md` (копируется агенту): `Background`, `AnimatedNumber { from; to; beat; locale; prefix?; suffix? }`, `LineChart { points: { label: string; value: number }[]; beat; area?; highlightLast? }`, `FlowGraph { nodes: { id; label; x; y; w; h; elevation? }[]; edges: { id; from; to }[]; beat }`, `PulseAlongPath { edgeId | segments; beat; color?; tail? }`, `Card { elevation: 0 | 1 | 2 | 3; children }`, `KineticText { text; beat; mode: "words" | "letters"; enter: "rise" | "fade" | "scale" | "slide" }`
- `PROVENANCE.md`: для каждого компонента — `kb_id`, repo, commit из `knowledge/repositories.json`, лицензия, что взято, колонка `rendered: ok | issues`. Из restricted-записей (react-bits, remotion-boilerplate и др.) код не копируется.

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
expect(formatNumber(1_000_000, { locale: "ru" })).toBe("1 000 000");
expect(formatNumber(10_000, { locale: "en" })).toBe("10,000");
expect(beatProgress(0, { start_frame: 10, end_frame: 20 })).toBe(0);
expect(beatProgress(15, { start_frame: 10, end_frame: 20 })).toBeCloseTo(0.5);
expect(beatProgress(99, { start_frame: 10, end_frame: 20 })).toBe(1);
expect(cubicPoint({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, 0.5)).toEqual({ x: 1.5, y: 0 });
expect(pointAtLength(pathLUT([straight0to3], 64), 1.5).x).toBeCloseTo(1.5, 2);
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать** функции и компоненты; `checkSceneSource` на файлах kit возвращает `[]`.
- [ ] **Step 4: Галерея (e2e):** `kit-gallery` — все компоненты в одной сцене 1920×1080, 150 кадров, подписи на кириллице («Рост пользователей», «Оркестратор»). Тест: `renderVersion` ok; кадры `[0, 30, 75, 120, 149]`; `probeGate` пуст; sha256 кадров 30 и 120 различаются.
- [ ] **Step 5: Просмотр кадров глазами** (Read PNG): кириллица нужным шрифтом, нет обрезки, импульс на пути, тени различимы по `elevation`. Кадры — в `docs/evidence/phase-1/slice/kit/`, итог — в `PROVENANCE.md`.
- [ ] **Step 6:** `./check`; коммит `feat(motion-studio): motion-kit v0.1`; `./finish`.

### Task 7: AgentRuntimeAdapter и ClaudeCodeRuntime (P1-08)

**Files:**
- Create: `app/motion-studio/server/src/config.ts`, `app/motion-studio/server/src/agents/{runtime.ts,claude-code.ts,env.ts}`
- Create: `app/motion-studio/server/test/fixtures/claude/{success.json,is-error.json,schema-violation.json,no-structured.json}` (`success.json` — реальный ответ CLI из Phase 0, остальные — его правки), `app/motion-studio/server/test/fixtures/bin/sleepy-claude.sh`
- Test: `app/motion-studio/server/test/agents/{args,parse,env,timeout,config}.test.ts`, `app/motion-studio/server/test/agents/claude.e2e.test.ts`

**Interfaces:**
- Consumes: `toJsonSchema` (Task 3); `spawnTracked` (Task 2)
- Produces:
  - `type Role = "concept" | "motion_director" | "engineer" | "visual_qa" | "edit_planner"`
  - `AgentTask<I>`, `AgentResult<O>`, `AgentRuntimeAdapter` — как в `docs/architecture/04-agent-workflows.md` §4–5; в `AgentTask` добавляется `run: { root: string; runId: string; attempt: number }`
  - `type AppConfig = { dataDir: string; claudeBin: string; agentRuntime: "claude-code"; agents: Record<Role, { model: string; timeoutMs: number; maxBudgetUsd: number }>; scene: { maxCostUsd: number; maxAutoFixes: number }; kb: { root: string; sourceRoot: string } }` — то есть ключ `agents.<role>.model`
  - `loadConfig(env: NodeJS.ProcessEnv, fileJson?: unknown): AppConfig` — значения по умолчанию из Global Constraints, переопределения из `$MS_DATA_DIR/config.json`
  - `buildClaudeArgs(task: AgentTask<unknown>, jsonSchema: object, systemPrompt: string): string[]`
  - `parseClaudeOutput<O>(stdout: string, schema: ZodType<O>): Pick<AgentResult<O>, "status" | "output" | "error" | "usage" | "permissionDenials" | "sessionId">`
  - `childEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv` — только `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`, `TMPDIR`
  - `class ClaudeCodeRuntime implements AgentRuntimeAdapter` — `constructor(opts: { bin: string; logRoot: string })`; промпт — через stdin; журнал `<logRoot>/<runId>/{prompt.md,stdout.json,stderr.log}`

- [ ] **Step 1: Тесты (падают):**

```ts
expect(loadConfig({ MS_DATA_DIR: root }).agents.engineer.model).toBe("opus");
expect(loadConfig({ MS_DATA_DIR: root }).agents.visual_qa.model).toBe("sonnet");
expect(loadConfig({ MS_DATA_DIR: root }, { agents: { engineer: { model: "sonnet" } } }).agents.engineer.model).toBe("sonnet");
const a = buildClaudeArgs(directorTask, schema, "sys");
expect(a).toEqual(expect.arrayContaining(["-p", "--restricted", "--strict-mcp-config", "--no-session-persistence", "--output-format", "json"]));
expect(a[a.indexOf("--tools") + 1]).toBe("");
expect(a).not.toContain("--permission-mode");
expect(a.join(" ")).not.toMatch(/bypassPermissions|dangerously/);
const e = buildClaudeArgs(engineerTask, schema, "sys");
expect(e[e.indexOf("--tools") + 1]).toBe("Read,Write,Edit,Glob,Grep");
expect(e[e.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
expect(e[e.indexOf("--model") + 1]).toBe("opus");
expect(parseClaudeOutput(fx("success.json"), Ok)).toMatchObject({ status: "completed", usage: { costUsd: expect.any(Number) } });
expect(parseClaudeOutput(fx("is-error.json"), Ok)).toMatchObject({ status: "failed", error: { kind: "cli" } });
expect(parseClaudeOutput(fx("schema-violation.json"), Ok)).toMatchObject({ status: "failed", error: { kind: "schema" } });
expect(childEnv({ PATH: "/bin", GITHUB_TOKEN: "x", ANTHROPIC_API_KEY: "y" })).toEqual({ PATH: "/bin" });
expect((await new ClaudeCodeRuntime({ bin: sleepy, logRoot }).run(task300ms, Ok, ctrl.signal)).status).toBe("timeout");
```

- [ ] **Step 2–3:** FAIL → реализовать (фактическая модель — ключ `modelUsage`; отмена — через `spawnTracked`).
- [ ] **Step 4: e2e (`make e2e`):** реальный `claude`, роль с моделью `haiku`, схема `{ ok: boolean }` → `completed`, `output.ok === true`, `usage.costUsd > 0`, `usage.model` содержит `haiku`; роль engineer в tmp-каталоге пишет `a.txt`, чтение `~/.zshrc` попадает в `permissionDenials`.
- [ ] **Step 5:** `./check`; коммит `feat(motion-studio): рантайм агентов на Claude Code`; `./finish`.

### Task 8: KnowledgeAdapter (P1-09)

**Files:**
- Create: `app/motion-studio/server/src/knowledge/{adapter.ts,search.ts,synonyms.ts,license.ts,types.ts}`
- Test: `app/motion-studio/server/test/knowledge/{license,search,refs}.test.ts`, `app/motion-studio/server/test/knowledge/golden.test.ts` (читает реальный `knowledge/` репозитория)

**Interfaces:**
- Produces:
  - `CapabilityView` (имена по `docs/architecture/02-integration-map.md` §4.1): `id, name, kind, category, visualizes, use_when, inputs, adaptations, patterns, compat_flags, repository, repository_url, commit, license, license_class: "permissive" | "restricted" | "unknown", source_paths: string[], documentation_paths: string[], compatibility_status, tested_status, confidence: "medium" | "low" | "unknown", card_path`
  - `licenseClass(license: string): LicenseClass` — `Commons Clause`, `UNLICENSED` → restricted; «не указана», «нет», пусто → unknown; MIT, Apache-2.0, BSD, ISC, CC0 без оговорок → permissive
  - `confidenceOf(view): Confidence` — `static-review` + native → medium; `static-review` + adaptable → low; иначе unknown
  - `interface SearchFilters { compat?: CompatibilityStatus[] /* по умолчанию ["native","adaptable"] */; kinds?: string[]; patterns?: string[]; allowRestricted?: boolean /* по умолчанию false: только permissive */ }`
  - `interface SearchHit { view: CapabilityView; score: number; matched: string[] }`
  - `class KnowledgeAdapter`: `static load(opts: { kbRoot: string; sourceRoot: string }): Promise<KnowledgeAdapter>`; `search(query: string, filters?: SearchFilters, limit?: number): SearchHit[]`; `getCapability(id: string): CapabilityView | undefined`; `getComponentCard(id: string): Promise<string>`; `getSourceReference(id: string): Promise<{ path: string; absPath: string; exists: boolean }[]>`; `getVisualPatterns(slug: string): Promise<string>` (курируемая часть `patterns/<slug>.md` без автотаблицы); `getCompatibility(id: string): { compatibility_status; compat_flags; adaptations; tested_status }`; `copyRefs(ids: string[], destDir: string): Promise<{ id: string; copied: string[]; missing: string[] }[]>` — `source_paths` в `destDir/<id>/…` и `CARD.md`; для `license_class !== "permissive"` — отказ
- Поиск: нижний регистр, `ё → е`, русские слова длиннее 6 символов усекаются до 6; EN-токены расширяются по `synonyms.ts` (`chart→график`, `growth→рост`, `counter→счетчик`, `number→число`, `user→пользов`, `architecture→архите`, `diagram→схем`, `node→узел`, `edge→связ`, `pulse→импуль`, `beam→луч`, `flow→поток`, `kinetic→кинети`, `typography→типогр, текст`, `card→карточ`, `depth→объем, глубин`); веса: name/id 3, visualizes 2, voiceover_cues 2, use_when 1, category/patterns 1; множитель native 1.5, adaptable 1.2.

- [ ] **Step 1: Тесты (падают):**

```ts
expect(licenseClass("MIT + Commons Clause")).toBe("restricted");
expect(licenseClass("UNLICENSED")).toBe("restricted");
expect(licenseClass("не указана")).toBe("unknown");
expect(licenseClass("MIT (package.json)")).toBe("permissive");
const kb = await KnowledgeAdapter.load({ kbRoot: repoKnowledge, sourceRoot: process.env.KB_SOURCE_ROOT ?? mainCheckout });
const ids = (q: string, n: number) => kb.search(q).slice(0, n).map(h => h.view.id);
const t1 = "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года";
expect(ids(t1, 5)).toContain("remotion-bits/animated-counter");
expect(ids(t1, 10)).toContain("free-remotion-templates/line-chart-anim");
expect(ids("Покажи архитектуру AI-агента: оркестратор вызывает три инструмента. Световые импульсы движутся по связям", 10)).toContain("magicui/animated-beam");
expect(ids("kinetic typography", 5).some(id => id.includes("kinetic"))).toBe(true);
expect(kb.search("счётчик").every(h => h.view.license_class === "permissive")).toBe(true);
expect(kb.getCapability("remotion-bits/animated-counter")!.commit).toMatch(/^[0-9a-f]{7,}$/);
expect((await kbWithFakeRoot.getSourceReference("remotion-bits/animated-counter"))[0].exists).toBe(false);
```

- [ ] **Step 2–3:** FAIL → реализовать. Если golden-ожидание не проходит из-за формулировки самой записи KB — тест не подгонять и KB не править, описать находку в отчёте задачи.
- [ ] **Step 4:** PASS; `./check`; коммит `feat(motion-studio): KnowledgeAdapter`; `./finish`.

### Task 9: Файловый SceneStore (P1-20)

**Files:**
- Create: `app/motion-studio/server/src/scenes/{store.ts,hash.ts,ids.ts}`
- Test: `app/motion-studio/server/test/scenes/store.test.ts`

**Interfaces:**
- Consumes: `StorageStatus`, `safeMkdir` (Task 1); `VersionManifestSchema` (Task 3)
- Produces:
  - `newId(prefix: "scn" | "ver" | "run"): string` — ULID с префиксом
  - `interface Draft { dir: string; runId: string; attempt: number; sceneId: string; parentVersionId?: string }`
  - `createDraft(root: string, ref: { runId: string; attempt: number; sceneId: string; parentVersionId?: string }): Promise<Draft>` — `workspace/drafts/<runId>-a<attempt>/`; если каталог уже есть — ошибка (draft не переиспользуется); при `parentVersionId` копирует `src/`, `props.json`, `spec.json`, `settings.json` родителя
  - `writeBrief(root: string, sceneId: string, brief: { prompt: string; settings: Settings; created_at: string }): Promise<void>` — `workspace/projects/playground/scenes/<sceneId>/brief.json`
  - `publishVersion(draft: Draft, meta: Omit<VersionManifest, "files" | "version_id" | "number" | "created_at">, guard: () => Promise<StorageStatus>): Promise<{ versionId: string; dir: string; manifest: VersionManifest }>` — перепроверяет хранилище; sha256 всех файлов; `manifest.json`; `rename` в `workspace/projects/playground/scenes/<sceneId>/versions/<ver_…>/`; `chmod -R a-w`
  - `quarantineDraft(draft: Draft, reason: string): Promise<void>` — пишет `.quarantined`
  - `readVersion(dir: string): Promise<VersionManifest>` — сверяет sha256, при расхождении — ошибка

- [ ] **Step 1: Тесты (падают):**

```ts
const v = await publishVersion(draft, meta, okGuard);
expect(existsSync(draft.dir)).toBe(false);
await expect(writeFile(join(v.dir, "props.json"), "{}")).rejects.toMatchObject({ code: "EACCES" });
expect((await readVersion(v.dir)).files.find(f => f.path === "src/Scene.tsx")!.sha256).toBe(sha256(sceneText));
expect(v.manifest.number).toBe(1);
await expect(createDraft(root, sameRef)).rejects.toThrow(/exists/);
await expect(publishVersion(draft2, meta, offlineGuard)).rejects.toThrow(/storage_unavailable/);
expect(existsSync(draft2.dir)).toBe(true);
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5:** `./check`; коммит `feat(motion-studio): файловый SceneStore`; `./finish`.

### Task 10: Пайплайн среза, промпты и CLI `generate` (P1-20)

**Files:**
- Create: `app/motion-studio/prompts/{motion-director.md,engineer.md}`
- Create: `app/motion-studio/server/src/pipeline/{generate.ts,refs.ts,budget.ts}`, `app/motion-studio/server/src/cli/generate.ts`
- Modify: `app/motion-studio/package.json` (скрипты `doctor`, `generate`)
- Test: `app/motion-studio/server/test/pipeline/generate.test.ts` (фейковые адаптеры — только логика), `app/motion-studio/server/test/pipeline/slice.e2e.test.ts` (всё реальное)

**Interfaces:**
- Consumes: всё из Task 1–9
- Produces:
  - `interface GenerateDeps { storage: () => Promise<StorageStatus>; kb: KnowledgeAdapter; agents: AgentRuntimeAdapter; render: typeof renderVersion; check: typeof checkSceneSource; typecheck: typeof typecheckVersion; config: AppConfig; watchIntervalMs?: number /* 10_000 */ }`
  - `generateScene(prompt: string, settings: Settings, deps: GenerateDeps, signal?: AbortSignal): Promise<GenerateResult>`
  - `GenerateResult = { status: "ready" | "failed"; versionDir?: string; previewPath?: string; costUsd: number; engineerCalls: number; failure?: { stage: "storage" | "director" | "engineer" | "static" | "typecheck" | "render" | "probe" | "budget"; message: string } }` — `versionDir` есть, если создан draft
  - `prepareRefs(draftDir: string, selection: ComponentSelection, kb: KnowledgeAdapter, skillsRoot: string): Promise<void>` — `refs/kb/<id>/…` и `CARD.md` (только permissive), `refs/motion-kit/API.md`, `refs/skills/` = `remotion-markup/{SKILL.md,timing.md,timing-props.md,sequencing.md,local-fonts.md,transitions.md}` из `official_skills/skills/skills/`
  - `canSpend(spentUsd: number, config: AppConfig): boolean` — `spentUsd < config.scene.maxCostUsd`
  - CLI: `npm run generate -- "<запрос>" [--duration-frames N] [--aspect 16:9|9:16|1:1] [--style dark-premium|light-clean|tech-neon]` → `acquireOwnerLock(root, "cli")`, `reapStale` для незавершённых прогонов из `run/processes/` (если `clean: false` — отказ с pid и командой), затем `generateScene`; печатает статус, путь версии, путь превью, стоимость; код выхода 1 при `failed`
- Порядок `generateScene`: storage → `writeBrief` → `kb.search(prompt, default, 12)` → Motion Director (`DirectorOutputSchema`, без инструментов; вход: запрос, настройки, кандидаты `CapabilityView`, курируемый текст 1–2 паттернов кандидатов, `API.md`) → `createDraft` → `spec.json`, `settings.json`, `knowledge-refs.json` (`KnowledgeRef[]`) → `prepareRefs` → Engineer (cwd = draft; пишет `src/Scene.tsx`, `props.json`; `EngineerReportSchema`) → `check` + `typecheck` → `render` (стоп-кадры: первый кадр после входа, середины битов, последний) → `probeGate` → `publishVersion("ready")`. Ошибка `static` / `typecheck` / `render` / `probe` → Engineer снова с причинами (`Violation[]`, диагностика, ошибка рендера), не более `maxAutoFixes` (2) повторов; затем `publishVersion("failed", failure)` с логами и превью, если оно есть. Перед каждым вызовом агента — `canSpend`; иначе `failure.stage = "budget"`. Вызовы агентов и рендер идут под `watchStorage`: сбой хранилища → `AbortSignal`, `failure.stage = "storage"`, публикации нет, draft помечается `.quarantined`, если процесс не завершился подтверждённо.
- Промпты пишутся по ТЗ §8 (иерархия, детерминизм, интенсивность, safe area, одна мысль в сцене, разные входы для разных элементов), правилам official skills и API motion-kit. В промпте Engineer: «предпочитай motion-kit; код из `refs/kb` адаптируй на кадры; импорт только из allowlist». Ссылок на устаревший `aiplatform/motion` нет.

- [ ] **Step 1: Юнит-тесты логики (падают):**

```ts
// Engineer всегда пишет Math.random → первый вызов + 2 исправления → failed
const r = await generateScene("тест", s, depsAlwaysBadEngineer);
expect(r).toMatchObject({ status: "failed", engineerCalls: 3, failure: { stage: "static" } });
// бюджет 5, каждый вызов 2: Director (2) → Engineer (4) → исправление 1 (6) → исправление 2 не делается
const b = await generateScene("тест", s, depsCost2AndBadRender);
expect(b).toMatchObject({ status: "failed", engineerCalls: 2, failure: { stage: "budget" } });
// хранилище недоступно с самого начала → ничего не создано
const o = await generateScene("тест", s, { ...deps, storage: offline });
expect(o.failure!.stage).toBe("storage"); expect(o.versionDir).toBeUndefined();
expect(existsSync(join(root, "workspace/projects"))).toBe(false);
// хранилище пропало во время рендера → рендер прерван, версии нет
const m = await generateScene("тест", s, { ...deps, storage: okThenOffline, render: slowRender, watchIntervalMs: 20 });
expect(m.failure!.stage).toBe("storage"); expect(slowRenderAborted).toBe(true);
// knowledge-refs.json
expect(JSON.parse(readFileSync(join(okResult.versionDir!, "knowledge-refs.json"), "utf8"))[0])
  .toMatchObject({ kb_id: expect.any(String), commit: expect.any(String), license: expect.any(String), strategy: expect.any(String) });
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать** `generate.ts`, `refs.ts`, `budget.ts`, CLI, промпты. **Step 4: Запустить** — PASS.
- [ ] **Step 5: Реальный прогон среза (`make e2e`).** После `MS_DATA_DIR="/Volumes/External SSD/MotionStudio" npm run doctor -- --init` — промпты Test 1 и Test 2 из `docs/architecture/09-acceptance-tests.md` дословно:

```ts
expect(r.status).toBe("ready");
const m = await readVersion(r.versionDir!);
expect(m.knowledge_refs.length).toBeGreaterThan(0);
expect(m.render_env.remotion).toBe("4.0.537");
expect(probeGate(await ffprobe(r.previewPath!), settings, 0.5)).toEqual([]);
const again = await renderVersion({ versionDir: copyOf(r.versionDir!), settings, cacheDir, stills: m.qa_frames, preview: { scale: 0.5, crf: 23 }, timeoutMs: 300_000, run });
expect(again.stills.map(sha256)).toEqual(m.qa_frames_sha256);
```

  Второй `npm run generate`, запущенный во время первого, завершается ошибкой `owner_busy`.
- [ ] **Step 6: Просмотр глазами** ключевых кадров (Read PNG): график и числа читаемы (Test 1), узлы и импульсы на связях (Test 2). Evidence — `docs/evidence/phase-1/slice/{test1,test2}/`: `preview.mp4` (если ≤ 10 МБ), кадры, `manifest.json`, `knowledge-refs.json`, стоимость, время. Слабое качество — конкретные замечания в отчёт; полировка — P1-10.
- [ ] **Step 7:** `./check`; коммит `feat(motion-studio): вертикальный срез generate`; `./finish`; отчёт: что прошло автоматически [A], что требует просмотра [H], стоимость прогонов, блокировки sandbox.

---

## Self-review (выполнен)

- Критерий среза (`07` §2): запрос → KB (Task 8, 10) → Claude Code (Task 7, 10) → Remotion (Task 4, 6) → `preview.mp4` с проверками (Task 4, 5) и воспроизводимой версией (Task 9, 10).
- Принятые ADR: `MS_DATA_DIR`, StorageGuard и сторож во время рендера (Task 1, 9, 10); модели и бюджет в конфиге (Task 7); персональный режим — в срезе нет сервера; ADR 0007 — Task 2 и Task 10 (условно до утверждения).
- Находки аудита согласованности закрыты: `@remotion/cli` не нужен (`ensureBrowser`); поднятые зависимости + static check; тест бюджета пересчитан; ESLint в `check`; ключ бандла — `contentKey`; `childEnv` = список из `03` §6; KB только permissive по умолчанию; `useBeat(beat)`; шрифты в `render/fonts/`; `agents.<role>.model`; имена `CapabilityView` по `02` §4.1; `versionDir?`; `refs/skills` — реальные имена файлов.
- Вне среза: Concept, Visual QA, Edit Planner, SQLite и очередь, API, UI, экспорт, правки через чат.
