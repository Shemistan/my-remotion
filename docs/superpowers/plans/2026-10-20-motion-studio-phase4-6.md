---
тип: plan
статус: запланировано
обновлено: 2026-10-20
спека: 2026-10-20-motion-studio-phase4-6.md
---

# AI Video Production — Phase 4 (сцены проекта), Phase 5 (сборка и финальный экспорт), Phase 6 (продуктовая полировка): план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** из утверждённого плана сцен (Approval B) пакетно получить реальные Remotion-сцены проекта тем же движком, что и Playground; сцены смотрятся по одной и в контексте исходного видео, правятся чатом и вручную, версионируются, перегенерируются по одной без вреда соседям, проходят QA и утверждаются (Approval C); затем собрать таймлайн (EDL Phase 2 + сцены + оверлеи) с синхронизацией по якорям слов, отрендерить финал через Remotion (`OffthreadVideo` исходника, исходный звук), экспортировать MP4 H.264/AAC с выбором FPS, разрешения и качества, автоматически проверить результат и воспроизвести его из сохранённого проекта. Phase 6 доводит продукт: управление проектами, диагностика, производительность, стабильность долгих операций, качество анимации (motion-kit v0.3, рубрика Visual QA), восстановление после сбоев, UX и руководство пользователя на русском. Финальная приёмка — 15 шагов Definition of Done и тесты устойчивости через UI на реальных Claude Code, видео и рендере.

**Architecture:** новых пакетов нет. В `@ms/contracts` — схемы производства и чистая математика таймлайна (`production.ts`, `timeline-render.ts`, `final.ts`), общая для сервера, движка и UI. В `@ms/render` — **одна** Remotion-композиция `ProjectTimeline` (исходник через `OffthreadVideo` по EDL, звук — готовая дорожка, сцены — модули версий в `<Sequence>` с `Placement`), `renderTimelineRange` для предпросмотра сцены в контексте, превью таймлайна и финала, локальный медиасервер воркера. Сцены проекта генерирует тот же пайплайн Phase 1 (`runScenePipeline`, выделенный из `playgroundGenerate`) с контекстом сцены плана. В `server` — `src/production/` (сцены проекта, пакет, Approval C, импорт из Playground), `src/timeline/` (сборка и операции таймлайна), `src/final/` (master-исходник, звуковая дорожка, финальный рендер, проверка, воспроизведение), `src/projects/`, `src/diagnostics/`, `src/perf/`. FFmpeg только готовит входы (CFR-master, дорожка звука) и проверяет выход; композиция и кодирование финала — Remotion.

**Tech Stack:** то же, что в Phase 1–3 (Node 22.21.1 через `scripts/with-node.sh`, TS strict ESM, Vitest 5 / ESLint 10 по R5, Zod 3, Fastify 5, React + Vite + TanStack Query, Playwright, `better-sqlite3`, Remotion 4.0.537 точно, системные FFmpeg/ffprobe 7.1.1 с фильтрами `psnr`, `ebur128`, `astats`, Claude Code CLI 2.1.x) плюс `@axe-core/playwright` (MPL-2.0, только devDependency для проверок доступности UI) и `yazl` (MIT, zip диагностического архива). Точные версии — в lockfile при установке.

**Spec:** `docs/superpowers/specs/2026-10-20-ai-motion-studio-design.md` → `AI_Motion_Studio_TZ.md` §5 (A6–A9), §6.1 п.10, §7, §8, §11, §12, §13 Phase 4–6, §14 Test 4; `docs/architecture/03` §5–8, `04` §2–3, §6, `05` §1–7, `06` §5–7, `07` §5, `08`, `09` §5, §7; ADR 0001–0007 (приняты). Потребляет интерфейсы среза (`docs/superpowers/plans/2026-10-20-motion-playground-mvp.md`, Task 1–10), остатка Phase 1 (`.superpowers/sdd/plan-drafts/phase1-rest.md`, Task 11–22) и Phase 2–3 (`.superpowers/sdd/plan-drafts/phase2-3.md`, Task 23–34) по точным именам; решения контроллера R1–R7.

## Порядок и параллельность

```text
Phase 1–3 (Task 1–34)
  └─▶ 35 ─▶ 36 ─▶ 37 ─▶ 38 ─▶ 39 ─▶ 40 ─▶ 41 (приёмка Ph4)
                    └──────────────▶ 42 ─▶ 43 ─▶ 44 ─▶ 45 ─▶ 46 (приёмка Ph5)
                                                              │
       47 ─┐  48 ─┐  49 ─┐  50 ─┐  ──▶ 51 ─▶ 52 (финальная приёмка)
```

| Волна | Задачи | Параллельно |
|---|---|---|
| 1 | 35 | — |
| 2 | 36 | — |
| 3 | 37, 42 | да: `server/src/production` ↔ `server/src/timeline` (42 нужен только 35–36) |
| 4 | 38, 43 | да: `production/batch*` ↔ `final/*` |
| 5 | 39, 44 | да |
| 6 | 40, 45 | да: разные маршруты и страницы; общий `web/src/i18n/ru.ts` — append-only |
| 7 | 41, затем 46 | — (приёмки на одном сторе последовательно) |
| 8 | 47, 48, 49, 50 | да: `projects/` ↔ `diagnostics/` ↔ `perf/` ↔ `motion-kit` + `qa/` |
| 9 | 51 | — |
| 10 | 52 | — |

Общие файлы с правками append-only: `server/src/jobs/handlers.ts`, `contracts/src/index.ts`, `web/src/i18n/ru.ts`, `server/src/api/app.ts`. Параллельные задачи — только в отдельных worktree.

## Global Constraints

- Всё из Global Constraints среза, остатка Phase 1 и Phase 2–3 остаётся в силе: Node 22.21.1 через `scripts/with-node.sh`; Remotion 4.0.537 точно; данные только в `MS_DATA_DIR` через StorageGuard и `safeMkdir`; агенты только `claude -p --restricted --strict-mcp-config …` без Bash и без bypass; модели `agents.<role>.model`; Host/Origin на `127.0.0.1:8790`; `Idempotency-Key` на создающих POST; строки UI только через `t(key)`; коммиты без строк соавторства; ветки и `./finish` — контроллер; R1–R7.
- **ADR 0007 для всех новых задач:** draft на попытку (`createJobDraft`), публикация только через `SceneRepo.publish` или `ArtifactStore.publish` с fencing `jobs.attempt` в той же транзакции; все дочерние процессы (Remotion-воркер, ffmpeg, `claude`, медиасервер воркера) — через `spawnTracked` со своей группой и `ProcessRegistry`; повтор без подтверждённого завершения прежней попытки — только `blocked(stale_process)`; неоднозначный draft — `.quarantined`, автоматически не удаляется.
- **Один движок.** Сцены проекта генерируются, рендерятся и проверяются тем же пайплайном и тем же `@ms/render`, что в Playground; финал и предпросмотр в контексте — одна композиция `ProjectTimeline` в Remotion. FFmpeg допускается только для подготовки входов (CFR-master, дорожка звука) и для проверки выхода. FFmpeg-оверлей финала не делаем (ADR 0008, Task 36).
- **Конфликтующие операции над одной сценой не идут параллельно.** Типы `playground.generate`, `playground.edit`, `scene.restore`, `production.generate`, `production.edit`, `scene.import` берут `scene:<sceneId>` в `claimNext` (`lockKeyFor`); вторая задача ждёт в очереди и видна в UI с позицией. Пакет, таймлайн и финал берут `project:<p>:batch`, `project:<p>:timeline`, `project:<p>:final`. Синхронные правки таймлайна при занятом замке — 409 `resource_busy`.
- **Время:** только целые µs (`source`, `edited`) и кадры `timeline_fps` проекта; `scene_local` — кадры сцены, `scene_local = timeline_frame − clip.start_frame`. Все переводы — функции `@ms/contracts` (`usToFrame`, `frameToUs`, `snapUsToFrame`, `buildTimeline`, `sourceToEdited`, `editedToSource`, `rangeFromWords` + Task 35). Своих формул времени в сервере, движке и UI нет. Смысловые привязки — id слов; перенос сцены после правки EDL — по якорю-слову, а не по абсолютному времени.
- **Approvals:** C — на конкретную версию сцены (`scene:<sceneId>@<versionId>`); `final` — явное нажатие «Смонтировать и экспортировать» на конкретную ревизию таймлайна и настройки экспорта. Финальный рендер проверяет свежесть A, B, C каждой включённой сцены и `final` в той же транзакции, что захват задачи; устаревшее — `approval_required` / `timeline_stale`, без «тихой» сборки (ТЗ §11.2).
- **Исходник неизменяем:** финал читает только `source/` (через CFR-master в `proxy/<media>/master@<fps>/`) и прокси; ни один выход ffmpeg или Remotion не пишется в `source/` (`assertOutsideSource`).
- **Звук:** исходная речь сохраняется; громкость не меняется (без нормализации и компрессии); склейки — микрофейды `roughcut.fadeUs` как в превью rough cut.
- **Воспроизводимость:** финал определяется `final-manifest.json` (ревизии EDL, плана, стиля, таймлайна, sha256 версий сцен, sha256 master и дорожки звука, настройки, `render_env`); `inputs_hash = canonicalHash(inputs)`; повторный экспорт из сохранённого проекта сверяется автоматически.
- **Удаление никогда не бывает тихим:** проекты, черновики в карантине, кэш с упоминанием в манифестах удаляются только явным действием человека с подтверждением; удаление проекта — перенос в корзину `workspace/trash/`, очистка корзины — отдельное подтверждённое действие.
- **ai-platform не меняется:** только запуск ASR-воркера Phase 2 и чтение коммита; других источников кода и идей из него нет.
- **Реальность приёмки:** фейковые агенты и бинарники — только в юнит-тестах логики; e2e и приёмка — реальный `claude`, реальный `renderMedia`, реальные ffmpeg/ffprobe, реальный ролик пользователя (V4); mock-результат не засчитывается. Тестовые медиа юнит-тестов — `scripts/make-media-fixtures.mjs` (Task 25) в `tmp/media-fixtures/`.
- Evidence — `docs/evidence/phase-4/…`, `phase-5/…`, `phase-6/…`, `final/…`; видео в git не кладётся (sha256, ffprobe, путь в `MS_DATA_DIR`); кадры личного ролика — ≤ 480 px; превью сцен (сгенерированная графика без кадров пользователя) — если ≤ 10 МБ.

## Review Focus

1. Финал на 1 кадр сдвинут относительно звука или исходника: `clipsToSequences` и `audioSampleRange` дают одни и те же границы, что `buildTimeline`; `final.verify` ловит сдвиг ±1 кадр (`alignmentOffset`) и рассинхрон звука (Task 35, 36, 44).
2. Сборка из устаревшего: после новой версии сцены, правки EDL или плана финал без переутверждения невозможен; `assembleGate` в транзакции (Task 35, 43, 46).
3. Перегенерация сцены 2 не меняет файлы, версии и Approval C сцен 1 и 3; две правки одной сцены не идут одновременно (Task 39, 41).
4. Оверлей поверх лица в отрендеренных кадрах (а не только в плане) — blocking `face_ink` (Task 37).
5. Сервер убит во время финального рендера: Remotion-воркер и медиасервер (группа) убиты, задача `pending` → `completed` или `blocked(stale_process)`; частичный `final.mp4` не публикуется (Task 43, 46, 52).
6. Медиасервер воркера отдаёт только перечисленные файлы, только на `127.0.0.1`, с токеном в пути; сцена не может обратиться к сети (static check) — исключение из QA-правила `network` действует только для URL этого сервера (Task 36).
7. Удаление проекта при активной задаче — 409 `project_busy`; без набранного названия — `confirm_mismatch`; файлы уходят в корзину, не стираются (Task 47).

## Противоречия и пробелы спеки — на решение контроллера

| # | Где | Суть | Предложение по умолчанию (план исходит из него) |
|---|---|---|---|
| F1 | ТЗ §5 A9 «композировать исходное видео» ↔ `05` §2 «VFR → CFR прокси» ↔ прокси 720p | `OffthreadVideo` по VFR/повёрнутому/10-битному HEVC оригиналу не даёт точного кадра по EDL; прокси — низкое качество | дериватив `master@<fps>`: из оригинала, полный размер с учётом поворота, CFR `timeline_fps`, H.264 High CRF 12, `-g` = 1 с, `yuv420p`, без звука; строится один раз и кэшируется по `(sha256 оригинала, fps)`; превью — по прокси (тот же CFR, тот же индекс кадра) |
| F2 | пользователь: «`OffthreadVideo` … с исходным звуком» ↔ микрофейды 8 мс < 1 кадра | громкость Remotion задаётся покадрово — сэмпл-точных склеек нет | видео-клипы `OffthreadVideo muted`; звук — `edited-audio.wav` (PCM 48 кГц, стерео как в оригинале), собранный ffmpeg тем же фильтром, что превью rough cut (`buildAudioFilter`), и подключённый одной `<Audio>`; Remotion кодирует AAC |
| F3 | `07` §5 «Remotion `OffthreadVideo` либо FFmpeg-оверлей — выбор по замеру» ↔ требование пользователя «один движок» | второй путь композитинга | только Remotion-композиция `ProjectTimeline`; ADR 0008 (`предложено`, Task 36) фиксирует решение; замер скорости — в Task 49 как профиль, не как выбор движка |
| F4 | ТЗ §8.4 overlay/PiP ↔ сцены Playground рисуются на весь кадр | как сцена встраивается в кадр | `placementFor(mode, zone)`: `overlay`, `callout` — холст во весь кадр, прозрачный, графика только в `rect` зоны (`props.layout.rect`); `fullscreen` — во весь кадр, непрозрачный; `pip`, `split_screen` — непрозрачный холст размером зоны, масштабируется `Placement`; смена класса холста (overlay ↔ pip) — только перегенерацией. Размер холста детям задаёт `<Sequence width height>` Remotion 4 — **[Д]** проверить на 4.0.537 в Task 36; если не работает — fallback: обёртка-`div` с `scale` и `VideoConfig`-провайдер в `Placement` (без второго движка) |
| F5 | ТЗ §5 A8 «Approval C: только утверждённые сцены включаются по умолчанию» | C на сцену или на версию; что делать с неутверждёнными | C на версию; новая версия не снимает C со старой, таймлайн берёт утверждённую (UI: «утверждена v2, текущая v3»); неутверждённая сцена исключена, включить можно явно с причиной (`include: "override"`), такие сцены перечислены в диалоге финала |
| F6 | ТЗ §11.2 «Final: явное действие» | один раз на проект или на каждый экспорт | `final` создаётся самим нажатием «Смонтировать и экспортировать» на пару (ревизия таймлайна, настройки); любой новый экспорт — новое нажатие; изменение таймлайна делает прежний `final` `stale` |
| F7 | ТЗ §5 A8 «переместить сцену; система проверяет смысловую привязку» + «контроль длительности» | можно ли растянуть сцену без перегенерации | перемещение — в пределах, где все `key_terms` внутри окна сцены (иначе blocking `anchor_outside`, снимается только причиной); изменение длительности — новая версия без LLM (`EditPlan.path = "param"`, `timing_scale = new/old`), Approval C этой сцены нужен заново |
| F8 | ТЗ §5 A9 «выбор FPS» ↔ исходник снят в `timeline_fps` | экспорт в другом FPS | разрешены `timeline_fps`, 24, 25, 30, 50, 60; иной FPS — предупреждение «кадры исходника будут дублироваться/пропускаться», сцены — `scaleTiming`, исходник — `OffthreadVideo` на master по времени; допуски проверки — 1 кадр выходного FPS |
| F9 | ADR 0005 «сервер только loopback» ↔ `OffthreadVideo` требует URL | как рендер получает гигабайтный master | медиасервер внутри render-воркера: `127.0.0.1:0`, случайный токен в пути, только перечисленные файлы, Range; копий в `publicDir` нет (**[Д]** проверить; если `OffthreadVideo` примет `file://` на 4.0.537 — использовать его, сервер не нужен) |
| F10 | ТЗ §5 A9 «MP4 H.264/AAC … экспорт сцен отдельно … manifest и повторно открываемый проект» | что ещё экспортировать | финал — только MP4 H.264/AAC (`yuv420p`, 48 кГц, 192 кбит/с), качество `high`/`standard`/`draft` = CRF 16/20/24, разрешение `source`/`2160p`/`1080p`/`720p` по короткой стороне; рядом `final-manifest.json`, `verify.json`, `project-snapshot.json`; сцены — экспорт Phase 1 (MP4, ProRes 4444) |
| F11 | ТЗ Phase 6 «motion-kit, camera/motion patterns» ↔ `07` §5 «overlay/PiP-режимы в motion-kit — Phase 4» | где версия kit | Phase 4 — `0.2.1` (только `Placement`, `ZoneFrame`, `LowerThird` для оверлеев); Phase 6 — `0.3.0` (качество движения, переходы, камера, новые пресеты) |
| F12 | бюджет пакета | ТЗ/ADR задают $5 на сцену | `scene.maxCostUsd` $5 на задачу сцены без изменений; перед пакетом UI показывает оценку `n × 5`; настройка `production.maxBatchCostUsd` (по умолчанию не задана) — превышение оценки → 409 `budget` до старта |
| F13 | ТЗ Phase 6 «нагрузочные тесты» | нет целевых чисел | профиль на этом Mac: пакет 6 сцен (рендер фикстур) + финал 120 с 1080p; цели — **[Д]**, фиксируются первым замером; регрессия > 25 % относительно записанного профиля — предупреждение, не провал |
| F14 | ТЗ §1.2 / §11 Phase 6 «удаление» ↔ иммутабельность и ADR 0007 | удаление данных | корзина `workspace/trash/<project>-<ts>/` + `projects.deleted_at`; очистка — задача `trash.purge` после второго подтверждения; восстановление из корзины — до очистки |

---

### Task 35: Контракты и данные производства — сцены проекта, таймлайн, финал, Approval C

**Files:**
- Create: `app/motion-studio/contracts/src/{production.ts,timeline-render.ts,final.ts,api-production.ts}`
- Modify: `app/motion-studio/contracts/src/{jobs.ts,approvals.ts,scene-props.ts,index.ts}`
- Create: `app/motion-studio/server/src/db/migrations/003_production.sql`, `app/motion-studio/server/src/db/repos/{production-scenes,batches,timelines,final-exports}.ts`
- Modify: `app/motion-studio/server/src/jobs/{locks.ts,queue.ts,types.ts}`, `app/motion-studio/server/src/approvals/{engine.ts,subjects.ts}`, `app/motion-studio/server/src/artifacts/paths.ts`, `app/motion-studio/server/src/config.ts`
- Test: `app/motion-studio/contracts/test/{production,timeline-render,final}.test.ts`, `app/motion-studio/server/test/db/migrate-003.test.ts`, `app/motion-studio/server/test/jobs/locks-production.test.ts`, `app/motion-studio/server/test/approvals/approval-c.test.ts`

**Interfaces:**
- Consumes: `Fps`, `usToFrame`, `frameToUs`, `toJsonSchema` (Task 3); `ScenePropsBaseSchema`, `JobTypeSchema`, `JobErrorSchema`, `ExportRequestSchema` (Task 11); `buildTimeline`, `EditedTimeline`, `TimelineClip`, `rangeFromWords`, `canonicalHash`, `ScenePlanItem`, `CompositionMode`, `Zone`, `NormRect`, `ApprovalSchema`, `ApprovalKind` (Task 23); `ZONE_RECTS` (Task 30); `openDb`, `migrate` (Task 11); `lockKeyFor`, `claimNext`, `finish`, `SCENE_WRITING_TYPES` (Task 12, 24); `approve`, `approvalState`, `currentSubject`, `artifactPaths` (Task 24); `AppConfig`, `loadConfig` (Task 7, 24)
- Produces (`@ms/contracts`):
  - `production.ts`: `PlacementSchema = { mode: Exclude<CompositionMode, "none">; zone: Zone; rect: NormRect; canvas: "full" | "rect"; transparent: boolean }`; `placementFor(mode, zone): Placement` (правила F4); `sceneCanvas(p: Placement, out: { width: number; height: number }): { width: number; height: number }` — для `rect`: `2·round(w·W/2)` × `2·round(h·H/2)`; `ProductionSceneSchema = { scene_id; project_id; plan_id; plan_item_id; plan_revision; origin: "plan" | "playground" | "user"; source_version_id?: string }`; `SceneContextSchema = { plan_item: ScenePlanItem; placement: Placement; canvas: { width; height }; fps: Fps; duration_frames: number; key_terms: { text: string; word_id: string; local_frame: number }[]; narration: string; style_id: string; style_revision: number; face?: NormRect; context_frame?: string }`; `keyTermLocalFrames(item: ScenePlanItem, fps: Fps): { text; word_id; local_frame }[]` — `usToFrame(edited_at_us, fps) − item.frames.start`; `ManualEditSchema = { kind: "text"; element_id: string; text: string } | { kind: "style"; patch: Partial<ScenePropsStyle> } | { kind: "retime"; duration_frames: number } | { kind: "zone"; zone: Zone }`
  - `ScenePropsBaseSchema` (modify): `layout?: { rect: NormRect }` — сцена рисует графику только внутри `rect`
  - `timeline-render.ts`: `SequenceSpec = { idx: number; from: number; durationInFrames: number; startFrom: number }`; `clipsToSequences(tl: EditedTimeline): SequenceSpec[]` — `from = usToFrame(edited_start_us)`, `durationInFrames = usToFrame(edited_start_us + source_end_us − source_start_us) − from`, `startFrom = usToFrame(source_start_us)`; `timelineFrames(tl): number`; `audioSampleRange(c: TimelineClip, sampleRate: number): { start: number; end: number }` — `round(us·sr/1e6)`; `TimelineSceneClipSchema = { clip_id; scene_id; plan_item_id; version_id; include: "approved" | "override"; override_reason?: string; start_frame; duration_frames; placement: Placement; z: number; anchors: { word_id; text; frame: number }[] }`; `ProductionTimelineDocSchema = { schema_version: 1; timeline_id; revision; parent_revision?; fps: Fps; duration_frames; inputs: { media_sha256; edl: { id; revision; hash }; plan: { id; revision; hash }; style: { id; revision; hash } }; video: SequenceSpec[]; scenes: TimelineSceneClip[]; excluded: { plan_item_id; reason: "not_approved" | "no_version" | "failed" | "user" }[]; issues: PlanIssue[]; ops?: TimelineOp[] }`; `TimelineOpSchema = { op: "move"; clip_id; start_frame; override_reason? } | { op: "set_duration"; clip_id; duration_frames } | { op: "use_version"; clip_id; version_id } | { op: "include"; clip_id; include: boolean; override_reason? } | { op: "set_zone"; clip_id; zone: Zone }`; `composeTimeline(i: { tl: EditedTimeline; items: ScenePlanItem[]; scenes: Record<string /* plan_item_id */, { scene_id; version_id?; approved_version_id?; status: "ready" | "failed" | "none" }>; overrides?: Record<string, string>; inputs; timelineId; revision }): ProductionTimelineDoc`; `anchorCheck(clip: TimelineSceneClip, startFrame: number): { ok: true } | { ok: false; outside: string[] }`; `snapToWord(frame: number, wordFrames: number[], maxDist = 6): number`; `timelineChecks(doc): PlanIssue[]` — `scene_overlap` (blocking: пересечение окон двух сцен с непрозрачным холстом или двух сцен в одной зоне), `anchor_outside` (blocking без `override_reason`), `out_of_range` (blocking: окно за пределами `duration_frames`)
  - `final.ts`: `FinalExportRequestSchema = { fps?: Fps; resolution: "source" | "2160p" | "1080p" | "720p"; quality: "high" | "standard" | "draft"; audio_bitrate_kbps: 192 }`; `crfFor(q): number` (16/20/24); `outputSize(display: { width; height }, res): { width; height }` — по короткой стороне, чётные, `source` — как есть; `FinalManifestSchema = { schema_version: 1; export_id; project_id; timeline: { id; revision; hash }; inputs: { edl; plan; style; media_sha256; master_sha256; audio_sha256; scenes: { clip_id; version_id; manifest_sha256 }[] }; request: FinalExportRequest; output: { width; height; fps: Fps; frames: number }; render_env; inputs_hash: string; ffprobe: ProbeResult; verify: { verdict: "pass" | "fail"; report: "verify.json" }; created_at }`; `FinalVerifyReportSchema` (поля — Task 44)
  - `jobs.ts` (modify): `JobTypeSchema` += `"production.batch" | "production.generate" | "production.edit" | "scene.import" | "scene.preview_context" | "timeline.build" | "timeline.preview" | "final.render" | "final.reproduce" | "trash.purge" | "cache.gc"`; `JobErrorSchema.code` += `"timeline_stale" | "scene_not_ready" | "version_failed" | "placement_class_change" | "verify_failed" | "stalled" | "project_busy"`
  - `approvals.ts` (modify): `stale_reason` += `"plan_changed" | "version_changed" | "timeline_changed"`
  - `api-production.ts`: DTO Task 40/45 (`ProductionSceneDto`, `BatchDto`, `SceneEditBody`, `TimelineDto`, `TimelineRevisionBody`, `FinalExportDto`, `FinalVerifyDto`)
- Produces (server):
  - `003_production.sql`: `production_scenes(scene_id PK FK, project_id, plan_id, plan_item_id, plan_revision, origin, source_version_id, UNIQUE(plan_id, plan_item_id))`; `batches(id PK, project_id, plan_id, plan_revision, job_id, estimate_usd, created_at)`; `batch_items(batch_id, plan_item_id, scene_id, job_id, PK(batch_id, plan_item_id))`; `prod_timelines(id PK, project_id UNIQUE, current_revision)`; `prod_timeline_revisions(timeline_id, revision, parent_revision, rel_path, sha256, hash, created_at, PK(timeline_id, revision))`; `final_exports(id PK, project_id, timeline_id, timeline_revision, request_json, inputs_hash, rel_path, sha256, status: "ready" | "failed_verification", verify_json, job_id, created_at)`
  - `lockKeyFor` (modify): `production.generate`, `production.edit`, `scene.import` → `scene:<sceneId>`; `production.batch` → `project:<p>:batch`; `timeline.build` → `project:<p>:timeline`; `final.render`, `final.reproduce` → `project:<p>:final`; `scene.preview_context`, `timeline.preview`, `cache.gc` → `undefined`; `trash.purge` → `store:trash`; `SCENE_WRITING_TYPES` += три типа сцены
  - `approve` (modify): прежние `valid` того же `kind` **и той же области** (`scene:<id>` для C, проект — для A/B) → `revoked`
  - `approveScene(db, i: { sceneId; versionId }): Approval` — версия `failed` → `version_failed`; `subject_ref = "scene:<sceneId>@<versionId>"`, `subject_hash = canonicalHash({ manifest_sha256, placement, duration_frames })`
  - `sceneApprovalState(db, sceneId): { state: "missing" | "valid" | "stale"; versionId?: string; reason? }`
  - `artifactPaths` (modify): `timelineRev(id, n)`, `finalExport(id)`, `master(mediaId, fps)`, `editedAudio(edlId, rev)`, `contextPreview(sceneId, versionId)`, `trash(projectId, ts)`
  - `AppConfig` (modify): `production: { maxBatchCostUsd?: number; contextPadFrames: 30 }`; `final: { timeoutMs: 7_200_000; masterCrf: 12 }`

- [ ] **Step 1: Тесты (падают):**

```ts
const F30 = { num: 30, den: 1 }, F2997 = { num: 30000, den: 1001 };
const tl = buildTimeline(10_000_000, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
expect(clipsToSequences(tl)).toEqual([
  { idx: 0, from: 0, durationInFrames: 60, startFrom: 0 },
  { idx: 1, from: 60, durationInFrames: 195, startFrom: 105 }]);
expect(timelineFrames(tl)).toBe(255);
expect(audioSampleRange(tl.clips[1], 48_000)).toEqual({ start: 168_000, end: 480_000 });
const tl2 = buildTimeline(10_010_000, [{ start_us: 1_001_000, end_us: 2_002_000 }], F2997);
expect(clipsToSequences(tl2).map(s => [s.from, s.durationInFrames, s.startFrom])).toEqual([[0, 30, 0], [30, 240, 60]]);
// размещение
expect(placementFor("overlay", "lower_third")).toMatchObject({ canvas: "full", transparent: true, rect: ZONE_RECTS.lower_third });
expect(sceneCanvas(placementFor("pip", "pip_tr"), { width: 1920, height: 1080 })).toEqual({ width: 576, height: 324 });
expect(sceneCanvas(placementFor("split_screen", "split_left"), { width: 1920, height: 1080 })).toEqual({ width: 960, height: 1080 });
expect(placementFor("fullscreen", "full")).toMatchObject({ canvas: "full", transparent: false });
// якоря: сцена 90 кадров, ключевое слово на кадре 400 таймлайна
const clip = sceneClip({ start_frame: 330, duration_frames: 90, anchors: [{ word_id: "w_000120", text: "миллион", frame: 400 }] });
expect(anchorCheck(clip, 311)).toEqual({ ok: true });
expect(anchorCheck(clip, 300)).toEqual({ ok: false, outside: ["w_000120"] });
expect(snapToWord(103, [90, 100, 120])).toBe(100); expect(snapToWord(110, [90, 100, 120], 6)).toBe(110);
expect(keyTermLocalFrames(item({ frames: { start: 300, end: 390 }, key_terms: [{ text: "миллион", word_id: "w_000120", edited_at_us: 11_000_000 }] }), F30))
  .toEqual([{ text: "миллион", word_id: "w_000120", local_frame: 30 }]);
// состав таймлайна: без C сцена исключена
const doc = composeTimeline({ tl, items: [i1, i2, i3], scenes: { sp_001: ready("ver_a", "ver_a"), sp_002: ready("ver_b"), sp_003: { scene_id: "s3", status: "failed" } }, inputs, timelineId: "tml_1", revision: 1 });
expect(doc.scenes.map(c => c.plan_item_id)).toEqual(["sp_001"]);
expect(doc.excluded).toEqual([{ plan_item_id: "sp_002", reason: "not_approved" }, { plan_item_id: "sp_003", reason: "failed" }]);
expect(outputSize({ width: 1080, height: 1920 }, "1080p")).toEqual({ width: 1080, height: 1920 });
expect(outputSize({ width: 3840, height: 2160 }, "720p")).toEqual({ width: 1280, height: 720 });
expect(crfFor("standard")).toBe(20);
// замки
expect(lockKeyFor(job("production.edit", { sceneId: "scn_1" }))).toBe("scene:scn_1");
expect(lockKeyFor(job("final.render", { projectId: "p1" }))).toBe("project:p1:final");
expect(lockKeyFor(job("timeline.preview", { projectId: "p1" }))).toBeUndefined();
// Approval C — область сцены
const c1 = approveScene(db, { sceneId: "s1", versionId: "v1" }); const c2 = approveScene(db, { sceneId: "s2", versionId: "v5" });
expect(sceneApprovalState(db, "s1").state).toBe("valid");   // C другой сцены не отозвал C первой
approveScene(db, { sceneId: "s1", versionId: "v2" });
expect(approvals.get(db, c1.id).status).toBe("revoked"); expect(approvals.get(db, c2.id).status).toBe("valid");
expect(() => approveScene(db, { sceneId: "s1", versionId: "v_failed" })).toThrow(/version_failed/);
expect(migrate(db)).toEqual({ from: 2, to: 3 });
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS (`./scripts/with-node.sh npx vitest run contracts/test server/test/db server/test/jobs server/test/approvals`). **Step 4:** `./check`; коммит `feat(motion-studio): контракты и данные производства сцен`.

### Task 36: Единый движок — композиция `ProjectTimeline`, `Placement`, рендер диапазона (ADR 0008)

**Files:**
- Create: `app/motion-studio/render/src/timeline/{ProjectTimeline.tsx,Placement.tsx,entry.ts,render-range.ts,media-server.ts,worker-timeline.ts}`
- Create: `app/motion-studio/render/src/motion-kit/components/{ZoneFrame,LowerThird}.tsx`; Modify: `app/motion-studio/render/src/motion-kit/{index.ts,API.md,PROVENANCE.md}` (версия `0.2.1`)
- Create: `app/motion-studio/server/src/media/{edited-audio.ts,master.ts}`
- Modify: `app/motion-studio/server/src/edit/preview-filter.ts` — выделить `buildAudioFilter(clips, sampleRate, fadeUs)`; `buildPreviewFilter` использует его
- Modify: `app/motion-studio/server/src/qa/programmatic.ts` — правило `network` пропускает только `allowedOrigins` из `RenderResult`
- Modify: `app/motion-studio/render/src/node/ffprobe.ts` — `ProbeResult` += `audioSampleRate?: number; audioChannels?: number`
- Create: `docs/decisions/0008-single-remotion-engine-final.md` (тип `adr`, статус `предложено`)
- Create: `app/motion-studio/render/test/fixtures/timeline/{overlay-lower-third,fullscreen-card}/{src/Scene.tsx,props.json,settings.json}`
- Test: `app/motion-studio/render/test/timeline/{placement,entry,media-server}.test.ts`, `app/motion-studio/server/test/media/{edited-audio,master}.test.ts`, `app/motion-studio/render/test/timeline/timeline.e2e.test.ts`

**Interfaces:**
- Consumes: `writeEntry`, `contentKey`, `renderVersion`, `ffprobe`, `ProbeResult`, `ensureRenderBrowser` (Task 4); `spawnTracked`, `ProcessRegistry` (Task 2, 13); `checkSceneSource` (Task 5); `resolveStyle`, `StyleProvider`, `safeRect` (Task 6, 14); `clipsToSequences`, `audioSampleRange`, `Placement`, `sceneCanvas`, `ProductionTimelineDoc` (Task 35); `runFfmpeg`, `probeMedia`, `assertOutsideSource` (Task 25); `buildPreviewFilter` (Task 28)
- Produces (`@ms/render`):
  - `<ProjectTimeline>` — props `TimelineRenderProps = { width; height; fps: Fps; duration_frames; video: { src: string; sequences: SequenceSpec[] }; audio?: { src: string }; scenes: { clip_id; key: string /* модуль в реестре entry */; props: unknown; start_frame; duration_frames; placement: Placement; canvas: { width; height }; z: number }[] }`: каждый `SequenceSpec` → `<Sequence from durationInFrames><OffthreadVideo src startFrom muted /></Sequence>`; звук — одна `<Audio src>`; сцены — `<Sequence from durationInFrames width height>` (F4) внутри `<Placement>` в порядке `z`
  - `<Placement placement canvas>` — `canvas = "full"`: абсолютный слой во весь кадр; `"rect"`: слой размером `canvas`, `transform: scale` в `rect` кадра; прозрачность — без фона
  - `writeTimelineEntry(i: { scenes: { key: string; versionDir: string }[]; cacheDir: string }): Promise<string>` — `<cacheDir>/entries/tl-<sha256(contentKey всех версий)>/index.tsx`: статические импорты `src/Scene.tsx` каждой версии в реестр, одна `<Composition id="ProjectTimeline">`
  - `serveMedia(files: Record<string, string>): Promise<{ origin: string; urlFor(key: string): string; close(): Promise<void> }>` — `http.createServer` на `127.0.0.1:0`; путь `/<token 32 hex>/<key>`; только перечисленные ключи (иначе 404); `Range` → 206; запускается внутри `worker-timeline.ts` (та же группа процессов)
  - `interface TimelineRenderRequest { props: Omit<TimelineRenderProps, "video" | "audio"> & { video: { path: string; sequences }; audio?: { path: string } }; versionDirs: Record<string, string>; cacheDir: string; range?: [number, number]; stills: number[]; output?: { path: string; codec: "h264"; crf: number; scale: number; audioBitrateKbps: number; x264Preset: "medium" | "veryfast" }; timeoutMs: number; run: RunRef; registry?: ProcessRegistry }`
  - `renderTimelineRange(req, signal?): Promise<{ ok: boolean; stills: string[]; outPath?: string; probe?: ProbeResult; browserLogs: string[]; allowedOrigins: string[]; error?: { stage: "bundle" | "still" | "media" | "probe" | "timeout" | "aborted"; message: string } }>` — перед бандлом `checkSceneSource` каждой версии (сцена не обходит static check в составе таймлайна)
- Produces (server):
  - `buildAudioFilter(clips: TimelineClip[], sampleRate: 48000, fadeUs: number): string` — `atrim=start_sample:end_sample` по `audioSampleRange`, `asetpts`, `afade` in/out, `concat=…:v=0:a=1`
  - `buildEditedAudio(i: { input: string; tl: EditedTimeline; fadeUs: number; out: string; run; signal; registry? }): Promise<{ path: string; sha256: string; samples: number }>` — `-ar 48000`, каналы как в источнике, `pcm_s24le`; длина = `round(duration_us·48000/1e6)` сэмплов
  - `masterArgs(input: string, out: string, probe: ProbeSummary, fps: Fps, crf: number): string[]` — автоповорот, `fps=<num>/<den>`, `-fps_mode cfr`, `libx264 -preset medium -crf <crf> -g <round(fps)> -pix_fmt yuv420p -an -movflags +faststart`; `ensureMaster(deps, mediaId, fps): Promise<{ path; sha256 }>` — дериватив `master@<num>-<den>` в `proxy/<media>/`, повторный вызов — из кэша (sha256 сверяется); `assertOutsideSource` на выходе
- ADR 0008: контекст F1–F4, F9; решение — одна композиция Remotion, FFmpeg только подготовка и проверка; последствия — время рендера финала, кэш master.

- [ ] **Step 1: Юнит-тесты (падают):**

```ts
expect(buildAudioFilter(tl.clips, 48_000, 8_000)).toContain("atrim=start_sample=168000:end_sample=480000");
const srv = await serveMedia({ master: masterFile });
expect((await fetch(srv.urlFor("master"), { headers: { Range: "bytes=0-99" } })).status).toBe(206);
expect((await fetch(srv.origin + "/" + "0".repeat(32) + "/master")).status).toBe(404);
expect((await fetch(srv.urlFor("master").replace("master", "..%2Fetc%2Fpasswd"))).status).toBe(404);
expect(new URL(srv.origin).hostname).toBe("127.0.0.1");
expect(masterArgs("in.mov", "out.mp4", probeRot90, { num: 30, den: 1 }, 12)).toEqual(expect.arrayContaining(["-crf", "12", "-g", "30", "-an", "-fps_mode", "cfr"]));
expect(() => assertOutsideSource(join(root, "workspace/projects/p1/source/med_1/master.mp4"), root)).toThrow();
await expect(writeTimelineEntry({ scenes: [{ key: "S0", versionDir: badVersion /* fetch() */ }], cacheDir })).rejects.toThrow(/forbidden-global/);
```

- [ ] **Step 2: e2e (`make e2e`, падает):** фикстура `talk-ru-cfr.mp4` (1280×720, 30/1, `testsrc2` со счётчиком кадров, ≈ 20 с), вырезка 2,0–3,5 с; сцены `overlay-lower-third` (кадры 150–240, `lower_third`, прозрачная) и `fullscreen-card` (300–360); `renderTimelineRange` целиком, 1280×720, CRF 18:
  - [A] ffprobe: `h264`, `aac`, 48 000 Гц, длительность `frameToUs(timelineFrames(tl), F30) ± 33 334` µs (для 20-секундной фикстуры — 18 500 000);
  - [A] кадр 100 (вне сцен) совпадает с кадром 145 исходника лучше, чем с 143, 144, 146, 147 (`psnr` ffmpeg), PSNR ≥ 30 дБ;
  - [A] кадр 200: вне `ZONE_RECTS.lower_third` PSNR с исходником ≥ 35 дБ, внутри — < 25 дБ; кадр 330 = still сцены `fullscreen-card` (PSNR ≥ 35 дБ);
  - [A] `edited-audio.wav`: `round(duration_us · 48 000 / 1e6)` сэмплов (для 20-секундной фикстуры — 888 000); `browserLogs` без чужих origin;
  - [A] повторный `ensureMaster` не запускает ffmpeg (реестр процессов пуст), sha256 тот же.
  - Если `<Sequence width height>` не задаёт `useVideoConfig()` детям на 4.0.537 — применить fallback F4, записать в отчёт и ADR 0008.
- [ ] **Step 3:** реализовать → PASS. **Step 4:** кадры 100, 200, 330 — в `docs/evidence/phase-4/engine/`, просмотр глазами [H]. **Step 5:** `./check`; коммит `feat(motion-studio): единая композиция таймлайна в Remotion`.

### Task 37: Генерация сцены проекта (`production.generate`) — контекст плана и QA в контексте

**Files:**
- Create: `app/motion-studio/server/src/production/{context.ts,brief.ts,context-qa.ts,compose-frame.ts}`, `app/motion-studio/server/src/pipeline/production-generate.ts`
- Modify: `app/motion-studio/server/src/pipeline/playground-generate.ts` — выделить `runScenePipeline`; `playgroundGenerate` = вызов без `scene`
- Modify: `app/motion-studio/prompts/{motion-director.md,engineer.md,visual-qa.md,partials/scene-contract.md}` — блок «сцена видеопроекта»: холст, `props.layout.rect`, ключевые слова в `local_frame`, цитата речи, StyleBible проекта
- Modify: `app/motion-studio/server/src/jobs/handlers.ts`
- Test: `app/motion-studio/server/test/production/{context,brief,context-qa}.test.ts`, `app/motion-studio/server/test/pipeline/production-generate.test.ts`, `app/motion-studio/server/test/pipeline/production-generate.e2e.test.ts`

**Interfaces:**
- Consumes: `playgroundGenerate`, `steps.ts`, `fixLoop`, `recordRun`, `selectCandidates`, `buildDirectorTask`, `buildEngineerTask`, `provenanceGate` (Task 17); `selectQaFrames`, `programmaticChecks`, `specChecks`, `runVisualQA`, `mergeQA`, `qaBlocks`, `fixHints`, `loadPng`, `inkFraction` (Task 16); `SceneRepo.createScene`, `SceneRepo.publish` (Task 11); `ProjectStyleDoc`, `ScenePlanItem`, `FootageAnalysis`, `verifyQuote`, `normalizeToken` (Task 23); `occupiedAt` (Task 32); `extractKeyframes` (Task 30); `placementFor`, `sceneCanvas`, `keyTermLocalFrames`, `SceneContextSchema`, `production_scenes` repo (Task 35); `runFfmpeg` (Task 25)
- Produces:
  - `runScenePipeline(ctx: JobContext, input: { sceneId: string; prompt: string; settings: Settings; allowRestricted?: boolean; scene?: SceneContext; base?: { versionId: string } }, deps: PipelineDeps): Promise<HandlerResult>` — шаги Task 17 без изменения порядка; при `scene`: в вход Director добавляются `scene` (цитата, ключевые слова с `local_frame`, холст, зона), `style.json` = `ProjectStyleDoc.resolved` + `resolveStyle`, в `props.json` обязателен `layout.rect` для `canvas = "full"` и `transparent = true`; после QA Task 16 — `contextChecks`
  - `buildSceneContext(db, root, i: { projectId; planItemId }): Promise<SceneContext>` — план текущей утверждённой ревизии; `fps = timeline_fps`; `duration_frames = frames.end − frames.start`; `canvas = sceneCanvas(placement, project display size)`; `narration` = текст слов `start_word_id…end_word_id`; `face` = объединение `face.union` из `occupiedAt(footage, item.source)`; `context_frame` — ключевой кадр прокси в середине окна (`extractKeyframes`)
  - `briefFromContext(ctx: SceneContext, style: ProjectStyleDoc): { prompt: string; settings: Settings }` — `prompt` по-русски: назначение, метафора, тип (`visual_type`), режим и зона, цитата, ключевые слова с моментами; `settings`: `width/height = canvas`, `fps`, `duration_frames`, `transparent_export = placement.transparent`, `style_preset = style.base.preset`, `animation_intensity = style.base.intensity`
  - `contextChecks(i: { frames: { frame: number; path: string }[]; scene: SceneContext; spec: MotionSpec; settings: Settings }): Promise<QAIssue[]>` — коды: `face_ink` (blocking; доля пикселей с alpha > 0,1 внутри `face` > 0,01 на любом кадре; с `plan_item.face_overlap.override_reason` — warning); `outside_zone` (blocking; доля ink вне `rect`, расширенного на 0,02, > 0,005); `key_term_missing` (blocking; нет элемента spec, чей `content` после `normalizeToken` содержит термин); `key_term_timing` (|`start_frame` бита элемента − `local_frame`| ≤ 6 — ok, ≤ 15 — warning, иначе blocking); `duration_mismatch` (blocking; `spec.duration_frames ≠ scene.duration_frames`)
  - `composeOverFrame(still: string, contextFrame: string, p: Placement, out: string): Promise<string>` — ffmpeg `overlay` (масштаб под `rect` для `canvas = "rect"`); кадры `qa/ctx-<frame>.png` передаются Visual QA вместе с обычными
  - `productionGenerate: JobHandler` — вход `{ projectId; sceneId; planItemId; allowRestricted? }`; B не валиден или ревизия плана не та, что в `production_scenes.plan_revision` → `failed(approval_required)`; иначе `buildSceneContext` → `briefFromContext` → `runScenePipeline`

- [ ] **Step 1: Тесты (падают):**

```ts
const ctx = sceneCtx({ placement: placementFor("overlay", "lower_third"), face: { x: 0.4, y: 0.1, w: 0.2, h: 0.4 }, key_terms: [{ text: "миллион", word_id: "w_000120", local_frame: 30 }], duration_frames: 90 });
expect(await contextChecks({ frames: [png("ink-lower-third")], scene: ctx, spec, settings })).toEqual([]);
expect(await contextChecks({ frames: [png("ink-at-0.5-0.3")], scene: ctx, spec, settings })).toContainEqual(expect.objectContaining({ code: "face_ink", severity: "blocking" }));
const withReason = { ...ctx, plan_item: { ...ctx.plan_item, face_overlap: { ratio: 0.1, override_reason: "указатель на лицо" } } };
expect((await contextChecks({ frames: [png("ink-at-0.5-0.3")], scene: withReason, spec, settings })).find(i => i.code === "face_ink")!.severity).toBe("warning");
const at = (s: number) => specWith({ element: { content: { text: "1 миллион" } }, beatStart: s });
expect(codes(await contextChecks({ frames: [], scene: ctx, spec: at(34), settings }))).not.toContain("key_term_timing");
expect(sev(await contextChecks({ frames: [], scene: ctx, spec: at(42), settings }), "key_term_timing")).toBe("warning");
expect(sev(await contextChecks({ frames: [], scene: ctx, spec: at(50), settings }), "key_term_timing")).toBe("blocking");
expect(codes(await contextChecks({ frames: [], scene: ctx, spec: specWith({ element: { content: { text: "рост" } }, beatStart: 30 }), settings }))).toContain("key_term_missing");
const b = briefFromContext(sceneCtx({ placement: placementFor("pip", "pip_tr"), canvas: { width: 576, height: 324 } }), style);
expect(b.settings).toMatchObject({ width: 576, height: 324, transparent_export: false, duration_frames: 90 });
// логика с фейковыми агентами: playgroundGenerate без scene ведёт себя как раньше (снимок шагов Task 17)
expect(stepsOf(await runScenePipeline(jctx, playgroundInput, fakeDeps))).toEqual(TASK17_STEPS);
```

- [ ] **Step 2: e2e (`make e2e`, реальный `claude` и рендер):** проект-фикстура (импорт `talk-ru-cfr.mp4`, план из одной сцены `overlay`/`lower_third` с ключевым словом, Approval B) → `production.generate` → [A] версия `ready` или `failed` с логами; `settings` = холст и длительность плана; `contextChecks` выполнены (коды в `qa.json`); кадры `qa/ctx-*.png` есть. Кадры — `docs/evidence/phase-4/generate/` [H].
- [ ] **Step 3:** реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): генерация сцены видеопроекта по плану`.

### Task 38: Пакетная генерация (`production.batch`) с изоляцией сбоев

**Files:**
- Create: `app/motion-studio/server/src/production/{batch.ts,batch-status.ts}`, `app/motion-studio/server/src/pipeline/production-batch.ts`
- Modify: `app/motion-studio/server/src/jobs/handlers.ts`
- Test: `app/motion-studio/server/test/production/{batch,batch-status}.test.ts`, `app/motion-studio/server/test/pipeline/production-batch.test.ts`

**Interfaces:**
- Consumes: `enqueue`, `requestCancel`, `JobRunner`, `Semaphore` (Task 12); `recoverOnStart` (Task 13); `SceneRepo.createScene` (Task 11); `approvalState`, `currentSubject` (Task 24); `production_scenes`, `batches` repos, `AppConfig.production` (Task 35); `productionGenerate` (Task 37)
- Produces:
  - `planBatch(db, i: { projectId; itemIds?: string[]; regenerate?: boolean }): { planId; revision; toGenerate: { planItemId; sceneId?: string }[]; skipped: { planItemId; reason: "has_version" | "not_accepted" }[]; estimateUsd: number }` — только `accepted` сцены текущей ревизии; `estimateUsd = toGenerate.length × scene.maxCostUsd`
  - `productionBatch: JobHandler` — вход `{ projectId; itemIds?; regenerate? }`; B не валиден → `failed(approval_required)`; `estimateUsd > production.maxBatchCostUsd` → `failed(budget)` до создания сцен; для каждого элемента — сцена (если нет) + строка `production_scenes` + `enqueue("production.generate", idempotencyKey = "batch:<planId>@r<rev>:<itemId>[:regen-<batchId>]")` с `parentJobId`; строки `batches`, `batch_items`; сам пакет завершается сразу (`outputRefs = { batchId, children }`) — дети — обычные задачи, переживают рестарт через `recoverOnStart`
  - `batchStatus(db, batchId): { total; pending; running; ready; failed; cancelled; blocked; costUsd: number; items: { planItemId; sceneId; jobId; status; versionId? }[] }`
  - `cancelBatch(db, batchId): { cancelled: string[] }` — `requestCancel` для `pending`/`running` детей; готовые версии не трогаются

- [ ] **Step 1: Тесты (падают), раннер с фейковыми обработчиками:**

```ts
const r = await runToIdle(runner, enqueueBatch(db, { projectId: "p1" }));      // 4 accepted, обработчик сцены sp_002 бросает
expect(batchStatus(db, r.batchId)).toMatchObject({ total: 4, ready: 3, failed: 1 });
expect(maxConcurrent(trace, "production.generate")).toBeLessThanOrEqual(2);   // maxRunning 2
expect(enqueueBatch(db, { projectId: "p1" }, "same-key").created).toBe(false);
expect(planBatch(db, { projectId: "p1" }).toGenerate).toHaveLength(1);         // у трёх уже есть версия
expect(planBatch(db, { projectId: "p1", regenerate: true }).toGenerate).toHaveLength(4);
expect(planBatch(db, { projectId: "p1" }).skipped).toContainEqual({ planItemId: "sp_005", reason: "not_accepted" });
setConfig({ production: { maxBatchCostUsd: 10 } });
expect(await handlerResult(productionBatch, { projectId: "p1", regenerate: true })).toMatchObject({ status: "failed", error: { code: "budget" } }); // 4 × 5 > 10
expect(scenes.listByProject(db, "p1")).toHaveLength(4);                       // новых сцен не создано
staleB(db, "p1");
expect(await handlerResult(productionBatch, { projectId: "p1" })).toMatchObject({ error: { code: "approval_required" } });
// отмена: 2 ребёнка running, 2 pending → cancelled 4, опубликованные версии на месте
// рестарт: kill посреди пакета → recoverOnStart → все дети доходят до конечного статуса, дублей версий нет
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): пакетная генерация сцен проекта`.

### Task 39: Правки, перегенерация, конфликты, Approval C, импорт из Playground, предпросмотр в контексте

**Files:**
- Create: `app/motion-studio/server/src/production/{manual-edit.ts,base.ts,approval-c.ts,import-playground.ts,context-preview.ts}`, `app/motion-studio/server/src/pipeline/{production-edit.ts,scene-import.ts,scene-preview-context.ts}`
- Modify: `app/motion-studio/server/src/pipeline/playground-edit.ts` — принимает `scene?: SceneContext` (передаётся в Director/QA), `editPlan?: EditPlan` (готовый план без Edit Planner)
- Modify: `app/motion-studio/server/src/jobs/handlers.ts`
- Test: `app/motion-studio/server/test/production/{manual-edit,base,approval-c,import-playground}.test.ts`, `app/motion-studio/server/test/pipeline/{production-edit,conflicts,isolation}.test.ts`, `app/motion-studio/server/test/pipeline/production-edit.e2e.test.ts`

**Interfaces:**
- Consumes: `playgroundEdit`, `applyParamEdit`, `checkPreserve`, `versionHistoryDigest`, `sceneRestore` (Task 18); `sceneExport`, `exportVersion` (Task 19); `scaleTiming`, `EditPlanSchema` (Task 11); `runScenePipeline`, `buildSceneContext`, `contextChecks` (Task 37); `approveScene`, `sceneApprovalState`, `ManualEdit`, `placementFor`, `composeTimeline` (Task 35); `renderTimelineRange`, `ensureMaster`, `buildEditedAudio` (Task 36); `timelineFor` (Task 27); деривативы `proxy` (Task 25)
- Produces:
  - `manualToEditPlan(base: { spec; props; placement: Placement }, edit: ManualEdit): EditPlan` — всегда `path: "param"`: `text` → `param_patch.content`; `style` → `param_patch.style`; `retime` → `timing_scale = duration_frames / base.duration_frames`; `zone` — только при том же `canvas`, иначе ошибка `placement_class_change` (нужна перегенерация)
  - `resolveBase(job: Job, scene: SceneRow): string` — явный `baseVersionId` — он; иначе `current_version_id` **на момент старта** задачи; нет версии → `scene_not_ready`
  - `productionEdit: JobHandler` — вход `{ sceneId; messageId?: string; manual?: ManualEdit; regenerate?: boolean; baseVersionId? }` (ровно одно из трёх): чат → `playgroundEdit` с `scene`; ручная → `playgroundEdit` с `editPlan = manualToEditPlan(…)` (без LLM); `regenerate` → `runScenePipeline` по брифу плана, `parent_version_id = base`; любая новая версия становится `current`; `retime` после публикации — C этой сцены `stale(version_changed)` не нужен (C на версию), но клип таймлайна помечается `pending_version`
  - `sceneImport: JobHandler` — вход `{ projectId; versionId /* версия Playground */; planItemId?: string }`: копия `src/`, `props.json`, `spec.json`, `settings.json` в draft новой сцены проекта, `production_scenes.origin = "playground"`, `source_version_id`; при `planItemId` — `scaleTiming` к длительности плана, fps — к `timeline_fps`, `props.layout.rect` по зоне; несовпадение класса холста → `placement_class_change`; рендер и QA (`contextChecks`) обязательны
  - `scenePreviewContext: JobHandler` — вход `{ sceneId; versionId? }`: окно `[start − contextPadFrames, end + contextPadFrames]` в кадрах таймлайна, `composeTimeline` из одной сцены, исходник — прокси, звук — `buildEditedAudio(proxy)`, `renderTimelineRange` в масштабе 0,5 → `artifactPaths.contextPreview(scene, version)/preview.mp4` (иммутабельно, кэш по `(version, edl rev)`)
  - `queuePosition(db, jobId): { ahead: number; blockingJobId?: string }` — для UI «в очереди за …»

- [ ] **Step 1: Тесты (падают):**

```ts
expect(manualToEditPlan(base90, { kind: "retime", duration_frames: 120 })).toMatchObject({ path: "param", timing_scale: 120 / 90 });
expect(() => manualToEditPlan(baseOverlay, { kind: "zone", zone: "pip_tr" })).toThrow(/placement_class_change/);
expect(manualToEditPlan(baseOverlay, { kind: "zone", zone: "top_band" }).param_patch).toBeDefined();
// конфликты: одна сцена — последовательно, разные — параллельно
const a = enqueue(db, edit("scn_1", "k1")).job, b = enqueue(db, restoreJob("scn_1", "k2")).job, c = enqueue(db, edit("scn_2", "k3")).job;
expect(claimNext(db, "w", now, busy0)!.job.id).toBe(a.id);
expect(claimNext(db, "w", now, busy1)!.job.id).toBe(c.id);         // b ждёт замок scn_1
expect(claimNext(db, "w", now, busy2)).toBeUndefined();
finish(db, a.id, 1, done); expect(claimNext(db, "w", now, busy1)!.job.id).toBe(b.id);
expect(queuePosition(db, b.id)).toEqual({ ahead: 0 });
// база: правка, поставленная при current = v2, стартует после появления v3 → база v3
expect(resolveBase(jobImplicit, sceneWithCurrent("v3"))).toBe("v3");
expect(resolveBase(jobExplicit("v1"), sceneWithCurrent("v3"))).toBe("v1");
expect(() => resolveBase(jobImplicit, sceneWithCurrent(undefined))).toThrow(/scene_not_ready/);
// изоляция: перегенерация scn_2 не трогает scn_1 и scn_3
const before = await dirHashes([scn1Dir, scn3Dir]);
await runToIdle(runner, enqueue(db, regen("scn_2")));
expect(await dirHashes([scn1Dir, scn3Dir])).toEqual(before);
expect(sceneApprovalState(db, "scn_1").state).toBe("valid"); expect(sceneApprovalState(db, "scn_3").state).toBe("valid");
```

- [ ] **Step 2: e2e (`make e2e`, реальный `claude`):** сцена проекта из Task 37 → чат «сделай подпись крупнее и задержи итоговое число на секунду дольше» → новая версия `parent = v1`, `checkPreserve` выполнен; ручная `retime` 90 → 120 без вызова агента (`agent_runs` не прибавились), длительность превью 4,0 с ± 1 кадр; `scene.preview_context` → превью с исходником вокруг сцены, длительность `(90 + 60) / 30` с ± 1 кадр.
- [ ] **Step 3:** реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): правки, перегенерация и Approval C сцен проекта`.

### Task 40: API и UI Phase 4 — доска сцен, Scene Inspector, пакет, предпросмотр в контексте

**Files:**
- Create: `app/motion-studio/server/src/api/routes/{production,batches,scene-approvals}.ts`; Modify: `app/motion-studio/server/src/api/app.ts`, `app/motion-studio/server/src/api/routes/scenes.ts` (поле `production`, `queue`)
- Create: `app/motion-studio/web/src/pages/SceneInspector.tsx`, `app/motion-studio/web/src/components/production/{ProductionBoard,SceneCard,BatchBar,BriefPanel,PropsForm,ContextPlayer,ApprovalCButton,QueueBadge,ImportFromPlayground}.tsx`
- Modify: `app/motion-studio/web/src/pages/VideoWorkspace.tsx` (вкладка «Сцены»), `app/motion-studio/web/src/pages/Playground.tsx` («В видеопроект…»), `app/motion-studio/web/src/{router.ts,i18n/ru.ts,api/client.ts,api/queries.ts}`
- Test: `app/motion-studio/server/test/api/{production,batches,scene-approvals}.test.ts`, `app/motion-studio/web/test/{scene-card,props-form,batch-bar}.test.tsx`, `app/motion-studio/web/e2e/production.spec.ts`

**Interfaces:**
- Consumes: `buildApp`, `security.ts`, `range.ts`, `sse.ts`, правило `Idempotency-Key` (Task 20); `enqueue`, `requestCancel` (Task 12); `planBatch`, `batchStatus`, `cancelBatch` (Task 38); `approveScene`, `sceneApprovalState`, `queuePosition`, `resolveBase` (Task 35, 39); DTO `api-production.ts` (Task 35); `Chat`, `VersionHistory`, `VersionCompare`, `ComponentsPanel`, `QAPanel`, `ExportDialog`, `Player`, `JobStatus`, `t`, `useEvents` (Task 21); `PlanTrack`, `EvidenceQuote`, `ApprovalBar` (Task 29, 33); `seedScene` (Task 21)
- Produces (`/api`):
  - `GET /projects/:id/production` → сцены плана: элемент плана, сцена, `current`/`approved` версии, `C`-состояние, активная задача и `queue`, последняя партия
  - `POST /projects/:id/production/batch { itemIds?; regenerate? }` → 202 `{ batch, job }` | 409 (`approval_required`, `budget` с оценкой); `GET /batches/:id` → `BatchDto`; `POST /batches/:id/cancel`
  - `POST /scenes/:id/edits { text } | { manual } | { regenerate: true }` (+ `baseVersionId?`) → 202 | 409 (`scene_not_ready`, `placement_class_change`)
  - `POST /scenes/:id/approve { versionId }` → 201 | 409 `version_failed`; `POST /scenes/:id/unapprove` → 200
  - `POST /scenes/:id/preview-context { versionId? }` → 202; `GET /scenes/:id/preview-context.mp4?versionId=` (Range)
  - `POST /projects/:id/scenes/import { versionId; planItemId? }` → 202
  - сравнение, восстановление и экспорт версий — маршруты Task 20 без изменений
- Produces (UI, все строки через `t()`):
  - **Вкладка «Сцены»:** `ProductionBoard` — карточка на каждую принятую сцену плана: кадр-миниатюра, режим/зона, статус задачи и очередь (`QueueBadge`: «в очереди за правкой v3»), QA-гейты, бейдж C («утверждена v2, текущая v3»); `BatchBar` — «Сгенерировать все» с оценкой стоимости, прогресс n/N, стоимость, «Остановить», ошибки по сценам со ссылкой
  - **Scene Inspector** (ТЗ §11.1 п.5): слева — `BriefPanel` (назначение, цитата `EvidenceQuote`, ключевые слова с кадрами, холст, зона), `ComponentsPanel`, `PropsForm` (тексты элементов, стиль: палитра/интенсивность/глубина, длительность, зона того же класса → `ManualEdit`), `Chat`, `VersionHistory`; справа — переключатель «Сцена / В контексте» (`Player` превью версии, `ContextPlayer` — превью в контексте с кнопкой «Собрать»), `QAPanel` с кадрами `ctx-*`, «Утвердить (C)», «Перегенерировать», «Экспорт» (`ExportDialog`); блокирующие QA показаны, но не запрещают C (решение за человеком, ТЗ §8.5) — подтверждение «утвердить с замечаниями»
  - Playground: «В видеопроект…» → `ImportFromPlayground` (проект, элемент плана или «новая сцена»)

- [ ] **Step 1: Тесты (падают):** API: batch без B → 409 `approval_required`; повтор с тем же `Idempotency-Key` → тот же `job.id`; `POST /scenes/:id/edits` без версии → 409 `scene_not_ready`; две правки подряд → обе 202, вторая — `queue.ahead = 1`; approve `failed`-версии → 409. Web: `SceneCard` по статусам (`pending/running/ready/failed/blocked` × C `missing/valid/stale`) показывает нужную подпись словаря; `PropsForm` собирает `{ kind: "retime", duration_frames: 120 }`; `BatchBar` при `budget` показывает оценку «4 × $5 = $20».
- [ ] **Step 2:** Playwright `production.spec.ts` без LLM: проект-фикстура, сцены через `seedScene` (реальный рендер фикстур) → доска, инспектор, сравнение, восстановление, C, экспорт MP4, предпросмотр в контексте (реальный `renderTimelineRange`).
- [ ] **Step 3:** реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): Scene Inspector и пакетная генерация в UI`.

### Task 41: Приёмка Phase 4 на реальном проекте

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance-production/{global-setup.ts,helpers.ts,phase4-batch.spec.ts,phase4-edit.spec.ts,phase4-isolation.spec.ts,phase4-restart.spec.ts}`, `app/motion-studio/web/playwright.acceptance-production.config.ts`
- Create: `app/motion-studio/scripts/collect-production-evidence.mjs`
- Create: `docs/evidence/phase-4/{batch,edit,isolation,conflicts,export,restart}/…`, `docs/evidence/phase-4/REPORT.md`
- Modify: `app/motion-studio/Makefile` (`acceptance-production`)

**Interfaces:**
- Consumes: всё из Task 1–40; проект приёмки Phase 2–3 в `/Volumes/External SSD/MotionStudio-acceptance` (утверждённые A и B); `collect-evidence.mjs`, `collect-video-evidence.mjs` (Task 22, 34); `alphaAtCorner` (Task 19)
- Produces: `collect-production-evidence.mjs <projectId> <dest>` — по каждой сцене: `brief`, `spec.json`, `knowledge-refs.json`, `qa.json`, кадры (сцена — PNG; в контексте — ≤ 480 px), превью сцены (≤ 10 МБ), история версий, Approval C, `agent_runs` (модель, стоимость), журнал задач; `REPORT.md` — пункты ТЗ §13 Phase 4 → [A]/[H]

- [ ] **Step 1: Подготовка.** Проект приёмки Phase 2–3 открыт; в плане ≥ 3 принятых сцен, среди них `overlay` и `fullscreen` (если нет — через UI изменить режим сцены и переутвердить B; это часть сценария пользователя).
- [ ] **Step 2: Пакет (`phase4-batch.spec`):** «Сгенерировать все» (реальный `claude`) → [A] каждая сцена — `ready` или `failed` с логами; версии `ready` прошли технический gate и `contextChecks`; стоимость ≤ `n × $5`; [H] просмотр каждой сцены в контексте: графика в своей зоне, не закрывает лицо, ключевое слово появляется в момент произнесения.
- [ ] **Step 3: Изоляция (`phase4-isolation.spec`):** повторный пакет `regenerate` → во время рендера сцены 2 убить её группу процессов (`SIGKILL` по PID из `GET /jobs/:id`) → [A] сцены 1 и 3 доходят до `ready`, их прежние версии и C не изменены (sha256 каталогов); сцена 2 — `pending` → новая попытка или `failed`; очередь не встала.
- [ ] **Step 4: Правки (`phase4-edit.spec`):** сцена 1 — правка чатом; сцена 3 — ручная правка текста и длительности (без LLM: `agent_runs` не прибавились); сцена 2 — «Перегенерировать»; сравнить версии, восстановить v1 сцены 1 → [A] история цела, все версии проигрываются; конфликт: две правки сцены 1 подряд → [A] интервалы `started_at…finished_at` не пересекаются, вторая начинается от результата первой (`parent_version_id`).
- [ ] **Step 5: Approval C и экспорт сцен:** утвердить все сцены; экспорт сцены `fullscreen` в MP4 → [A] `exportGate` пуст; экспорт `overlay` в ProRes 4444 → [A] `alphaAtCorner = 0`.
- [ ] **Step 6: Перезапуск (`phase4-restart.spec`):** `SIGKILL` сервера посреди пакета → старт → [A] задачи восстановлены (`pending`/`blocked`), дублей версий нет, после завершения — все сцены и C на месте.
- [ ] **Step 7:** evidence, `REPORT.md` (стоимость, время, [A]/[H], ограничения); `./check`; коммит `test(motion-studio): приёмка Phase 4 и evidence`.

### Task 42: Таймлайн проекта — сборка, позиции, длительности, якоря (`timeline.build`)

**Files:**
- Create: `app/motion-studio/server/src/timeline/{build.ts,ops.ts,freshness.ts,carry-over.ts}`, `app/motion-studio/server/src/pipeline/{timeline-build.ts,timeline-preview.ts}`
- Modify: `app/motion-studio/server/src/jobs/handlers.ts`, `app/motion-studio/server/src/edit/edl-ops.ts` и `app/motion-studio/server/src/analysis/plan-ops.ts` (после новой ревизии — `timeline` помечается устаревшим через `timelineFreshness`, без перестройки)
- Test: `app/motion-studio/server/test/timeline/{build,ops,freshness,carry-over}.test.ts`, `app/motion-studio/server/test/pipeline/timeline-preview.e2e.test.ts`

**Interfaces:**
- Consumes: `composeTimeline`, `timelineChecks`, `anchorCheck`, `snapToWord`, `clipsToSequences`, `prod_timelines` repo, `sceneApprovalState` (Task 35); `timelineFor`, `roughCutApprovalValid` (Task 27); `approveVisualPlan`, `approvalState`, `currentSubject` (Task 24, 32); `mapWords`, `usToFrame` (Task 23); `ArtifactStore.publish`, `ArtifactStore.writeRevision`, `resourceBusy` (Task 24); `productionEdit` (Task 39); `renderTimelineRange`, `buildEditedAudio` (Task 36)
- Produces:
  - `buildTimelineDoc(db, projectId): ProductionTimelineDoc` — A и B валидны (иначе `approval_required`); утверждённые версии по C; длительность и холст версии ≠ клипу → `duration_mismatch` (blocking); `anchors` — `key_terms` плана в кадрах таймлайна
  - `timelineBuild: JobHandler` — вход `{ projectId }`, без LLM; при существующей ревизии — `carryOver` пользовательских операций; публикация `timeline/<id>/r<N>/timeline.json` с fencing
  - `carryOver(prev: ProductionTimelineDoc, next: ProductionTimelineDoc): ProductionTimelineDoc` — для клипа, сдвинутого пользователем (`ops.move`), сохраняется смещение относительно первого якоря: `start' = anchor'.frame + (prev.start − prev.anchor.frame)`; если сохранить нельзя (`anchor_outside`) — позиция плана и issue `move_dropped`
  - `applyTimelineOps(doc, ops, ctx): { doc: ProductionTimelineDoc; jobs: { type: "production.edit"; input: unknown }[] }` — `move` → `anchorCheck` (без `override_reason` → blocking issue, ревизия сохраняется, финал блокирован); `set_duration` → задача `production.edit` (`manual.retime`), клип помечен `pending_version` до утверждения новой версии; `use_version` — только версия с валидным C или `include: "override"` с причиной; `set_zone` — через `production.edit` (`manual.zone`); после — `timelineChecks`
  - `saveTimelineRevision(deps, timelineId, body: { base_revision; ops }): Promise<ProductionTimelineDoc>` — 409 `revision_conflict` / `resource_busy`; ставит задачи из `jobs` с `Idempotency-Key = "tl:<id>@r<N>:<i>"`
  - `timelineFreshness(db, projectId): { fresh: boolean; reasons: ("edl_changed" | "plan_changed" | "style_changed" | "version_changed" | "approval_stale")[] }` — сравнение `inputs` текущей ревизии с текущими ревизиями и C
  - `timelinePreview: JobHandler` — вход `{ timelineId; revision }`: прокси + `buildEditedAudio(proxy)` + `renderTimelineRange` целиком, масштаб 0,5, CRF 23 → `timeline/<id>/r<N>/preview.mp4`

- [ ] **Step 1: Тесты (падают):**

```ts
const d1 = buildTimelineDoc(db, "p1");
expect(d1.scenes.map(c => [c.plan_item_id, c.start_frame, c.duration_frames])).toEqual([["sp_001", 300, 90], ["sp_002", 600, 120]]);
const { doc: d2 } = applyTimelineOps(d1, [{ op: "move", clip_id: "c1", start_frame: 300 - 19 }], ctx);   // ключевое слово на 340: окно [281, 371)
expect(d2.issues.filter(i => i.severity === "blocking")).toEqual([]);
const { doc: d3 } = applyTimelineOps(d1, [{ op: "move", clip_id: "c1", start_frame: 251 }], ctx);       // [251, 341) — 340 внутри
expect(d3.issues).toEqual([]);
const { doc: d4 } = applyTimelineOps(d1, [{ op: "move", clip_id: "c1", start_frame: 250 }], ctx);
expect(d4.issues).toContainEqual(expect.objectContaining({ code: "anchor_outside", severity: "blocking" }));
const { jobs } = applyTimelineOps(d1, [{ op: "set_duration", clip_id: "c2", duration_frames: 150 }], ctx);
expect(jobs).toEqual([{ type: "production.edit", input: expect.objectContaining({ manual: { kind: "retime", duration_frames: 150 } }) }]);
// перенос после правки EDL: вырезано 45 кадров до сцены, якорь 340 → 295
const moved = withOp(d1, { op: "move", clip_id: "c1", start_frame: 330 });                              // смещение от якоря −10
expect(carryOver(moved, rebuiltAfterCut).scenes[0].start_frame).toBe(285);
await saveEdlRevision(deps, "edl_1", { base_revision: 3, ops: cutBeforeScene });
expect(timelineFreshness(db, "p1")).toEqual({ fresh: false, reasons: ["edl_changed"] });
approveScene(db, { sceneId: "scn_2", versionId: "ver_new" });
expect(timelineFreshness(db, "p1").reasons).toContain("version_changed");
```

- [ ] **Step 2: e2e:** `timeline.preview` на проекте-фикстуре Task 37 → [A] длительность = `duration_frames / fps` ± 1 кадр.
- [ ] **Step 3:** реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): таймлайн проекта и операции над сценами`.

### Task 43: Финальный рендер (`final.render`) — master, звук, композиция, настройки экспорта, публикация

**Files:**
- Create: `app/motion-studio/server/src/final/{gate.ts,request.ts,render.ts,manifest.ts,snapshot.ts,space.ts}`, `app/motion-studio/server/src/pipeline/{final-render.ts,final-reproduce.ts}`
- Modify: `app/motion-studio/server/src/jobs/handlers.ts`, `app/motion-studio/server/src/approvals/subjects.ts` (`final`)
- Test: `app/motion-studio/server/test/final/{gate,request,manifest,space}.test.ts`, `app/motion-studio/server/test/pipeline/final-render.test.ts`, `app/motion-studio/server/test/final/final.e2e.test.ts`

**Interfaces:**
- Consumes: `renderTimelineRange`, `writeTimelineEntry`, `ensureMaster`, `buildEditedAudio` (Task 36); `ProductionTimelineDoc`, `FinalExportRequest`, `crfFor`, `outputSize`, `FinalManifestSchema`, `final_exports` repo (Task 35); `timelineFreshness` (Task 42); `approve`, `approvalState`, `sceneApprovalState`, `canonicalHash`, `ArtifactStore.publish`, `createJobDraft` (Task 23–24, 35); `scaleTiming` (Task 11); `checkStorage`, `macosProbe.freeBytes` (Task 1); `verifyFinal` (Task 44 — до его готовности вызывается заглушкой-интерфейсом, в e2e — реальный)
- Produces:
  - `requestFinal(db, i: { timelineId; revision; request: FinalExportRequest }): { approval: Approval; job: Job }` — одна транзакция: `assembleGate` → `approve("final", "final:<timeline>@r<N>#<sha256(request)>", canonicalHash({ timeline_hash, request }))` → `enqueue("final.render")`; это и есть явное действие пользователя (F6)
  - `assembleGate(db, projectId, ref: { timelineId; revision }): { ok: true } | { ok: false; errors: { code: "approval_required" | "timeline_stale" | "blocking_issues" | "pending_version"; detail: string }[] }` — A, B валидны; `timelineFreshness.fresh`; нет blocking issues; каждая сцена `include: "approved"` — C валиден на `version_id` клипа, `override` — с причиной; повторяется в обработчике перед публикацией (за время рендера что-то могло устареть → `failed(timeline_stale)`, файл не публикуется)
  - `estimateFinalBytes(i: { frames: number; width; height; quality }): number` — `bytes = round(width·height·frames·k(q)/8)` с `k = 0.12 / 0.08 / 0.05` бит на пиксель кадра + 1 ГБ запас (master, если его нет в кэше, оценивается отдельно `estimateImportBytes`); нехватка → `failed(low_space)` до рендера
  - `finalProps(doc, request, paths, display): TimelineRenderRequest` — `outputSize`, fps запроса (F8: при ≠ `timeline_fps` — `scaleTiming` props сцен и пересчёт `from`/`durationInFrames` через `usToFrame` от µs клипов), `crfFor`, `audioBitrateKbps`, `x264Preset: "medium"`
  - `finalRender: JobHandler` — вход `{ projectId; timelineId; revision; request; approvalId }`: гейт → место → `ensureMaster` (прогресс «Подготовка исходника») → `buildEditedAudio(original)` (кэш по ревизии EDL) → `renderTimelineRange` в draft → `verifyFinal` → гейт повторно → публикация `exports/<exp>/{final.mp4,final-manifest.json,verify.json,project-snapshot.json}` с fencing, `chmod a-w`; `verify.verdict = "fail"` → строка `final_exports.status = "failed_verification"`, файл сохраняется с пометкой, UI не показывает его как успешный
  - `buildFinalManifest(i): FinalManifest` — `inputs_hash = canonicalHash(inputs + request + render_env.render_lock_sha256)`
  - `projectSnapshot(db, projectId, timelineRef): unknown` — ревизии и хэши всех входов, approvals, версии сцен — для повторного открытия и воспроизведения
  - `finalReproduce: JobHandler` — вход `{ exportId }`: те же входы по `final-manifest.json` (версии — по `version_id`, master/аудио — по sha256, при расхождении → `failed(verify_failed, "inputs_changed")`) → новый экспорт → `compareExports(a, b)` (Task 44)

- [ ] **Step 1: Тесты (падают):**

```ts
expect(assembleGate(db, "p1", ref)).toEqual({ ok: true });
approveScene(db, { sceneId: "scn_2", versionId: "ver_new" });          // C ушёл на другую версию → таймлайн устарел
expect(assembleGate(db, "p1", ref)).toMatchObject({ ok: false, errors: [expect.objectContaining({ code: "timeline_stale" })] });
staleA(db, "p1");
expect(assembleGate(db, "p1", ref2).errors!.map(e => e.code)).toContain("approval_required");
const { approval } = requestFinal(db, { timelineId: "tml_1", revision: 2, request: req1080 });
expect(approval.subject_ref).toMatch(/^final:tml_1@r2#[0-9a-f]{64}$/);
expect(requestFinal(db, { timelineId: "tml_1", revision: 2, request: req720 }).approval.id).not.toBe(approval.id);
expect(buildFinalManifest(inputsA).inputs_hash).toBe(buildFinalManifest(shuffleKeys(inputsA)).inputs_hash);
expect(estimateFinalBytes({ frames: 3600, width: 1920, height: 1080, quality: "standard" }))
  .toBe(Math.round(1920 * 1080 * 3600 * 0.08 / 8) + 1_000_000_000);
// логика: verify fail → status failed_verification, публикация есть, success-событие нет
// гейт протух во время рендера → failed(timeline_stale), в exports/ ничего
```

- [ ] **Step 2: e2e (`make e2e`):** проект-фикстура Task 36/37 → таймлайн r1 → `requestFinal` 1280×720 (`source`), `standard` → [A] `final.mp4` в `exports/`, `final-manifest.json` проходит схему, `master` построен один раз (второй экспорт — из кэша), оригинал не изменён (sha256).
- [ ] **Step 3:** реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): финальный рендер видеопроекта`.

### Task 44: Проверка финала (`final.verify`) и воспроизводимость

**Files:**
- Create: `app/motion-studio/server/src/final/{verify.ts,frames.ts,sync.ts,loudness.ts,compare.ts}`
- Create: `app/motion-studio/server/test/fixtures/final/README.md` (как `make-media-fixtures.mjs` строит `counter-30.mp4`, `delayed-audio.mp4`, `louder.mp4`)
- Modify: `app/motion-studio/scripts/make-media-fixtures.mjs` — фикстуры проверки: `testsrc2` со счётчиком кадров; `adelay=66` (2 кадра); `volume=3dB`
- Test: `app/motion-studio/server/test/final/{verify,frames,sync,loudness,compare}.test.ts`

**Interfaces:**
- Consumes: `ffprobe`, `ProbeResult` (Task 4, 36); `audioOffsetUs`, `syncCheck` (Task 28); `loadPng`, `frameDelta` (Task 16); `sourceToEdited`, `editedToSource`, `mapWords`, `usToFrame`, `frameToUs` (Task 23); `clipsToSequences`, `outputSize`, `FinalVerifyReportSchema` (Task 35); `renderTimelineRange` (stills, Task 36); `runFfmpeg` (Task 25)
- Produces:
  - `finalProbeGate(probe: ProbeResult, expect: { width; height; fps: Fps; frames: number }): string[]` — `codec h264`, `audioCodec aac`, `pixFmt yuv420p`, размеры, fps, `audioSampleRate 48000`, каналы = источнику; длительность: `|durationUs − frameToUs(frames, fps)| ≤ frameToUs(1, fps) + 1`
  - `extractFrame(video: string, frame: number, fps: Fps, out: string, size?: { width; height }): Promise<string>` — `select=eq(n\,<frame>)`, PNG
  - `psnr(a: string, b: string): Promise<number>` — ffmpeg `psnr`, `inf` → 99
  - `alignmentOffset(finalFrame: string, candidates: { offset: number; path: string }[]): Promise<{ offset: number | "inconclusive"; psnr: number }>` — лучший PSNR; если соседние кандидаты отличаются `frameDelta < 0.002` — `inconclusive`
  - `sampleVerifyFrames(doc: ProductionTimelineDoc, n = 12): { frame: number; kind: "source" | "scene"; clip_id?: string }[]` — 6 кадров вне сцен равномерно, середина каждой сцены (до 6)
  - `syncAnchors(doc, words, tl, n = 5): { word_id: string; edited_us: number; source_us: number }[]` — ключевые слова сцен, затем равномерно по оставленным словам
  - `loudnessDelta(final: string, editedAudio: string): Promise<{ source_lufs: number; final_lufs: number; delta_lu: number; final_peak_db: number; source_peak_db: number }>` — `ebur128`, `astats`
  - `verifyFinal(i: { finalPath; doc; request; master; editedAudio; source16k; words; tl; stillsFor(frames: number[]): Promise<string[]> }): Promise<FinalVerifyReport>`; `FinalVerifyReport = { probe: string[]; duration: { expected_frames: number; actual_us: number; delta_frames: number }; sync: { word_id; offset_us: number }[]; frames: { frame; kind; psnr_db: number; offset: number | "inconclusive" }[]; loudness: …; verdict: "pass" | "fail"; failures: string[] }` — `fail`, если: `probe` не пуст; `|delta_frames| > 1`; любой `|offset_us| > frameToUs(1, fps) + 1`; кадр `source` с `offset ≠ 0` (кроме `inconclusive`) или PSNR < 30 дБ; кадр `scene` с PSNR < 30 дБ против still; `|delta_lu| > 0.5`; `final_peak_db > source_peak_db + 0.1`
  - `compareExports(a: FinalManifest & { path }, b: …): Promise<{ inputs_equal: boolean; probe_equal: boolean; frames: { frame; psnr_db }[]; file_sha256_equal: boolean; verdict: "reproduced" | "differs" }>` — `reproduced`, если входы и ffprobe совпадают, а 12 кадров попарно PSNR ≥ 50 дБ (совпадение sha256 файла — пишется отдельно, не требуется)

- [ ] **Step 1: Тесты (падают), фикстуры из `make-media-fixtures.mjs`:**

```ts
const F30 = { num: 30, den: 1 };
expect(finalProbeGate(probe({ durationUs: 8_533_333 }), exp(255))).toEqual([]);           // +1 кадр
expect(finalProbeGate(probe({ durationUs: 8_566_667 }), exp(255))).toEqual([expect.stringMatching(/duration/)]);
expect(finalProbeGate(probe({ pixFmt: "yuv444p" }), exp(255))).toEqual([expect.stringMatching(/pix_fmt/)]);
expect((await alignmentOffset(await extractFrame(counter, 145, F30, t1), cands(counter, 145))).offset).toBe(0);
expect((await alignmentOffset(await extractFrame(counter, 146, F30, t2), cands(counter, 145))).offset).toBe(1);
expect((await alignmentOffset(await extractFrame(still, 10, F30, t3), cands(still, 10))).offset).toBe("inconclusive");
expect(Math.abs((await syncAt(delayed, source, 5))[0].offset_us - 66_000)).toBeLessThanOrEqual(1_000);  // 2 кадра → fail
expect((await loudnessDelta(louder, original)).delta_lu).toBeCloseTo(3, 0);
const r = await verifyFinal(okInput);                                                       // фикстура Task 43 e2e
expect(r).toMatchObject({ verdict: "pass", failures: [] });
expect((await verifyFinal({ ...okInput, finalPath: delayed })).failures).toContain("sync");
expect(sampleVerifyFrames(doc2scenes).map(f => f.kind)).toEqual(["source", "source", "source", "scene", "source", "scene", "source", "source"]);
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS (e2e-часть — `make e2e`). **Step 4:** `./check`; коммит `feat(motion-studio): автоматическая проверка финального видео`.

### Task 45: API и UI Phase 5 — экран таймлайна и экспорт финала

**Files:**
- Create: `app/motion-studio/server/src/api/routes/{timelines,final-exports}.ts`; Modify: `app/motion-studio/server/src/api/app.ts`
- Create: `app/motion-studio/web/src/pages/TimelinePage.tsx`, `app/motion-studio/web/src/components/timeline/{TimelineView,TrackVideo,TrackAudio,TrackGraphics,AnchorTicks,Playhead,ClipInspector,FinalExportDialog,VerifyReport,ExportHistory,FreshnessBanner}.tsx`, `app/motion-studio/web/src/timeline/{geometry.ts,drag.ts}`
- Modify: `app/motion-studio/web/src/{router.ts,i18n/ru.ts,api/client.ts,api/queries.ts}`, `app/motion-studio/web/src/pages/{VideoWorkspace,Dashboard}.tsx` (переход к таймлайну, последние экспорты)
- Test: `app/motion-studio/server/test/api/{timelines,final-exports}.test.ts`, `app/motion-studio/web/test/{timeline-geometry,drag,final-export-dialog,verify-report}.test.tsx`, `app/motion-studio/web/e2e/timeline.spec.ts`

**Interfaces:**
- Consumes: маршрутная инфраструктура Task 20; `buildTimelineDoc`, `saveTimelineRevision`, `timelineFreshness` (Task 42); `requestFinal`, `assembleGate` (Task 43); `FinalVerifyReport`, `compareExports` (Task 44); `snapToWord`, `anchorCheck`, `outputSize` (Task 35); `Player`, `Waveform`, `ThumbStrip`, `EditedTimelineBar`, `wordAt`, `useEditedTimeline`, `trackLayout` (Task 21, 29, 33); `t`
- Produces (`/api`):
  - `GET /projects/:id/timeline` → `TimelineDto` (текущая ревизия, `freshness`, issues, клипы с версиями и C); `POST /projects/:id/timeline/build` → 202
  - `POST /timelines/:id/revisions { base_revision; ops }` → 201 | 409 (`revision_conflict`, `resource_busy`); `GET /timelines/:id/revisions`
  - `POST /timelines/:id/revisions/:n/preview` → 202; `GET /timelines/:id/revisions/:n/preview.mp4` (Range)
  - `POST /timelines/:id/revisions/:n/final { request }` → 202 `{ approval, job }` | 409 (`approval_required`, `timeline_stale`, `blocking_issues`, `pending_version`, `low_space`)
  - `GET /projects/:id/final-exports`; `GET /final-exports/:id` → manifest + `verify.json`; `GET /final-exports/:id/file` (Range, `Content-Disposition: attachment; filename="<project>-r<N>-<res>-<fps>.mp4"`); `POST /final-exports/:id/reproduce` → 202
- Produces (UI):
  - **Timeline** (ТЗ §11.1 п.4): дорожки «Видео» (клипы EDL с миниатюрами), «Звук» (waveform смонтированного звука), «Графика» (сцены цветом режима, бейдж C, `pending_version` штриховкой), «Якоря» (ключевые слова, при приближении — слова); плеер превью ревизии с общим playhead; перетаскивание сцены с прилипанием к словам (`snapToWord`, Alt — без прилипания) и мгновенной проверкой `anchorCheck` (красная подсветка и поле «причина»); ручка длительности → диалог «будет создана новая версия сцены без LLM, потребуется утвердить её»; `ClipInspector` (таймкоды edited/source/кадры, версия, переключение версии с валидным C, включение без утверждения с причиной); список ревизий и «отменить» = вернуться к прежней ревизии новой ревизией; `FreshnessBanner` («монтаж изменился — пересобрать таймлайн»)
  - `FinalExportDialog`: FPS (по умолчанию `timeline_fps`, иной — предупреждение F8), разрешение, качество, оценка размера и места, сводка входов (ревизии, версии сцен, сцены без C с причинами) и кнопка «Смонтировать и экспортировать» — Final approval; прогресс по этапам (исходник, звук, рендер, проверка)
  - `VerifyReport`: ffprobe против настроек, длительность, синхронизация по якорям (слово, смещение, норма ≤ 1 кадр), кадры (миниатюры «ожидалось / получилось», PSNR, смещение), громкость; вердикт; `failed_verification` — красным, «Скачать всё равно» с подтверждением
  - `ExportHistory`: экспорты с вердиктом, «Повторить экспорт из сохранённого проекта» → результат `compareExports`
  - `geometry.ts`: `frameToX(frame, zoom, scroll)`, `xToFrame(x, zoom, scroll)` — обратимы на целых кадрах; `drag.ts`: `dragMove(clip, dxFrames, wordFrames, alt): { start_frame; snapped: boolean; anchor: ReturnType<typeof anchorCheck> }`

- [ ] **Step 1: Тесты (падают):** API: `final` без C у включённой сцены → 409 `approval_required` с перечнем; с устаревшим таймлайном → 409 `timeline_stale`; правка ревизии на старой базе → 409 `revision_conflict`; файл экспорта отдаётся с `206` по Range. Web: `xToFrame(frameToX(437, z, s), z, s) === 437` для `z ∈ {0.5, 1, 4.25}`; `dragMove` с якорем 340 и `dx` −80 от 330 → `anchor.ok === false`; `FinalExportDialog` при fps 25 на проекте 30 показывает предупреждение; `VerifyReport` для `failed_verification` не показывает «Готово».
- [ ] **Step 2:** Playwright `timeline.spec.ts` без LLM (сцены через `seedScene`): собрать таймлайн, сдвинуть сцену с прилипанием, превью ревизии, экспорт 720p `draft` (реальный рендер), отчёт проверки виден.
- [ ] **Step 3:** реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): экран таймлайна и экспорт финала`.

### Task 46: Приёмка Phase 5 и Test 4 (talking head) на реальном ролике

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance-final/{global-setup.ts,helpers.ts,phase5-assemble.spec.ts,phase5-export-variants.spec.ts,phase5-reproduce.spec.ts,phase5-resilience.spec.ts,test4-talking-head.spec.ts}`, `app/motion-studio/web/playwright.acceptance-final.config.ts`
- Create: `app/motion-studio/scripts/{final-timing-audit.mjs,collect-final-evidence.mjs}`
- Create: `docs/evidence/phase-5/{assemble,export-1080p30,export-720p25,reproduce,resilience,test4}/…`, `docs/evidence/phase-5/REPORT.md`
- Modify: `app/motion-studio/Makefile` (`acceptance-final`)

**Interfaces:**
- Consumes: всё из Task 1–45; проект приёмки после Task 41
- Produces:
  - `final-timing-audit.mjs <exportId>` — для 10 слов (5 — якоря сцен, 5 — равномерно): `source_us`, `edited_us`, кадр таймлайна, смещение звука финала относительно `audio16k` исходника (`audioOffsetUs`), смещение кадра (`alignmentOffset`); таблица `phase-5/test4/timing-audit.md`
  - `collect-final-evidence.mjs <exportId> <dest>`: `final-manifest.json`, `verify.json`, `project-snapshot.json`, ffprobe, кадры проверки ≤ 480 px, таймлайн-ревизии, журналы задач; видео — только sha256, ffprobe и путь

- [ ] **Step 1: Сборка (`phase5-assemble.spec`):** «Собрать таймлайн» → сдвинуть одну сцену на ±10 кадров с прилипанием → изменить длительность другой (новая версия без LLM → утвердить C) → превью ревизии → [H] просмотр превью: сцены в нужные моменты, лицо не закрыто.
- [ ] **Step 2: Экспорт 1080p / `timeline_fps` / `standard`:** «Смонтировать и экспортировать» → [A] `verify.verdict = pass`: ffprobe `h264`/`aac`/`yuv420p`/48 кГц/размер/fps; длительность ± 1 кадр; 5 якорей ≤ 1 кадр; 12 кадров — `offset 0` или `inconclusive`, PSNR ≥ 30 дБ; `|ΔLU| ≤ 0.5`; [A] оригинал не изменён (sha256 до/после); [H] просмотр финала целиком: звук без щелчков на склейках, речь синхронна губам, сцены читаемы.
- [ ] **Step 3: Варианты (`phase5-export-variants.spec`):** 720p / 25 fps / `draft` → [A] verify pass с допусками 1 кадра 25 fps; предупреждение F8 было показано.
- [ ] **Step 4: Воспроизводимость (`phase5-reproduce.spec`):** `SIGTERM` сервера → старт → проект открывается, таймлайн и экспорты на месте → «Повторить экспорт» → [A] `compareExports.verdict = reproduced` (`inputs_hash` равен, ffprobe равен, 12 кадров PSNR ≥ 50 дБ; совпадение sha256 файла — в отчёт).
- [ ] **Step 5: Устойчивость (`phase5-resilience.spec`):** (1) `SIGKILL` сервера во время финального рендера → [A] группа воркера и медиасервер мертвы, частичного файла в `exports/` нет, после старта задача `pending` → `completed` (или `blocked(stale_process)` с PID в UI); (2) `MS_DATA_DIR` переименован во время рендера → `storage_offline`, 503 и баннер, на системный диск ничего не записано, после возврата — экспорт доведён; (3) правка EDL после `final`-утверждения до старта задачи → [A] задача `failed(timeline_stale)`, экспорта нет.
- [ ] **Step 6: Test 4 (`test4-talking-head.spec`, `09` §7):** таблица по пунктам: ASR со временем слов, rough cut обратим, source↔edited по 10 словам ± 1 кадр (`final-timing-audit.mjs`), предложения не закрывают лицо, approvals A/B/C/final, сцены `overlay` и `fullscreen` в финале, смещение речи ≤ 1 кадра по 5 словам, финал воспроизводится из сохранённого проекта — [A]/[H] со ссылками.
- [ ] **Step 7:** evidence, `REPORT.md` (время рендера, размер, стоимость, ограничения: рендер финала по master, FPS ≠ исходному — дубли/пропуски кадров); `./check`; коммит `test(motion-studio): приёмка Phase 5 и Test 4`.

### Task 47: Управление проектами и восстановление после сбоев

**Files:**
- Create: `app/motion-studio/server/src/db/migrations/004_lifecycle.sql`, `app/motion-studio/server/src/projects/{lifecycle.ts,trash.ts,delete-intent.ts}`, `app/motion-studio/server/src/recovery/{boot-report.ts,quarantine.ts,shutdown-marker.ts}`, `app/motion-studio/server/src/pipeline/trash-purge.ts`
- Create: `app/motion-studio/server/src/api/routes/{project-lifecycle,recovery}.ts`
- Create: `app/motion-studio/web/src/pages/RecoveryCenter.tsx`, `app/motion-studio/web/src/components/projects/{ProjectList,RenameDialog,DeleteDialog,TrashList,RecoveryBanner}.tsx`
- Modify: `app/motion-studio/server/src/boot.ts` (отчёт восстановления, маркер чистого завершения), `app/motion-studio/server/src/main.ts`, `app/motion-studio/web/src/pages/Dashboard.tsx`, `app/motion-studio/web/src/i18n/ru.ts`
- Test: `app/motion-studio/server/test/projects/{lifecycle,trash,delete-intent}.test.ts`, `app/motion-studio/server/test/recovery/{boot-report,quarantine,shutdown-marker}.test.ts`, `app/motion-studio/web/test/delete-dialog.test.tsx`, `app/motion-studio/web/e2e/projects.spec.ts`

**Interfaces:**
- Consumes: `bootCore`, `RecoveryReport`, `recoverOnStart` (Task 13); `quarantineDraft`, `cleanupDrafts` (Task 9, 11); `artifactPaths.trash` (Task 35); `enqueue` (Task 12); `safeMkdir` (Task 1)
- Produces:
  - `004_lifecycle.sql`: `projects.archived_at`, `projects.deleted_at`, `trash(id PK, project_id, rel_path, bytes, created_at, purged_at)`, `boot_reports(id PK, created_at, crashed, report_json, acknowledged_at)`
  - `renameProject(db, id, title)` — 1–120 символов после `trim`, иначе `invalid_title`; `archiveProject` / `unarchiveProject` — архивные скрыты из списка по умолчанию, задачи по ним не ставятся (`project_archived`)
  - `deleteIntent(db, root, id): { token: string; title: string; bytes: number; scenes: number; versions: number; exports: number; activeJobs: string[]; expiresAt: string }` — токен на 10 минут, привязан к состоянию проекта
  - `deleteProject(core, id, body: { token: string; confirm_title: string }): { trashId: string }` — активные или `pending` задачи → `project_busy` (с id задач); `confirm_title` ≠ названию → `confirm_mismatch`; токен устарел → `intent_expired`; иначе `rename` каталога в `workspace/trash/<id>-<ts>/` (тот же том) + `deleted_at`; данные не стираются
  - `restoreFromTrash(core, trashId)`; `purgeTrash: JobHandler` — вход `{ trashIds: string[]; token }` (второй `deleteIntent` для корзины); удаляет каталоги, `purged_at`
  - `writeShutdownMarker(root)` при штатной остановке; `consumeShutdownMarker(root): boolean` при старте — нет маркера → `crashed: true`
  - `persistBootReport(db, report: RecoveryReport & { crashed: boolean; quarantined: QuarantineEntry[] })`; `listQuarantined(root, db): QuarantineEntry[]` (`dir`, `job_id`, `attempt`, причина, размер, время); `discardQuarantined(core, dir, token)` — только явно, с подтверждением
  - API: `PATCH /projects/:id { title }`, `POST /projects/:id/archive`, `POST /projects/:id/unarchive`, `POST /projects/:id/delete-intent` → сводка + токен, `DELETE /projects/:id { token, confirm_title }` → 200 | 409 `project_busy` | 400 `confirm_mismatch`, `GET /trash`, `POST /trash/:id/restore`, `POST /trash/purge`; `GET /recovery` (последний отчёт, карантин), `POST /recovery/:id/ack`, `POST /recovery/quarantine/discard { dir, token }`
  - UI: `ProjectList` (поиск, фильтр «активные / архив / корзина», переименование на месте, меню действий); `DeleteDialog` — сводка «что будет удалено» и ввод названия; `RecoveryBanner` после аварийного завершения («восстановлено N задач, M заблокированы, K черновиков в карантине» → `RecoveryCenter`); `RecoveryCenter` — задачи с исходом, `blocked` с PID и командой, карантин с действиями «Посмотреть журнал», «Удалить черновик»

- [ ] **Step 1: Тесты (падают):**

```ts
const it1 = deleteIntent(db, root, "p1");
expect(() => deleteProject(core, "p1", { token: it1.token, confirm_title: "другое" })).toThrow(/confirm_mismatch/);
enqueue(db, genJob("p1"));
expect(() => deleteProject(core, "p1", { token: it1.token, confirm_title: "Мой ролик" })).toThrow(/project_busy/);
cancelAll(db, "p1");
const { trashId } = deleteProject(core, "p1", { token: deleteIntent(db, root, "p1").token, confirm_title: "Мой ролик" });
expect(existsSync(join(root, "workspace/projects/p1"))).toBe(false);
expect(existsSync(join(root, "workspace/trash", trashDir(trashId)))).toBe(true);        // ничего не стёрто
expect(projects.list(db).map(p => p.id)).not.toContain("p1");
restoreFromTrash(core, trashId); expect(projects.get(db, "p1")!.deleted_at).toBeNull();
clock.advance(11 * 60_000); expect(() => deleteProject(core, "p1", { token: it1.token, confirm_title: "Мой ролик" })).toThrow(/intent_expired/);
expect(() => renameProject(db, "p1", "   ")).toThrow(/invalid_title/);
archiveProject(db, "p2"); expect(() => enqueue(db, genJob("p2"))).toThrow(/project_archived/);
// аварийный старт: маркера нет → crashed: true; черновик .quarantined не удалён автоматически
expect((await bootFixture({ cleanShutdown: false })).bootReport.crashed).toBe(true);
expect(listQuarantined(root, db)).toHaveLength(1);
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS; Playwright `projects.spec.ts`: переименовать, архивировать, удалить с подтверждением, восстановить из корзины; после `SIGKILL` сервера — баннер восстановления. **Step 4:** `./check`; коммит `feat(motion-studio): управление проектами и центр восстановления`.

### Task 48: Диагностика — doctor в UI, журналы, трассировка, каталог ошибок

**Files:**
- Create: `app/motion-studio/server/src/diagnostics/{logger.ts,redact.ts,doctor-checks.ts,trace.ts,bundle.ts,error-catalog.ts}`, `app/motion-studio/server/src/api/routes/diagnostics.ts`
- Modify: `app/motion-studio/server/src/cli/doctor.ts` (→ `runDoctor()`), `app/motion-studio/server/src/jobs/{runner.ts,events.ts}`, `app/motion-studio/server/src/agents/claude-code.ts`, `app/motion-studio/render/src/node/worker.ts` (корреляционные поля в журнал)
- Create: `app/motion-studio/web/src/pages/Diagnostics.tsx`, `app/motion-studio/web/src/components/diagnostics/{DoctorTable,LogViewer,TraceView,ErrorCard}.tsx`; Modify: `app/motion-studio/web/src/components/JobStatus.tsx` (использует `ErrorCard`), `app/motion-studio/web/src/i18n/ru.ts`
- Test: `app/motion-studio/server/test/diagnostics/{logger,redact,doctor-checks,trace,bundle,error-catalog}.test.ts`, `app/motion-studio/web/test/error-card.test.tsx`

**Interfaces:**
- Consumes: `doctor` (Task 20, 25, 26, 30); `JobErrorSchema` (Task 11, 23, 35); `job_events`, `agent_runs`, `render_jobs` repos (Task 11); `EventBus` (Task 12)
- Produces:
  - `createLogger(root): Logger` — JSONL `logs/server-YYYY-MM-DD.jsonl`, ротация 10 МБ × 10 файлов; поля `ts, level, msg, project_id?, scene_id?, version_id?, job_id?, attempt?, agent_run_id?, render_job_id?`; каждая запись проходит `redact`
  - `redact(s: string): string` — `sk-ant-[A-Za-z0-9_-]+`, `Bearer [^\s]+`, `ANTHROPIC_API_KEY=\S+`, `"(access|refresh)_token":\s*"[^"]+"` → `[скрыто]`
  - `runDoctor(opts?: { fast?: boolean }): Promise<DoctorReport>`; `DoctorReport = { checks: { id: string; ok: boolean; detail: string; fix?: string }[]; ok: boolean }` — общий для CLI и API
  - `jobTrace(db, jobId): { project; scene?; version?; job; children: Job[]; agentRuns: AgentRunRow[]; renderJobs: RenderJobRow[]; events: JobEventDto[] }` — связь project → scene → version → agent run → render job (ТЗ §12)
  - `diagnosticBundle(core, opts: { includePrompts: boolean }): Promise<{ path: string; bytes: number }>` — zip в `MS_DATA_DIR/diagnostics/<ts>.zip`: журналы за 7 дней, `doctor.json`, `PRAGMA user_version`, последние 2000 `job_events`, `boot_reports`; без медиа, без превью, промпты — только при `includePrompts`; всё через `redact`
  - `ERROR_CATALOG: Record<ErrorCode, { title: string /* ключ t() */; hint: string; actions: ("retry" | "open_logs" | "open_settings" | "wait_storage" | "kill_process" | "reapprove" | "rebuild_timeline")[] }>` — для каждого кода `JobErrorSchema` и API-ошибок; `explainError(e): ErrorView`
  - API: `GET /diagnostics/doctor?fast=` (кэш 30 с), `GET /logs?level=&jobId=&projectId=&since=&limit=` (≤ 1000), `GET /jobs/:id/trace`, `POST /diagnostics/bundle { includePrompts }` → 202 → `GET /diagnostics/bundles/:name`
  - UI: страница «Диагностика» — `DoctorTable` (проверка, статус, подсказка, «Проверить снова»), `LogViewer` (фильтры, автообновление по SSE), `TraceView` (дерево проект → сцена → версия → запуски агентов → рендеры со стоимостью и временем), «Собрать архив»; `ErrorCard` везде, где показывается ошибка: этап, понятный текст, действия из каталога, «Технические подробности» (журнал), «Продолжить с последнего успешного шага» (`retry` переиспользует чекпоинты, ТЗ §11.3)

- [ ] **Step 1: Тесты (падают):**

```ts
expect(redact('token sk-ant-api03-AbC_12 and Bearer xyz.abc')).toBe("token [скрыто] and Bearer [скрыто]");
for (const code of JobErrorSchema.shape.code.options) expect(ERROR_CATALOG[code], code).toBeDefined();
log.info("render", { job_id: "job_1", project_id: "p1" }); expect(lastLine(root)).toMatchObject({ job_id: "job_1", project_id: "p1", level: "info" });
writeMany(log, 11 * 1024 * 1024); expect(logFiles(root).length).toBeGreaterThan(1); expect(logFiles(root).length).toBeLessThanOrEqual(10);
expect(jobTrace(db, "job_edit").agentRuns.map(r => r.role)).toEqual(["edit_planner", "motion_director", "engineer", "visual_qa"]);
const b = await diagnosticBundle(core, { includePrompts: false });
expect(zipEntries(b.path).some(n => n.endsWith(".mp4") || n.includes("prompt"))).toBe(false);
expect(zipText(b.path)).not.toMatch(/sk-ant-/);
expect((await runDoctor({ fast: true })).checks.map(c => c.id)).toEqual(expect.arrayContaining(["node", "claude", "ffmpeg", "storage", "chrome", "asr", "vision", "db"]));
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS. **Step 4:** `./check`; коммит `feat(motion-studio): страница диагностики, журналы и каталог ошибок`.

### Task 49: Производительность и долгие операции — кэш рендера, прокси, сторож прогресса, затраты

**Files:**
- Create: `app/motion-studio/server/src/perf/{cache-gc.ts,stills-cache.ts,watchdog.ts,costs.ts,profile.ts}`, `app/motion-studio/server/src/pipeline/cache-gc.ts`, `app/motion-studio/scripts/perf-profile.mjs`
- Modify: `app/motion-studio/server/src/jobs/runner.ts` (сторож прогресса), `app/motion-studio/render/src/node/{worker.ts,worker-timeline.ts}` (`concurrency` из конфига, переиспользование бандла по ключу), `app/motion-studio/server/src/config.ts` (`render.concurrency`, `cache.maxBytes`, `watchdog`)
- Create: `app/motion-studio/web/src/components/costs/{CostSummary,CostBadge}.tsx`; Modify: `app/motion-studio/web/src/pages/{Dashboard,SceneInspector}.tsx`, `app/motion-studio/web/src/components/production/BatchBar.tsx`
- Create: `docs/evidence/phase-6/perf/PROFILE.md`
- Test: `app/motion-studio/server/test/perf/{cache-gc,stills-cache,watchdog,costs}.test.ts`, `app/motion-studio/server/test/perf/long-ops.e2e.test.ts`

**Interfaces:**
- Consumes: `contentKey`, `writeEntry`, `writeTimelineEntry`, `renderVersion`, `renderTimelineRange` (Task 4, 36); `ensureMaster` (Task 36); `JobRunner`, `JobContext.progress` (Task 12); `agent_runs` repo (Task 11); `exports`, `final_exports` (Task 11, 35)
- Produces:
  - `gcCache(root, db, o: { maxBytes: number /* 20 GiB */ }): Promise<{ removed: string[]; keptBytes: number }>` — LRU по `atime`-маркеру `.used`; никогда не удаляет бандлы и master, на которые ссылается активная задача или текущая ревизия таймлайна; `cache.gc` — задача по кнопке и раз в сутки при простое
  - `stillsCache.get/put(contentKey, frame, size): string | undefined` — кадры для QA, сравнения версий и миниатюр не рендерятся повторно
  - `progressWatchdog(o: { noProgressMs: Record<JobType | "default", number> })` — по умолчанию: рендеры 300 000, агенты 600 000, ffmpeg 300 000, ASR — `asr.noOutputTimeoutMs`; нет вызова `progress()`/событий дольше лимита → abort попытки, `failed(stalled)` с этапом; повтор — по правилам ADR 0007
  - `renderConcurrency(cpus: number, cfg?: number): number` — `cfg ?? min(4, max(1, floor(cpus / 2)))`
  - `costSummary(db, f: { projectId?: string; sceneId?: string; since?: string }): { totalUsd: number; byRole: Record<Role, number>; byModel: Record<string, number>; byScene: { sceneId; usd }[]; calls: number }`
  - `perf-profile.mjs` — без LLM: 6 версий-фикстур через `seedScene` + `timeline.preview` + финал 120 с 1080p на реальном ролике приёмки; три прогона подряд; время этапов, пик RSS сервера и воркера, байты на диске, попадания кэша → `PROFILE.md`; повтор с отклонением > 25 % от записанного профиля — предупреждение (F13)
  - UI: `CostSummary` на Dashboard (за 7/30 дней, по ролям и моделям; подпись «расчётная стоимость по данным CLI, не счёт подписки»), `CostBadge` в инспекторе сцены и на `BatchBar`

- [ ] **Step 1: Тесты (падают):**

```ts
expect(renderConcurrency(10)).toBe(4); expect(renderConcurrency(2)).toBe(1); expect(renderConcurrency(10, 2)).toBe(2);
const r = await gcCache(root, db, { maxBytes: 3 * MiB });   // 5 бандлов по 1 МиБ, b2 — у активной задачи, b5 — у текущего таймлайна
expect(r.removed.sort()).toEqual(["b1", "b3"]);
const jobId = enqueueSilent(db);                            // обработчик молчит 1 с при noProgressMs 200
await runToIdle(runner);
expect(jobs.get(db, jobId)).toMatchObject({ status: "failed", error: { code: "stalled" } });
expect(costSummary(db, { projectId: "p1" })).toMatchObject({ totalUsd: 3.75, byRole: { engineer: 2.5, visual_qa: 0.25, motion_director: 1 } });
```

- [ ] **Step 2: e2e `long-ops.e2e.test.ts`:** финал 120 с подряд три раза → RSS третьего ≤ 1,5 × первого; SSE-клиент переподключается посреди рендера с `Last-Event-ID` и не теряет событий; второй и третий финал — бандл из кэша (`bundle` этап ≤ 10 % времени первого).
- [ ] **Step 3:** реализовать → PASS; `node scripts/perf-profile.mjs` → `PROFILE.md`. **Step 4:** `./check`; коммит `perf(motion-studio): кэш рендера, сторож прогресса и учёт затрат`.

### Task 50: Качество анимации — motion-kit v0.3, рубрика Visual QA, шаблоны лучших сцен

**Files:**
- Create: `app/motion-studio/render/src/motion-kit/components/{BeatTransition,MaskReveal,TextSweep,Spotlight,DataLabel,DrawArrow,Ticker}.tsx`, `app/motion-studio/render/src/motion-kit/choreo/{transitions.ts,camera-moves.ts,smoothness.ts}`
- Modify: `app/motion-studio/render/src/motion-kit/{index.ts,presets.ts,API.md,PROVENANCE.md}` (версия `0.3.0`, пресеты `editorial-warm`, `mono-minimal`), `app/motion-studio/contracts/src/{settings.ts,style.ts}` (`StylePreset` += 2), `app/motion-studio/contracts/src/qa.ts` (`QualityRubricSchema`), `app/motion-studio/prompts/{visual-qa.md,partials/quality-rubric.md,motion-director.md,engineer.md}`
- Create: `app/motion-studio/server/src/qa/{rubric.ts,smoothness.ts}`, `app/motion-studio/server/src/templates/{store.ts,candidates.ts}`, `app/motion-studio/server/src/api/routes/templates.ts`
- Modify: `app/motion-studio/server/src/qa/report.ts` (`mergeQA` учитывает рубрику), `app/motion-studio/server/src/pipeline/kb-select.ts` (шаблоны среди кандидатов), `app/motion-studio/web/src/components/QAPanel.tsx` (рубрика), `app/motion-studio/web/src/pages/SceneInspector.tsx` («Сохранить как шаблон»)
- Create: `app/motion-studio/fixtures/golden-prompts.json`, `app/motion-studio/scripts/quality-regression.mjs`, `docs/evidence/phase-6/quality/…`
- Test: `app/motion-studio/render/test/kit/{transitions,camera-moves,presets-v03,provenance}.test.ts`, `app/motion-studio/render/test/kit/v03-gallery.e2e.test.ts`, `app/motion-studio/server/test/qa/{rubric,smoothness}.test.ts`, `app/motion-studio/server/test/templates/{store,candidates}.test.ts`

**Interfaces:**
- Consumes: `resolveStyle`, `contrastRatio`, `Enter`, `cameraAt`, `Camera`, `staggerBeat`, `presets` (Task 14); компоненты v0.2 (Task 15); `selectQaFrames`, `runVisualQA`, `mergeQA`, `qaBlocks`, `frameDelta`, `loadPng` (Task 16); `selectCandidates` (Task 17); `SceneRepo` (Task 11); `checkSceneSource` (Task 5); `renderVersion` (Task 4)
- Produces:
  - motion-kit `0.3.0`: `BeatTransition { from; to; kind: "crossfade" | "wipe" | "push" | "zoom"; beat }`; `MaskReveal { shape: "rect" | "circle" | "diagonal"; beat }`; `TextSweep { text; beat; color? }` (подсветка по словам); `Spotlight { target: Rect; beat; dim: 0..1 }`; `DataLabel { at: Point; anchor: Point; text; beat }` (линия-выноска `draw`); `DrawArrow { from; to; curve?; beat }`; `Ticker { from; to; beat; mode: "roll" | "spring" }`; `cameraMove(kind: "push_in" | "pull_out" | "pan_to", target: Rect, beat, style): CameraKey[]` — в пределах `camera.max_scale`; пресеты `editorial-warm`, `mono-minimal` с контрастами как в Task 14 (`text ≥ 7`, `muted ≥ 4.5`, `accent[0] ≥ 3`); у каждого компонента строка `PROVENANCE.md` (`kb_id` или `own`), `rendered: ok`
  - `QualityRubricSchema = { scores: Record<"hierarchy" | "readability" | "rhythm" | "entrance_variety" | "motion_smoothness" | "style_consistency" | "semantic_fit" | "context_fit", 1 | 2 | 3 | 4 | 5>; notes: Record<string, string> }` — часть `VisualQAOutputSchema` (`rubric`); `context_fit` — только для сцен проекта
  - `rubricVerdict(r: QualityRubric): { visual: Verdict; issues: QAIssue[] }` — любая оценка ≤ 2 → `fail` + blocking `rubric_low:<критерий>`; среднее < 3,5 → `warn`; иначе `pass`
  - `smoothnessCheck(deltas: number[]): QAIssue[]` — по `frameDelta` 10 подряд идущих кадров входа главного бита: `max / median > 6` при `median > 0.001` → warning `jerky`
  - `markTemplate(repo, versionId, meta: { name: string; tags: string[]; patterns: PatternSlug[] }): Promise<TemplateRow>` — копия версии `ready` в `templates/<tpl>/` (иммутабельно, manifest с `source_version_id`); `templateCandidates(db, concept): TemplateRef[]` — шаблоны с совпадающими паттернами попадают к Director как кандидаты `kb_id = "own:template:<id>"`, `strategy: "adapt"`, provenance — исходная версия
  - `quality-regression.mjs` — 6 промптов `golden-prompts.json` (Test 1, Test 2 и 4 паттерна: сравнение, таймлайн, процесс, оверлей с акцентом на числе) реальным `claude` и рендером; таблица рубрики v0.3 против базового прогона v0.2 (сохранён в `phase-6/quality/baseline.json` первым запуском до перехода на v0.3)

- [ ] **Step 1: Тесты (падают):**

```ts
expect(rubricVerdict(r({ readability: 2 }))).toMatchObject({ visual: "fail", issues: [expect.objectContaining({ code: "rubric_low:readability", severity: "blocking" })] });
expect(rubricVerdict(r({ all: 3 })).visual).toBe("warn");
expect(rubricVerdict(r({ all: 4 })).visual).toBe("pass");
expect(smoothnessCheck([0.01, 0.011, 0.009, 0.08, 0.01, 0.012, 0.01, 0.011, 0.01, 0.009])).toEqual([expect.objectContaining({ code: "jerky", severity: "warning" })]);
expect(smoothnessCheck([0.01, 0.011, 0.012, 0.013, 0.012, 0.011, 0.01, 0.009, 0.008, 0.007])).toEqual([]);
for (const p of ["editorial-warm", "mono-minimal"] as const) expect(contrastRatio(presets[p].palette.text, presets[p].palette.bg)).toBeGreaterThanOrEqual(7);
expect(cameraMove("push_in", rect, beat, styleMax(1.15)).every(k => k.scale <= 1.15)).toBe(true);
expect(templateCandidates(db, concept(["quantities"])).map(t => t.kb_id)).toEqual(["own:template:tpl_1"]);
```

- [ ] **Step 2: Галерея v0.3 (e2e)** — все новые компоненты в сцене 1920×1080, 180 кадров; `checkSceneSource` пуст; кадры просмотрены [H], итог в `PROVENANCE.md`.
- [ ] **Step 3: Регрессия качества** — `node scripts/quality-regression.mjs` (реальные модели и рендер) → [A] нет оценок ≤ 2, среднее по каждому промпту ≥ базового; [H] человек сравнивает пары кадров v0.2/v0.3 и отмечает «лучше / так же / хуже»; итог — `docs/evidence/phase-6/quality/REPORT.md`.
- [ ] **Step 4:** реализовать → PASS. **Step 5:** `./check`; коммит `feat(motion-studio): motion-kit 0.3 и рубрика качества в Visual QA`.

### Task 51: UX-полировка, визуальная обратная связь и руководство пользователя

**Files:**
- Create: `app/motion-studio/web/src/components/ui/{Toasts,ProgressStages,Skeleton,ConfirmDialog,DisabledReason,EmptyState,ShortcutsHelp}.tsx`, `app/motion-studio/web/src/ui/{shortcuts.ts,eta.ts,unsaved.ts}`
- Modify: страницы и компоненты `web/src/pages/*`, `web/src/components/**` — единые состояния загрузки, пустые состояния, причины недоступности кнопок, подтверждения, прогресс по этапам; `web/src/i18n/ru.ts`
- Create: `docs/guide/{README.md,01-установка-и-запуск.md,02-motion-playground.md,03-видеопроект.md,04-сцены-и-утверждение.md,05-таймлайн-и-экспорт.md,06-проекты-и-корзина.md,07-диагностика-и-сбои.md,08-сценарии.md}`, `docs/guide/img/*.png`
- Create: `app/motion-studio/web/e2e/{guide-screens.spec.ts,a11y.spec.ts}`
- Test: `app/motion-studio/web/test/{shortcuts,eta,unsaved,confirm-dialog,disabled-reason,i18n-coverage}.test.tsx`

**Interfaces:**
- Consumes: все экраны Task 21, 29, 33, 40, 45, 47, 48; `useEvents`, `t`, `ru` (Task 21); `ERROR_CATALOG`, `ErrorCard` (Task 48); `seedScene` (Task 21)
- Produces:
  - `etaFrom(samples: { t: number; p: number }[]): number | undefined` — линейная регрессия по последним 10 точкам, `undefined` при < 3 точках или p не растёт; `ProgressStages` — этапы задачи (`job.stage`), прогресс, «осталось ≈ N мин»
  - `SHORTCUTS`: `Space` — пуск/пауза, `←/→` — ±1 кадр, `Shift+←/→` — ±1 с, `[`/`]` — предыдущая/следующая сцена, `Cmd+Z` — на таймлайне вернуть прежнюю ревизию; не срабатывают в полях ввода; `?` — `ShortcutsHelp`
  - `Toasts` по SSE: завершение, ошибка (с переходом к `ErrorCard`), `storage_offline`/возврат хранилища
  - `DisabledReason` — каждая недоступная кнопка показывает причину из словаря (например, «Утвердить (A)» — «остались непросмотренные предложения: 3»)
  - `ConfirmDialog` — для разрушительных и дорогих действий (удаление, очистка корзины, пакет > $10, перегенерация утверждённой сцены): сводка последствий, для удаления — ввод названия
  - `useUnsavedGuard(dirty: boolean)` — предупреждение при уходе со страницы с несохранённой правкой (транскрипт, план, параметры)
  - Доступность: роли и подписи из словаря, видимый фокус, контраст UI ≥ 4,5:1; проверка `@axe-core/playwright` без нарушений `serious`/`critical`
  - Руководство (`docs/guide/`, по-русски): установка и `doctor --init`; Playground (запрос, правки, версии, экспорт); видеопроект (импорт, транскрипт, черновой монтаж, анализ, план); сцены и утверждение (пакет, инспектор, контекст, C); таймлайн и экспорт (якоря, длительность, Final, отчёт проверки, повтор экспорта); проекты и корзина; диагностика и сбои (отключение SSD, `blocked`, карантин, архив диагностики); сценарии пользователя — 15 шагов DoD как сквозной пример; скриншоты — из `guide-screens.spec.ts` на фикстурах (без личных кадров)
  - `i18n-coverage`: все ключи `ru` используются, кириллицы в `.tsx` вне словаря нет (правило Phase 1)

- [ ] **Step 1: Тесты (падают):**

```ts
expect(etaFrom([{ t: 0, p: 0 }, { t: 10_000, p: 0.1 }, { t: 20_000, p: 0.2 }])).toBe(80_000);
expect(etaFrom([{ t: 0, p: 0.5 }, { t: 10_000, p: 0.5 }, { t: 20_000, p: 0.5 }])).toBeUndefined();
fireKey("ArrowRight"); expect(player.frame).toBe(1); fireKey("ArrowRight", { shift: true }); expect(player.frame).toBe(31);
typeInto(textarea, " "); expect(player.playing).toBe(false);                 // в поле ввода не срабатывает
render(<ApproveA proposedLeft={3} />); expect(screen.getByRole("button", { name: t("approval.a.approve") })).toBeDisabled();
expect(screen.getByText(t("approval.a.disabled.proposed", { n: 3 }))).toBeVisible();
```

- [ ] **Step 2:** Playwright `a11y.spec.ts` (Dashboard, Playground, Video Workspace, Scene Inspector, Timeline, Diagnostics) — нет `serious`/`critical`; `guide-screens.spec.ts` → `docs/guide/img/`.
- [ ] **Step 3:** реализовать, написать руководство → PASS; руководство вычитать (`slop-check` по желанию человека). **Step 4:** `./check`; коммит `feat(motion-studio): полировка UX и руководство пользователя`.

### Task 52: Финальная приёмка продукта — Definition of Done (15 шагов) и устойчивость

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance-dod/{global-setup.ts,helpers.ts,dod-01-08-playground.spec.ts,dod-09-14-video.spec.ts,dod-15-restart.spec.ts,robustness.spec.ts,output-params.spec.ts}`, `app/motion-studio/web/playwright.acceptance-dod.config.ts`
- Create: `app/motion-studio/scripts/{dod-report.mjs,versions-integrity.mjs}`
- Create: `docs/evidence/final/{dod/step-01…step-15,robustness,screens,manual-checklist.md}/…`, `docs/evidence/final/REPORT.md`, `docs/evidence/phase-6/REPORT.md`
- Modify: `app/motion-studio/Makefile` (`acceptance-dod`), `app/motion-studio/README.md` (как пройти приёмку, время, стоимость)

**Interfaces:**
- Consumes: всё из Task 1–51; `pick-test-video.mjs`, `timing-audit.mjs` (Task 34); `final-timing-audit.mjs` (Task 46); `kb-hashes.mjs` (Task 22); `seedScene` (Task 21) — только для сломанных фикстур устойчивости
- Produces:
  - `global-setup.ts`: новый стор `MS_DATA_DIR="/Volumes/External SSD/MotionStudio-dod"` (`doctor --init`), `npm run doctor` обязан пройти; `kb-hashes.mjs before`; sha256 ролика; `npm start` (production-сборка)
  - `versions-integrity.mjs before|after` — sha256 всех опубликованных версий, ревизий и экспортов; `after` обязан совпасть для всего, что было опубликовано до шага
  - `dod-report.mjs` — `REPORT.md`: 15 строк DoD и строки устойчивости → [A] pass/fail со ссылкой на evidence, [H] с результатом просмотра; скриншоты каждого шага; стоимость и время; известные ограничения; что требует утверждения (ТЗ §16 п.8)
  - `manual-checklist.md` — ручной тест отключения SSD (`09` §5 п.6) и просмотр финала глазами

- [ ] **Step 1: DoD 1–8 (`dod-01-08-playground.spec`, реальный `claude` и рендер), скриншот на каждом шаге:** (1) открыть приложение → Dashboard; (2) создать проект «Приёмка DoD»; (3) промпт Test 1 (`09` §2) дословно; (4) получить сцену → [A] версия `ready`, `knowledge-refs.json` с commit и лицензией, ffprobe-gate пуст; (5) предпросмотр: пуск, перемотка, шаг кадра; (6) правка чатом «сделай график ярче и замедли финальный акцент» → v2; (7) сравнить v1/v2 и восстановить v1 → v3 с `parent = v1`, v2 на месте; (8) экспорт MP4 → [A] `exportGate` пуст (1920×1080, 30 fps, h264/aac).
- [ ] **Step 2: DoD 9–14 (`dod-09-14-video.spec`):** (9) новый видеопроект, импорт ролика (V4) → [A] оригинал не изменён; (10) расшифровка и анализ → [A] слова с таймкодами, шоты, семантика, план; (11) черновой монтаж и план сцен (Approval A, B); (12) пакет сцен, просмотр в контексте, правка одной сцены, утверждение C; (13) собрать таймлайн, сдвинуть сцену по якорю, «Смонтировать и экспортировать»; (14) скачать финал → [A] `verify.verdict = pass`, `output-params.spec`: ffprobe = выбранным настройкам; [H] просмотр финала целиком.
- [ ] **Step 3: DoD 15 (`dod-15-restart.spec`):** остановить сервер (`SIGTERM`), запустить → оба проекта, версии, approvals, таймлайн и экспорты на месте → продолжить: новая правка сцены Playground и повтор финального экспорта → [A] `compareExports.verdict = reproduced`; `versions-integrity.mjs after` совпадает.
- [ ] **Step 4: Устойчивость (`robustness.spec`), каждая проверка — [A]:**
  1. `SIGKILL` сервера во время рендера сцены и во время финального рендера → после старта задачи доведены или `blocked(stale_process)` с PID; частичных публикаций нет;
  2. SSD: `MS_DATA_DIR` переименован во время задачи → `storage_offline`, 503, баннер, на системный диск ничего не записано (сравнение листинга `/Volumes`), после возврата — работа продолжена; физическое отключение — `manual-checklist.md` [H];
  3. перезапуск при пустой очереди и при очереди из 5 задач — ничего не потеряно, дублей нет (`Idempotency-Key`);
  4. конфликтующие задачи над одной сценой (правка + восстановление + перегенерация) — выполняются последовательно, интервалы не пересекаются; правка таймлайна во время `timeline.build` → 409 `resource_busy`;
  5. ошибка агента: `agents.engineer.maxBudgetUsd = 0.01` в настройках → задача `failed(budget)`, `ErrorCard` с действием «Открыть настройки», очередь не встала; недоступный `claude` (`claudeBin` на несуществующий путь) → `unavailable` с понятным текстом, без фиктивной сцены;
  6. ошибка компиляции: версия-фикстура с ошибкой TypeScript (`seedScene`) → рендер не запускается, `typecheck` с файлом и строкой в UI;
  7. ошибка рендера: `hang-scene` → таймаут, группа процессов убита, `failed` с логами, превью не подменено;
  8. сохранность прежних версий: `versions-integrity.mjs` до и после всех проверок — без расхождений; KB и оригинал — `kb-hashes.mjs after`, sha256 ролика;
  9. таймкоды: `final-timing-audit.mjs` — 10 слов ± 1 кадр, звук ≤ 1 кадр;
  10. параметры вывода: экспорт сцены (MP4, ProRes) и финала (два набора настроек) — ffprobe совпадает с выбранным.
- [ ] **Step 5: Ручная часть [H]:** `manual-checklist.md` — физически отключить SSD во время рендера, подключить, убедиться в продолжении; просмотреть финал; оценить UX по руководству (`docs/guide/08-сценарии.md` пройден человеком, замечания в отчёт).
- [ ] **Step 6:** `dod-report.mjs` → `docs/evidence/final/REPORT.md`, `docs/evidence/phase-6/REPORT.md` (Task 47–51: что сделано, профили, регрессия качества); `./check`; коммит `test(motion-studio): финальная приёмка продукта и evidence`; итог человеку по ТЗ §16 п.8.

---

## Self-review (выполнен)

- **ТЗ §13 Phase 4:** Knowledge Researcher, Motion Director, Engineer, QA — пайплайн Phase 1 через `runScenePipeline` (Task 37); пакетная генерация (Task 38); Scene Inspector (Task 40); чат-правки и ручные правки (Task 39); Approval C (Task 35, 39); экспорт отдельных сцен (Task 19 + 40); перенос сцены из Playground (ТЗ §6.1 п.10, Task 39). Приёмка «несколько реальных сцен, сбой одной не ломает остальные, независимые правки, возврат версий, утверждение» — Task 41.
- **ТЗ §13 Phase 5:** сборка rough cut и графики, overlay/fullscreen/PiP (Task 35–36, 42), точная синхронизация (Task 35, 44), финальный MP4 и настройки экспорта (Task 43), повторное открытие и экспорт из сохранённого проекта (Task 43–46). Test 4 — Task 46.
- **ТЗ §13 Phase 6:** профили производительности и нагрузка (Task 49), дизайн-пресеты и camera/motion patterns (Task 50), визуальный QA (рубрика, Task 50), шаблонизация лучших сцен (Task 50), мониторинг затрат (Task 49), UX-полировка (Task 51); плюс требования пользователя: управление проектами, диагностика, восстановление, руководство (Task 47, 48, 51). Функциональные требования не заменены косметикой: каждая задача Phase 6 имеет проверяемые тесты.
- **ТЗ §5 A8–A9:** предпросмотр в контексте (Task 39), принять/отклонить/исправить (Task 39–40), смена режима и размещения (Task 39 `zone`, перегенерация при смене класса), возврат версии, скачивание сцены, перемещение с проверкой привязки (Task 42); применение EDL, композиция в правильных координатах, сохранение речи без изменения громкости, техпроверка, manifest и повторно открываемый проект (Task 36, 43, 44).
- **ТЗ §7.1 и пользовательское «все переводы времени согласованы»:** одна функция на перевод в `@ms/contracts` (`clipsToSequences`, `audioSampleRange`, `keyTermLocalFrames`, `anchorCheck`, `snapToWord`); перенос после правки EDL — по якорю-слову (`carryOver`).
- **ТЗ §11.2:** C на версию, `final` на каждое нажатие, `assembleGate` дважды (при постановке и перед публикацией) — сборки из устаревшего нет.
- **ADR 0006/0007:** все новые долгие операции — задачи с draft на попытку, fencing, группами процессов (включая медиасервер воркера), восстановлением и `blocked`; StorageGuard в ходе финального рендера (Task 43, 46, 52); замки сцены, пакета, таймлайна, финала (Task 35).
- **Интерфейсы прошлых планов потребляются по точным именам:** `playgroundGenerate`, `playgroundEdit`, `sceneRestore`, `sceneExport`, `exportVersion`, `exportGate`, `alphaAtCorner`, `SceneRepo`, `recordRun`, `selectCandidates`, `buildDirectorTask`, `buildEngineerTask`, `provenanceGate`, `applyParamEdit`, `checkPreserve`, `versionHistoryDigest`, `selectQaFrames`, `programmaticChecks`, `specChecks`, `runVisualQA`, `mergeQA`, `qaBlocks`, `fixHints`, `loadPng`, `inkFraction`, `frameDelta`, `writeEntry`, `contentKey`, `renderVersion`, `ffprobe`, `ProbeResult`, `checkSceneSource`, `resolveStyle`, `contrastRatio`, `presets`, `cameraAt`, `enqueue`, `claimNext`, `finish`, `requestCancel`, `recoverOnStart`, `bootCore`, `buildApp`, `EventBus`, `JobRunner`, `Semaphore`, `SCENE_WRITING_TYPES`, `ScenePropsBaseSchema`, `scaleTiming`, `EditPlanSchema`, `JobErrorSchema`, `buildTimeline`, `sourceToEdited`, `editedToSource`, `mapWords`, `rangeFromWords`, `snapUsToFrame`, `canonicalHash`, `ZONE_RECTS`, `occupiedAt`, `extractKeyframes`, `approve`, `approvalState`, `currentSubject`, `ArtifactStore`, `createJobDraft`, `artifactPaths`, `lockKeyFor`, `resourceBusy`, `timelineFor`, `buildPreviewFilter`, `audioOffsetUs`, `syncCheck`, `runFfmpeg`, `probeMedia`, `assertOutsideSource`, `seedScene`, `Player`, `QAPanel`, `VersionCompare`, `ComponentsPanel`, `Chat`, `ExportDialog`, `PlanTrack`, `EvidenceQuote`, `trackLayout`, `t`, `useEvents`. Расширения (обратно совместимые): `JobTypeSchema`, `JobErrorSchema.code`, `stale_reason`, `approve` (область C), `ScenePropsBaseSchema.layout`, `ProbeResult` (аудио-поля), `playgroundEdit` (`scene`, `editPlan`), `buildAudioFilter` из `buildPreviewFilter`, `StylePreset` (+2 в Phase 6), `VisualQAOutputSchema.rubric`.
- **Без моков в приёмке:** Task 41, 46, 52 — реальные `claude`, `renderMedia`, ffmpeg/ffprobe, ролик пользователя; фейковые обработчики — только в юнит-тестах логики (Task 38, 39, 43); UI-тесты без LLM — на реально отрендеренных фикстурах (`seedScene`).
- ai-platform не меняется; источники кода — только ТЗ, official skills, KB и собственные пакеты.
- **Открытые [Д]:** `<Sequence width height>` на 4.0.537 (F4), доставка медиа в `OffthreadVideo` (F9), целевые числа профиля (F13) — проверяются в Task 36 и 49, результат пишется в ADR 0008 и `PROFILE.md`.
