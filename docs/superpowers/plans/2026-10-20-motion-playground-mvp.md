---
тип: plan
статус: запланировано
обновлено: 2026-10-20
спека: 2026-10-20-ai-motion-studio-design.md
---

# Motion Playground MVP — вертикальный срез: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** по текстовому запросу из CLI получить настоящую Remotion-сцену, собранную с опорой на Knowledge Base, прошедшую технические проверки и сохранённую как воспроизводимая версия с `preview.mp4`.

**Architecture:** npm-workspace `app/motion-studio/` из трёх пакетов: `contracts` (Zod-схемы), `render` (Remotion 4.0.537 + motion-kit + рендер в дочернем процессе), `server` (StorageGuard, KnowledgeAdapter, AgentRuntimeAdapter, static check, файловый SceneStore, пайплайн и CLI). В срезе нет БД, очереди задач и UI — они идут следующими задачами Phase 1 (`docs/architecture/07-implementation-roadmap.md` §3).

**Tech Stack:** Node 22, TypeScript 5 (strict, ESM), Vitest, Zod 3 + zod-to-json-schema, Remotion 4.0.537 (`remotion`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/fonts`), React 19, TypeScript compiler API, `@fontsource` (OFL-шрифты с кириллицей), Claude Code CLI 2.1.x.

**Spec:** `docs/superpowers/specs/2026-10-20-ai-motion-studio-design.md` → `docs/architecture/01…09`, ADR 0001–0006.

**Порядок задач = утверждённая последовательность:** P1-01 + P1-19 (Task 1) → P1-02 (Task 2) → P1-05 (Task 3) → P1-06 (Task 4) → P1-07 (Task 5) → P1-08 (Task 6) → P1-09 (Task 7) → P1-20 (Task 8, Task 9).

## Global Constraints

- Node `22.21.1` (`.nvmrc`); все `remotion`/`@remotion/*` закреплены **точно** на `4.0.537`; lockfile коммитится.
- `MS_DATA_DIR` обязателен; значение по умолчанию отсутствует; корень создаёт только `doctor --init`; ничего не пишется вне `MS_DATA_DIR`, кроме `tmp/` репозитория в тестах.
- Предлагаемое значение для ручных прогонов: `/Volumes/External SSD/MotionStudio`.
- Агенты: только `claude -p --restricted --strict-mcp-config --no-session-persistence --output-format json --json-schema …`; никогда `bypassPermissions` и `--dangerously-skip-permissions`; Bash агенту не даётся.
- Модели по умолчанию: `motion_director` и `engineer` — `opus`, остальные роли — `sonnet`; всё в конфиге.
- Лимиты по умолчанию: `maxBudgetUsd` на вызов 2; `scene.maxCostUsd` 5 (ориентир, не лимит подписки); автоисправлений на версию 2; таймаут агента 10 мин; таймаут рендера превью 5 мин.
- Сцена по умолчанию: 1920×1080, fps 30/1, 180 кадров, превью в масштабе 0.5, H.264 CRF 23.
- Код сцены: анимация только от `useCurrentFrame()`; `interpolate` с `clamp`; без CSS transition/animation, таймеров, `Math.random`, `Date.now`, сети.
- Mock-рендер и заранее подготовленные ролики не засчитываются как результат; фейковые агенты и бинарники допустимы только в юнит-тестах логики.
- Устаревший `ai-platform/.../aiplatform/motion/` не используется ни как код, ни как референс (роли, промпты, пайплайны, рендер).
- Исходники KB (`templates/`, `official_skills/` main checkout) — только чтение; `KB_SOURCE_ROOT` настраивается.
- Регламент репозитория: каждая задача — ветка `motion-studio/p1-xx-<slug>` от `staging`; `./check` → коммит `тип(область): …` без строки соавторства → `./finish`.

## Review Focus

1. SSD отключён между шагами генерации → публикация версии не пишет на системный диск, CLI завершается с `storage_unavailable` (тест в Task 8: `publishVersion` перепроверяет хранилище).
2. Агент импортирует библиотеку, которой нет в render-пакете (`framer-motion`, `gsap`) → static check отклоняет до бандла, понятная ошибка, цикл исправления (тест в Task 4).
3. Англоязычный запрос к русскоязычной KB → находит релевантное через синонимы (тест в Task 7: `kinetic typography`).
4. Сцена вешает рендер (`delayRender` без `continueRender`) → таймаут, версия `failed` с логами, процесс не висит (тест в Task 3).
5. Бюджет сцены исчерпан посреди цикла исправлений → пайплайн останавливается и публикует `failed` с причиной `budget` (тест в Task 9).

---

### Task 1: Каркас workspace и StorageGuard (P1-01, P1-19)

**Files:**
- Create: `app/motion-studio/{package.json,.nvmrc,tsconfig.base.json,vitest.workspace.ts,Makefile,README.md,.gitignore}`
- Create: `app/motion-studio/scripts/with-node.sh` — запускает команду в Node из `.nvmrc` через `nvm exec`, падает с подсказкой, если nvm нет
- Create: `app/motion-studio/server/{package.json,tsconfig.json}`
- Create: `app/motion-studio/server/src/storage/{guard.ts,probe-macos.ts}`
- Create: `app/motion-studio/server/src/cli/doctor.ts`
- Test: `app/motion-studio/server/test/storage/guard.test.ts`

**Interfaces:**
- Produces:
  - `interface StoreMarker { schema_version: 1; store_id: string; volume_uuid: string; created_at: string }`
  - `type StorageFailure = "env_missing" | "not_found" | "marker_missing" | "marker_mismatch" | "volume_mismatch" | "system_volume" | "not_writable" | "low_space"`
  - `type StorageStatus = { ok: true; root: string; marker: StoreMarker; freeBytes: number } | { ok: false; reason: StorageFailure; detail: string }`
  - `interface VolumeProbe { volumeUuid(path: string): Promise<string>; deviceId(path: string): Promise<number>; systemDeviceId(): Promise<number>; freeBytes(path: string): Promise<number> }`
  - `checkStorage(env: StorageEnv, probe: VolumeProbe): Promise<StorageStatus>`, где `StorageEnv = { MS_DATA_DIR?: string; MS_ALLOW_SYSTEM_DISK?: string; MS_MIN_FREE_GB?: string }` (порог по умолчанию 10)
  - `initStore(root: string, probe: VolumeProbe, opts: { adopt?: boolean; allowSystemDisk?: boolean }): Promise<StoreMarker>` — `mkdir` без `recursive`; родитель обязан существовать
  - `macosProbe: VolumeProbe` — `diskutil info -plist` → `VolumeUUID`; `fs.stat().dev`; `fs.statfs()` → `bavail * bsize`
  - Корневой `Makefile` с целями `check` (typecheck + test) и `e2e`; `./check` репозитория вызывает `make -C app/motion-studio check` автоматически

- [ ] **Step 1: Каркас.** package.json (`"private": true`, `"type": "module"`, workspaces `contracts`, `render`, `server`, `engines.node: ">=22"`), tsconfig.base (strict, `module: NodeNext`, `target: ES2022`), Vitest workspace, Makefile: `check: ; ./scripts/with-node.sh npm run typecheck && ./scripts/with-node.sh npm test`. В `.gitignore` пакета: `node_modules/`, `dist/`.
- [ ] **Step 2: Тесты StorageGuard (падают).** Фейковый `VolumeProbe` и каталоги в `tmp/`:

```ts
it("refuses without MS_DATA_DIR", async () =>
  expect(await checkStorage({}, probe)).toMatchObject({ ok: false, reason: "env_missing" }));
it("does not create a missing root", async () => {
  const r = await checkStorage({ MS_DATA_DIR: join(tmp, "absent") }, probe);
  expect(r).toMatchObject({ ok: false, reason: "not_found" });
  expect(existsSync(join(tmp, "absent"))).toBe(false);
});
it("rejects root on system volume", async () => {           // probe.deviceId === systemDeviceId
  expect(await checkStorage({ MS_DATA_DIR: root }, sysProbe)).toMatchObject({ ok: false, reason: "system_volume" });
  expect(await checkStorage({ MS_DATA_DIR: root, MS_ALLOW_SYSTEM_DISK: "1" }, sysProbe)).toMatchObject({ ok: true });
});
it("detects another volume via uuid", ...)  // marker.volume_uuid "A", probe returns "B" → volume_mismatch
it("reports low space", ...)                // freeBytes 5 GiB, порог 10 → low_space
it("initStore requires existing parent", ...) // initStore(join(tmp,"no/such/dir")) rejects; ничего не создано
it("adopt rewrites volume_uuid only", ...)  // store_id прежний, volume_uuid новый
```

- [ ] **Step 3: Запустить** `cd app/motion-studio && ./scripts/with-node.sh npx vitest run server/test/storage` — ожидается FAIL (нет модуля).
- [ ] **Step 4: Реализовать** `guard.ts`, `probe-macos.ts`; `doctor.ts`: `doctor` печатает `StorageStatus`; `doctor --init` / `--adopt` вызывают `initStore` с `macosProbe`; код выхода 1 при `ok: false`.
- [ ] **Step 5: Запустить тесты** — PASS. Ручная проверка: `MS_DATA_DIR=/Volumes/NoSuchDisk/MotionStudio npm run doctor` → `not_found`, каталог не появился.
- [ ] **Step 6:** `npm ci` создаёт lockfile; `./check` зелёный; коммит `feat(motion-studio): каркас workspace и StorageGuard`; `./finish`.

### Task 2: Контракты (P1-02)

**Files:**
- Create: `app/motion-studio/contracts/{package.json,tsconfig.json}`
- Create: `app/motion-studio/contracts/src/{index.ts,time.ts,settings.ts,style.ts,motion-spec.ts,selection.ts,agents.ts,manifest.ts,json-schema.ts}`
- Test: `app/motion-studio/contracts/test/{time,settings,motion-spec,json-schema,manifest}.test.ts`

**Interfaces:**
- Produces (пакет `@ms/contracts`):
  - `Fps = { num: number; den: number }`; `usToFrame(us: number, fps: Fps): number` (floor); `frameToUs(frame: number, fps: Fps): number` (round)
  - `SettingsSchema` (ТЗ §6.4): `aspect_ratio` `"16:9" | "9:16" | "1:1"`, `width`, `height`, `fps`, `duration_frames`, `style_preset` (`"dark-premium" | "light-clean" | "tech-neon"`), `color_palette?`, `font?`, `animation_intensity` (`"calm" | "balanced" | "energetic"`), `background`, `transparent_export`, `safe_area {x, y}` (доли кадра); `defaultSettings()` по Global Constraints
  - `StyleBibleSchema` — поля из `docs/architecture/06-motion-engine.md` §4
  - `MotionSpecSchema`: `{ title, purpose, duration_frames, fps, style_preset, palette_overrides?, elements: Element[], beats: Beat[] }`; `Beat = { id, start_frame, end_frame, action, description, element_ids: string[] }`; `Element = { id, kind: "text" | "number" | "chart" | "graph" | "card" | "shape" | "group", role, content: Record<string, unknown>, layout?: { x, y, w, h } }` (layout в долях кадра)
  - `ComponentSelectionSchema` — как в `04-agent-workflows.md` §4
  - `DirectorOutputSchema = { spec: MotionSpec; selection: ComponentSelection; rationale: string }`
  - `EngineerReportSchema = { files_written: string[]; kit_components_used: string[]; kb_ids_used: string[]; notes: string }`
  - `VersionManifestSchema` — поля из `05-data-model.md` §4 плюс `status: "ready" | "failed"`, `failure?: { stage, message }`, `qa_frames: number[]` и `qa_frames_sha256: string[]` (стоп-кадры и их хеши для проверки воспроизводимости)
  - `toJsonSchema(schema: ZodTypeAny): object` — без `$ref` (`$refStrategy: "none"`), `additionalProperties: false`

- [ ] **Step 1: Тесты (падают).**

```ts
expect(usToFrame(1_000_000, { num: 30000, den: 1001 })).toBe(29);
expect(frameToUs(30, { num: 30, den: 1 })).toBe(1_000_000);
expect(defaultSettings()).toMatchObject({ width: 1920, height: 1080, fps: { num: 30, den: 1 }, duration_frames: 180 });
// beat за пределами длительности
expect(MotionSpecSchema.safeParse(specWith({ duration_frames: 100, beats: [{ start_frame: 90, end_frame: 120 }] })).success).toBe(false);
// beat со start >= end
expect(MotionSpecSchema.safeParse(specWith({ beats: [{ start_frame: 10, end_frame: 10 }] })).success).toBe(false);
// beat ссылается на несуществующий element
expect(MotionSpecSchema.safeParse(specWith({ beats: [{ element_ids: ["nope"] }] })).success).toBe(false);
// JSON Schema пригодна для --json-schema
const js = toJsonSchema(DirectorOutputSchema);
expect(JSON.stringify(js)).not.toContain("$ref");
expect(js).toMatchObject({ type: "object", required: expect.arrayContaining(["spec", "selection", "rationale"]) });
```

- [ ] **Step 2: Запустить** `npx vitest run contracts` — FAIL.
- [ ] **Step 3: Реализовать** схемы; кросс-полевые проверки — через `superRefine`.
- [ ] **Step 4: Запустить** — PASS; `./check`; коммит `feat(motion-studio): контракты сцены и агентов`; `./finish`.

### Task 3: Render-пакет и рендер версии (P1-05)

**Files:**
- Create: `app/motion-studio/render/{package.json,tsconfig.json,remotion.config.ts}`
- Create: `app/motion-studio/render/src/node/{entry.ts,render-version.ts,worker.ts,ffprobe.ts}`
- Create: `app/motion-studio/render/test/fixtures/{hello-scene,hang-scene}/{src/Scene.tsx,props.json,settings.json}`
- Test: `app/motion-studio/render/test/{probe-gate.test.ts,render.e2e.test.ts}`

**Interfaces:**
- Consumes: `Settings`, `Fps` (Task 2)
- Produces (пакет `@ms/render`):
  - `writeEntry(versionDir: string, cacheDir: string, settings: Settings): Promise<string>` — пишет `<cacheDir>/entries/<sha256(versionDir)>/index.tsx`: `registerRoot` с одной `<Composition id="Scene">`, компонент из `<versionDir>/src/Scene.tsx`, `defaultProps` из `props.json`
  - `interface RenderRequest { versionDir: string; settings: Settings; cacheDir: string; stills: number[]; preview: { scale: number; crf: number }; timeoutMs: number }`
  - `interface RenderResult { ok: boolean; stills: string[]; previewPath?: string; probe?: ProbeResult; browserLogs: string[]; error?: { stage: "bundle" | "still" | "media" | "probe" | "timeout"; message: string } }`
  - `renderVersion(req: RenderRequest, signal?: AbortSignal): Promise<RenderResult>` — запускает `worker.ts` дочерним процессом (env: allowlist из Task 6 не нужен, задаём `PATH`, `HOME`, `TMPDIR=<cacheDir>/tmp`); кадры → `<versionDir>/frames/<n>.png`, превью → `<versionDir>/preview.mp4`
  - `ffprobe(path: string): Promise<ProbeResult>`; `ProbeResult = { durationMs: number; width: number; height: number; fps: Fps; codec: string }`
  - `probeGate(probe: ProbeResult, settings: Settings, scale: number): string[]` — пустой массив = pass; допуск длительности ± 1 кадр
- Бандл: `bundle({ entryPoint, outDir: <cacheDir>/bundles/<hash>, webpackOverride })`; `webpackOverride` задаёт `resolve.alias["@ms/motion-kit"]` → `render/src/motion-kit`, `resolve.modules` → только `render/node_modules`.

- [ ] **Step 1: Зависимости.** В `render/package.json` точные версии: `remotion`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/fonts` = `4.0.537`; `react`/`react-dom` — версия, которую требует peer-зависимость Remotion 4.0.537 (зафиксировать точно в lockfile). `npx remotion browser ensure` — скачать Chrome Headless Shell; если sandbox блокирует сеть — остановиться и записать блок в отчёт.
- [ ] **Step 2: Юнит-тест `probeGate` (падает):**

```ts
const s = { ...defaultSettings(), duration_frames: 60 };
expect(probeGate({ durationMs: 2000, width: 960, height: 540, fps: { num: 30, den: 1 }, codec: "h264" }, s, 0.5)).toEqual([]);
expect(probeGate({ durationMs: 2100, width: 960, height: 540, fps: { num: 30, den: 1 }, codec: "h264" }, s, 0.5)).toHaveLength(1);
expect(probeGate({ durationMs: 2000, width: 1920, height: 1080, fps: { num: 30, den: 1 }, codec: "h264" }, s, 0.5)[0]).toMatch(/width/);
```

- [ ] **Step 3: e2e-тесты (падают), цель `make e2e`:** фикстура `hello-scene` — рукописная тестовая сцена из `interpolate` по кадру, 640×360, 60 кадров.

```ts
const r = await renderVersion({ versionDir: hello, settings: s640, cacheDir, stills: [0, 30, 59], preview: { scale: 1, crf: 23 }, timeoutMs: 120_000 });
expect(r.ok).toBe(true);
expect(r.stills).toHaveLength(3);
expect(probeGate(r.probe!, s640, 1)).toEqual([]);
// детерминизм: второй рендер даёт те же кадры
const r2 = await renderVersion({ ...sameReq, versionDir: copyOf(hello) });
expect(sha256(r2.stills[1])).toBe(sha256(r.stills[1]));
// зависание: hang-scene вызывает delayRender() без continueRender()
const h = await renderVersion({ versionDir: hang, settings: s640, cacheDir, stills: [0], preview: { scale: 1, crf: 23 }, timeoutMs: 15_000 });
expect(h).toMatchObject({ ok: false, error: { stage: "timeout" } });
```

- [ ] **Step 4: Реализовать** `entry.ts`, `worker.ts` (bundle → `selectComposition` → `renderStill` по кадрам → `renderMedia` codec `h264`, `crf`, `scale`; `onBrowserLog` в `browserLogs`; сообщение результата — JSON последней строкой stdout), `render-version.ts` (таймаут: SIGTERM, через 5 с SIGKILL), `ffprobe.ts` (системный `ffprobe -v error -print_format json -show_streams -show_format`).
- [ ] **Step 5: Запустить** `make check` и `make e2e` — PASS. Время первого и повторного рендера записать в README пакета.
- [ ] **Step 6:** `./check`; коммит `feat(motion-studio): render-пакет Remotion 4.0.537`; `./finish`.

### Task 4: Статическая проверка кода сцены (P1-06)

**Files:**
- Create: `app/motion-studio/server/src/scenes/{static-check.ts,typecheck.ts}`
- Create: `app/motion-studio/server/test/fixtures/bad-scenes/*.tsx` (по одному нарушению на файл)
- Test: `app/motion-studio/server/test/scenes/static-check.test.ts`

**Interfaces:**
- Produces:
  - `type RuleId = "import-not-allowed" | "dynamic-import" | "forbidden-global" | "forbidden-css-animation" | "outside-src"`
  - `interface Violation { rule: RuleId; file: string; line: number; message: string }` — `message` по-русски, пригоден для передачи агенту
  - `checkSceneSource(files: { path: string; text: string }[]): Violation[]` — TypeScript compiler API, без выполнения кода
  - `typecheckVersion(versionDir: string): Promise<{ file: string; line: number; message: string }[]>` — `ts.createProgram` с `paths`: `@ms/motion-kit` → render/src/motion-kit, типы из `render/node_modules`
- Allowlist импорта: `react`, `react/jsx-runtime`, `remotion`, `@remotion/fonts`, `@ms/motion-kit`, относительные пути внутри `src/`.
- Запрещённые глобалы: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `eval`, `Function`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now`, `Math.random`, `process`, `require`, `globalThis`, `localStorage`, `navigator`.
- CSS: ключи `transition`, `animation` в объектах `style`; строки `className`, содержащие `animate-` или `transition`.

- [ ] **Step 1: Тесты (падают):**

```ts
expect(rules(check("import { motion } from 'framer-motion'"))).toEqual(["import-not-allowed"]);
expect(rules(check("import gsap from 'gsap'"))).toEqual(["import-not-allowed"]);
expect(rules(check("const m = await import('./x')"))).toEqual(["dynamic-import"]);
expect(rules(check("const r = Math.random()"))).toEqual(["forbidden-global"]);
expect(rules(check("fetch('https://x')"))).toEqual(["forbidden-global"]);
expect(rules(check("<div style={{ transition: 'all 1s' }} />"))).toEqual(["forbidden-css-animation"]);
expect(rules(check("<div className=\"animate-pulse\" />"))).toEqual(["forbidden-css-animation"]);
expect(rules(check("import x from '../../outside'"))).toEqual(["outside-src"]);
expect(check(okScene)).toEqual([]);   // useCurrentFrame + interpolate + random('seed') из remotion + @ms/motion-kit
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать.** **Step 4: Запустить** — PASS; `typecheckVersion` на `hello-scene` из Task 3 возвращает `[]`, на фикстуре с ошибкой типа — 1 запись.
- [ ] **Step 5:** `./check`; коммит `feat(motion-studio): статическая проверка кода сцены`; `./finish`.

### Task 5: motion-kit v0.1 (P1-07)

**Files:**
- Create: `app/motion-studio/render/src/motion-kit/{index.ts,tokens.ts,presets.ts,fonts.ts,beat.ts,easing.ts,geometry.ts,format.ts}`
- Create: `app/motion-studio/render/src/motion-kit/components/{Background,AnimatedNumber,LineChart,FlowGraph,PulseAlongPath,Card,KineticText}.tsx`
- Create: `app/motion-studio/render/src/motion-kit/{API.md,PROVENANCE.md}`
- Create: `app/motion-studio/render/test/fixtures/kit-gallery/src/Scene.tsx`
- Test: `app/motion-studio/render/test/kit/{format,beat,geometry}.test.ts`, `app/motion-studio/render/test/kit/gallery.e2e.test.ts`

**Interfaces:**
- Consumes: `StyleBible`, `MotionSpec`, `Beat` (Task 2)
- Produces (импорт `@ms/motion-kit`):
  - `presets: Record<"dark-premium" | "light-clean" | "tech-neon", StyleBible>`; `useStyle(): StyleBible` и `<StyleProvider style>`
  - `ensureFonts(): void` — `@remotion/fonts` `loadFont` для Inter, Manrope, JetBrains Mono из `@fontsource*` (woff2, подмножества latin + cyrillic)
  - `beatProgress(frame: number, beat: Pick<Beat, "start_frame" | "end_frame">, easing?: EasingFn): number` (0..1, clamp); `useBeat(beat): { progress: number; phase: "before" | "enter" | "hold" | "exit" | "after" }`
  - `formatNumber(value: number, opts: { locale: "ru" | "en"; compact?: boolean; decimals?: number }): string`
  - `cubicPoint(p0, p1, p2, p3: Point, t: number): Point`; `pathLUT(segments: CubicSegment[], samples: number): { points: Point[]; lengths: number[] }`; `pointAtLength(lut, s: number): Point`
  - Компоненты (props — в `API.md`, который копируется агенту): `Background`, `AnimatedNumber { from, to, beat, locale, prefix?, suffix? }`, `LineChart { points: { label: string; value: number }[]; beat; area?; highlightLast? }`, `FlowGraph { nodes: { id; label; x; y; w; h; elevation? }[]; edges: { id; from; to }[]; beat }`, `PulseAlongPath { edgeId | segments; beat; color?; tail? }`, `Card { elevation: 0 | 1 | 2 | 3; children }`, `KineticText { text; beat; mode: "words" | "letters"; enter: "rise" | "fade" | "scale" | "slide" }`
- Источники идей — MIT-записи KB (`docs/architecture/06-motion-engine.md` §2); в `PROVENANCE.md` для каждого компонента: `kb_id`, repo, commit из `knowledge/repositories.json`, лицензия, что взято. Код из react-bits, remotion-boilerplate и других restricted-записей не копируется.

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
expect(formatNumber(1_000_000, { locale: "ru" })).toBe("1 000 000");
expect(formatNumber(10_000, { locale: "en" })).toBe("10,000");
expect(beatProgress(0, { start_frame: 10, end_frame: 20 })).toBe(0);
expect(beatProgress(15, { start_frame: 10, end_frame: 20 })).toBeCloseTo(0.5);
expect(beatProgress(99, { start_frame: 10, end_frame: 20 })).toBe(1);
expect(cubicPoint({x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}, 0.5)).toEqual({ x: 1.5, y: 0 });
expect(pointAtLength(pathLUT([straight0to3], 64), 1.5).x).toBeCloseTo(1.5, 2);
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать** чистые функции, затем компоненты (только `useCurrentFrame`/`interpolate`/`spring`, без запрещённого из Task 4); `checkSceneSource` на файлах kit возвращает `[]`.
- [ ] **Step 4: Галерея (e2e).** `kit-gallery` раскладывает все компоненты в одной сцене 1920×1080, 150 кадров, на кириллице («Рост пользователей», «Оркестратор»). Тест: `renderVersion` ok, 5 кадров `[0, 30, 75, 120, 149]`, `probeGate` пуст; кадры 30 и 120 различаются (sha256).
- [ ] **Step 5: Просмотр кадров глазами** (Read PNG): кириллица отрисована нужным шрифтом, нет обрезки, импульс на пути, тени карточек различимы по `elevation`. Кадры сохранить в `docs/evidence/phase-1/slice/kit/`, итог — в `PROVENANCE.md` колонка `rendered: ok | issues`.
- [ ] **Step 6:** `./check`; коммит `feat(motion-studio): motion-kit v0.1`; `./finish`.

### Task 6: AgentRuntimeAdapter и ClaudeCodeRuntime (P1-08)

**Files:**
- Create: `app/motion-studio/server/src/{config.ts}`, `app/motion-studio/server/src/agents/{runtime.ts,claude-code.ts,env.ts}`
- Create: `app/motion-studio/server/test/fixtures/claude/{success.json,is-error.json,schema-violation.json,no-structured.json}` (успешный — реальный ответ из Phase 0, остальные — правка его полей), `app/motion-studio/server/test/fixtures/bin/sleepy-claude.sh`
- Test: `app/motion-studio/server/test/agents/{args,parse,env,timeout}.test.ts`, `app/motion-studio/server/test/agents/claude.e2e.test.ts`

**Interfaces:**
- Consumes: `toJsonSchema` (Task 2)
- Produces:
  - `type Role = "concept" | "motion_director" | "engineer" | "visual_qa" | "edit_planner"`
  - `AgentTask<I>`, `AgentResult<O>`, `AgentRuntimeAdapter` — точно как в `docs/architecture/04-agent-workflows.md` §4–5
  - `loadConfig(env: NodeJS.ProcessEnv): AppConfig`; `AppConfig = { dataDir: string; claudeBin: string; agents: { runtime: "claude-code"; roles: Record<Role, { model: string; timeoutMs: number; maxBudgetUsd: number }> }; scene: { maxCostUsd: number; maxAutoFixes: number }; kb: { root: string; sourceRoot: string } }`; переопределения — `$MS_DATA_DIR/config.json`; значения по умолчанию — Global Constraints
  - `buildClaudeArgs(task: AgentTask<unknown>, jsonSchema: object, systemPrompt: string): string[]`
  - `parseClaudeOutput<O>(stdout: string, schema: ZodType<O>): Pick<AgentResult<O>, "status" | "output" | "error" | "usage" | "permissionDenials" | "sessionId">`
  - `childEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv` — только `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_ALL`, `TMPDIR`
  - `class ClaudeCodeRuntime implements AgentRuntimeAdapter` — `constructor(opts: { bin: string; logRoot: string })`; промпт — через stdin; журнал `<logRoot>/<runId>/{prompt.md,stdout.json,stderr.log}`

- [ ] **Step 1: Тесты (падают):**

```ts
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
// sleepy-claude.sh спит 30 с; timeoutMs 300
expect((await new ClaudeCodeRuntime({ bin: sleepy, logRoot }).run(task300ms, Ok, ctrl.signal)).status).toBe("timeout");
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать.** Отмена: `AbortSignal` → SIGTERM, через 5 с SIGKILL. Фактическая модель — ключ `modelUsage`.
- [ ] **Step 4: e2e (`make e2e`):** реальный `claude`, роль с моделью `haiku`, схема `{ ok: boolean }` → `status: "completed"`, `output.ok === true`, `usage.costUsd > 0`, `usage.model` содержит `haiku`; второй тест — роль engineer в tmp-каталоге пишет `a.txt`, попытка прочитать `~/.zshrc` попадает в `permissionDenials`.
- [ ] **Step 5:** `./check`; коммит `feat(motion-studio): рантайм агентов на Claude Code`; `./finish`.

### Task 7: KnowledgeAdapter (P1-09)

**Files:**
- Create: `app/motion-studio/server/src/knowledge/{adapter.ts,search.ts,synonyms.ts,license.ts,types.ts}`
- Test: `app/motion-studio/server/test/knowledge/{license,search,refs}.test.ts`, `app/motion-studio/server/test/knowledge/golden.test.ts` (читает реальный `knowledge/` репозитория)

**Interfaces:**
- Produces:
  - `CapabilityView` — поля из `docs/architecture/02-integration-map.md` §4.1: `id, name, repo, kind, category, visualizes, use_when, patterns, remotion_compat, compat_flags, adaptations, inputs, repository: { id, url, commit }, license, license_class: "permissive" | "restricted" | "unknown", source_paths, documentation_paths, tested_status, confidence: "medium" | "low" | "unknown", card_path`
  - `licenseClass(license: string): LicenseClass` — `Commons Clause`, `UNLICENSED` → restricted; «не указана», «нет», пусто → unknown; MIT, Apache-2.0, BSD, ISC, CC0 без оговорок → permissive
  - `confidence(view)`: `static-review` + native → medium; `static-review` + adaptable → low; иначе unknown
  - `interface SearchFilters { compat?: RemotionCompat[] /* по умолчанию ["native","adaptable"] */; kinds?: string[]; patterns?: string[]; allowRestricted?: boolean /* по умолчанию false */ }`
  - `interface SearchHit { view: CapabilityView; score: number; matched: string[] }`
  - `class KnowledgeAdapter`: `static load(opts: { kbRoot: string; sourceRoot: string }): Promise<KnowledgeAdapter>`; `search(query: string, filters?: SearchFilters, limit?: number): SearchHit[]`; `getCapability(id): CapabilityView | undefined`; `getComponentCard(id): Promise<string>`; `getSourceReference(id): Promise<{ path: string; absPath: string; exists: boolean }[]>`; `getVisualPatterns(slug: string): Promise<string>` (курируемая часть `patterns/<slug>.md` без автотаблицы); `getCompatibility(id): { status; flags; adaptations; tested_status }`; `copyRefs(ids: string[], destDir: string): Promise<{ id: string; copied: string[]; missing: string[] }[]>` — копирует `source_files` в `destDir/<id>/…`, отказывается для `license_class !== "permissive"`
- Поиск: токенизация в нижнем регистре, `ё → е`, усечение русских слов длиннее 6 символов до 6; EN-токены расширяются по `synonyms.ts` (`chart→график`, `growth→рост`, `counter→счетчик`, `number→число`, `user→пользовател`, `architecture→архитектур`, `diagram→схем`, `node→узел`, `edge→связ`, `pulse→импульс`, `beam→луч`, `flow→поток`, `kinetic→кинетическ`, `typography→типограф, текст`, `card→карточк`, `depth→объем, глубин`); веса: name/id 3, visualizes 2, voiceover_cues 2, use_when 1, category/patterns 1; множитель совместимости native 1.5, adaptable 1.2.

- [ ] **Step 1: Тесты (падают):**

```ts
expect(licenseClass("MIT + Commons Clause")).toBe("restricted");
expect(licenseClass("UNLICENSED")).toBe("restricted");
expect(licenseClass("не указана")).toBe("unknown");
expect(licenseClass("MIT (package.json)")).toBe("permissive");
// golden на реальной KB
const kb = await KnowledgeAdapter.load({ kbRoot: repoKnowledge, sourceRoot: process.env.KB_SOURCE_ROOT ?? mainCheckout });
const ids = (q: string, n: number) => kb.search(q).slice(0, n).map(h => h.view.id);
expect(ids("рост пользователей с 10 000 до 1 000 000, плавный график и счётчик", 5)).toContain("remotion-bits/animated-counter");
expect(ids("рост пользователей с 10 000 до 1 000 000, плавный график и счётчик", 10)).toContain("free-remotion-templates/line-chart-anim");
expect(ids("архитектура AI-агента: оркестратор вызывает три инструмента, световые импульсы по связям", 10)).toContain("magicui/animated-beam");
expect(ids("kinetic typography", 5).some(id => id.includes("kinetic"))).toBe(true);
expect(kb.search("счётчик").every(h => h.view.license_class === "permissive")).toBe(true);
expect(kb.getCapability("remotion-bits/animated-counter")!.repository.commit).toMatch(/^[0-9a-f]{7,}$/);
// refs: отсутствующий исходник не валит адаптер
expect((await kbWithFakeRoot.getSourceReference("remotion-bits/animated-counter"))[0].exists).toBe(false);
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать.** Если golden-ожидание не проходит из-за формулировки самой записи KB — тест не подгонять и KB не править; описать находку в отчёте задачи для решения человеком.
- [ ] **Step 4: Запустить** — PASS; `./check`; коммит `feat(motion-studio): KnowledgeAdapter`; `./finish`.

### Task 8: Файловый SceneStore (часть P1-20)

**Files:**
- Create: `app/motion-studio/server/src/scenes/{store.ts,hash.ts,ids.ts}`
- Test: `app/motion-studio/server/test/scenes/store.test.ts`

**Interfaces:**
- Consumes: `checkStorage`, `VolumeProbe` (Task 1); `VersionManifestSchema` (Task 2)
- Produces:
  - `newId(prefix: "scn" | "ver" | "drf" | "run"): string` — ULID с префиксом
  - `interface Draft { id: string; dir: string; sceneId: string; parentVersionId?: string }`
  - `createDraft(dataDir: string, sceneId: string, parentVersionId?: string): Promise<Draft>` — `workspace/drafts/<drf_…>/`; при `parentVersionId` копирует `src/`, `props.json`, `spec.json` родителя
  - `publishVersion(draft: Draft, meta: Omit<VersionManifest, "files" | "version_id" | "number" | "created_at">, guard: () => Promise<StorageStatus>): Promise<{ versionId: string; dir: string; manifest: VersionManifest }>` — перепроверяет хранилище, считает sha256 всех файлов, пишет `manifest.json`, `rename` в `workspace/projects/playground/scenes/<sceneId>/versions/<ver_…>/`, `chmod -R a-w`
  - `readVersion(dir: string): Promise<VersionManifest>` — проверяет sha256 файлов, при расхождении — ошибка

- [ ] **Step 1: Тесты (падают):**

```ts
const v = await publishVersion(draft, meta, okGuard);
expect(existsSync(draft.dir)).toBe(false);
await expect(writeFile(join(v.dir, "props.json"), "{}")).rejects.toMatchObject({ code: "EACCES" });
expect((await readVersion(v.dir)).files.find(f => f.path === "src/Scene.tsx")!.sha256).toBe(sha256(sceneText));
expect(v.manifest.number).toBe(1);                         // следующая — 2
await expect(publishVersion(draft2, meta, offlineGuard)).rejects.toThrow(/storage_unavailable/);
expect(existsSync(draft2.dir)).toBe(true);                  // ничего не переносили
```

- [ ] **Step 2–4:** FAIL → реализовать → PASS. **Step 5:** `./check`; коммит `feat(motion-studio): файловый SceneStore`; `./finish`.

### Task 9: Пайплайн среза, промпты и CLI `generate` (P1-20)

**Files:**
- Create: `app/motion-studio/prompts/{motion-director.md,engineer.md}`
- Create: `app/motion-studio/server/src/pipeline/{generate.ts,refs.ts,budget.ts}`, `app/motion-studio/server/src/cli/generate.ts`
- Modify: `app/motion-studio/package.json` (скрипты `doctor`, `generate`)
- Test: `app/motion-studio/server/test/pipeline/generate.test.ts` (фейковые адаптеры — только логика), `app/motion-studio/server/test/pipeline/slice.e2e.test.ts` (всё реальное)

**Interfaces:**
- Consumes: всё из Task 1–8
- Produces:
  - `interface GenerateDeps { storage: () => Promise<StorageStatus>; kb: KnowledgeAdapter; agents: AgentRuntimeAdapter; render: typeof renderVersion; check: typeof checkSceneSource; typecheck: typeof typecheckVersion; config: AppConfig }`
  - `generateScene(prompt: string, settings: Settings, deps: GenerateDeps, signal?: AbortSignal): Promise<GenerateResult>`; `GenerateResult = { status: "ready" | "failed"; versionDir: string; previewPath?: string; costUsd: number; attempts: number; failure?: { stage: "storage" | "director" | "engineer" | "static" | "typecheck" | "render" | "probe" | "budget"; message: string } }`
  - `prepareRefs(draftDir: string, selection: ComponentSelection, kb: KnowledgeAdapter): Promise<void>` — `refs/kb/<id>/…` (только permissive), `refs/kb/<id>/CARD.md`, `refs/motion-kit/API.md`, `refs/skills/` — выдержки `official_skills/skills/skills/remotion-markup/` (`SKILL.md`, timing, sequencing, fonts/local-fonts, transitions)
  - CLI: `npm run generate -- "<запрос>" [--duration-frames N] [--aspect 16:9|9:16|1:1] [--style dark-premium|light-clean|tech-neon]` → печатает статус, путь версии, путь превью, стоимость; код выхода 1 при `failed`
- Порядок `generateScene`: storage → `kb.search(prompt, default, 12)` → Motion Director (`DirectorOutputSchema`, без инструментов; вход: запрос, настройки, кандидаты как `CapabilityView`, курируемый текст 1–2 паттернов из кандидатов, `API.md`) → `createDraft` → `spec.json`, `settings.json`, `knowledge-refs.json` (выбранные id с repo, commit, license, strategy) → `prepareRefs` → Engineer (cwd = draft; пишет `src/Scene.tsx` и `props.json`; `EngineerReportSchema`) → `check` + `typecheck` → `render` (стоп-кадры: первый кадр после входа, середины битов, последний) → `probeGate` → `publishVersion(status: "ready")`. Любая ошибка `static`/`typecheck`/`render`/`probe` → повтор Engineer с нарушениями (`Violation[]` / диагностика / ошибка рендера), не более `config.scene.maxAutoFixes` (2); затем `publishVersion(status: "failed", failure)` с логами и превью, если оно есть. Перед каждым вызовом агента — проверка `budget`: сумма `costUsd` ≥ `config.scene.maxCostUsd` → `failure.stage = "budget"`.
- Промпты пишутся по ТЗ §8 (иерархия, детерминизм, интенсивность, safe area, «одна мысль в сцене»), правилам official skills и API motion-kit; в промпте Engineer — «предпочитай motion-kit; код из `refs/kb` адаптируй на кадры; импорт только из allowlist». Ссылок на устаревший `aiplatform/motion` нет.

- [ ] **Step 1: Юнит-тесты логики (падают):**

```ts
// Engineer всегда пишет сцену с Math.random → 1 + 2 исправления → failed
const r = await generateScene("тест", s, depsWithAlwaysBadEngineer);
expect(r).toMatchObject({ status: "failed", attempts: 3, failure: { stage: "static" } });
expect(engineerCalls).toBe(3);
// бюджет: каждый вызов стоит 2.0, лимит 5 → третий вызов не делается
const b = await generateScene("тест", s, depsCost2AndBadRender);
expect(b).toMatchObject({ status: "failed", failure: { stage: "budget" } });
// хранилище недоступно → ничего не создано
const o = await generateScene("тест", s, { ...deps, storage: offline });
expect(o.failure!.stage).toBe("storage"); expect(readdirSync(join(dataDir, "workspace"))).toEqual([]);
// knowledge-refs.json содержит выбранные id с commit
expect(JSON.parse(readFileSync(join(okResult.versionDir, "knowledge-refs.json"), "utf8"))[0]).toMatchObject({ kb_id: expect.any(String), commit: expect.any(String), license: expect.any(String) });
```

- [ ] **Step 2: Запустить** — FAIL. **Step 3: Реализовать** `generate.ts`, `refs.ts`, `budget.ts`, CLI, промпты. **Step 4: Запустить** — PASS.
- [ ] **Step 5: Реальный прогон среза (e2e, `make e2e`, `MS_DATA_DIR="/Volumes/External SSD/MotionStudio"` после `doctor --init`):** промпты Test 1 и Test 2 из `docs/architecture/09-acceptance-tests.md` дословно. Проверки для каждого:

```ts
expect(r.status).toBe("ready");
const m = await readVersion(r.versionDir);                       // sha256 сходятся
expect(m.knowledge_refs.length).toBeGreaterThan(0);
expect(m.render_env.remotion).toBe("4.0.537");
expect(probeGate(await ffprobe(r.previewPath!), settings, 0.5)).toEqual([]);
// воспроизводимость: рендер копии версии даёт те же стоп-кадры
const again = await renderVersion({ versionDir: copyOf(r.versionDir), settings, cacheDir, stills: m.qa_frames, preview: { scale: 0.5, crf: 23 }, timeoutMs: 300_000 });
expect(again.stills.map(sha256)).toEqual(m.qa_frames_sha256);
```

- [ ] **Step 6: Просмотр глазами** ключевых кадров обоих прогонов (Read PNG): график и числа читаемы (Test 1), узлы и импульсы на связях (Test 2). Evidence в `docs/evidence/phase-1/slice/{test1,test2}/`: `preview.mp4` (если ≤ 10 МБ), кадры, `manifest.json`, `knowledge-refs.json`, стоимость, время. Если качество слабое — записать конкретные замечания в отчёт; результат среза — техническая цепочка, полировка качества — P1-10.
- [ ] **Step 7:** `./check`; коммит `feat(motion-studio): вертикальный срез generate`; `./finish`; отчёт человеку: что прошло автоматически [A], что требует просмотра [H], стоимость прогонов, блокировки sandbox (если были).

---

## Self-review (выполнен при написании)

- Покрытие критерия среза (`07` §2): запрос → агент (Task 6, 9) → KB (Task 7, 9) → Remotion (Task 3, 5) → `preview.mp4` с проверками (Task 3, 4) и воспроизводимая версия (Task 8, 9) — есть.
- Утверждённые решения: `MS_DATA_DIR` и StorageGuard (Task 1, 8, 9), модели по ролям и бюджет в конфиге (Task 6), отсутствие UI/БД/очереди/ASR в срезе, исключение устаревшего Motion (Global Constraints, Task 9).
- Согласованность имён: `renderVersion`, `probeGate`, `checkSceneSource`, `typecheckVersion`, `publishVersion`, `KnowledgeAdapter.copyRefs/search`, `generateScene` используются одинаково во всех задачах.
- Вне среза (следующие задачи Phase 1): Concept, Visual QA, Edit Planner, SQLite и очередь, API, UI, экспорт, правки через чат.
