---
тип: plan
статус: в работе
обновлено: 2026-10-25
спека: 2026-10-20-motion-studio-phase4-6.md
---

# AI Video Production — Phase 4 (сцены видеопроекта), Phase 5 (сборка и финал), Phase 6 (полировка): план реализации, редакция 2026-10-25

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Редакция.** План переписан 2026-10-25 под решения человека Р-V1…Р-V9 (ADR 0009
«Видеосцены через сценарный конвейер») после сценарного трека S1–S18. Источник решений и
вердиктов по задачам — сверка `.superpowers/sdd/2026-10-20-motion-studio-phase4-6/reconciliation-2026-10-25.md`.
Редакция 2026-10-21 (производственный конвейер `production.*`, `runScenePipeline`, бюджет пакета,
retime с таймлайна, миграции 003/004) заменена целиком; её брифы `task-NN-brief.md` не удалены и
не действуют, действуют `v2-task-<id>-brief.md` и `v2-global.md`.

**Goal:** из утверждённого плана сцен видеопроекта (Approval B) получить сцены тем же конвейером,
что и у сценария (`playground.generate`/`playground.edit` с входом `video`), посмотреть их по
одной и в контексте исходника, доработать в Playground, утвердить версию (Approval C) и выгрузить
папку клипов с шпаргалкой таймкодов (Phase 5-lite); затем собрать таймлайн (EDL Phase 2 + сцены
плана) с привязкой к словам, отрендерить финал одной Remotion-композицией с исходным звуком,
проверить и воспроизвести его из сохранённого проекта. Phase 6: управление проектами,
восстановление, диагностика, затраты и производительность, UX и руководство. Финал — 15 шагов
Definition of Done плюс регресс сценарного MVP.

**Architecture:** новых пакетов нет. Сцена видеопроекта — обычная сцена Playground, её задачи —
`playground.generate` с входом `video` (рядом с `script`) и `playground.edit`; пакет — набор
обычных задач с ключами, как `server/src/script/batch.ts`; хранение — таблицы `video_scenes`,
`video_batches`, `video_packages` по образцу `script_*`. Все размещения рендерятся на весь кадр:
`fullscreen` — непрозрачно, остальные — прозрачно (тот же приём, что альфа-экспорт S6,
`props.style.transparent`), графика — только в `props.layout.rect`. В `@ms/contracts` — контекст
видеосцены, размещение, чистая математика таймлайна и финала (`video-scene.ts`,
`timeline-render.ts`, `final.ts`). В `@ms/render` — одна композиция `ProjectTimeline`
(`OffthreadVideo` по EDL, звук — готовая дорожка, сцены — модули версий в `<Sequence>`),
`renderTimelineRange` для превью в контексте, превью таймлайна и финала, loopback-медиасервер
воркера. В `server` — `src/video-scenes/` (бриф, контекст, проверки, пакет, Approval C),
`src/timeline/`, `src/final/`, `src/projects/`, `src/recovery/`, `src/diagnostics/`, `src/perf/`.
FFmpeg только готовит входы (CFR-master, дорожка звука) и проверяет выход.

**Tech Stack:** как Phase 1–3 и сценарный трек: Node 22.21.1 через `app/motion-studio/scripts/with-node.sh`,
TS strict ESM, Zod 3, Fastify 5, better-sqlite3, Vitest, React 19 + Vite + TanStack Query,
Playwright, Remotion 4.0.537 точно, ffmpeg/ffprobe 7.1 (`psnr`, `ebur128`, `astats`), Claude Code
CLI headless; плюс `@axe-core/playwright` (devDependency, Task 51) и `yazl` (zip, Task 48).

**Spec:** `docs/superpowers/specs/2026-10-20-motion-studio-phase4-6.md` (раздел «Изменения
2026-10-25»), ТЗ `AI_Motion_Studio_TZ.md` §5 (A6–A9), §7, §8, §11–§14; архитектура `docs/architecture/`;
ADR 0001–0007, 0009; сценарный трек — `docs/superpowers/plans/2026-10-24-script-to-motion.md` и
спека `2026-10-24-script-to-motion-design.md` (интерфейсы S1–S18 потребляются по точным именам).

## Что изменилось против редакции 2026-10-21

| Было | Стало | Решение |
|---|---|---|
| `production.generate/edit/batch`, `runScenePipeline` | `playground.generate`/`playground.edit` с входом `video` | Р-V1 |
| задача `production.batch`, бюджетный гейт | пакет = набор задач (`stageBatch`-аналог), ключи `video:…`, бюджета нет | Р-V2, Р-V7 |
| `production_scenes`, `batches`, `batch_items`, `prod_timelines` | `video_scenes`, `video_batches`, `video_packages`, `video_timelines` | Р-V3 |
| C: `scene:<id>@<versionId>`, отзыв всех C проекта | C: `scene:<id>@r<N>` + `manifest_sha256`, отзыв по субъекту; final: `timeline:<id>@r<N>` + хеш настроек | Р-V4 |
| холст `rect` для pip/split, `<Sequence width height>` [Д] | все размещения на весь кадр, прозрачно, графика в `layout.rect` | Р-V5 |
| `set_duration`/`retime` с таймлайна, `ManualEdit.retime` | длительность — только правкой плана; с таймлайна — нет | Р-V6 |
| Task 50 (motion-kit 0.3, рубрика) | трек качества S16b + ночь, последним; kit от 0.5.8 | Р-V8 |
| сразу полная Phase 5 | сначала Phase 5-lite (папка клипов), потом Phase 5 | Р-V9 |
| миграции 003/004 | одна миграция `006_video_production.sql` (001–005 уже есть) | сверка |
| Scene Inspector | Playground со ссылкой «← К видео», вкладка «Сцены» в VideoWorkspace | сверка |
| Task 38, 39 | одна задача 38-39; Task 49 → 49a и 49b; новая 5L | сверка |

## Порядок и волны

Каждая задача — свой worktree от `staging` после слияния предыдущей волны.

```text
В1  35′ (основа: контракты, 006, реестры, заглушки)
В2  36 (движок) ∥ 37′ (генерация видеосцены) ∥ 44 (проверка финала) ∥ 47 (проекты, восстановление)
В3  38-39 (пакет, правки, C, превью в контексте) ∥ 42 (таймлайн) ∥ 48 (диагностика)
В4  40 (UI сцен) ∥ 5L (папка клипов) ∥ 43 (финальный рендер) ∥ 49a (затраты, сторож, кэш)
В5  41 (приёмка Ph4) → 45 (UI таймлайна и финала)
В6  46 (приёмка Ph5 + Test 4)
В7  49b (профиль финала) ∥ 51 (UX, руководство)
В8  52 (DoD + регресс сценария)
Затем трек качества: S16b и ночные прогоны (вместо Task 50).
```

| Задача | Зависит от | Свои файлы (кратко) |
|---|---|---|
| 35′ | staging | контракты, 006, реестры, заглушки, kit 0.5.9 `LayoutRect`, правило split_screen |
| 36 | 35′ | `render/src/timeline/*`, `render/src/node/{overlay-props,asset-guard}.ts`, `server/src/media/{master,edited-audio}.ts`, `preview-filter.ts` |
| 37′ | 35′ | `server/src/video-scenes/{context,brief,fingerprint,checks,compose-frame}.ts`, `playground-generate.ts`, `prompts/partials/video-scene.md` |
| 44 | 35′ | `server/src/final/{verify,frames,sync,loudness,compare}.ts`, `make-media-fixtures.mjs` |
| 47 | 35′ | `server/src/projects/*`, `server/src/recovery/*`, `boot.ts`, `main.ts`, страницы проектов |
| 38-39 | 37′, 36 | `server/src/video-scenes/{batch,approval-c,queue,state}.ts`, `server/src/jobs/batch-keys.ts`, `playground-edit.ts`, `scene-preview-context.ts` |
| 42 | 36, 37′ | `server/src/timeline/*`, `timeline-build.ts`, `timeline-preview.ts`, `analysis/plan-recheck.ts` |
| 48 | 35′ | `server/src/diagnostics/*`, `cli/doctor.ts`, `jobs/{runner,events}.ts`, `api/job-dto.ts` |
| 40 | 38-39 | `api/routes/video-batch.ts`, `web/src/pages/video/ScenesTab.tsx`, `web/src/components/video-scenes/*` |
| 5L | 38-39 | `pipeline/video-package.ts`, `video-scenes/cheatsheet.ts`, `api/routes/video-package.ts`, `web/src/pages/video/ExportTab.tsx` |
| 43 | 36, 42, 44 | `server/src/final/{gate,request,render,manifest,snapshot}.ts`, `final-render.ts`, `final-reproduce.ts` |
| 49a | 48 | `server/src/perf/*`, `pipeline/cache-gc.ts`, `jobs/runner.ts` (сторож) |
| 41 | 40, 5L | `web/e2e/acceptance-video-scenes/*`, evidence Phase 4 |
| 45 | 42, 43, 44 | `api/routes/{timelines,final-exports}.ts`, `web/src/pages/video/TimelineTab.tsx`, `web/src/components/timeline/*` |
| 46 | 45, 41 | `web/e2e/acceptance-final/*`, evidence Phase 5 |
| 49b | 46 | `scripts/perf-profile.mjs`, `perf/profile.ts`, `PROFILE.md` |
| 51 | 46 | `web/src/components/ui/*`, `docs/guide/*` |
| 52 | всё | `web/e2e/acceptance-dod/*`, evidence final |

**Реестры правит только 35′:** `contracts/src/index.ts`, `contracts/src/jobs.ts`,
`contracts/src/failure.ts`, `contracts/src/approvals.ts`, `server/src/jobs/handlers.ts`,
`server/src/jobs/locks.ts`, `server/src/api/app.ts`, `server/src/config.ts`,
`server/src/db/migrations/*`, `server/src/artifacts/paths.ts`, `web/src/i18n/ru.ts`,
`web/src/App.tsx`, `web/src/router.ts`, `web/src/pages/VideoWorkspace.tsx`. 35′ ставит заглушки
(обработчики, маршруты, вкладки, страницы, словари); задача заменяет тело заглушки в своём файле,
сигнатуру фабрики не меняет. Нужно поле в контракте 35′ — только добавление необязательного поля в
конец схемы с комментарием `// Task <id>:` и строкой в отчёте. Строки UI — только в своём словаре
`web/src/i18n/ru-<область>.ts`.

## Global Constraints

- Всё из Global Constraints Phase 1–3 и сценарного трека в силе: Node только через
  `app/motion-studio/scripts/with-node.sh`; Remotion 4.0.537 точно; агенты — `claude -p --restricted`
  без Bash и bypass; модели — `agents.<role>.model`; `Idempotency-Key` на создающих POST; строки UI —
  только `t(key)`; коммиты `тип(область): описание` ≤ 72 символов без строк соавторства; хуки не
  обходить; перед коммитом `./check` зелёный. Ветки, `./finish`, слияние — контроллер.
- **Сервер только на 127.0.0.1** (ADR 0005); медиасервер воркера — тоже `127.0.0.1:0`.
- **Данные только в папке материалов** `/Volumes/External SSD/moution-studio-materials/` (S18):
  хранилища — через `materialsPath("store" | "acceptance" | "e2e" | "examples", …)` и
  `assertInMaterials` из `@ms/core` (`core/src/storage/materials.ts`); рабочее хранилище — внутри
  `MS_DATA_DIR` через StorageGuard и `safeMkdir`; исходные ролики вне папки — только чтение.
- **ai-platform не меняется** (только запуск ASR-воркера Phase 2).
- **Сценарный трек не ломать.** Тесты `server/test/script/*`, `web/test/script/*`, `make e2e-ui`
  зелёные; задачи, трогающие общий конвейер (`playground-generate.ts`, `playground-edit.ts`,
  `fix-loop.ts`, `script/batch.ts`, `render/src/node/export-version.ts`), дополнительно гоняют
  `server/test/script/script-generate.e2e.test.ts` (реальный `claude`, 3 сцены, `MS_E2E=1`).
- **ADR 0007:** draft на попытку, публикация через `SceneRepo.publish`/`ArtifactStore.publish` с
  fencing `jobs.attempt`; дочерние процессы (Remotion-воркер, ffmpeg, `claude`, медиасервер) —
  `spawnTracked` + `ProcessRegistry`; без подтверждённого завершения прежней попытки — `blocked(stale_process)`.
- **Один движок.** Сцены — тем же конвейером Playground; финал, превью таймлайна и превью в
  контексте — одна композиция `ProjectTimeline` (ADR 0010, Task 36). FFmpeg — только входы и проверка.
- **Длительность сцены — только через план** (Р-V6): границы по словам в плане → новая ревизия →
  перегенерация сцены с новой плановой длиной. С таймлайна и в правке Playground длительность
  видеосцены не меняется (`durationChecks`, как у сценария S16a).
- **Время:** только целые µs и кадры `timeline_fps`; переводы — функции `@ms/contracts`
  (`usToFrame`, `frameToUs`, `snapUsToFrame`, `buildTimeline`, `sourceToEdited`, `editedToSource`,
  `mapWords`, `rangeFromWords` + 35′). Своих формул времени нет. Привязки — id слов.
- **Approvals (Р-V4):** C — на версию сцены `scene:<sceneId>@r<number>` + `manifest_sha256`; новая
  C той же сцены отзывает прежнюю только этой сцены; final — `timeline:<id>@r<N>` + `canonicalHash(request)`.
  Финал проверяет свежесть A, B, C включённых сцен и final в транзакции; устаревшее —
  `approval_required` / `timeline_stale`.
- **Исходник неизменяем** (`assertOutsideSource`); **звук** — исходная речь без нормализации,
  склейки — микрофейды `roughcut.fadeUs`.
- **Реальность приёмки:** фейковые агенты и бинарники — только в юнит-тестах логики; e2e и
  приёмка — реальные `claude`, `renderMedia`, ffmpeg/ffprobe, ролик пользователя (согласие
  2026-10-24 на свои ролики MyProtocol). e2e с LLM — во временном хранилище
  `materialsPath("e2e", "<задача>")`, не в рабочем.
- Evidence — `docs/evidence/phase-4/`, `phase-5/`, `phase-6/`, `final/`; видео в git нет (sha256,
  ffprobe, путь); кадры личного ролика ≤ 480 px.
- **Качество анимации — не цель этих задач** (его ведёт трек качества после 52); здесь —
  корректность размещения, синхронизации, данных и надёжность.

## Review Focus

1. Сценарный трек не сломан: вход `script` ведёт себя как до 37′ (те же шаги, ключи, отпечатки),
   `script/batch.ts` после выноса общих помощников даёт те же ключи и id пакетов (37′, 38-39).
2. Отпечаток видеосцены не зависит от абсолютной позиции в ролике: правка EDL до сцены сдвигает
   её, но не делает устаревшей; смена границ слов, режима, зоны, ключевых слов — делает (37′, 42).
3. Approval C другой сцены не отзывается; final на ревизию таймлайна + настройки; пересборка
   `approvals` в 006 сохраняет `rowid` и порядок `latestActive` (35′, 38-39, 43).
4. Финал на 1 кадр сдвинут относительно звука или исходника: `clipsToSequences` и
   `audioSampleRange` дают те же границы, что `buildTimeline`; `verifyFinal` ловит ±1 кадр (35′, 36, 44).
5. Графика поверх лица в отрендеренных кадрах — blocking `face_ink`; вне зоны — `outside_zone` (37′).
6. Медиасервер отдаёт только перечисленные файлы, только на 127.0.0.1, с токеном; сцена агента
   не может обратиться к сети (36).
7. Сервер убит во время финала: группа воркера и медиасервер убиты, частичный файл не
   опубликован (43, 46, 52). Удаление проекта при активной задаче (в т. ч. сценарный пакет) — 409 (47).

## Пробелы спеки — решения (обновлено 2026-10-25)

| # | Суть | Решение |
|---|---|---|
| F1 | `OffthreadVideo` по VFR/повёрнутому оригиналу неточен | CFR-дериватив `master@<num>-<den>` (H.264 CRF 12, `-g` = 1 с, без звука), кэш по (sha256, fps); превью — по прокси. VFR iPhone (Phase 2 F2) — здесь (Task 36) |
| F2 | сэмпл-точные склейки звука | видео `OffthreadVideo muted`; звук — `edited-audio.wav` 48 кГц тем же фильтром, что превью rough cut (`buildAudioFilter`), одна `<Audio>` |
| F3 | второй путь композитинга (FFmpeg-оверлей) | нет; ADR 0010 (`предложено`, Task 36) |
| F4 | как сцена встраивается в кадр | **заменено Р-V5:** все режимы — холст на весь кадр; `fullscreen` непрозрачный; `overlay`, `callout`, `split_screen`, `pip` — прозрачные (`props.style.transparent`), графика только в `props.layout.rect` = `item.rect`. `pip` по аналогии со `split_screen` — решение планировщика (своя «карточка» рисуется внутри `rect`); split_screen при лице в центре не предлагается (35′) |
| F5 | C на сцену или версию | на версию (Р-V4); новая версия не снимает C со старой; таймлайн берёт утверждённую; неутверждённая — только `include: "override"` с причиной |
| F6 | final — явное действие | нажатие «Смонтировать и экспортировать» на (ревизия таймлайна, настройки); новый экспорт — новое нажатие |
| F7 | длительность и перемещение с таймлайна | **заменено Р-V6:** длительность, режим и зона — только правкой плана (новая ревизия, перегенерация). С таймлайна — перемещение в пределах якорей (`anchorCheck`), выбор утверждённой версии, включение/исключение |
| F8 | FPS экспорта ≠ `timeline_fps` | разрешены `timeline_fps`, 24, 25, 30, 50, 60; иной — предупреждение; сцены — `exportDurationFrames` и сверка темпа как в `export-version.ts` |
| F9 | доставка master в `OffthreadVideo` | loopback-медиасервер воркера (`127.0.0.1:0`, токен в пути, allowlist), `AssetPolicy.media` реализуется в Task 36 |
| F10 | форматы финала | MP4 H.264/AAC (`yuv420p`, 48 кГц, 192 кбит/с), CRF 16/20/24, разрешение `source`/`2160p`/`1080p`/`720p`; рядом `final-manifest.json`, `verify.json`, `project-snapshot.json` |
| F11 | версия kit | **заменено Р-V8:** от 0.5.8; 35′ — аддитивный 0.5.9 (`LayoutRect`); дальше — трек качества |
| F12 | бюджет пакета | **снято Р-V7:** гейта нет, стоимость справочная (`agent_runs`, Task 48–49a) |
| F13 | целевые числа производительности | первый замер — профиль; регрессия > 25 % — предупреждение (Task 49b) |
| F14 | удаление | корзина `workspace/trash/<project>-<ts>/` + `projects.deleted_at`; очистка — `trash.purge` после второго подтверждения |
| F15 | Phase 5-lite | папка клипов видеопроекта задачей `video.package` (механизм `script.package`/`exportOne`), своя таблица `video_packages` — решение планировщика по Р-V3, Р-V9 |

---

### Task 35′: Основа — контракты видеосцен, миграция 006, approvals по субъекту, реестры и заглушки

**Цель:** одна задача-основа, после которой задачи волн В2–В8 идут параллельно и не трогают общие
файлы: контракты, схема БД, ключи замков, пути, конфиг, реестры обработчиков/маршрутов/вкладок/
словарей с заглушками, kit 0.5.9 (`LayoutRect`), правило split_screen.

**Files:**
- Create: `app/motion-studio/contracts/src/{video-scene.ts,timeline-render.ts,final.ts,api-video-scenes.ts}`
- Modify: `app/motion-studio/contracts/src/{jobs.ts,failure.ts,approvals.ts,scene-props.ts,index.ts}`
- Create: `app/motion-studio/server/src/db/migrations/006_video_production.sql`, `app/motion-studio/server/src/db/repos/video.ts`
- Modify: `app/motion-studio/server/src/db/repos/approvals.ts`, `app/motion-studio/server/src/approvals/{engine.ts,subjects.ts}`
- Modify: `app/motion-studio/server/src/jobs/{locks.ts,handlers.ts}`, `app/motion-studio/server/src/artifacts/paths.ts`, `app/motion-studio/server/src/config.ts`, `app/motion-studio/server/src/api/app.ts`
- Create (заглушки): `app/motion-studio/server/src/pipeline/{video-package,scene-preview-context,timeline-build,timeline-preview,final-render,final-reproduce,trash-purge,cache-gc}.ts`; `app/motion-studio/server/src/api/routes/{video-batch,video-package,timelines,final-exports,project-lifecycle,recovery,diagnostics}.ts`
- Modify: `app/motion-studio/server/src/analysis/plan-checks.ts`, `app/motion-studio/prompts/visual-planner.md` (split_screen при лице в центре)
- Create: `app/motion-studio/render/src/motion-kit/components/LayoutRect.tsx`; Modify: `app/motion-studio/render/src/motion-kit/{index.ts,version.ts,API.md,PROVENANCE.md}` (0.5.9)
- Modify (web-реестры): `app/motion-studio/web/src/{App.tsx,router.ts,i18n/ru.ts}`, `app/motion-studio/web/src/pages/VideoWorkspace.tsx` (вкладки «Сцены», «Экспорт», «Таймлайн»)
- Create (web-заглушки): `app/motion-studio/web/src/pages/video/{ScenesTab,ExportTab,TimelineTab}.tsx`, `app/motion-studio/web/src/pages/{Diagnostics,RecoveryCenter}.tsx`, `app/motion-studio/web/src/i18n/{ru-video-scenes,ru-video-export,ru-timeline,ru-projects,ru-diagnostics,ru-ux}.ts`
- Test: `app/motion-studio/contracts/test/{video-scene,timeline-render,final}.test.ts`, `app/motion-studio/server/test/db/migrate-006.test.ts`, `app/motion-studio/server/test/approvals/subject-scope.test.ts`, `app/motion-studio/server/test/jobs/locks-video.test.ts`, `app/motion-studio/server/test/analysis/plan-checks-split.test.ts`, `app/motion-studio/render/test/kit/layout-rect.test.ts`, `app/motion-studio/web/test/video/tabs-stub.test.tsx`

**Interfaces:**
- Consumes: `ScriptSceneContextSchema` (образец), `ProjectStyleBaseSchema`, `ScenePlanItem`, `VisualPlanRevisionDoc`, `CompositionModeSchema`, `ZoneSchema`, `NormRectSchema`, `ZONE_RECTS`, `buildTimeline`, `EditedTimeline`, `TimelineClip`, `usToFrame`, `frameToUs`, `canonicalHash`, `ProbeResultSchema`, `PlanIssueSchema`, `ScenePropsBaseSchema`, `ApprovalSchema`, `parseSubjectRef`, `subjectRef`, `JobTypeSchema`, `JobErrorCodeSchema`; сервер — `approve`, `approvalState`, `peekApprovalState`, `currentSubject`, `lockKeyFor`, `projectLockKey`, `ProjectResource`, `artifactPaths`, `AppConfig`, миграции 001–005 (образец пересборки — 005), `scriptBatches`/`scriptScenes`/`scriptPackages` (образец репо).
- Produces (`@ms/contracts`):
  - `video-scene.ts`: `PlacementSchema = { mode: PlannedCompositionModeSchema; zone: ZoneSchema; rect: NormRect; transparent: boolean }`; `placementFor(mode, zone, rect?)` — `transparent = mode !== "fullscreen"`, `rect = rect ?? ZONE_RECTS[zone]`; `VideoSceneContextSchema = { project_id; plan_id; plan_revision; item_id; style: ProjectStyleBase; lead_frames; tail_frames; placement: Placement; face?: NormRect; key_moments?: { text; value?; frame }[]; context_frame_rel?: string }.strict()` (по образцу `ScriptSceneContextSchema`); `videoSceneFrames(item): number` = `frames.end − frames.start`; `videoKeyMoments(item, fps)` — `usToFrame(edited_at_us) − frames.start`, в пределах `[0, duration)`; `videoSceneWindow(item, fps)` — `lead` = кадр начала первой цитаты `evidence` − `frames.start`, `tail` = `frames.end` − кадр конца последней (≥ 0); `VideoPackageManifestSchema` (как `ScriptPackageManifestSchema`: `scenes[]` с `item_id`, `scene_id`, `version_id`, `version_number`, `approved: boolean`, `source: { start_us; end_us }`, `edited: { start_us; end_us }`, `frames`, `quote`, `mode`, `zone`, `mp4`, `alpha: … | null`, `warnings`; `missing[]`)
  - `timeline-render.ts`: `SequenceSpec`, `clipsToSequences(tl)`, `timelineFrames(tl)`, `audioSampleRange(c, sr)` — формулы и тест-векторы редакции 2026-10-21 без изменений; `VideoTimelineClipSchema = { clip_id; scene_id; item_id; version_id; version_number; include: "approved" | "override"; override_reason?; start_frame; duration_frames; placement; z; anchors: { word_id; text; frame }[] }`; `VideoTimelineDocSchema = { schema_version: 1; timeline_id; revision; parent_revision?; fps; duration_frames; inputs: { media_sha256; edl; plan; style }; video: SequenceSpec[]; scenes: VideoTimelineClip[]; excluded: { item_id; reason: "not_approved" | "no_version" | "failed" | "stale" | "user" }[]; issues: PlanIssue[]; ops?: TimelineOp[] }`; `TimelineOpSchema = move | use_version | include` (**без** `set_duration`, `set_zone` — Р-V6); `composeTimeline(…)`, `anchorCheck(clip, startFrame)`, `snapToWord(frame, wordFrames, maxDist = 6)`, `timelineChecks(doc)` — `scene_overlap`, `anchor_outside`, `out_of_range`, `duration_mismatch` (версия ≠ плану)
  - `final.ts`: `FinalExportRequestSchema`, `crfFor`, `outputSize`, `FinalManifestSchema`, `FinalVerifyReportSchema` (поля — как в Task 44 редакции 2026-10-21: `probe`, `duration`, `sync`, `frames`, `loudness`, `verdict`, `failures`) — полностью, чтобы 44 шла в В2
  - `api-video-scenes.ts`: `VideoSceneDto`, `VideoScenesStateDto`, `VideoGenerateBody`, `VideoBatchDto`, `ApproveSceneBody`, `SceneApprovalDto`, `PreviewContextBody`, `VideoPackageDto`, `TimelineDto`, `TimelineRevisionBody`, `FinalExportDto`, `ProjectLifecycleDto`, `DeleteIntentDto`, `RecoveryDto`, `DoctorReportDto`, `ErrorViewDto`
  - `scene-props.ts`: `ScenePropsBaseSchema.layout?: { rect: NormRect }` (необязательное)
  - `jobs.ts`: `JobTypeSchema` += `"video.package" | "scene.preview_context" | "timeline.build" | "timeline.preview" | "final.render" | "final.reproduce" | "trash.purge" | "cache.gc"` (без `production.*`, `scene.import`)
  - `failure.ts`: `JobErrorCodeSchema` += `"timeline_stale" | "scene_not_ready" | "version_failed" | "verify_failed" | "stalled" | "project_busy"`
  - `approvals.ts`: `ApprovalStaleReasonSchema` += `"plan_changed" | "version_changed" | "timeline_changed"`; тип субъекта C — `scene`, final — `timeline`; `subjectKey(ref): string` (`"<type>:<id>"`)
- Produces (server):
  - `006_video_production.sql`: (1) пересборка `jobs` (CHECK типа + 8 типов, колонки и индексы — как 005); (2) пересборка `approvals`: колонка `subject_key TEXT NOT NULL` (заполняется из `subject_ref` до `@`), CHECK `stale_reason` + 3 причины, индекс `(project_id, kind, subject_key)`, **с переносом `rowid`** (`INSERT INTO approvals_new (rowid, …) SELECT rowid, …`); (3) `projects` + `archived_at`, `deleted_at` (`ALTER TABLE ADD COLUMN`); (4) `video_batches(id PK, project_id, plan_id, plan_revision, approval_id → approvals, created_at)`; `video_scenes(project_id, plan_id, item_id, scene_id UNIQUE → scenes, batch_id, job_id, item_fingerprint, created_at, PK(plan_id, item_id))`; `video_packages(id PK, project_id, job_id, rel_path, manifest_sha256, created_at)`; `video_timelines(id PK, project_id UNIQUE, current_revision)`; `video_timeline_revisions(timeline_id, revision, parent_revision, rel_path, sha256, hash, created_at, PK)`; `final_exports(id PK, project_id, timeline_id, timeline_revision, approval_id, request_json, inputs_hash, rel_path, sha256, status CHECK ('ready','failed_verification'), job_id, created_at)`; `trash(id PK, project_id, rel_path, bytes, created_at, purged_at)`; `boot_reports(id PK, created_at, crashed, report_json, acknowledged_at)`
  - `db/repos/video.ts`: `videoBatches`, `videoScenes` (`get`, `bySceneId`, `insert`, `setJob`, `setFingerprint`, `listByPlan`), `videoPackages`, `videoTimelines`, `finalExports` — по образцу `db/repos/script.ts`
  - `approvals/engine.ts`: `approve` — для A и B прежнее поведение (отзыв по виду в проекте); для C и final — отзыв только не отозванных с тем же `subject_key`; `approvalState`/`peekApprovalState` принимают `subjectKey?` (C, final); `db/repos/approvals.ts`: `latestActive(db, projectId, kind, subjectKey?)`, `revokeActive(db, projectId, kind, subjectKey?)`
  - `approvals/subjects.ts`: `sceneSubject(db, versionId): { ref: "scene:<sceneId>@r<number>"; hash: manifest_sha256 } | undefined` (версия `failed`/`broken_reason` → `undefined`); `finalSubject(timelineId, revision, request): { ref; hash: canonicalHash(request) }`
  - `jobs/locks.ts`: `ProjectResource` += `"timeline" | "final"`; `lockKeyFor`: `video.package` → `package`; `timeline.build` → `timeline`; `final.render`, `final.reproduce` → `final`; `scene.preview_context`, `timeline.preview` → `undefined`; `trash.purge` → `"store:trash"`; `cache.gc` → `"store:cache"`; `SCENE_WRITING_TYPES` не меняется (видеосцены пишутся `playground.*`)
  - `artifacts/paths.ts`: `timelineRev(id, n)` → `timeline/<id>/r<N>`; `finalExport(id)` → `final/<id>`; `master(mediaId, fps)` → `proxy/<media>/master@<num>-<den>`; `editedAudio(edlId, n)` → `audio/<edl>/r<N>`; `contextPreview(sceneId, versionId)` → `context/<scene>/<version>`; папка клипов — существующий `package(id)`
  - `config.ts`: `video: { contextPadFrames: 30 }`, `final: { timeoutMs: 7_200_000; masterCrf: 12 }`, `watchdog: { noProgressMs: Record<string, number> }` (Task 49a), `cache: { maxBytes: 20 GiB }`, `render: { concurrency?: number }` — с умолчаниями, в схеме файла `partial().strict()`
  - `analysis/plan-checks.ts`: blocking `split_face_center` — `composition_mode = "split_screen"`, а центр рамки лица окна сцены по x в `[0.35, 0.65]` (автор в центре, Р-V5); `prompts/visual-planner.md` — одна строка о том же
  - заглушки обработчиков (`failed: pipeline, "не реализовано: Task <id>"`), маршрутов (плагин без путей), вкладок и страниц (`t("…stub")`), пустые словари, подмешанные в `ru`
- kit 0.5.9: `<LayoutRect rect?>` — абсолютный контейнер по `props.layout.rect` (или всему кадру, если поля нет); `useLayoutRect()`; аддитивно, вид существующих сцен не меняется; строка в `version.ts`, `API.md`, `PROVENANCE.md` (`own`)

- [ ] **Step 1: Тесты (падают):**

```ts
expect(placementFor("overlay", "lower_third")).toEqual({ mode: "overlay", zone: "lower_third", rect: ZONE_RECTS.lower_third, transparent: true });
expect(placementFor("fullscreen", "full").transparent).toBe(false);
expect(placementFor("split_screen", "split_right").transparent).toBe(true);
expect(videoKeyMoments(item({ frames: { start: 300, end: 390 }, key_terms: [{ text: "миллион", word_id: "w_000120", edited_at_us: 11_000_000 }] }), F30)).toEqual([{ text: "миллион", frame: 30 }]);
// timeline-render: тест-векторы редакции 2026-10-21 (clipsToSequences, audioSampleRange, 29.97) без изменений
expect(TimelineOpSchema.safeParse({ op: "set_duration", clip_id: "c1", duration_frames: 120 }).success).toBe(false);
// approvals по субъекту
const c1 = approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s1@r1", subjectHash: H1 });
const c2 = approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s2@r3", subjectHash: H2 });
expect(approvals.get(db, c1.id)!.status).toBe("valid");                 // C другой сцены не отозвал
approve(db, { projectId: "p1", kind: "C", subjectRef: "scene:s1@r2", subjectHash: H3 });
expect(approvals.get(db, c1.id)!.status).toBe("revoked"); expect(approvals.get(db, c2.id)!.status).toBe("valid");
// A/B — прежнее поведение (тесты approvals/* Phase 2–3 зелёные без правок)
expect(migrate(db)).toEqual({ from: 5, to: 6 });                           // rowid approvals и порядок latestActive сохранены
expect(lockKeyFor(job("final.render", { projectId: "p1" }))).toBe("project:p1:final");
expect(lockKeyFor(job("timeline.preview", { projectId: "p1" }))).toBeUndefined();
expect(planChecks(planWith({ composition_mode: "split_screen", faceCenterX: 0.5 })).map(i => i.code)).toContain("split_face_center");
```

- [ ] **Step 2–3:** FAIL → реализовать → PASS (`./scripts/with-node.sh npx vitest run contracts/test server/test/db server/test/approvals server/test/jobs server/test/analysis render/test/kit web/test/video`).
- [ ] **Step 4:** миграция 006 на копии рабочего хранилища (`materialsPath("e2e", "v35-migrate")`, копия `store/db`): `migrate` проходит, `foreign_key_check` пуст, число строк `jobs`/`approvals` равно, `doctor` ok. `./check`, `make e2e-ui` зелёные.
- [ ] **Step 5:** коммиты `feat(motion-studio): контракты и миграция 006 видеосцен`, `feat(motion-studio): реестры и заглушки Phase 4–6`.

**Риски:** пересборка `approvals` без `rowid` ломает `latestActive` (порядок по rowid) — тест на
порядок после миграции; FK `script_batches.approval_id` → пересобранная таблица (FK выключены на
время миграции, `foreign_key_check` после); заглушки должны собираться и проходить lint.

### Task 36: Единый движок — `ProjectTimeline`, медиасервер, master и дорожка звука (ADR 0010)

**Цель:** одна Remotion-композиция для превью в контексте, превью таймлайна и финала. Главный техриск плана.

**Files:**
- Create: `app/motion-studio/render/src/timeline/{ProjectTimeline.tsx,entry.ts,render-range.ts,media-server.ts,worker-timeline.ts}`, `app/motion-studio/render/src/node/overlay-props.ts`
- Modify: `app/motion-studio/render/src/node/export-version.ts` (прозрачные props — через `overlay-props.ts`, поведение то же), `app/motion-studio/render/src/node/asset-guard.ts` (`AssetPolicy.media`), `app/motion-studio/render/src/node/ffprobe.ts`, `app/motion-studio/render/src/node/index.ts`, `app/motion-studio/render/src/node/chrome-wrapper.sh` (origin медиасервера в allowlist, если нужно)
- Modify: `app/motion-studio/contracts/src/export.ts` (`ProbeResultSchema` += `audioSampleRate?`, `audioChannels?` — в конец, `// Task 36:`)
- Create: `app/motion-studio/server/src/media/{master.ts,edited-audio.ts}`; Modify: `app/motion-studio/server/src/edit/preview-filter.ts` (выделить `buildAudioFilter`), `app/motion-studio/server/src/qa/programmatic.ts` (правило `network` пропускает только `allowedOrigins`)
- Create: `docs/decisions/0010-single-remotion-engine-final.md` (`adr`, `предложено`)
- Create: `app/motion-studio/render/test/fixtures/timeline/{overlay-lower-third,fullscreen-card}/{src/Scene.tsx,props.json,settings.json}`
- Test: `app/motion-studio/render/test/timeline/{overlay-props,entry,media-server,asset-guard-media}.test.ts`, `app/motion-studio/server/test/media/{edited-audio,master}.test.ts`, `app/motion-studio/render/test/timeline/timeline.e2e.test.ts`

**Interfaces:**
- Consumes: `writeEntry`, `contentKey`, `renderVersion`, `ffprobe`, `ensureRenderBrowser`, `installAssetGuard`, `AssetPolicy` (`render/src/node`); `spawnTracked`, `ProcessRegistry` (`@ms/core`); `checkSceneSource`; `clipsToSequences`, `audioSampleRange`, `Placement`, `VideoTimelineDoc` (35′); `runFfmpeg`, `probeMedia`, `assertOutsideSource`, `detectVfr`; `buildPreviewFilter`, `clipFrames`; `exportProps`, `exportDurationFrames` (`export-version.ts`)
- Produces (`@ms/render`):
  - `overlayInputProps(props: Record<string, unknown>): Record<string, unknown> | { error: "overlay_unsupported" }` — общий для альфа-экспорта S6 и прозрачных размещений: `ScenePropsBase` → `style.transparent = true`
  - `<ProjectTimeline>` — props `TimelineRenderProps = { width; height; fps; duration_frames; video: { src; sequences: SequenceSpec[] }; audio?: { src }; scenes: { clip_id; key; props; start_frame; duration_frames; transparent: boolean; z }[] }`: `SequenceSpec` → `<Sequence from durationInFrames><OffthreadVideo src startFrom muted/></Sequence>`; звук — одна `<Audio>`; сцены — `<Sequence from durationInFrames>` на весь кадр в порядке `z`, прозрачные — с `overlayInputProps`
  - `writeTimelineEntry({ scenes: { key; versionDir }[]; cacheDir })` — `<cacheDir>/entries/tl-<sha256>/index.tsx`, статические импорты `src/Scene.tsx` версий; `checkSceneSource` каждой версии до бандла
  - `serveMedia(files: Record<string, string>)` — `127.0.0.1:0`, путь `/<token 32 hex>/<key>`, только перечисленные ключи, `Range` → 206, без листинга и редиректов; запускается в `worker-timeline.ts` (та же группа процессов)
  - `installAssetGuard({ …, media: { origin; tokens } })` — пропускает только этот origin и токены (сейчас бросает, `asset-guard.ts:128`)
  - `renderTimelineRange(req: TimelineRenderRequest, signal?)` → `{ ok; stills; outPath?; probe?; browserLogs; allowedOrigins; error? }` (как в редакции 2026-10-21)
- Produces (server): `buildAudioFilter(clips, sampleRate, fadeUs)` (из `buildPreviewFilter`, тот же результат для превью rough cut); `buildEditedAudio({ input; tl; fadeUs; out; run; signal; registry? })` → `{ path; sha256; samples }`; `masterArgs(input, out, probe, fps, crf)`, `ensureMaster(deps, mediaId, fps)` → `{ path; sha256 }` — CFR по pts (VFR iPhone, Phase 2 F2), автоповорот, кэш в `artifactPaths.master`
- ADR 0010: контекст F1–F3, F9; решение — одна композиция Remotion; FFmpeg — только входы и проверка; последствия — время финала, кэш master.

**Пункты:** (1) вынести `overlayInputProps` из `export-version.ts` без изменения поведения альфа-экспорта (тесты `render/test/export-overlay.test.ts` зелёные); (2) `AssetPolicy.media` и медиасервер; (3) `ProjectTimeline` + entry + `renderTimelineRange`; (4) master и дорожка звука, `buildAudioFilter`; (5) ADR 0010.

- [ ] **Step 1: Юнит-тесты (падают):** `buildAudioFilter(tl.clips, 48_000, 8_000)` содержит `atrim=start_sample=168000:end_sample=480000`; `buildPreviewFilter` до/после выноса даёт ту же строку; `serveMedia`: Range → 206, чужой токен → 404, `..%2F` → 404, hostname `127.0.0.1`; `installAssetGuard` с `media` пропускает свой origin и токен, чужой — блок; `masterArgs` содержит `-crf 12 -g 30 -an -fps_mode cfr`; `assertOutsideSource` на `source/…/master.mp4` бросает; `writeTimelineEntry` с версией, где `fetch()`, отвергается (`forbidden-global`); `overlayInputProps` на props без `ScenePropsBase` → `overlay_unsupported`.
- [ ] **Step 2: e2e (`make e2e`, реальный рендер):** фикстура `talk-ru-cfr.mp4` (`scripts/make-media-fixtures.mjs`), вырезка 2,0–3,5 с; сцены `overlay-lower-third` (кадры 150–240, прозрачная, графика в `lower_third`) и `fullscreen-card` (300–360); `renderTimelineRange` целиком 1280×720 CRF 18 → [A] ffprobe `h264`/`aac`/48 кГц, длительность `frameToUs(timelineFrames) ± 1 кадр`; [A] кадр 100 совпадает с кадром 145 исходника лучше соседних (PSNR ≥ 30 дБ); [A] кадр 200: вне `ZONE_RECTS.lower_third` PSNR с исходником ≥ 35 дБ, внутри < 25 дБ; кадр 330 = still `fullscreen-card` (≥ 35 дБ); [A] число сэмплов `edited-audio.wav`; `browserLogs` без чужих origin; [A] повторный `ensureMaster` не запускает ffmpeg; VFR-фикстура `talk-ru-vfr.mov` → master CFR, число кадров = `round(duration·fps)`.
- [ ] **Step 3:** реализовать → PASS. **Step 4:** кадры 100, 200, 330 — `docs/evidence/phase-4/engine/` [H]. **Step 5:** `./check`, `make e2e-ui`, `server/test/script/script-generate.e2e.test.ts` не нужен (конвейер сцен не тронут), но `render/test/export*.test.ts` и `export.e2e.test.ts` зелёные. Коммит `feat(motion-studio): единая композиция таймлайна в Remotion`.

**Риски:** `OffthreadVideo` и `/proxy` Remotion против asset-guard (точка расширения — только
`media`); производительность финала по master 4K; дробные fps 29,97 — тест-векторы 35′.

### Task 37′: Генерация видеосцены — вход `video` у `playground.generate`

**Цель:** сцена видеопроекта генерируется тем же конвейером, что сцена сценария: бриф по плану,
стиль проекта, окно речи и моменты ключевых слов, прозрачное размещение, две новые проверки.

**Files:**
- Create: `app/motion-studio/server/src/video-scenes/{context.ts,brief.ts,fingerprint.ts,checks.ts,compose-frame.ts}`, `app/motion-studio/prompts/partials/video-scene.md`
- Modify: `app/motion-studio/server/src/pipeline/playground-generate.ts` (вход `video`, взаимоисключающий со `script`), `app/motion-studio/prompts/visual-qa.md` (кадр-композит «сцена поверх видео»); `app/motion-studio/server/src/pipeline/fix-loop.ts` — только если кадрам-композитам нужен путь к Visual QA (минимально, строка в отчёте)
- Test: `app/motion-studio/server/test/video-scenes/{context,brief,fingerprint,checks}.test.ts`, `app/motion-studio/server/test/pipeline/video-generate.test.ts` (фейковые агенты), `app/motion-studio/server/test/video-scenes/video-generate.e2e.test.ts` (реальные)

**Interfaces:**
- Consumes: `PlaygroundGenerateInputSchema`, `playgroundGenerate`, `runGeneration`, `extraQa`, `overlayChecks`, `overlayFrames`, `alphaCoverage`, `fragmentFitAttempt`, `foreignLabelQa`, `payoffStart`, `PAYOFF_PEAK` (`script-temporal.ts`), `loadPartial`, `sceneStyle`/`style_lock`, `durationChecks` (`playground-edit.ts`); образцы `script/brief.ts` (`buildSceneBrief`, `sceneSettings`, `sceneTitle`, `clipWords`), `script/fingerprint.ts` (`itemFingerprint`), `recordPublishedFingerprint`; `VideoSceneContextSchema`, `placementFor`, `videoKeyMoments`, `videoSceneWindow`, `videoScenes` repo (35′); `currentPlan` (`analysis/plan-ops.ts`), `currentProjectStyle`, `occupiedAt` (`analysis/planner-input.ts`), `extractKeyframes` (`analysis/keyframes.ts`), `loadPng`, `inkFraction` (`qa/image.ts`), `runFfmpeg`, `verifyQuote`
- Produces:
  - `videoSceneContext(db, root, i: { projectId; doc: VisualPlanRevisionDoc; item }): VideoSceneContext` — стиль текущий, `placement = placementFor(item.composition_mode, item.zone, item.rect)`, окно и моменты (35′), `face` — объединение лица из `occupiedAt(footage, item.source)`, `context_frame_rel` — ключевой кадр прокси в середине окна
  - `videoSceneSettings(project: Settings, display: { width; height }, fps, item, style): Settings` — кадр = размер показа исходника, `duration_frames = videoSceneFrames(item)`, `style_lock`, `transparent_export: false` (сцена генерируется непрозрачной, прозрачность — `overlayInputProps` при композиции и экспорте)
  - `buildVideoSceneBrief(i: { item; index; total; prev?; next?; projectTitle; fps; narration; moments; placement }): string` — по-русски: назначение, метафора, `visual_type`, режим и зона («вся графика внутри `LayoutRect`»), цитата `evidence`, ключевые слова с кадрами; лимит `BRIEF_MAX`
  - `videoItemFingerprint(item, style): string` — `purpose`, `visual_type`, `composition_mode`, `zone`, `rect`, `start_word_id`/`end_word_id`, **длительность** (не `frames.start`), ключевые слова с относительными кадрами, `metaphor`, ревизия стиля; позиция в ролике в отпечаток **не входит**
  - `playgroundGenerate`: вход `video?: VideoSceneContext`, `video_fingerprint?: string`; `video` и `script` вместе → `failed(pipeline)`; при `video` — `loadPartial("video-scene")`, `speechWindow` из `lead/tail`, `scriptHints.keyMoments`, `fragment = { quote: цитаты evidence, purpose, key_terms }`, `props.layout.rect = placement.rect` для прозрачных; `extraQa` = `overlayChecks` (для `transparent`) + `foreignLabelQa` по `narration` + `videoSceneChecks` + `fragmentFitAttempt` + `durationChecks(v, videoSceneFrames(item))`; после публикации — `videoScenes.setFingerprint`
  - `videoSceneChecks(i: { alphaFrames: { frame; path }[]; ctx: VideoSceneContext }): Promise<QAIssue[]>` — `face_ink` (blocking: доля α > 0,1 внутри `face` > 0,01 на любом кадре; при `face_overlap.override_reason` — warning), `outside_zone` (blocking: доля α > 0,1 вне `rect`, расширенного на 0,02, > 0,005); `fullscreen` — проверок нет
  - `composeOverContext(alphaStill, contextFrame, out)` — ffmpeg `overlay`; `qa/ctx-<frame>.png` идут Visual QA вместе с обычными кадрами

**Пункты:** (1) контекст, настройки, бриф, отпечаток; (2) вход `video` в `playgroundGenerate` без
изменения ветки `script` и Playground; (3) проверки `face_ink`/`outside_zone` и кадр-композит;
(4) partial `video-scene.md` (холст на весь кадр, `LayoutRect`, цитата — данные, ключевые слова в
кадрах, стиль проекта).

- [ ] **Step 1: Тесты (падают):** `videoSceneChecks` — альфа в `lower_third` → `[]`; альфа на лице → `face_ink` blocking, с `override_reason` → warning; альфа вне зоны → `outside_zone`; `fullscreen` → `[]`. `videoItemFingerprint`: сдвиг `frames.start/end` на 45 кадров при той же длине → тот же; другая `zone` или `end_word_id` → другой. `videoSceneSettings` → `duration_frames = 90`, `width/height` = показ исходника (поворот учтён). Фейковые агенты: вход `script` — шаги и ключи как до задачи (снимок), вход `video` → `brief` из `buildVideoSceneBrief`, `extraQa` вызван, `video_scenes.item_fingerprint` записан после публикации; `video` + `script` → `failed`.
- [ ] **Step 2: e2e (`MS_E2E=1`, реальные `claude` и рендер, `materialsPath("e2e", "v37")`):** видеопроект-фикстура (`talk-ru-cfr.mp4`, план из двух сцен: `overlay`/`lower_third` с ключевым словом и `fullscreen`, Approval B) → по задаче `playground.generate` с `video` на каждую → [A] версии `ready` (или `failed` с логами и причиной); `duration_frames` = плану; в `qa.json` коды проверок есть; `qa/ctx-*.png` есть; кадры ≤ 480 px — `docs/evidence/phase-4/generate/` [H].
- [ ] **Step 3: защита сценария:** `./check`, `make e2e-ui`, `MS_E2E=1 … server/test/script/script-generate.e2e.test.ts` (3 сцены, реальный `claude`) — [A] все `ready`, ключи и отпечатки как до задачи.
- [ ] **Step 4:** коммит `feat(motion-studio): генерация сцены видеопроекта по плану`.

**Риски:** регресс сценария через общий `playground-generate.ts` (Step 3 обязателен); лицо в
кадре — Vision даёт рамку по окну, не по кадру (берётся объединение за окно сцены); 4K-исходник →
кадр сцены 3840×2160 дорог в рендере — при показе > 1920 по длинной стороне `videoSceneSettings`
берёт 1920×1080 с тем же соотношением (масштаб при композиции), записать в отчёт.

### Task 38-39: Пакет сцен, правки, Approval C, очередь, превью в контексте

**Цель:** пакет видеосцен как у сценария (набор обычных задач), правки — Playground, «Перегенерировать»
— новая генерация, утверждение C на версию, позиция в очереди, превью сцены в контексте исходника.

**Files:**
- Create: `app/motion-studio/server/src/video-scenes/{batch.ts,approval-c.ts,queue.ts,state.ts}`, `app/motion-studio/server/src/jobs/batch-keys.ts`
- Modify: `app/motion-studio/server/src/script/batch.ts` (общие помощники — из `batch-keys.ts`, поведение то же), `app/motion-studio/server/src/pipeline/playground-edit.ts` (`videoContextOf`, плановая длительность видеосцены, `extraQa` видеопроверок на пути правки), `app/motion-studio/server/src/pipeline/scene-preview-context.ts` (тело заглушки)
- Test: `app/motion-studio/server/test/video-scenes/{batch,approval-c,queue,state}.test.ts`, `app/motion-studio/server/test/jobs/batch-keys.test.ts`, `app/motion-studio/server/test/pipeline/{video-edit,scene-preview-context}.test.ts`, `app/motion-studio/server/test/video-scenes/video-batch.e2e.test.ts`

**Interfaces:**
- Consumes: `startScriptBatch`/`stageBatch`/`batchStatus`/`cancelBatch`/`members` (образец), `keyPrefix`, `requestTag`, `sceneJobKey` (`script/batch.ts`); `enqueue`, `cancelJob`, `claimNext`; `approveVisualPlan` (B утверждает человек во вкладке «План»), `peekApprovalState`, `currentSubject`; `scriptContextOf`, `scriptPlannedFrames`, `durationChecks`, `PlaygroundEditInputSchema` (`playground-edit.ts`); `videoSceneContext`, `videoSceneSettings`, `buildVideoSceneBrief`, `videoItemFingerprint`, `videoSceneChecks` (37′); `approve`, `sceneSubject`, `videoScenes`/`videoBatches` (35′); `renderTimelineRange`, `buildEditedAudio`, `serveMedia` (36); `composeTimeline` (35′); `timelineFor` (`edit/timeline-store.ts`); `sceneStatus`, `publicJob`
- Produces:
  - `jobs/batch-keys.ts`: `keyPrefix(projectId, key, prefix)`, `requestTag(body)`, `nextTryKey(db, keyOf, prior, opts)` — общие для `script/batch.ts` и `video-scenes/batch.ts`; ключи и id пакетов сценария не меняются (тест-снимок)
  - `videoSceneJobKey({ planId; revision; itemId; styleRevision; tryN?; regenK? })` → `video:<plan>@r<rev>:<item>:s<style>[:try-n][:regen-k]`
  - `startVideoBatch(core, i: { projectId; revision; itemIds?; regenerate?; idempotencyKey }): VideoBatchDto` — проект `kind = "video"`; ревизия плана текущая (иначе 409 `plan_outdated`); **валидное B на текущую ревизию** (иначе 409 `approval_required`; B здесь не ставится); принятые сцены; без готовой версии по текущему отпечатку (`regenerate` — все выбранные); идущая задача на тот же отпечаток входит как есть; одна транзакция: `video_batches` → сцены → задачи `playground.generate` с `video` → `videoScenes.setJob` → события `video_batch` в `job_events`; брифы до транзакции с откатом (как `stageBatch`); **бюджета нет** (Р-V7)
  - `videoBatchStatus(db, root, batchId)`, `cancelVideoBatch(core, batchId)`, `videoBatchesForState(db, root, projectId)`
  - `videoScenesState(db, root, projectId): VideoScenesStateDto` — по сцене плана: сцена, задача, `current`/`approved` версии с номерами, C-состояние, `stale` (отпечаток ≠ текущему), `queue`, QA-замечания
  - `videoContextOf(db, sceneId)` (по образцу `scriptContextOf`); `videoPlannedFrames(db, root, ctx)` (по образцу `scriptPlannedFrames`) → `durationChecks` в `playgroundEdit` для видеосцен
  - `approveScene(db, i: { sceneId; versionId }): Approval` — версия `failed` или `broken_reason` → `version_failed`; `approve({ kind: "C", subjectRef/hash = sceneSubject })` + `scenes.approved_version_id` в той же транзакции; `unapproveScene(db, sceneId)`; `sceneApprovalState(db, sceneId): { state: "missing" | "valid" | "stale"; versionId?; versionNumber?; approval? }`
  - `queuePosition(db, jobId): { ahead: number; blockingJobId?: string }` — для «в очереди за …»
  - `scenePreviewContext: JobHandler` — вход `{ sceneId; versionId? }`: окно `[start − contextPadFrames, end + contextPadFrames]`, `composeTimeline` из одной сцены, исходник — прокси, звук — `buildEditedAudio(proxy)`, `renderTimelineRange` масштаб 0,5 → `artifactPaths.contextPreview(scene, version)/preview.mp4` (иммутабельно, кэш по версии и ревизии EDL)

**Пункты:** (1) вынести общие помощники пакета в `batch-keys.ts` (сценарий не меняется);
(2) пакет видеосцен; (3) правки: чат и параметры — существующий `playground.edit` (видеоконтекст,
длительность по плану); «Перегенерировать» — `startVideoBatch({ itemIds: [id], regenerate: true })`
(`:regen-k`); «Повторить» упавшую — `:try-n`; (4) Approval C; (5) очередь; (6) превью в контексте.
Импорт сцены из Playground в видеопроект — вне плана (Phase 6, необязательно).

- [ ] **Step 1: Тесты (падают), раннер с фейковыми обработчиками:** пакет 4 сцены, одна падает → `{ total: 4, ready: 3, failed: 1 }`; тот же `Idempotency-Key` → тот же пакет; ключ другого тела → 422; второй пакет без `regenerate` → только упавшая (`:try-1`); B устарело → 409 `approval_required`; сдвиг сцены правкой EDL (тот же отпечаток) → сцена не `stale`; смена зоны в плане → `stale`; отмена пакета: running/pending → cancelled, версии на месте; рестарт посреди пакета → `recoverOnStart`, дублей версий нет; ключи `script/batch.ts` — снимок до/после выноса совпадает; C: две сцены, новая C сцены 1 не отзывает C сцены 2; `failed`-версия → `version_failed`; две правки одной сцены → вторая `queue.ahead = 1`, интервалы не пересекаются; правка видеосцены с другой длительностью → blocking `duration_changed`.
- [ ] **Step 2: e2e (`MS_E2E=1`, реальные, `materialsPath("e2e", "v38")`):** проект-фикстура 37′ → `startVideoBatch` (2 сцены) → обе до конечного статуса; правка чатом сцены 1 («крупнее подпись») → v2 `parent = v1`, длительность та же; C на v2; `scene.preview_context` → MP4 длительностью `(90 + 60) / 30 с ± 1 кадр`, кадры ≤ 480 px — `docs/evidence/phase-4/context/` [H].
- [ ] **Step 3: защита сценария:** `./check`, `make e2e-ui`, `script-generate.e2e.test.ts` (реальный). **Step 4:** коммиты `refactor(motion-studio): общие ключи пакетов сцен`, `feat(motion-studio): пакет видеосцен, Approval C и превью в контексте`.

**Риски:** вынос помощников меняет id пакетов сценария (снимок-тест); `playground-edit.ts` —
общий файл сценария (Step 3); превью в контексте зависит от прокси с тем же индексом кадра, что master.

### Task 42: Таймлайн проекта — сборка, перемещения по якорям, свежесть (`timeline.build`)

**Цель:** ревизия таймлайна из EDL, текущего плана и утверждённых версий; перемещение сцены только
в пределах якорей; длительность и зона — только планом (Р-V6).

**Files:**
- Create: `app/motion-studio/server/src/timeline/{build.ts,ops.ts,freshness.ts,carry-over.ts}`
- Modify: `app/motion-studio/server/src/pipeline/{timeline-build.ts,timeline-preview.ts}` (тела заглушек), `app/motion-studio/server/src/analysis/plan-recheck.ts` (Phase 3 F7: `remapped` — только если время сцены изменилось; новая отметка `unchanged` не пишется в `changed`)
- Test: `app/motion-studio/server/test/timeline/{build,ops,freshness,carry-over}.test.ts`, `app/motion-studio/server/test/analysis/plan-recheck-f7.test.ts`, `app/motion-studio/server/test/pipeline/timeline-preview.e2e.test.ts`

**Interfaces:**
- Consumes: `composeTimeline`, `timelineChecks`, `anchorCheck`, `snapToWord`, `clipsToSequences`, `videoTimelines`, `ProjectResource "timeline"` (35′); `sceneApprovalState`, `videoScenesState` (38-39); `videoItemFingerprint` (37′); `timelineFor`, `roughCutApprovalValid`, `currentSubject`, `peekApprovalState`, `mapWords`, `usToFrame`, `ArtifactStore.publish`, `resourceBusy`; `renderTimelineRange`, `buildEditedAudio` (36); `recheckPlan`
- Produces:
  - `buildTimelineDoc(db, root, projectId): VideoTimelineDoc` — A и B валидны (иначе `approval_required`); клип на каждую принятую сцену с валидной C (позиция — `item.frames.start` текущей ревизии плана); без C — `excluded: not_approved`; сцена `stale` — `excluded: stale`; длительность версии ≠ плану → `duration_mismatch` (blocking); `anchors` — ключевые слова плана в кадрах таймлайна
  - `timelineBuild: JobHandler` — `{ projectId }`, без LLM; при прежней ревизии — `carryOver`; публикация `timeline/<id>/r<N>/timeline.json` с fencing
  - `carryOver(prev, next)` — только для клипов, сдвинутых пользователем (`ops.move`): смещение относительно первого якоря сохраняется; нельзя (`anchor_outside`) — позиция плана и issue `move_dropped`
  - `applyTimelineOps(doc, ops): VideoTimelineDoc` — `move` → `snapToWord` и `anchorCheck` (без `override_reason` — blocking issue); `use_version` — только версия с валидной C или `include: "override"` с причиной; `include`; затем `timelineChecks`
  - `saveTimelineRevision(deps, timelineId, body: { base_revision; ops })` → 409 `revision_conflict` / `resource_busy`
  - `timelineFreshness(db, root, projectId): { fresh; reasons: ("edl_changed" | "plan_changed" | "style_changed" | "version_changed" | "approval_stale")[] }` — лениво по `inputs` ревизии против текущих; хуки в `edl-ops.ts`/`plan-ops.ts` **не добавляются**
  - `timelinePreview: JobHandler` — `{ timelineId; revision }`: прокси + `buildEditedAudio(proxy)` + `renderTimelineRange` целиком, масштаб 0,5, CRF 23 → `timeline/<id>/r<N>/preview.mp4`

- [ ] **Step 1: Тесты (падают):** сборка: две сцены с C → клипы на кадрах плана; без C → `excluded`; `move` −19 при якоре на 340 → без blocking; −80 → `anchor_outside`; `TimelineOpSchema` не принимает `set_duration`; перенос после вырезки 45 кадров до сцены: сдвинутый пользователем клип сохраняет смещение от якоря; `timelineFreshness` после новой ревизии EDL → `edl_changed`, после новой C → `version_changed`; `plan.recheck` после вырезки: сцены до вырезки не в `changed` (F7).
- [ ] **Step 2: e2e (реальный рендер):** `timeline.preview` на проекте-фикстуре 38-39 → [A] длительность `duration_frames / fps ± 1 кадр`; кадр середины сцены — в `docs/evidence/phase-5/timeline/` [H].
- [ ] **Step 3:** `./check`, `make e2e-ui` (UI Phase 3 после правки recheck). Коммит `feat(motion-studio): таймлайн проекта и операции над сценами`.

**Риски:** F7 меняет счётчик баннера Phase 3 (тест UI); ревизия таймлайна при EDL, изменённой между
сборкой и публикацией (проверка `inputs` в транзакции публикации).

### Task 40: UI Phase 4 — вкладка «Сцены», пакет, C, превью в контексте

**Цель:** человек генерирует, смотрит, дорабатывает и утверждает сцены видеопроекта без отдельного
инспектора: вкладка «Сцены» в VideoWorkspace, доработка — Playground со ссылкой «← К видео».

**Files:**
- Modify: `app/motion-studio/server/src/api/routes/video-batch.ts` (тело заглушки), `app/motion-studio/web/src/pages/video/ScenesTab.tsx` (тело заглушки), `app/motion-studio/web/src/pages/Playground.tsx` (ссылка «← К видео» и кнопка C для сцены видеопроекта), `app/motion-studio/web/src/i18n/ru-video-scenes.ts`
- Create: `app/motion-studio/web/src/api/video-scenes-client.ts`, `app/motion-studio/web/src/components/video-scenes/{VideoSceneTile,ApprovalCButton,QueueBadge,ContextPlayer}.tsx`
- Modify (аддитивно, только необязательные props): `app/motion-studio/web/src/components/script/{SceneTile,BatchBar}.tsx`
- Test: `app/motion-studio/server/test/api/video-batch.test.ts`, `app/motion-studio/web/test/video/{scenes-tab,approval-c,queue-badge}.test.tsx`, `app/motion-studio/web/e2e/video-scenes.spec.ts`

**Interfaces:**
- Consumes: `startVideoBatch`, `videoBatchStatus`, `cancelVideoBatch`, `videoScenesState`, `approveScene`, `unapproveScene`, `sceneApprovalState`, `queuePosition` (38-39); `script-batch.ts` (образец маршрутов, 202/409/422, `Idempotency-Key`); `SceneTile`, `BatchBar` (`web/src/components/script/`), `Player`, `JobStatus`, `QAPanel`, `EvidenceQuote`, `PlanTrack`, `ProxyPlayer`; SSE-инвалидация (`web/src/api/sse.ts`)
- Produces (`/api`): `GET /api/projects/:id/video/scenes` → `VideoScenesStateDto`; `POST /api/projects/:id/video/generate { revision; item_ids?; regenerate? }` → 202 `VideoBatchDto` | 409 (`approval_required`, `plan_outdated`) | 422; `GET /api/video-batches/:id`; `POST /api/video-batches/:id/cancel`; `POST /api/scenes/:id/approve { versionId }` → 201 | 409 `version_failed`; `POST /api/scenes/:id/unapprove`; `POST /api/scenes/:id/preview-context { versionId? }` → 202; `GET /api/scenes/:id/preview-context.mp4?versionId=` (Range)
- Produces (UI): плитка на каждую принятую сцену плана — миниатюра, режим/зона, статус задачи и очередь («в очереди за правкой v3»), QA-значки, бейдж C («утверждена v2, текущая v3»), `stale` — «сцена устарела»; «Сгенерировать все», прогресс, «Остановить» (`BatchBar`); «Доработать» → Playground; «Повторить» (`:try-n`), «Перегенерировать» (`:regen-k`); «Утвердить (C)» с подтверждением при blocking QA; плеер «Сцена / В контексте» (`ContextPlayer`, кнопка «Собрать»). В Playground у сцены видеопроекта — «← К видео» и «Утвердить (C)».

- [ ] **Step 1: Тесты (падают):** API — генерация без B → 409 `approval_required`; тот же ключ → тот же пакет; approve `failed`-версии → 409; preview-context отдаёт 206 по Range. Web — плитки по статусам × C (`missing/valid/stale`) показывают нужные подписи словаря; «Перегенерировать» шлёт `regenerate: true`; `QueueBadge` с `ahead = 1`.
- [ ] **Step 2: e2e-ui (без LLM, `claudeBin`-заглушка как в Phase 1 e2e-ui, реальный рендер фикстур через `seedScene`):** видеопроект-фикстура → вкладка «Сцены» → плитки → C → превью в контексте → переход в Playground и обратно; скриншоты `docs/evidence/phase-4/ui/` [H]. `make e2e-ui` зелёный.
- [ ] **Step 3:** `./check`; коммит `feat(motion-studio): вкладка сцен видеопроекта`.

**Риски:** общие `SceneTile`/`BatchBar` сценария — только аддитивные props (тесты `web/test/script/*` зелёные).

### Task 5L: Phase 5-lite — папка клипов видеопроекта с шпаргалкой таймкодов

**Цель:** до полной Phase 5 человек получает готовые клипы для своего монтажа: MP4 + ProRes 4444 с
альфой на каждую сцену и шпаргалку «таймкод исходника / таймкод смонтированного ролика / фраза /
режим». Механизм — `script.package`/`exportOne`, задача `video.package`.

**Files:**
- Modify: `app/motion-studio/server/src/pipeline/video-package.ts` (тело заглушки), `app/motion-studio/server/src/api/routes/video-package.ts` (тело заглушки), `app/motion-studio/web/src/pages/video/ExportTab.tsx` (тело заглушки), `app/motion-studio/web/src/i18n/ru-video-export.ts`
- Create: `app/motion-studio/server/src/video-scenes/cheatsheet.ts`
- Test: `app/motion-studio/server/test/video-scenes/{cheatsheet,video-package}.test.ts`, `app/motion-studio/server/test/video-scenes/video-package.e2e.test.ts`, `app/motion-studio/web/test/video/export-tab.test.tsx`

**Interfaces:**
- Consumes: `exportOne`, `ExportOneInput` (`pipeline/scene-export.ts`); `PACKAGE_MP4`, `PACKAGE_ALPHA`, `MANIFEST_FILE`, `exportFailedReason`, `durationNote`, `packageDto` (образец), `scriptPackage` (образец задачи, `pipeline/script-package.ts`); `fileSlug`, `sceneNumber`, `fileNames`, `displayName`, `packageIdFor` (`script/package-names.ts`); `cheatsheet`, `cheatNotes`, `mss`, `CHEAT_FILES` (`script/cheatsheet.ts`); `overlayOk`, `OVERLAY_IMPOSSIBLE`; `VideoPackageManifestSchema`, `videoPackages` (35′); `videoScenesState`, `sceneApprovalState` (38-39); `artifactPaths.package`
- Produces:
  - `videoPackage: JobHandler` — вход `{ projectId; only_approved?: boolean }`: сцены плана по порядку; версия — утверждённая (C), иначе текущая `ready` с пометкой «не утверждена (C)» (при `only_approved` — в `missing`); `stale` — в `missing` «сцена устарела»; `NN_slug.mp4` и, кроме `fullscreen`, `NN_slug_alpha.mov` (ProRes 4444, `overlay`); `package-manifest.json` + шпаргалка; пусто — `failed(package_empty)`; замок `project:<p>:package`
  - `videoCheatRows(manifest)`, `videoCheatsheet(rows, format: "md" | "csv" | "txt")` — колонки: №, файл, исходник (начало–конец, `mss` от `source`), ролик (`edited`), фраза (цитата evidence), режим/зона, C, замечания (`cheatNotes`)
  - `/api`: `POST /api/projects/:id/video/package { only_approved? }` → 202; `GET /api/video-packages/:id`; `GET /api/video-packages/:id/cheatsheet?format=`; `POST /api/video-packages/:id/reveal` (как у сценария)
  - UI: вкладка «Экспорт» — «Собрать папку клипов», карточка пакета (файлы, «не вошли»), шпаргалка, «Показать в Finder»

- [ ] **Step 1: Тесты (падают):** строки шпаргалки: таймкоды исходника и ролика из `source`/`edited` сцены плана; `fullscreen` без альфы с причиной; неутверждённая сцена — пометка; `only_approved` → в `missing`; пустой пакет → `package_empty`; повтор ключа → тот же пакет.
- [ ] **Step 2: e2e (реальный рендер, `materialsPath("e2e", "v5l")`):** проект 38-39 → папка → [A] на каждую сцену MP4 (h264, размер показа, fps проекта, aac) и альфа (prores 4444, yuva, альфа угла 0); шпаргалка md/csv/txt — строк = сцен; таймкоды сверены с планом; копия примера для человека — `materialsPath("examples", "video-5l")` + `README.txt` [H].
- [ ] **Step 3:** `./check`, `make e2e-ui`; коммит `feat(motion-studio): папка клипов видеопроекта с шпаргалкой`.

**Риски:** альфа видеосцены невозможна (`overlay_opaque`) — сцена в `missing` с причиной, как у сценария.

### Task 41: Приёмка Phase 4 на реальном проекте

**Цель:** сцены видеопроекта на реальном ролике человека, через UI, реальные `claude` и рендер.

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance-video-scenes/{global-setup.ts,helpers.ts,phase4-batch.spec.ts,phase4-edit.spec.ts,phase4-isolation.spec.ts,phase4-restart.spec.ts,phase4-package.spec.ts}`, `app/motion-studio/web/playwright.acceptance-video-scenes.config.ts`, `app/motion-studio/scripts/collect-video-scenes-evidence.mjs`
- Create: `docs/evidence/phase-4/{batch,edit,isolation,conflicts,package,restart}/…`, `docs/evidence/phase-4/REPORT.md`
- Test-only Makefile-цель: `acceptance-video-scenes` — строка в отчёте (Makefile — не реестр, правит 41)

**Interfaces:** всё из 35′–40, 5L; проект приёмки Phase 2–3 в `materialsPath("acceptance", "store")`
(утверждённые A и B); `collect-video-evidence.mjs`, `alphaAtCorner`; каркас `web/e2e/acceptance-script/`.

- [ ] **Step 1: Подготовка.** В плане проекта приёмки ≥ 3 принятых сцен, среди них `overlay` и `fullscreen`; если есть split_screen с автором в центре — `split_face_center` не даёт утвердить B → через UI сменить режим (часть сценария человека).
- [ ] **Step 2: Пакет:** «Сгенерировать все» → [A] каждая сцена `ready` или `failed` с логами; `ready` прошли `face_ink`/`outside_zone`/`durationChecks`; стоимость — справочно (`agent_runs`); [H] каждая сцена в контексте: графика в своей зоне, лицо не закрыто, ключевое слово — к моменту слова.
- [ ] **Step 3: Изоляция:** повторный пакет `regenerate` → `SIGKILL` группы процессов сцены 2 посреди рендера → [A] сцены 1 и 3 `ready`, их версии и C не изменены (sha256 каталогов); сцена 2 — новая попытка или `failed`; очередь не встала.
- [ ] **Step 4: Правки:** сцена 1 — чат в Playground; сцена 3 — правка параметров; сцена 2 — «Перегенерировать»; сравнение и восстановление v1 → [A] история цела; две правки сцены 1 подряд → интервалы не пересекаются, вторая от результата первой; изменить границы сцены в плане → новая ревизия, B, сцена `stale` → перегенерация с новой длиной (Р-V6).
- [ ] **Step 5: C и папка клипов:** утвердить все → «Собрать папку клипов» → [A] файлы и шпаргалка как в 5L; копия для человека — `materialsPath("examples", "phase4")` [H: клипы ставятся в монтажку].
- [ ] **Step 6: Перезапуск:** `SIGKILL` сервера посреди пакета → старт → [A] задачи восстановлены, дублей версий нет, C на месте.
- [ ] **Step 7:** evidence, `REPORT.md` ([A]/[H], время, стоимость справочно, ограничения); `./check`; коммит `test(motion-studio): приёмка Phase 4 и evidence`.

### Task 43: Финальный рендер (`final.render`) — гейт, master, звук, композиция, публикация

**Цель:** «Смонтировать и экспортировать» на ревизию таймлайна и настройки → проверенный MP4.

**Files:**
- Create: `app/motion-studio/server/src/final/{gate.ts,request.ts,render.ts,manifest.ts,snapshot.ts}`
- Modify: `app/motion-studio/server/src/pipeline/{final-render.ts,final-reproduce.ts}` (тела заглушек), `app/motion-studio/server/src/media/space.ts` (`estimateFinalBytes`)
- Test: `app/motion-studio/server/test/final/{gate,request,manifest,space}.test.ts`, `app/motion-studio/server/test/pipeline/final-render.test.ts`, `app/motion-studio/server/test/final/final.e2e.test.ts`

**Interfaces:**
- Consumes: `renderTimelineRange`, `writeTimelineEntry`, `ensureMaster`, `buildEditedAudio`, `overlayInputProps` (36); `VideoTimelineDoc`, `FinalExportRequest`, `crfFor`, `outputSize`, `FinalManifestSchema`, `finalExports`, `finalSubject` (35′); `timelineFreshness` (42); `sceneApprovalState` (38-39); `verifyFinal`, `compareExports` (44); `approve`, `peekApprovalState`, `canonicalHash`, `ArtifactStore.publish`, `createJobDraft`; `exportDurationFrames`, `tempoCheck` (как `export-version.ts`); `estimateImportBytes`, `checkImportSpace` (`media/space.ts`), `macosProbe.freeBytes`
- Produces:
  - `requestFinal(db, i: { timelineId; revision; request }): { approval; job }` — одна транзакция: `assembleGate` → `approve({ kind: "final", …finalSubject })` → `enqueue("final.render")`
  - `assembleGate(db, root, projectId, ref)` → `{ ok: true } | { ok: false; errors: { code: "approval_required" | "timeline_stale" | "blocking_issues"; detail }[] }` — A, B валидны; `timelineFreshness.fresh`; нет blocking; C каждой включённой сцены валидна на её версии, `override` — с причиной; повтор в обработчике перед публикацией
  - `estimateFinalBytes({ frames; width; height; quality })` в `media/space.ts`; нехватка → `failed(low_space)` до рендера
  - `finalProps(doc, request, paths, display): TimelineRenderRequest` — `outputSize`, fps запроса (≠ `timeline_fps` → длительности сцен через `exportDurationFrames` и сверка темпа, `from`/`durationInFrames` — через `usToFrame` от µs клипов), `crfFor`, `audioBitrateKbps: 192`
  - `finalRender: JobHandler` — гейт → место → `ensureMaster` → `buildEditedAudio(original)` → `renderTimelineRange` в draft → `verifyFinal` → гейт повторно → публикация `final/<id>/{final.mp4,final-manifest.json,verify.json,project-snapshot.json}` с fencing, `a-w`; `verdict = fail` → `final_exports.status = "failed_verification"`
  - `buildFinalManifest(i)` — `inputs_hash = canonicalHash(inputs + request + render_env)`; `projectSnapshot(db, root, projectId, ref)`; `finalReproduce: JobHandler` — `{ exportId }` → те же входы по манифесту (расхождение → `failed(verify_failed, "inputs_changed")`) → новый экспорт → `compareExports`

- [ ] **Step 1: Тесты (падают):** гейт ok; новая C другой версии сцены → `timeline_stale`; A устарело → `approval_required`; `requestFinal` → `subject_ref` `timeline:tml_1@r2`, хеш = `canonicalHash(request)`; другой `request` той же ревизии → новое final, прежнее `revoked`; `inputs_hash` не зависит от порядка ключей; `estimateFinalBytes` по формуле; verify fail → `failed_verification`, success-события нет; гейт протух за время рендера → `failed(timeline_stale)`, в `final/` ничего.
- [ ] **Step 2: e2e (`make e2e`, реальный рендер):** проект-фикстура 42 → ревизия r1 → `requestFinal` 1280×720 `standard` → [A] `final.mp4`, манифест по схеме, `verify.verdict = pass`, master построен один раз (второй экспорт — из кэша), оригинал не изменён (sha256).
- [ ] **Step 3:** `./check`; коммит `feat(motion-studio): финальный рендер видеопроекта`.

**Риски:** длинный финал (2 ч таймаут, прогресс по этапам); FPS ≠ `timeline_fps` (дубли/пропуски
кадров исходника — предупреждение в UI, допуски проверки — 1 кадр выходного fps).

### Task 44: Проверка финала (`verifyFinal`) и воспроизводимость

**Цель:** автоматическая проверка MP4 финала: параметры, длительность, сдвиг кадра, синхронность
звука, громкость; сравнение двух экспортов. Идёт сразу после 35′ на синтетических фикстурах.

**Files:**
- Create: `app/motion-studio/server/src/final/{verify.ts,frames.ts,sync.ts,loudness.ts,compare.ts}`, `app/motion-studio/server/test/fixtures/final/README.md`
- Modify: `app/motion-studio/scripts/make-media-fixtures.mjs` — `counter-30.mp4` (`testsrc2` со счётчиком кадров), `delayed-audio.mp4` (`adelay=66`), `louder.mp4` (`volume=3dB`), `final-like.mp4` (вырезка + прямоугольник «сцены» на кадрах 150–240)
- Test: `app/motion-studio/server/test/final/{verify,frames,sync,loudness,compare}.test.ts`

**Interfaces:**
- Consumes: `ffprobe`, `ProbeResult`; `audioOffsetUs`, `syncCheck`, `wavPcm`, `judgeSync` (`edit/sync-probe.ts`); `loadPng`, `frameDelta` (`qa/image.ts`); `sourceToEdited`, `editedToSource`, `mapWords`, `usToFrame`, `frameToUs`; `clipsToSequences`, `outputSize`, `FinalVerifyReportSchema`, `VideoTimelineDoc` (35′); `runFfmpeg`
- Produces: `finalProbeGate`, `extractFrame`, `psnr`, `alignmentOffset`, `sampleVerifyFrames`, `syncAnchors`, `loudnessDelta`, `verifyFinal`, `compareExports` — сигнатуры и пороги редакции 2026-10-21 (Task 44) без изменений; `verifyFinal` получает still-кадры сцен колбэком `stillsFor(frames)` (в 43 — `renderTimelineRange`, в тестах — PNG-фикстуры)

- [ ] **Step 1: Тесты (падают):** `finalProbeGate` — +1 кадр ok, +2 — `duration`; `pix_fmt`; `alignmentOffset` на `counter-30` → 0 и 1, неподвижный кадр → `inconclusive`; `delayed-audio` → смещение ≈ 66 000 µs → `sync` в `failures`; `louder` → `delta_lu ≈ 3`; `verifyFinal(final-like)` → `pass`; `compareExports` двух копий → `reproduced`.
- [ ] **Step 2–3:** FAIL → реализовать → PASS (ffmpeg-часть — `make e2e`). **Step 4:** `./check`; коммит `feat(motion-studio): автоматическая проверка финального видео`.

### Task 45: API и UI Phase 5 — вкладка «Таймлайн» и экспорт финала

**Цель:** таймлайн во вкладке VideoWorkspace: дорожки, перемещение по якорям, превью ревизии,
финальный экспорт с отчётом проверки и повтором из сохранённого проекта.

**Files:**
- Modify: `app/motion-studio/server/src/api/routes/{timelines,final-exports}.ts` (тела заглушек), `app/motion-studio/web/src/pages/video/TimelineTab.tsx` (тело заглушки), `app/motion-studio/web/src/i18n/ru-timeline.ts`, `app/motion-studio/web/src/pages/Dashboard.tsx` (последние экспорты)
- Create: `app/motion-studio/web/src/api/timeline-client.ts`, `app/motion-studio/web/src/components/timeline/{TimelineView,TrackGraphics,AnchorTicks,Playhead,ClipInspector,FinalExportDialog,VerifyReport,ExportHistory,FreshnessBanner}.tsx`, `app/motion-studio/web/src/timeline/{geometry.ts,drag.ts}`
- Test: `app/motion-studio/server/test/api/{timelines,final-exports}.test.ts`, `app/motion-studio/web/test/video/{timeline-geometry,drag,final-export-dialog,verify-report}.test.tsx`, `app/motion-studio/web/e2e/video-timeline.spec.ts`

**Interfaces:**
- Consumes: `buildTimelineDoc`, `saveTimelineRevision`, `timelineFreshness` (42); `requestFinal`, `assembleGate` (43); `compareExports`, `FinalVerifyReport` (44); `snapToWord`, `anchorCheck`, `outputSize` (35′); `Waveform`, `ThumbStrip`, `EditedTimelineBar`, `PlanTrack`, `ProxyPlayer` (`web/src/components/video/`), `Player`, `t`
- Produces (`/api`): `GET /api/projects/:id/timeline`; `POST /api/projects/:id/timeline/build` → 202; `POST /api/timelines/:id/revisions { base_revision; ops }` → 201 | 409; `GET /api/timelines/:id/revisions`; `POST …/revisions/:n/preview` → 202; `GET …/revisions/:n/preview.mp4` (Range); `POST …/revisions/:n/final { request }` → 202 | 409 (`approval_required`, `timeline_stale`, `blocking_issues`, `low_space`); `GET /api/projects/:id/final-exports`; `GET /api/final-exports/:id`; `GET /api/final-exports/:id/file` (Range, `Content-Disposition`); `POST /api/final-exports/:id/reproduce` → 202
- Produces (UI): дорожки «Видео», «Звук», «Графика» (бейдж C, исключённые — серым с причиной), «Якоря»; перетаскивание сцены с прилипанием к словам (Alt — без) и мгновенной `anchorCheck`; **ручки длительности нет** — в `ClipInspector` «Изменить границы — в плане» (переход во вкладку «План» на сцену, Р-V6); переключение версии с валидной C; включение без C с причиной; ревизии и «вернуть прежнюю»; `FreshnessBanner`; `FinalExportDialog` (FPS с предупреждением, разрешение, качество, оценка места, сводка входов, «Смонтировать и экспортировать»); `VerifyReport`; `ExportHistory` с «Повторить экспорт»

- [ ] **Step 1: Тесты (падают):** API — final без C включённой сцены → 409 с перечнем; устаревший таймлайн → 409 `timeline_stale`; старая база → 409 `revision_conflict`; файл — 206 по Range. Web — `xToFrame(frameToX(437))` обратимо для трёх масштабов; `dragMove` за якорь → `anchor.ok === false`; fps 25 на проекте 30 → предупреждение; `failed_verification` без «Готово».
- [ ] **Step 2:** Playwright `video-timeline.spec.ts` без LLM (сцены через `seedScene`): собрать, сдвинуть с прилипанием, превью, экспорт 720p `draft` (реальный рендер), отчёт проверки; скриншоты `docs/evidence/phase-5/ui/` [H].
- [ ] **Step 3:** `./check`, `make e2e-ui`; коммит `feat(motion-studio): вкладка таймлайна и экспорт финала`.

### Task 46: Приёмка Phase 5 и Test 4 (talking head) на реальном ролике

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance-final/{global-setup.ts,helpers.ts,phase5-assemble.spec.ts,phase5-export-variants.spec.ts,phase5-reproduce.spec.ts,phase5-resilience.spec.ts,test4-talking-head.spec.ts}`, `app/motion-studio/web/playwright.acceptance-final.config.ts`, `app/motion-studio/scripts/{final-timing-audit.mjs,collect-final-evidence.mjs}`
- Create: `docs/evidence/phase-5/{assemble,export-1080p,export-720p25,reproduce,resilience,test4}/…`, `docs/evidence/phase-5/REPORT.md`

**Interfaces:** всё из 35′–45; проект приёмки после 41 (`materialsPath("acceptance", "store")`);
`timing-audit.mjs`, `audioOffsetUs`, `alignmentOffset`.

- [ ] **Step 1: Сборка:** «Собрать таймлайн» → сдвиг сцены ±10 кадров с прилипанием → изменение границ другой сцены **через план** (ревизия, B, перегенерация, C) → пересборка → превью → [H] сцены в нужные моменты, лицо не закрыто.
- [ ] **Step 2: Экспорт 1080p / `timeline_fps` / `standard`:** [A] `verify.verdict = pass` (ffprobe, длительность ± 1 кадр, 5 якорей ≤ 1 кадр, 12 кадров `offset 0`/`inconclusive` и PSNR ≥ 30 дБ, `|ΔLU| ≤ 0,5`); оригинал не изменён; [H] финал целиком: без щелчков на склейках, речь синхронна губам.
- [ ] **Step 3: Вариант 720p / 25 fps / `draft`:** [A] verify pass с допусками 25 fps; предупреждение F8 показано.
- [ ] **Step 4: Воспроизводимость:** `SIGTERM` → старт → «Повторить экспорт» → [A] `compareExports.verdict = reproduced`.
- [ ] **Step 5: Устойчивость:** `SIGKILL` во время финала → группа воркера и медиасервер мертвы, частичного файла нет, задача доведена или `blocked(stale_process)`; `MS_DATA_DIR` переименован во время рендера → `storage_offline`, на системный диск ничего не записано, после возврата — доведено; правка EDL после final до старта → `failed(timeline_stale)`.
- [ ] **Step 6: Test 4** (`09` §7) — таблица [A]/[H] со ссылками, `final-timing-audit.mjs` (10 слов ± 1 кадр).
- [ ] **Step 7:** evidence, `REPORT.md`; `./check`; коммит `test(motion-studio): приёмка Phase 5 и Test 4`.

### Task 47: Управление проектами и восстановление после сбоев

**Цель:** переименование, архив, удаление в корзину с подтверждением, центр восстановления —
для всех видов проектов (`playground`, `video`, `script`). Независима от Phase 4–5.

**Files:**
- Create: `app/motion-studio/server/src/projects/{lifecycle.ts,trash.ts,delete-intent.ts}`, `app/motion-studio/server/src/recovery/{boot-report.ts,quarantine.ts,shutdown-marker.ts}`, `app/motion-studio/server/src/db/repos/{trash.ts,boot-reports.ts}`
- Modify: `app/motion-studio/server/src/pipeline/trash-purge.ts`, `app/motion-studio/server/src/api/routes/{project-lifecycle,recovery}.ts` (тела заглушек), `app/motion-studio/server/src/boot.ts`, `app/motion-studio/server/src/main.ts`, `app/motion-studio/server/src/jobs/queue.ts` (`project_archived` при постановке)
- Modify (web): `app/motion-studio/web/src/pages/{RecoveryCenter,Dashboard}.tsx`, `app/motion-studio/web/src/i18n/ru-projects.ts`; Create: `app/motion-studio/web/src/components/projects/{ProjectList,RenameDialog,DeleteDialog,TrashList,RecoveryBanner}.tsx`, `app/motion-studio/web/src/api/projects-client.ts`
- Test: `app/motion-studio/server/test/projects/{lifecycle,trash,delete-intent}.test.ts`, `app/motion-studio/server/test/recovery/{boot-report,quarantine,shutdown-marker}.test.ts`, `app/motion-studio/web/test/delete-dialog.test.tsx`, `app/motion-studio/web/e2e/projects.spec.ts`

**Interfaces:**
- Consumes: `bootCore`, `recoverOnStart`, `quarantineDraft`, `enqueue`, `safeMkdir`, `projects`/`jobs` repos, `scriptBatches`/`videoBatches`, `artifactPaths` (в т. ч. `package(id)`); колонки и таблицы 006 (35′)
- Produces: `renameProject`, `archiveProject`/`unarchiveProject` (задачи по архивному → `project_archived`), `deleteIntent` (сводка: сцены, версии, экспорты, **пакеты** `packages/`, активные задачи **включая сценарные пакеты**), `deleteProject` (`project_busy` / `confirm_mismatch` / `intent_expired`; перенос в `workspace/trash/<id>-<ts>/`), `restoreFromTrash`, `purgeTrash` (`trash.purge`, второй intent), `writeShutdownMarker`/`consumeShutdownMarker`, `persistBootReport`, `listQuarantined`, `discardQuarantined`; API и UI — как в редакции 2026-10-21

- [ ] **Step 1: Тесты (падают):** как в редакции 2026-10-21 плюс: сценарный проект с идущей задачей `playground.generate` пакета → `project_busy`; `deleteIntent` сценарного проекта считает папки `packages/`.
- [ ] **Step 2–3:** FAIL → реализовать → PASS; Playwright `projects.spec.ts`. **Step 4:** `./check`, `make e2e-ui`; коммит `feat(motion-studio): управление проектами и центр восстановления`.

**Риски:** `boot.ts`/`main.ts` — порядок старта ADR 0007 (owner-lock → StorageGuard → процессы →
восстановление) не меняется; корзина на том же томе (rename, не копия).

### Task 48: Диагностика — doctor в UI, журналы, трассировка, каталог ошибок, стоимость задачи

**Files:**
- Create: `app/motion-studio/server/src/diagnostics/{logger.ts,redact.ts,doctor-checks.ts,trace.ts,bundle.ts,error-catalog.ts}`
- Modify: `app/motion-studio/server/src/api/routes/diagnostics.ts` (тело заглушки), `app/motion-studio/server/src/cli/doctor.ts` (→ `runDoctor()`), `app/motion-studio/server/src/jobs/{runner.ts,events.ts}`, `app/motion-studio/server/src/agents/claude-code.ts`, `app/motion-studio/server/src/api/job-dto.ts` (стоимость задачи), `app/motion-studio/render/src/node/worker.ts` (корреляционные поля)
- Modify (web): `app/motion-studio/web/src/pages/Diagnostics.tsx`, `app/motion-studio/web/src/components/JobStatus.tsx`, `app/motion-studio/web/src/i18n/ru-diagnostics.ts`; Create: `app/motion-studio/web/src/components/diagnostics/{DoctorTable,LogViewer,TraceView,ErrorCard}.tsx`
- Test: `app/motion-studio/server/test/diagnostics/{logger,redact,doctor-checks,trace,bundle,error-catalog}.test.ts`, `app/motion-studio/web/test/error-card.test.tsx`

**Interfaces:**
- Consumes: `doctor`, `JobErrorCodeSchema` (`contracts/src/failure.ts`), коды `errors.*` (`web/src/i18n/ru-script-plan.ts`), `agent_runs`, `jobCost`, `recordAgentRuns` (`db/repos/agent-runs.ts`), `job_events`, `render_jobs`, `EventBus`
- Produces: `createLogger`, `redact`, `runDoctor`, `jobTrace`, `diagnosticBundle`, `ERROR_CATALOG` (ключ на **каждый** код `JobErrorCodeSchema` и каждый `errors.*` словаря сценария), `explainError`; `JobDto.cost_usd` (из `jobCost`, в т. ч. неудачные попытки — S17b); API и UI — как в редакции 2026-10-21

- [ ] **Step 1: Тесты (падают):** как в редакции 2026-10-21 плюс: `for (const code of JobErrorCodeSchema.options) expect(ERROR_CATALOG[code]).toBeDefined()`; каждый ключ `errors.*` из `ru-script-plan.ts` есть в каталоге; `GET /api/jobs/:id` содержит `cost_usd` = `jobCost`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS; `./check`; коммит `feat(motion-studio): страница диагностики, журналы и каталог ошибок`.

### Task 49a: Затраты, сторож прогресса, кэш кадров, `cache.gc`

**Files:**
- Create: `app/motion-studio/server/src/perf/{cache-gc.ts,stills-cache.ts,watchdog.ts,costs.ts}`
- Modify: `app/motion-studio/server/src/pipeline/cache-gc.ts` (тело заглушки), `app/motion-studio/server/src/jobs/runner.ts` (сторож), `app/motion-studio/render/src/node/worker.ts` (`concurrency` из конфига)
- Modify (web): `app/motion-studio/web/src/pages/Dashboard.tsx` (`CostSummary`), `app/motion-studio/web/src/components/script/BatchBar.tsx` (аддитивно — `CostBadge`), `app/motion-studio/web/src/i18n/ru-diagnostics.ts` (раздел `costs.*` в конец); Create: `app/motion-studio/web/src/components/costs/{CostSummary,CostBadge}.tsx`
- Test: `app/motion-studio/server/test/perf/{cache-gc,stills-cache,watchdog,costs}.test.ts`

**Interfaces:**
- Consumes: `contentKey`, `writeEntry`, `writeTimelineEntry`, `ensureMaster` (36); `JobRunner`, `JobContext.progress`; `agent_runs`, `jobCost`; `AppConfig.watchdog/cache/render` (35′)
- Produces: `gcCache(root, db, { maxBytes })` — LRU кэша бандлов, кадров и master; **никогда** не трогает `packages/`, `final/`, `exports/` и то, на что ссылается активная задача или текущая ревизия таймлайна; размеры `packages/` — только в отчёт; `stillsCache`; `progressWatchdog` → `failed(stalled)`; `renderConcurrency(cpus, cfg?)`; `costSummary(db, f)` (справочно, подпись «расчётная стоимость по данным CLI, не счёт подписки»)

- [ ] **Step 1: Тесты (падают):** `renderConcurrency(10) = 4`, `(2) = 1`, `(10, 2) = 2`; `gcCache` удаляет только LRU и не трогает активное, текущее и `packages/`; молчащая задача → `failed(stalled)`; `costSummary` по ролям и моделям.
- [ ] **Step 2–3:** FAIL → реализовать → PASS. **Step 4:** `./check`, `make e2e-ui`; коммит `perf(motion-studio): учёт затрат, сторож прогресса и уборка кэша`.

### Task 49b: Профиль финала и долгих операций

**Files:** Create: `app/motion-studio/server/src/perf/profile.ts`, `app/motion-studio/scripts/perf-profile.mjs`, `app/motion-studio/server/test/perf/long-ops.e2e.test.ts`, `docs/evidence/phase-6/perf/PROFILE.md`

**Interfaces:** `renderTimelineRange`, `finalRender`, `timelinePreview`, `stillsCache`, `gcCache` (36, 42, 43, 49a); проект приёмки после 46.

- [ ] **Step 1:** `perf-profile.mjs` — без LLM: 6 версий-фикстур через `seedScene` + `timeline.preview` + финал 120 с 1080p на ролике приёмки; три прогона подряд; время этапов, пик RSS сервера и воркера, байты на диске, попадания кэша → `PROFILE.md`; отклонение > 25 % от записанного — предупреждение (F13).
- [ ] **Step 2: e2e `long-ops`:** финал 120 с трижды → RSS третьего ≤ 1,5 × первого; SSE переподключается с `Last-Event-ID` без потерь; бандл второго и третьего — из кэша.
- [ ] **Step 3:** `./check`; коммит `perf(motion-studio): профиль финального рендера`.

### Task 50: заменена

Заменена треком качества (Р-V8): S16b (`.superpowers/sdd/2026-10-24-script-to-motion/task-S16b-brief.md`)
и ночные прогоны (`2026-10-23-night-quality-loop-design.md`) — после Task 52. motion-kit — от
0.5.8; 35′ поднимает до 0.5.9 (`LayoutRect`), трек качества — дальше. Рубрика Visual QA и
шаблоны лучших сцен — в бэклоге трека качества.

### Task 51: UX-полировка, визуальная обратная связь и руководство пользователя

**Files:**
- Create: `app/motion-studio/web/src/components/ui/{Toasts,ProgressStages,Skeleton,ConfirmDialog,DisabledReason,EmptyState,ShortcutsHelp}.tsx`, `app/motion-studio/web/src/ui/{shortcuts.ts,eta.ts,unsaved.ts}`, `app/motion-studio/web/e2e/{guide-screens.spec.ts,a11y.spec.ts}`
- Modify: страницы и компоненты `web/src/pages/**`, `web/src/components/**` — состояния загрузки, пустые состояния, причины недоступности, подтверждения, прогресс; строки — `web/src/i18n/ru-ux.ts` (и свои словари областей, только добавление)
- Create: `docs/guide/{README.md,01-установка-и-запуск.md,02-motion-playground.md,03-сценарий-в-моушн-сцены.md,04-видеопроект.md,05-сцены-видео-и-утверждение.md,06-таймлайн-и-экспорт.md,07-проекты-и-корзина.md,08-диагностика-и-сбои.md,09-сквозной-пример.md}`, `docs/guide/img/*.png`
- Test: `app/motion-studio/web/test/{shortcuts,eta,unsaved,confirm-dialog,disabled-reason,i18n-coverage}.test.tsx`

**Interfaces:** все экраны (Playground, ScriptWorkspace, VideoWorkspace и вкладки 40/5L/45,
Dashboard, Diagnostics, RecoveryCenter); `ERROR_CATALOG`, `ErrorCard` (48); `useEvents`, `t`, `ru`.
Produces: `etaFrom`, `ProgressStages`, `SHORTCUTS`, `Toasts`, `DisabledReason`, `ConfirmDialog`
(удаление, очистка корзины, перегенерация утверждённой сцены; порога «пакет > $10» нет — Р-V7),
`useUnsavedGuard`; доступность (`@axe-core/playwright`, без `serious`/`critical`); руководство
по-русски, **включая главу о сценарии** (текст → план → пакет → папка → 9:16) и сквозной пример
по 15 шагам DoD; скриншоты — фикстуры без личных кадров; `i18n-coverage` по всем словарям `ru-*.ts`.

- [ ] **Step 1: Тесты (падают):** `etaFrom`; клавиши и защита полей ввода; `DisabledReason` с причиной из словаря; кириллицы в `.tsx` вне словарей нет.
- [ ] **Step 2:** `a11y.spec.ts` (Dashboard, Playground, ScriptWorkspace, VideoWorkspace: сцены/экспорт/таймлайн, Diagnostics) — без `serious`/`critical`; `guide-screens.spec.ts` → `docs/guide/img/`.
- [ ] **Step 3:** руководство вычитано (`slop-check` — по желанию человека); `./check`, `make e2e-ui`; коммит `feat(motion-studio): полировка UX и руководство пользователя`.

### Task 52: Финальная приёмка — Definition of Done (15 шагов), устойчивость, регресс сценария

**Files:**
- Create: `app/motion-studio/web/e2e/acceptance-dod/{global-setup.ts,helpers.ts,dod-01-08-playground.spec.ts,dod-09-14-video.spec.ts,dod-15-restart.spec.ts,robustness.spec.ts,output-params.spec.ts,script-regress.spec.ts}`, `app/motion-studio/web/playwright.acceptance-dod.config.ts`, `app/motion-studio/scripts/{dod-report.mjs,versions-integrity.mjs}`
- Create: `docs/evidence/final/{dod,robustness,script-regress,screens}/…`, `docs/evidence/final/manual-checklist.md`, `docs/evidence/final/REPORT.md`, `docs/evidence/phase-6/REPORT.md`
- Modify: `app/motion-studio/README.md` (как пройти приёмку)

**Interfaces:** всё из 35′–51; новое хранилище `materialsPath("acceptance", "dod")` (`doctor --init`);
`pick-test-video.mjs`, `timing-audit.mjs`, `final-timing-audit.mjs`, `kb-hashes.mjs`; сценарная
приёмка `web/e2e/acceptance-script/` и §13 спеки `2026-10-24-script-to-motion-design.md`.

- [ ] **Step 1: DoD 1–8 (Playground)** и **Step 2: DoD 9–14 (видео)** — как в редакции 2026-10-21, с поправками: шаг 12 — «Сгенерировать все» во вкладке «Сцены», правка одной сцены в Playground, C; шаг 13 — таймлайн, сдвиг по якорю, «Смонтировать и экспортировать»; изменение длительности — только через план; бюджетных проверок нет.
- [ ] **Step 3: DoD 15 (рестарт)** — как в редакции 2026-10-21 (`compareExports = reproduced`, `versions-integrity.mjs after` совпадает).
- [ ] **Step 4: Регресс сценарного MVP (`script-regress.spec`, реальные `claude` и рендер):** блок текста из приёмки S12 → проверки §13 спеки 2026-10-24 пп. 1–2, 5–11, 13 [A] (план, правка, пакет ≥ 90 % `ready`, длительности = плану, рестарт посреди пакета, папка 16:9 с альфой, шпаргалка, доработка v2 попадает в папку); п. 12 (9:16) — две сцены.
- [ ] **Step 5: Устойчивость** — пп. 1–4, 6–10 редакции 2026-10-21; п. 5 — недоступный `claude` и исчерпание лимита задачи `agents.<role>.maxBudgetUsd` (лимит вызова агента остаётся, бюджета пакета нет).
- [ ] **Step 6: Ручная часть [H]:** `manual-checklist.md` — отключение SSD во время рендера; просмотр финала; проход руководства `09-сквозной-пример.md`.
- [ ] **Step 7:** `dod-report.mjs` → `REPORT.md`; `./check`; коммит `test(motion-studio): финальная приёмка продукта и evidence`; итог человеку (ТЗ §16 п. 8). Затем — трек качества (S16b, ночь).

---

## Self-review (2026-10-25)

- **Р-V1…Р-V9 учтены:** `production.*`, `runScenePipeline`, `scene.import`, бюджет пакета,
  `set_duration`/`retime`/`ManualEdit`, холст `rect`, миграции 003/004, Scene Inspector, Task 50 —
  убраны; вход `video`, пакет как набор задач, `video_*`-таблицы, C/final по субъекту, прозрачные
  размещения, длительность через план, 5L — в задачах 35′, 37′, 38-39, 40, 5L, 42, 43, 45.
- **ТЗ §13 Phase 4:** генерация агентами Playground по плану (37′), пакет (38-39), просмотр и
  доработка (40 + Playground), C (38-39), экспорт сцен (5L), приёмка (41). **Phase 5:** таймлайн
  (42), финал (43), проверка (44), UI (45), приёмка и Test 4 (46). **Phase 6:** проекты и
  восстановление (47), диагностика (48), производительность (49a, 49b), UX и руководство (51),
  DoD (52); качество анимации — трек качества.
- **Имена сверены с кодом staging c2c09c8:** `playgroundGenerate`, `PlaygroundGenerateInputSchema`,
  `playgroundEdit`, `scriptContextOf`, `scriptPlannedFrames`, `durationChecks`, `startScriptBatch`,
  `stageBatch`, `keyPrefix`, `sceneJobKey`, `batchStatus`, `cancelBatch`, `recordPublishedFingerprint`,
  `ScriptSceneContextSchema`, `buildSceneBrief`, `sceneSettings`, `keyMoments`, `itemFingerprint`,
  `overlayChecks`, `overlayFrames`, `fragmentFitAttempt`, `foreignLabelQa`, `payoffStart`,
  `exportOne`, `scriptPackage`, `cheatsheet`, `fileNames`, `approveVisualPlan`, `approve`,
  `approvalState`, `peekApprovalState`, `currentSubject`, `lockKeyFor`, `projectLockKey`,
  `artifactPaths`, `installAssetGuard`, `exportVersion`, `exportDurationFrames`, `buildPreviewFilter`,
  `detectVfr`, `estimateImportBytes`, `loadPng`, `frameDelta`, `inkFraction`, `audioOffsetUs`,
  `syncCheck`, `wavPcm`, `timelineFor`, `buildTimeline`, `mapWords`, `occupiedAt`,
  `extractKeyframes`, `recheckPlan`, `jobCost`, `recordAgentRuns`, `seedScene`, `materialsPath`,
  `MOTION_KIT_VERSION` (0.5.8), миграции 001–005.
- **Открытые [Д]:** доставка медиа в `OffthreadVideo` через `AssetPolicy.media` (36); целевые
  числа профиля (49b). `<Sequence width height>` больше не нужен (Р-V5).
