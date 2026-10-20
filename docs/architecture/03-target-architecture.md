# 03. Целевая архитектура

Статус: **предложено, ждёт утверждения**. Решения с альтернативами — ADR
`docs/decisions/0001…0004`.

## 1. Главное решение: отдельное приложение или развитие ai-platform

| Вариант | Суть | За | Против |
|---|---|---|---|
| **A. Отдельное приложение в my-remotion** (рекомендуется) | `app/motion-studio/` на Node/TS; ai-platform — поставщик ASR (CLI) и, опционально, изображений | Один тулчейн с Remotion и React; KB лежит рядом; не трогаем активно меняющийся ai-platform; можно сделать durable jobs и версии с нуля | Второй продукт рядом с «Моушном»; часть логики «Монтажа» (вырезки, раскадровка) пишется заново в Phase 2–3 |
| B. Remotion-рендерер внутри «Моушна» ai-platform | Python-конвейер ai-platform вызывает Node-подпроцесс Remotion вместо HyperFrames | Переиспользует проекты, очередь, UI, ASR «Монтажа» | Нужны правки ai-platform (ТЗ §16.3 — только по согласованию); UI на ванильном JS без сборки плохо подходит для таймлайна, плеера, инспектора; очередь из одного воркера и `interrupted` без автоповтора не дают durable jobs |
| C. Гибрид | Движок сцен (contracts + motion-kit + render) — отдельный npm-пакет; его вызывают и Motion Studio, и ai-platform | Один движок на оба продукта | Сложнее Phase 1; выгоду даёт, только если «Моушн» решат перевести на Remotion |

**Рекомендация: A**, с границами, которые позволят позже перейти к C:
движок сцен изолирован в `render/` + `contracts/` и не знает о HTTP и БД.

> Блокирующий вопрос к человеку №1: подтвердить вариант A (или выбрать B/C).

## 2. Логическая схема

```text
┌──────────────────────────── Browser (React UI) ─────────────────────────────┐
│ Projects · Motion Playground · (Ph2+) Transcript · Timeline · Scene Inspector │
│ Knowledge Browser · Jobs Monitor                                              │
└───────────────────────▲───────────────────────────────┬──────────────────────┘
                REST JSON + SSE (events)          media: HTTP Range (preview.mp4)
┌───────────────────────┴───────────────────────────────▼──────────────────────┐
│ Control API (Fastify)        валидация Zod · идемпотентность · approvals     │
├───────────────────────────────────────────────────────────────────────────────┤
│ Job Orchestrator   SQLite-очередь · lease/heartbeat · лимиты · retry · cancel │
│   ├─ Pipelines: playground.generate · playground.edit · scene.render ·        │
│   │             scene.export · (Ph2+) media.import · asr · roughcut …         │
│   ├─ AgentRuntimeAdapter ─▶ ClaudeCodeRuntime (claude -p --restricted)        │
│   ├─ KnowledgeAdapter   ─▶ knowledge/ (in-memory index)                       │
│   ├─ SceneStore         ─▶ workspace/ (иммутабельные версии)                  │
│   ├─ RenderWorker       ─▶ child process: @remotion/renderer                  │
│   └─ MediaTools / AsrAdapter ─▶ ffmpeg, ffprobe, asr_worker.py                │
└───────────────────────────────────────────────────────────────────────────────┘
           │ метаданные                         │ большие файлы
       studio.db (SQLite WAL)          MS_DATA_DIR/workspace/…
```

**Процессная модель:** один процесс `server` (API + оркестратор + адаптеры) и
дочерние процессы на каждую тяжёлую операцию: `claude`, render worker, `ffmpeg`,
`asr_worker`. Падение дочернего процесса не роняет сервер; сервер при рестарте
поднимает незавершённые задачи из БД.

## 3. Стек и обоснование

| Слой | Выбор | Почему / альтернатива |
|---|---|---|
| Рантайм | Node 22 LTS (уже установлен 22.21.1), `.nvmrc` | Remotion 4 и TS-контракты в одном языке; HyperFrames ai-platform тоже на 22 |
| Пакеты | npm workspaces (без turborepo) | меньше инфраструктуры; pnpm есть, но npm достаточно |
| API | Fastify 5 + `fastify-type-provider-zod` | типы из Zod, встроенная валидация, SSE и Range; Express проще, но без схем |
| БД | SQLite WAL через `better-sqlite3` | один пользователь, durable jobs, транзакции; файлы ai-platform не дают атомарных переходов очереди. `node:sqlite` в Node 22 ещё experimental |
| Очередь | своя таблица `jobs` в SQLite | ТЗ запрещает Redis без необходимости; нагрузка — единицы задач |
| Контракты | Zod 3 → JSON Schema (`zod-to-json-schema`) | одна схема для API, агентов (`--json-schema`) и валидации файлов |
| UI | React 19 + Vite + TanStack Query, CSS-переменные | общий язык с Remotion; без UI-кита на старте |
| Превью | `preview.mp4` в `<video>` (seek, frame step через `currentTime`) | показываем ровно то, что отрендерено; `@remotion/player` с недоверенным кодом в браузере — позже и только в iframe-песочнице |
| Рендер | `@remotion/renderer` 4.0.537, точный pin | совпадает с официальными skills |
| Тесты | Vitest (unit/integration), Playwright (1–2 E2E UI-сценария) | |

Не вводим: Redis, Docker, Kubernetes, микросервисы, векторную БД, ORM.

## 4. Структура кода

```text
app/motion-studio/
  Makefile                 check: typecheck + lint + test (зовётся из ./check)
  package.json             npm workspaces
  contracts/               Zod-схемы сущностей и агентных I/O, генерация JSON Schema
  server/
    src/api/               маршруты Fastify
    src/jobs/              очередь, runner, пайплайны
    src/agents/            AgentRuntimeAdapter, ClaudeCodeRuntime, промпты ролей
    src/knowledge/         KnowledgeAdapter, поиск, нормализация лицензий
    src/scenes/            SceneStore, версии, манифесты, diff
    src/render/            RenderWorker (запуск дочернего процесса), QA-кадры
    src/media/             ffprobe/ffmpeg (Phase 2+), AsrAdapter (Phase 2)
    src/db/                схема, миграции (SQL-файлы), репозитории
  render/                  Remotion-проект: package.json с pin 4.0.537
    src/motion-kit/        проверенные frame-driven примитивы + StyleBible-токены
    src/entry/             генерируемая точка входа для бандла версии
    fonts/                 локальные шрифты (OFL), без сетевой загрузки
  web/                     React UI
  prompts/                 версионируемые промпты ролей
  fixtures/                эталонные запросы и ожидаемые свойства для тестов
```

## 5. Хранилище

- `MS_DATA_DIR` (по умолчанию `~/MotionStudio`, вне git и вне репозитория):
  `studio.db` + `workspace/` по схеме ТЗ §7 (детали — `05-data-model.md`).
- Версии сцены иммутабельны: каталог `versions/<id>/` после публикации версии
  получает права только на чтение (`chmod -R a-w`), запись идёт в `drafts/<job-id>/`,
  затем атомарный `rename`.
- Перед тяжёлыми операциями — проверка свободного места (порог в настройках,
  по умолчанию 5 ГБ для Playground).

> Блокирующий вопрос №2: где хранить данные — `~/MotionStudio` на системном диске
> (свободно 61 ГБ) или на внешнем SSD рядом с моделями.

## 6. Безопасность и изоляция

| Угроза | Мера |
|---|---|
| Агент читает/пишет вне задачи | `claude -p --restricted`: файловые инструменты ограничены cwd = draft-каталог версии; Bash и WebFetch отключены; MCP отключены `--strict-mcp-config` [Ф проверено] |
| Агенту нужен исходник из KB | Оркестратор копирует выбранные файлы в `draft/refs/` до запуска агента; доступа к `templates/` у агента нет |
| Bypass permissions | Не используется; `--restricted` его запрещает |
| Секреты в промптах и логах | В промпт идут только данные задачи; env дочерних процессов — allowlist (`PATH`, `HOME`, `LANG`, `TMPDIR`), без токенов; логи без env |
| Недоверенный код сцены при бандле и рендере | (1) статическая проверка: импорт только из allowlist (`react`, `remotion`, `@remotion/*` из pin, `motion-kit`, локальные файлы версии); запрет `fetch`, `XMLHttpRequest`, `WebSocket`, `eval`, `new Function`, `import()`, `require`, `process`, `globalThis` доступов, `setTimeout/setInterval/requestAnimationFrame`, `Math.random` (только `random(seed)` Remotion); (2) бандл через webpack с алиасами только на render-пакет; (3) рендер в дочернем процессе с урезанным env и таймаутом; (4) Chrome по умолчанию без внешних ассетов: шрифты и картинки только локальные |
| Сетевой доступ из Chrome во время рендера | Phase 1: статический запрет + перехват запросов Remotion (`onBrowserLog`, проверка логов). [Д] Жёсткая сетевая изоляция ОС (`sandbox-exec`-профиль) — задача-исследование Phase 1, см. риски |
| Лицензии | KB-запись с `license_class = restricted/unknown` нельзя копировать в сцену без явного флага пользователя; `Commons Clause` и `UNLICENSED` — только «референс» |
| Порча оригиналов | Исходники KB и медиа — только чтение; версии — `chmod a-w` |

## 7. Сценарий безопасного запуска (Phase 1)

1. `nvm use 22` → `cd app/motion-studio && npm ci` (pinned lockfile).
2. `npm run doctor`: проверяет Node ≥ 22, `claude --version`, логин Claude
   (короткий `claude -p` с `--tools ""`, стоимость < $0,01), ffmpeg/ffprobe,
   доступность `KB_ROOT`/`KB_SOURCE_ROOT`, свободное место, запись в `MS_DATA_DIR`,
   установку Chrome Headless Shell (`npx remotion browser ensure`).
3. `npm run dev` → сервер на `127.0.0.1:8790` (только loopback; Host/Origin-проверка
   как в ai-platform), UI на том же порту.
4. Любая задача проверяет capability-статус: при отсутствии Claude или Chrome — понятная
   ошибка `unavailable`, а не фиктивный результат.

## 8. Лимиты по умолчанию (конфигурируемые)

| Параметр | Значение | Основание |
|---|---|---|
| Параллельных агентных запусков | 2 | стоимость и токены |
| Параллельных рендеров | 1 (Remotion concurrency 4) | 10 ядер CPU, 32 ГБ |
| Автоисправлений на версию | 2 | ТЗ §4.2 |
| Таймаут агента | 10 мин | |
| Таймаут рендера превью | 5 мин | |
| Бюджет агента за вызов | `--max-budget-usd` 2 | контроль стоимости |
| Бюджет на одну генерацию сцены | $5 (сумма вызовов) | |
