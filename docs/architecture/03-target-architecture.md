# 03. Целевая архитектура

Статус: **предложено, ждёт утверждения**. Решения с альтернативами — ADR
`docs/decisions/0001…0004`.

## 1. Размещение: отдельное приложение в my-remotion

ТЗ §3.4 и §12 просят переиспользовать существующий backend и UI, если это оправдано.
Проверка по требованиям нового ТЗ (старый `aiplatform/motion/` в расчёт не берётся,
см. `01-current-state.md` §3.2а):

| Требование ТЗ | Backend/UI ai-platform | Вывод |
|---|---|---|
| React + TypeScript UI, Remotion-композиции (§3.4) | Python stdlib, ванильный JS без сборки | нужен Node/TS-тулчейн |
| Knowledge Base из my-remotion (§2.2, §9) | — | KB и исходники лежат в my-remotion |
| Durable jobs, recovery после рестарта (§4.2, §12) | очередь из одного потока, после рестарта `interrupted` без автоповтора | нужна своя очередь |
| Не менять ai-platform без согласования (§16.3) | — | интеграция только через внешние интерфейсы |
| ASR и изображения из ai-platform (§2.1) | CLI-воркер ASR, `/api/photo/jobs` | переиспользуем как сервисы |

**Решение:** `app/motion-studio/` на Node/TS в my-remotion; ai-platform — поставщик
ASR (CLI-воркер) и, опционально, изображений. Движок сцен (`contracts/` + `render/`)
изолирован от HTTP и БД — это требование тестируемости и воспроизводимого рендера
(ТЗ §6.3), а не задел под интеграцию с чем-либо.

> Вопрос к человеку №1 (подтверждение): размещение в `my-remotion/app/motion-studio/`.

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
| Рантайм | Node 22 LTS (уже установлен 22.21.1), `.nvmrc` | Remotion 4 и TS-контракты в одном языке; активная LTS-ветка |
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

Решение — ADR 0006. Все данные (`studio.db`, `workspace/`, кэш бандлов, логи) лежат на
внешнем SSD в каталоге `MS_DATA_DIR`, отдельно от `local_models`. Предлагаемое значение:
`/Volumes/External SSD/MotionStudio` ([Ф] диск подключён, APFS, Volume UUID
`DF07AEE5-…`, свободно 211 ГБ из 477 ГБ).

- `MS_DATA_DIR` **обязателен**, значения по умолчанию нет: без него сервер и CLI не стартуют.
- Версии сцены иммутабельны: каталог `versions/<id>/` после публикации получает права
  только на чтение (`chmod -R a-w`), запись идёт в `drafts/<job-id>/`, затем атомарный `rename`
  в пределах одного тома.
- Временные файлы Remotion (бандлы, кадры) направляются в `MS_DATA_DIR/cache/`, а не в
  системный `TMPDIR`, — кроме мелких служебных файлов самого Chrome.

### 5.1. StorageGuard: защита от отключённого диска

Опасный сценарий: диск отключён, `/Volumes/External SSD` исчез, а код делает
`mkdir -p` и тихо пишет на системный диск. Меры:

1. **Каталог не создаётся автоматически.** Только явная команда `doctor --init` создаёт
   `MS_DATA_DIR` и пишет маркер `.motion-studio-store.json`
   (`store_id`, `volume_uuid`, `created_at`). Во время работы — никаких `mkdir -p` корня.
2. **Проверка тома.** `MS_DATA_DIR` существует; маркер на месте и его `store_id` совпадает
   с записью в `studio.db`; Volume UUID тома, на котором лежит путь (`diskutil info -plist`),
   совпадает с маркером; устройство (`st_dev`) отличается от корневого тома, если не задан
   явный `MS_ALLOW_SYSTEM_DISK=1`; тестовая запись проходит; свободного места больше порога
   (по умолчанию 10 ГБ).
3. **Когда проверяем:** при старте; перед захватом каждой задачи; перед публикацией версии
   и экспортом; каждые 10 с во время выполнения задач.
4. **Если проверка провалена — режим `storage_offline`:** оркестратор перестаёт брать задачи,
   идущие дочерние процессы останавливаются, их задачи возвращаются в `pending` с
   причиной `storage_unavailable` (draft-каталоги одноразовые, опубликованные версии не
   затронуты); соединение с SQLite закрывается; API отвечает 503 с понятным текстом,
   UI показывает баннер. После возврата диска — `PRAGMA quick_check`, затем работа продолжается.
5. **Целостность:** SQLite в WAL с `synchronous=FULL`; публикация — атомарный `rename`;
   незавершённые drafts удаляются при восстановлении.

## 6. Безопасность и изоляция

Контекст (ADR 0005): персональный локальный инструмент — один пользователь, один Mac,
сервер только на `127.0.0.1`. Авторизации, ролей пользователей, биллинга, облачного
хранения и деплоя нет и не планируется. Защищаемся от двух вещей: от недоверенного
сгенерированного кода и от запросов чужих веб-страниц в браузере пользователя к
локальному серверу (поэтому проверка `Host` и `Origin` — это не авторизация, а защита
от DNS rebinding и CSRF).

| Угроза | Мера |
|---|---|
| Чужая веб-страница шлёт запросы на `127.0.0.1:8790` | Сервер слушает только loopback; `Host` ∈ {`127.0.0.1:8790`, `localhost:8790`}; мутирующие запросы — только с `Origin` того же адреса |
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
2. Один раз: `MS_DATA_DIR="/Volumes/External SSD/MotionStudio" npm run doctor -- --init` —
   создаёт каталог и маркер тома (см. §5.1).
3. `npm run doctor`: проверяет Node ≥ 22, `claude --version`, логин Claude
   (короткий `claude -p` с `--tools ""`, стоимость < $0,01), ffmpeg/ffprobe,
   доступность `KB_ROOT`/`KB_SOURCE_ROOT`, StorageGuard для `MS_DATA_DIR`,
   установку Chrome Headless Shell (`npx remotion browser ensure`).
4. `npm run dev` → сервер на `127.0.0.1:8790` (только loopback, проверка Host/Origin),
   UI на том же порту.
5. Любая задача проверяет capability-статус: при отсутствии Claude или Chrome — понятная
   ошибка `unavailable`, а не фиктивный результат.

## 8. Лимиты по умолчанию (конфигурируемые)

| Параметр | Значение | Основание |
|---|---|---|
| Параллельных агентных запусков | 2 | стоимость и токены |
| Параллельных рендеров | 1 (Remotion concurrency 4) | 10 ядер CPU, 32 ГБ |
| Автоисправлений на версию | 2 | ТЗ §4.2 |
| Таймаут агента | 10 мин | |
| Таймаут рендера превью | 5 мин | |
| Бюджет агента за вызов | `--max-budget-usd` 2 | ограничение CLI по расчётной стоимости |
| Бюджет на одну генерацию сцены | $5 (сумма `total_cost_usd` вызовов) | ориентир для тестов, утверждён человеком; при подписке это расчётная стоимость, а не фактический счёт и не лимит подписки |
