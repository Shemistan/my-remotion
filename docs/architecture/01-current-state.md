# 01. Текущее состояние (аудит Phase 0)

Дата аудита: 2026-10-20. Источник требований: `AI_Motion_Studio_TZ.md` v1.2
(лежит в корне main checkout `my-remotion`, в git пока не закоммичен).

Обозначения: **[Ф]** — факт, проверенный чтением кода, файлов или запуском команды;
**[Д]** — допущение или вывод, не проверенный напрямую. В Phase 0 ничего не
устанавливалось, исходные проекты не менялись.

## 1. Фактические пути

| Проект | Путь | Состояние |
|---|---|---|
| ai-platform | `/Users/stalyzade/my_track/01_It_development/ai-platform` | [Ф] существует, git `Shemistan/ai-platform`, `main` @ `0456395` (2026-10-20), ~60 worktree |
| my-remotion | `/Users/stalyzade/my_track/01_It_development/my-remotion` | [Ф] существует, git `Shemistan/my-remotion`; в `origin/main` слит PR #1 с `knowledge/` |
| Сторонние исходники KB | `my-remotion/templates/{infografika,react-libriry,remotion-components}`, `my-remotion/official_skills/` | [Ф] 18 вложенных git-клонов, **не в git** родителя (ни сабмодулей, ни скрипта клонирования) |

[Ф] Каталог в ТЗ назван `templates/react-library/`, на диске — `templates/react-libriry/`.
[Ф] Каталог `knowledge/` есть в git (ветки `main`/`staging`), а не в `templates/`.

## 2. Окружение машины

| Параметр | Значение | Как проверено |
|---|---|---|
| ОС | macOS 27.0.1 (26A434), arm64 | [Ф] `sw_vers`, `uname -m` |
| CPU / GPU | Apple M1 Pro, 10 ядер CPU, 16 ядер GPU, Metal 4 | [Ф] `sysctl`, `system_profiler` |
| RAM | 32 ГБ unified memory | [Ф] `hw.memsize` |
| Диск | 460 ГБ, **свободно 61 ГБ (занято 87 %)** | [Ф] `df -h` |
| Внешний SSD | `/Volumes/External SSD`: APFS, PCI-Express, 477 ГБ, свободно 211 ГБ, Volume UUID `DF07AEE5-03DA-4E40-9AF0-B1D03396D6BD`; в корне `local_models/` (модели ai-platform) и личные папки | [Ф] `df -h`, `diskutil info` |
| Node | v20.20.0 активна (nvm); есть v22.21.1 | [Ф] |
| npm / pnpm | 10.8.2 / 10.34.5; bun, yarn нет | [Ф] |
| Python | 3.12.0 (pyenv) | [Ф] |
| FFmpeg / ffprobe | 7.1.1 (Homebrew): libx264, h264/hevc/prores_videotoolbox, prores_ks, libvpx-vp9, aac | [Ф] `ffmpeg -encoders` |
| Chrome | `/Applications/Google Chrome.app`; кэша Remotion headless shell нет | [Ф] |
| Claude Code CLI | 2.1.304, `~/.local/bin/claude` | [Ф] |
| SQLite CLI | 3.54.0 | [Ф] |
| Docker | 24.0.7 (не нужен для MVP) | [Ф] |
| Remotion в npm | последняя 4.0.537 (2026-10-19) | [Ф] `npm view` |

Ограничения среды разработки [Ф]: сессия агента идёт в sandbox
(`.claude/settings.json`): сеть только к allowlist-доменам (npm, GitHub, Anthropic,
`storage.googleapis.com`), запись — в worktree. Git-команды за пределами worktree
блокирует worktree-изоляция.

## 3. ai-platform

### 3.1. Что это [Ф]

Локальная AI-платформа под Apple Silicon. Сервис `app/platform/` на **Python stdlib**
(`ThreadingHTTPServer`, `pyproject.toml` без зависимостей, ADR 0003), порт 8780,
только loopback. Фронтенд — ванильный JS (ES-модули, без сборки и package.json).
Хранение — файлы с атомарной записью и версией схемы (ADR 0007, 0009), БД нет.
Тяжёлые модели — подпроцессы в своих venv, общий GPU-замок `core/gate.py`
(одна модель в памяти, FIFO, только внутри процесса). Запуск: `cd app/platform && make run`
(`make demo` — фейковые модели). Сейчас **не запущена** (порт 8780 не слушается).

### 3.2. Возможности [Ф]

| Возможность | Где | Примечание |
|---|---|---|
| ASR | `montage/asr.py`, `montage/asr_worker.py` | mlx-audio 0.5.8; whisper-large-v3-turbo (по умолчанию), whisper-large-v3, qwen3-asr-1.7b + ForcedAligner |
| Изображения | `/api/photo/jobs` | flux2, qwen-image, z-image-turbo, krea-2 и др. (MLX) |
| TTS | `/api/audio/jobs` | Supertonic, ESpeech, Silero, Higgs |
| Видео | `/api/video/jobs` | LTX-2.x, Wan 2.2 (MLX) |
| «Монтаж» | `aiplatform/montage/` | модуль, в котором живёт ASR-воркер; для Motion Studio используется **только** как владелец ASR (см. §3.3) |

### 3.2а. Исключено из источников (решение человека, 2026-10-20)

Старая реализация моушн-анимации `aiplatform/motion/` — устаревший эксперимент.
Она **не является источником** требований, архитектурных, функциональных или
технических решений Motion Studio: из неё не берутся агентные роли, промпты,
пайплайны, схемы данных, способы генерации анимации и организация рендеринга.
Совместимость, миграция и объединение с ней — не цель. Код ai-platform не меняется.

Источник истины — `AI_Motion_Studio_TZ.md` v1.2. Прочие ТЗ в ai-platform
(например неотслеживаемый `MASTER_SPEC.md`) источником требований тоже не считаются.

Из ai-platform используются только независимые возможности, нужные по ТЗ §2.1:
ASR (обязательно, Phase 2) и генерация изображений (опционально).

### 3.3. ASR в деталях [Ф]

- Отдельного ASR-эндпоинта **нет**: расшифровка — этап проекта «Монтажа».
- HTTP-путь: `POST /api/montage/projects` (`mode: "manual"`, иначе после ASR сразу
  запускается LLM-план) → `POST …/sources/head` (сырое тело видео, только загрузка,
  до 16 ГБ, обязательна аудиодорожка) → `POST …/start` → опрос `GET …/{pid}` до
  `review` → `GET …/plan` → `.words`. Все POST с заголовком `X-AIP: 1`.
- CLI-путь: `<mlx-audio python> app/platform/aiplatform/montage/asr_worker.py --kind whisper
  --model <AIP_MODELS_DIR>/asr/whisper-large-v3-turbo --audio a.wav --out words.json
  --language ru [--splits …] [--hotwords "a|b"]`. Вход — WAV 16 кГц моно; прогресс
  строками `PROGRESS n stage`; воркер не импортирует платформу.
- Формат: `{"language","duration","elapsed_s","words":[{"w","s","e"}]}` — слова со
  временем и пунктуацией. **Сегментов и confidence нет.**
- В HTTP-пути язык жёстко русский (`asr.py:84`); у CLI-воркера есть `--language`.
- Длинные записи режутся по тишине на куски ≤ 300 с; лимиты 240 мин всего / 30 мин без вывода.
- Веса: `AIP_MODELS_DIR` = `/Volumes/External SSD/local_models` (внешний SSD, сейчас подключён).
- Рестарт: активные проекты → `interrupted`, автоповтора нет.

## 4. my-remotion

### 4.1. Регламент репозитория [Ф]

Скелет автономного агента: `CLAUDE.md`, `./check` (docs-гейт + `make check` в каждом
`app/<svc>/` с Makefile), `./finish` (поток `staging → main`), хуки в `.githooks/`.
Каталога `app/` пока нет — платформа будет первым сервисом.

### 4.2. Knowledge Base `knowledge/` [Ф]

- 836 записей в `knowledge/capabilities.jsonl` (1,85 МБ), по одной карточке
  `components/<repo>/<slug>.md` на запись; 12 визуальных паттернов `patterns/*.md`;
  таксономия (16 категорий, 5 классов совместимости, 17 флагов) в `taxonomy.md`.
- Запись: 21 поле (`id, name, repo, kind, category, visualizes, use_when,
  voiceover_cues[], visual_style, inputs, animations[], source_files[], docs[],
  dependencies[], remotion_compat, compat_flags[], adaptations, verification,
  patterns[], license, card`). Тексты на **русском**.
- `repositories.json`: 18 репозиториев с `url`, `commit` (совпадает с HEAD клонов),
  `license`, `remotion_relation`.
- Совместимость: native 228 (из них компонентов `kind=component` — **23**, остальное
  шаблоны 59, примеры 50, документация 80), adaptable 386, complex 210, unsuitable 9, unknown 3.
- `verification` = `static-review` у **всех** 836; `knowledge/compatibility/results.jsonl` **пуст** —
  ни одна запись не отрендерена.
- Пути `source_files` (1540) и локальные `docs` (922) разрешаются **все** — от корня main checkout.
- `tools/kb.py`: только `check`, `stats`, `build`, `patterns`. **Поиска и JSON-вывода нет**,
  формальной JSON Schema нет (схема в коде `kb.py` и в `knowledge/README.md`).
  `kb.py check` → «836 записей, ошибок нет» (0,43 с).
- Смоук-поиск наивным keyword-скриптом (6–10 мс): по «animated counter» топ точный;
  «architecture diagram … pulses» **не находит** `magicui/animated-beam` по-английски
  (по-русски находит вторым); «typography» не встречается ни в одной записи.

### 4.3. Remotion-исходники и skills [Ф]

- `official_skills/skills` (`remotion-dev/skills` @ `039e8a2`) и
  `official_skills/claude-code-plugin` (@ `60ee408`, MIT) — 12 skills версии **4.0.537**:
  правила детерминизма (`useCurrentFrame`/`interpolate`, без CSS-transition и `animate-*`),
  шрифты (`@remotion/google-fonts`, `@remotion/fonts`), 3D (`@remotion/three`, без `useFrame`),
  прозрачный экспорт (ProRes 4444 `yuva444p10le` или VP9 `yuva420p`).
- Remotion-native репозитории: free-remotion-templates (4.0.518, MIT, 50 шаблонов),
  remotion-video-templates (4.0.200, MIT, zod + `calculateMetadata`), remotion-bits
  (MIT, библиотека AnimatedCounter/AnimatedText/Scene3D/…), remotion-boilerplate
  (**UNLICENSED** — только как референс).
- Разброс версий Remotion: 4.0.200 … 4.0.537. **`node_modules` нет нигде** —
  ни один проект не готов к рендеру без установки.
- React-библиотеки (animata, magicui, motion-primitives, react-bits и др.) построены на
  времени (motion, gsap, rAF), для Remotion их надо переписывать на кадры.
  react-bits — MIT + Commons Clause.
- Готового Remotion-native компонента «схема с импульсами по связям» **нет**; ближайшие —
  `magicui/animated-beam` (adaptable) и техники `strokeDashoffset` из free-remotion-templates.
- Размер: remotion-components 52 МБ; infografika 4,4 ГБ (recharts `.git` 3,5 ГБ); react-libriry 890 МБ.

## 5. Claude Code headless [Ф]

Проверено запуском (стоимость смоуков ≈ $0,003):

1. `claude -p … --output-format json --json-schema '<schema>'` возвращает
   `structured_output`, `total_cost_usd`, `usage`, `modelUsage` (имя модели),
   `permission_denials`, `num_turns`, `session_id`, `is_error`.
2. `--restricted --tools "Read,Write,Edit,Glob,Grep" --permission-mode acceptEdits`:
   файл в рабочем каталоге создан; чтение `~/.zshrc` **отказано** и попало в
   `permission_denials`; Bash недоступен.
3. `--strict-mcp-config` отключает MCP-серверы пользователя; `--no-session-persistence`
   не сохраняет сессию.
4. В `--restricted` прогоне из подкаталога репозитория модель сообщила, что
   CLAUDE.md не загружен ([Д] — самоотчёт модели, не инструментальная проверка).
5. Авторизация — OAuth-подписка пользователя (keychain). `--bare` читает только
   `ANTHROPIC_API_KEY`/`apiKeyHelper` и OAuth не видит — с подпиской не подходит.

## 6. Выводы для архитектуры

1. **Размещение:** бэкенд ai-platform — Python stdlib без сборки фронтенда, а ТЗ требует
   Remotion, React/TS и Knowledge Base из my-remotion. Поэтому Motion Studio — отдельное
   Node/TS-приложение, ai-platform — поставщик ASR и изображений (`03-target-architecture.md` §1).
2. ASR переиспользуем как **CLI-воркер** ai-platform (слова + время), сегменты строим сами,
   confidence честно `unknown`.
3. KB пригодна как каталог, но нужен свой поиск (двуязычный), нормализация лицензий,
   commit из `repositories.json` и первые реальные рендеры для `tested_status`.
4. Remotion-проекта для рендера нет — создаём свой render-пакет, закрепив 4.0.537.
5. Headless Claude Code в `--restricted` даёт безопасную основу рантайма агентов.
6. Свободного диска 61 ГБ — достаточно для Playground, мало для работы с видео (Phase 2+).
