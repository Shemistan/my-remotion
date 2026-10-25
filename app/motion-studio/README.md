# AI Motion Studio

Локальное приложение для одного пользователя на Mac: по текстовому запросу агенты
собирают сцену Remotion, приложение рендерит и публикует версии. ТЗ —
`AI_Motion_Studio_TZ.md`, архитектура — `docs/architecture/`, решения — `docs/decisions/`.

## Пакеты (npm workspaces)

| Пакет | Что внутри |
|---|---|
| `core` (`@ms/core`) | StorageGuard: проверка хранилища, `safeMkdir`, сторож `watchStorage`, macOS-проба тома |
| `contracts` (`@ms/contracts`) | Схемы и типы: настройки сцены, время, контракты агентов |
| `render` (`@ms/render`) | Рендер версии на Remotion 4.0.537: бандл, кадры, превью, ffprobe-gate (`render/README.md`) |
| `server` (`@ms/server`) | Сервер: Control API (Fastify), очередь задач, пайплайны; CLI `doctor`, `generate` |

## Установка и где лежат зависимости

На новой машине — `./setup` в корне репозитория (раздел «Новый компьютер» корневого README,
ADR 0008). Зависимости — в проекте, тяжёлое — в папке материалов на SSD:

| Что | Где | Кто ищет |
|---|---|---|
| Node (`.nvmrc`, 22.21.1) | `<repo>/.deps/node` | `scripts/with-node.sh`; нет — nvm (запасной путь) |
| ffmpeg, ffprobe 7.1.1 | `<repo>/.deps/ffmpeg` | `resolveTool` (`core/src/deps.ts`): render, server, health, doctor; нет — PATH |
| python воркера ASR | `<repo>/.deps/asr-venv/bin/python` | `config.ts` (`asr.python`), если есть штамп полной установки `asr-venv/.ms-lock`; нет — прежнее окружение ai-platform |
| воркер ASR | `tools/asr-worker/asr_worker.py` (копия, README там же) | `asr.worker`; `asr.aiPlatformRoot` — воркер из ai-platform |
| веса Whisper | `<папка материалов>/models/asr/<модель>` | `asr.modelsDir`: папка материалов, если модель `asr.model` там готова (`config.json` + веса); нет — `/Volumes/External SSD/local_models`, если она там |
| npm-пакеты, Chrome Headless Shell | `node_modules/`, `node_modules/.remotion/` | `make install` |
| vision-detect | `tools/vision-detect/bin/` | `make install` (swiftc) |

`MS_DEPS_DIR` (абсолютный путь) заменяет каталог `.deps`; в worktree агента `.deps` ищется сначала
в worktree, потом в main checkout. Запасные пути (nvm, ffmpeg из PATH, прежние python и веса
ai-platform) работают, но `doctor` показывает строку `warning deps` с подсказкой `./setup`.

Все команды — через обёртку (Node из `.deps/node`, ffmpeg из `.deps/ffmpeg` первым в PATH):

```sh
./scripts/with-node.sh npm ci
```

## Проверки

```sh
make check   # lint + typecheck + юнит-тесты; ставит зависимости по lockfile, если их нет
make e2e     # интеграционные тесты (*.e2e.test.ts): сеть, рендер, реальный SSD
```

`make check` вызывается из `./check` в корне репозитория и pre-commit-хуком.
Тесты пишут только в `tmp/` репозитория и убирают за собой.

Evidence в `docs/evidence/` закоммичено и само по себе не переписывается:
- `slice.e2e` кладёт кадры и итоги прогона в `tmp/slice-evidence/`. В
  `docs/evidence/phase-1/slice/` они попадают только с флагом:
  `MS_WRITE_EVIDENCE=1 make e2e`.
- `make e2e-ui` (Playwright) пишет скриншоты в `tmp/e2e-ui/<фаза>/ui/`; в
  `docs/evidence/{phase-1,phase-2,phase-3,script-mvp}/ui/` — только с тем же флагом:
  `MS_WRITE_EVIDENCE=1 make e2e-ui`.
- Кадры галереи хореографии kit пересобирает `scripts/kit-evidence.mts` (см.
  `render/src/motion-kit/PROVENANCE.md`).

## Хранилище и doctor

Все данные приложения — только в `MS_DATA_DIR` (ADR 0006); значения по умолчанию нет.
Для этой машины: `/Volumes/External SSD/moution-studio-materials/store`.

Всё, что приложение, скрипты, тесты и агенты пишут на SSD, лежит в одной папке материалов
`/Volumes/External SSD/moution-studio-materials/` (решение 2026-10-25, ADR 0006 «Раскладка папки
материалов»): `store/` — рабочее хранилище, `acceptance/store` и `acceptance/src` — хранилище
приёмок и копии-отрезки исходников, `e2e/<имя>/` — хранилища e2e, `examples/` — примеры для
человека. Исходные видео из других папок SSD (`media.importRoots`, `MyProtocol/*.mov`) только
читаются. Пути берутся из `core/src/storage/materials.ts` (`materialsPath`, `assertInMaterials`);
корень переопределяет `MS_MATERIALS_ROOT` (тесты). `doctor` предупреждает (`warning materials`),
если `MS_DATA_DIR` на этом SSD, но вне папки материалов.

```sh
export MS_DATA_DIR="/Volumes/External SSD/moution-studio-materials/store"
./scripts/with-node.sh npm run doctor             # полная проверка окружения (ниже); код 1 при любой ошибке
./scripts/with-node.sh npm run doctor -- --json   # то же в JSON
./scripts/with-node.sh npm run doctor -- --init   # создать корень и маркер (родитель должен существовать)
./scripts/with-node.sh npm run doctor -- --adopt  # после переноса данных на другой том
```

Переменные: `MS_ALLOW_SYSTEM_DISK=1` разрешает хранилище на системном томе,
`MS_MIN_FREE_GB` — порог свободного места (по умолчанию 10 ГиБ).

`doctor` (`03` §7) проверяет: Node ≥ 22; `claude --version` и вход (короткий `claude -p`
модели haiku без инструментов, стоимость < $0,01 — реальный вызов); `ffmpeg`/`ffprobe` (путь в
строке) и энкодеры `libx264`, `aac`, `prores_ks`; ASR (python, sha256 воркера, веса); `KB_ROOT`/`KB_SOURCE_ROOT`; StorageGuard; Chrome Headless
Shell (качает при отсутствии); `quick_check` `studio.db`; свободен ли owner-lock (при запущенном
сервере — `busy`).

## Сервер

```sh
export MS_DATA_DIR="/Volumes/External SSD/moution-studio-materials/store"
./scripts/with-node.sh npm start      # Control API + UI (web/dist) на http://127.0.0.1:8790
./scripts/with-node.sh npm run dev    # то же, UI через Vite middleware на том же порту (Q7)
```

> **Внимание: задачи в очереди запускаются сразу.** Раннер стартует до `listen` и берёт все
> `pending`-задачи из `studio.db` (и прерванные `running`, вернувшиеся в `pending` при
> восстановлении) — это возобновление после сбоя. Платные агенты могут запуститься без
> действий в UI. Сервер печатает их в журнал («в очереди при старте …» и список id), а
> `GET /api/health` отдаёт `queued_at_start: { pending, running }`. Перед первым запуском на
> хранилище со старыми задачами проверьте очередь
> (`sqlite3 "$MS_DATA_DIR/studio.db" "SELECT id, type, created_at FROM jobs WHERE status='pending'"`);
> отмена — `POST /api/jobs/:id/cancel` (идущая попытка прерывается). Отдельной команды CLI для
> отмены пока нет, режима «запуск на паузе» — тоже.

Сервер слушает только `127.0.0.1:8790`. Порт меняется в `$MS_DATA_DIR/config.json`
(`"server": { "port": 8791 }`, 1024–65535), хост — нет; обвязки Playwright (e2e-ui, приёмки)
предполагают 8790 — в их хранилищах `server.port` не задавать. Дальше в тексте 8790 — порт по умолчанию. Запросы с `Host` не из {`127.0.0.1:8790`,
`localhost:8790`} — 403 `forbidden_host`; мутации (не GET/HEAD) без `Origin`
`http://127.0.0.1:8790` / `http://localhost:8790` — 403 `forbidden_origin` (защита от DNS
rebinding и CSRF, `03` §6). Чужой `Origin` отклоняется и на GET/HEAD, а `/api/*` с
`Sec-Fetch-Site: cross-site` или `same-site` — 403 `forbidden_fetch_site` (чужая страница не
встроит превью и не подпишется на SSE). Ответы 500 — код и общий текст, подробности в журнале. Хранилище недоступно — 503 `storage_offline` на `/api/*`, кроме
`GET /api/health`. POST, создающие задачи, требуют `Idempotency-Key`. Остановка — SIGTERM/SIGINT:
API и SSE закрываются, попытки прерываются, БД закрывается, owner-lock освобождается.

Порт меняется в `config.json` → `"server": { "port": 8791 }` (целое 1024–65535, после
перезапуска; проверки `Host`/`Origin` — по этому порту). Хост не настраивается: только
`127.0.0.1`, ключ `server.host` config.json отклоняет. Из браузера (`PUT /settings`) порт не меняется.

Лимиты (`config.json` → `limits`, действуют после перезапуска): `maxRunning` 2 задачи,
`agentCalls` 5, `renders` 2, `exportTimeoutMs` 1 800 000. Настройки — `GET/PUT /api/settings`:
через API меняются только модели ролей (`agents.<роль>.model`), `limits` (1–16, таймаут
экспорта ≤ 4 ч) и `defaults`; `claudeBin`, `kb.*`, `agentRuntime`, `scene.*` и бюджеты ролей —
только правкой `config.json` руками (в теле PUT — 400).

```sh
curl -H 'Host: 127.0.0.1:8790' http://127.0.0.1:8790/api/health
```

## Приёмка Phase 1

```sh
make acceptance                                           # весь прогон (Task 22)
MS_ACC_REUSE=1 MS_ACC_ONLY=resilience,mvp make acceptance # продолжить прошлый прогон
```

Playwright через настоящий UI (`web/playwright.acceptance.config.ts`, шаги по порядку —
`web/e2e/acceptance/acceptance.list.ts`): Test 1–3 из `docs/architecture/09-acceptance-tests.md`
с реальным `claude` и рендером, перезапуск сервера, тесты устойчивости, критерии MVP. Хранилище —
отдельное `/Volumes/External SSD/moution-studio-materials/acceptance/store` (нет — создаёт `doctor --init`;
`doctor` обязан пройти). Сервер запускается с `MS_TEST_HOOKS=1`: тестовые хуки экспорта для
`09` §5 п. 8–9 включаются только этой переменной, маршрутов не добавляют, взвод — файл
`arm.json` в `MS_TEST_HOOKS_DIR` (схема проверяется, неизвестный хук — ошибка задачи). С
`MS_TEST_HOOKS=1` сервер стартует, только если `MS_DATA_DIR` — любой подкаталог `acceptance/`
папки материалов (обычно `acceptance/store`) или временный каталог юнит-тестов; рабочее
хранилище `store/` запрещено всегда, при любом `MS_MATERIALS_ROOT`. `MS_ACC_REUSE=1` берёт готовые генерации из
`tmp/acceptance/state.json`, статус задачи перечитывает через API и помечает строки
`reused: true`. Порт 8790 должен быть свободен. Итоги проверок —
`docs/evidence/phase-1/<шаг>/checks.json`, сводка — `docs/evidence/phase-1/REPORT.md`; служебное
(логи сервера, скачанные файлы, проверочные рендеры) — `tmp/acceptance/`.

Время и стоимость — справочно (подписка): раздел «Стоимость и время» в `REPORT.md`.

## Приёмка Phase 2–3 (видео)

```sh
make acceptance-video                                         # Phase 2 и Phase 3 по порядку на одном проекте
MS_ACC_REUSE=1 MS_ACC_ONLY=phase3-analysis,phase3-plan,phase3-recheck make acceptance-video # только Phase 3
MS_ACC_REUSE=1 MS_ACC_ONLY=stress make acceptance-video       # стресс: весь 66-минутный исходник (долго)
MS_ACC_REUSE=1 MS_ACC_ONLY=roughcut,restart make acceptance-video # продолжить с нужного шага
```

Playwright через настоящий UI (`web/playwright.acceptance-video.config.ts`, шаги —
`web/e2e/acceptance-video/acceptance-video.list.ts`) с реальными `claude`, ASR-воркером
ai-platform, ffmpeg и Apple Vision; хранилище — то же `/Volumes/External SSD/moution-studio-materials/acceptance/store`.
Ролик — сырой `IMG_0685.MOV` пользователя (согласие — rulings 2026-10-24): основной сценарий идёт
на копии-отрезке 7 мин (`node scripts/pick-test-video.mjs --raw` → окно с речью ≥ 50 % и паузами,
`ffmpeg -c copy` в `/Volumes/External SSD/moution-studio-materials/acceptance/src/`), оригинал только
читается, sha256 до/после сверяется. Скрипты evidence: `scripts/collect-video-evidence.mjs
<projectId> <каталог>` (JSON артефактов, видео — только sha256 и ffprobe, кадры ≤ 480 px),
`node --import tsx scripts/timing-audit.mjs <projectId>` (source↔edited и смещение звука превью
по 10 словам), `scripts/draw-zones.mjs` и `scripts/draw-plan.mjs` (кадры с зонами и раскладкой
сцен). Итоги — `docs/evidence/phase-{2,3}/<шаг>/checks.json` и `REPORT.md` там же (время и
стоимость шагов); служебное — `tmp/acceptance-video/`. Phase 3 (анализ видеоряда, смысл, план,
перепроверка) — ≈ 3 мин задач и ≈ $0,2 справочно; фрагменты и кадры для просмотра человеком —
в `examples/task34-phase3/` папки материалов.
