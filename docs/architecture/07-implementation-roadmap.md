# 07. Дорожная карта и backlog Phase 1

Сложность: **S** ≤ 0,5 дня, **M** 1–2 дня, **L** 3–5 дней работы агента с проверкой.
Оценки — [Д], уточняются после первого вертикального среза.

## 1. Фазы

| Фаза | Результат | Зависит от | Приёмка (кратко) |
|---|---|---|---|
| 0 | Эта документация | — | утверждение архитектуры человеком |
| **1** | Motion Playground MVP | 0 | тесты 1–3 из `09-acceptance-tests.md` на реальных моделях и рендере; рестарт → открыть и экспортировать сцену |
| 2 | Импорт видео, ASR, rough cut, Approval A | 1 (jobs, store) | исходник не меняется; вырезки обратимы; таймкоды верны; переживает рестарт |
| 3 | Семантика, footage, StyleBible, план сцен, Approval B | 2 | обоснованные сцены с точными таймкодами, без графики поверх лица без причины |
| 4 | Пакетная генерация сцен, Scene Inspector, Approval C | 1, 3 | несколько реальных сцен, сбой одной не ломает другие |
| 5 | Сборка таймлайна и финальный экспорт | 2, 4 | воспроизводимый финальный MP4 без рассинхрона |
| 6 | Полировка | 5 | отдельно от MVP |

## 2. Первый вертикальный срез (внутри Phase 1)

Сначала доказываем путь целиком, потом расширяем (утверждено 2026-10-20):

**P1-01 → P1-19 → P1-02 → P1-05 → P1-06 → P1-07 → P1-08 → P1-09 → P1-20**
= «текстовый запрос → агент → Knowledge Base → Remotion → реальный `preview.mp4`».

P1-19 (StorageGuard) и P1-20 (связка среза) — минимальная интеграция, без которой
результат негде сохранить и нечем запустить. До успешного первого рендера не делаем:
UI, БД и очередь задач (P1-03/04), правки через чат, QA-агента, видеомонтаж, ASR.

**Критерий результата среза:** по текстовому запросу создана настоящая Remotion-анимация,
в `knowledge-refs.json` есть записи KB с commit и лицензией, код прошёл typecheck и
статическую проверку, `preview.mp4` получен реальным `renderMedia`, проходит ffprobe-gate и
лежит в версии с `manifest.json`; повторный рендер из сохранённых файлов даёт те же
ключевые кадры. Mock-рендер и заранее подготовленные ролики не засчитываются.
Детальный план среза — `docs/superpowers/plans/2026-10-20-motion-playground-mvp.md`.

## 3. Backlog Phase 1

| ID | Задача | Зависит от | Сложн. | Риск | Готово, когда |
|---|---|---|---|---|---|
| P1-01 | Каркас `app/motion-studio/`: npm workspaces, TS strict, Vitest, ESLint, `Makefile check`, `.nvmrc` 22, подключение к `./check` | — | S | низкий | `./check` зелёный с пустыми тестами |
| P1-02 | `contracts/`: Zod-схемы (Settings, MotionSpecification, ComponentSelection, Concept/Edit/QA I/O, Job, Manifest), генерация JSON Schema, `time.ts` с тестами | P1-01 | M | средний: схемы будут меняться | схемы покрыты тестами, JSON Schema принимает `claude --json-schema` |
| P1-03 | БД: миграции SQLite (таблицы Phase 1), репозитории, `PRAGMA user_version`; БД в `MS_DATA_DIR` | P1-01, P1-19 | M | низкий | тесты миграций и CRUD |
| P1-04 | Job Orchestrator: очередь, lease/heartbeat, лимиты по типам, cancel, retry, идемпотентность, восстановление после рестарта, `job_events`, режим `storage_offline`; fencing-токен `attempt`, таблица `job_processes`, статус `blocked` (ADR 0007) | P1-03, P1-19 | L | средний | тесты из `09` §5 п.1–9 |
| P1-05 | `render/`: Remotion 4.0.537 (точный pin), шрифты OFL, генератор entry, `bundle`/`renderStill`/`renderMedia` в дочернем процессе, ffprobe-gate | P1-01 | L | **высокий**: первая установка Remotion и Chrome в sandbox | рукописная тестовая сцена рендерится в MP4 и PNG; ffprobe совпадает |
| P1-06 | Статическая проверка кода сцены: allowlist импортов, запрещённые API (AST, `typescript` compiler API), `tsc --noEmit` для версии | P1-05 | M | средний | набор «плохих» сцен-фикстур отклоняется с понятной причиной |
| P1-07 | motion-kit v0.1: `useBeat`, `AnimatedNumber`, `LineChart`, `FlowGraph`, `PulseAlongPath`, `Card(elevation)`, `KineticText`, `Background`; 3 пресета StyleBible; `PROVENANCE.md` | P1-05 | L | средний: качество визуала | каждый примитив отрендерен, кадры просмотрены, результат в `PROVENANCE.md` (в `component_tests` — после P1-03) |
| P1-08 | `AgentRuntimeAdapter` + `ClaudeCodeRuntime`: флаги из `04` §5, таймаут, cancel, бюджет, журнал, парсинг `structured_output`, capability check | P1-02 | M | средний: изменения CLI | интеграционный тест на реальном `claude` (дешёвая модель) + тесты на фейковом бинарнике (только для юнит-тестов) |
| P1-09 | `KnowledgeAdapter`: загрузка jsonl/repositories/results, взвешенный поиск, RU/EN-синонимы, фильтры, `license_class`, `confidence`, `getSourceReference` с `exists`, копирование refs | P1-02 | M | средний: релевантность | golden-тесты: запросы тестов 1–3 дают ожидаемые id в top-5 (`animated-counter`, `line-chart-anim`, `animated-beam`) |
| P1-10 | Промпты ролей Concept, Motion Director, Engineer, Visual QA, Edit Planner (`prompts/`), выдержки official skills | P1-07, P1-09 | L | **высокий**: качество сцен | 3 эталонных запроса дают рендер без ручной правки |
| P1-11 | SceneStore: drafts, атомарная публикация, `chmod a-w`, manifest + sha256, восстановление, сравнение (diff props/spec/src); развивает файловый store из P1-20 | P1-03, P1-20 | M | низкий | тесты иммутабельности и восстановления |
| P1-12 | Пайплайн `playground.generate`: Concept → KB → Director → Engineer → tech gate → QA → publish, лимит 2 исправлений; расширяет пайплайн P1-20 | P1-04, P1-06, P1-08, P1-10, P1-11, P1-20 | L | высокий | тесты 1 и 2 проходят end-to-end |
| P1-13 | Пайплайн `playground.edit`: Edit Planner, param-only путь, borrow из других версий, проверка preserve | P1-12 | M | средний | тест 3 проходит |
| P1-14 | Экспорт: MP4 H.264/AAC (полное разрешение, выбор fps/качества), прозрачный ProRes 4444, export-manifest | P1-05, P1-11 | S | низкий | ffprobe экспортов совпадает с настройками |
| P1-15 | Control API (Fastify): проекты, сцены, версии, чат, jobs (SSE), preview/export с Range, Host/Origin-защита, `Idempotency-Key` | P1-04, P1-11 | M | низкий | контрактные тесты API |
| P1-16 | UI Playground: чат + история, параметры (ТЗ §6.4), плеер (play/pause/seek/frame step), версии (сравнить/восстановить), использованные компоненты KB с лицензиями и статус QA (ТЗ §6.1 п.6, §6.2), статус и логи задач, кнопки Render/Export, простой таймлайн сцены; строки интерфейса через словарь (ru по умолчанию, архитектура допускает i18n) | P1-15 | L | средний | E2E Playwright: создать → правка → восстановить → экспорт |
| P1-17 | `npm run doctor` (полный набор проверок) и README запуска; Jobs Monitor (минимум: список, cancel, retry) | P1-15, P1-19 | S | низкий | doctor ловит отсутствие claude/chrome/места/диска |
| P1-18 | Приёмка: прогон тестов 1–3 и теста рестарта, сбор evidence в `docs/evidence/phase-1/`, отчёт с честной разметкой «авто / нужна проверка глазами» | все | M | — | см. `09-acceptance-tests.md` |
| P1-19 | StorageGuard (`03` §5.1): обязательный `MS_DATA_DIR`, `doctor --init`/`--adopt` с маркером тома, проверки Volume UUID / `st_dev` / записи / места, без авто-`mkdir` корня, `mkdir` только внутри проверенного корня; owner-lock и реестр процессов в файлах (ADR 0007, `03` §5.2) | P1-01 | M | средний: поведение при отключении диска | тесты: нет переменной, нет каталога, чужой маркер, путь на системном томе, мало места — понятный отказ; второй владелец не стартует; живой процесс прежней попытки не даёт перезапуска; ручная проверка с отключённым SSD |
| P1-20 | Связка вертикального среза: CLI `npm run generate -- "<запрос>"`; KB-поиск по запросу → Motion Director (spec + выбор компонентов) → Engineer → static check + tsc → stills + `preview.mp4` → ffprobe-gate → файловая версия с `manifest.json`; минимальные промпты двух ролей | P1-05…P1-09, P1-19 | M | высокий: первое качество сцен | критерий среза из §2 выполнен на промптах тестов 1 и 2 |

Порядок исполнения: вертикальный срез из §2, затем P1-10 → P1-12 → P1-13 → P1-18 по
критическому пути; параллельно — P1-03 → P1-04 → P1-11, P1-14, затем P1-15 → P1-16 → P1-17.

## 4. Подзадачи и ветки

По регламенту репозитория каждая задача P1-xx — своя ветка от `staging`
(`motion-studio/p1-xx-<slug>`), `./check` → коммит → `./finish`. PR `staging → main`
обновляется автоматически, слияние — человек.

## 5. Phase 2–5: укрупнённо

- **Phase 2:** `media.import` (ffprobe, прокси H.264 720p CFR, waveform JSON, thumbnails,
  проверка места), `AsrAdapter` (CLI ai-platform), сегментация, правка транскрипта
  с сохранением id слов, детектор пауз/повторов (код) + Rough Cut Editor (LLM),
  EDL и маппинг source↔edited, rough-cut превью, Approval A.
- **Phase 3:** keyframes каждые N секунд + детекция лица (Vision framework через
  Swift CLI — [Д], либо LLM-зрение по кадрам), safe zones, Semantic Director, Visual
  Planner, StyleBible проекта, план на таймлайне, Approval B.
- **Phase 4:** перенос готовой сцены Playground в видеопроект (копия версии со ссылкой
  на источник, ТЗ §6.1 п.10), пакетная генерация (пайплайн Phase 1 на каждую сцену плана), Scene Inspector,
  Approval C, экспорт отдельных сцен, overlay/PiP-режимы в motion-kit.
- **Phase 5:** Remotion-композиция финала (`OffthreadVideo` прокси/оригинала по EDL +
  сцены в edited-координатах) либо FFmpeg-оверлей прозрачных сцен — выбор по замеру
  скорости и качества на Phase 5; финальный MP4, проверка синхронизации, manifest проекта.
