# 02. Карта интеграций

Что переиспользуем, что создаём, и через какую точку подключаемся.
**[Ф]** — проверено в Phase 0, **[Д]** — допущение, проверяется в указанной задаче.

## 1. Диаграмма зависимостей

```text
                      ┌──────────────────────────── my-remotion (git) ─────────────────────────────┐
                      │                                                                            │
  Браузер ── HTTP ──▶ │  app/motion-studio  (НОВОЕ, Node 22 + TS)                                  │
                      │   ├─ web/      React UI (Vite)                                             │
                      │   ├─ server/   Control API + Job Orchestrator + SQLite                     │
                      │   │    ├─ KnowledgeAdapter ──read──▶ knowledge/*.jsonl, *.md  [Ф есть]     │
                      │   │    │                    ──read──▶ templates/**, official_skills/**      │
                      │   │    │                              (вне git, read-only)    [Ф есть]     │
                      │   │    ├─ AgentRuntimeAdapter ──spawn──▶ claude -p --restricted [Ф работает]│
                      │   │    ├─ RenderWorker ──spawn──▶ render/ (Remotion 4.0.537)  [создаём]     │
                      │   │    │                 └─▶ Chrome Headless Shell (скачает Remotion)       │
                      │   │    ├─ MediaTools ──spawn──▶ ffmpeg / ffprobe 7.1.1       [Ф есть]       │
                      │   │    └─ AsrAdapter (Phase 2) ──spawn──┐                                  │
                      │   ├─ render/   Remotion-проект + motion-kit                                │
                      │   └─ contracts/ Zod-схемы → JSON Schema                                    │
                      └─────────────────────────────────────────┼──────────────────────────────────┘
                                                                │
                      ┌──────────── ai-platform (read-only, не меняем) ─────────────┐
                      │  app/platform/aiplatform/montage/asr_worker.py   [Ф]        │
                      │  mlx-audio venv ~/.local/share/montage/mlx-audio-0.5.8 [Ф]  │
                      │  веса /Volumes/External SSD/local_models/asr/   [Ф]         │
                      │  (опц.) HTTP :8780 /api/photo/jobs — изображения [Ф]         │
                      └─────────────────────────────────────────────────────────────┘

  Данные: MS_DATA_DIR (обязателен; внешний SSD, напр. /Volumes/External SSD/MotionStudio)
          — studio.db, workspace/, cache/, logs/ — вне git, под StorageGuard
```

## 2. Что переиспользуем

| Актив | Как используем | Фаза | Статус |
|---|---|---|---|
| `knowledge/capabilities.jsonl`, `repositories.json`, `patterns/*.md`, карточки | Источник `KnowledgeAdapter` (чтение в память, без копирования) | 1 | [Ф] |
| `templates/**`, `official_skills/**` | Источник исходников для адаптации; файлы-референсы копируются в workdir агента | 1 | [Ф] |
| Официальные Remotion skills 4.0.537 (`remotion-markup` и др.) | Выдержки правил вшиваются в системный промпт Engineer и в QA-чеклист | 1 | [Ф] |
| `tools/kb.py check` | Валидация каталога остаётся в `./check`; адаптер не дублирует проверки | 1 | [Ф] |
| Техники free-remotion-templates / remotion-video-templates / remotion-bits | Базис motion-kit: счётчик, линия/бар-график, обводка пути, kinetic text, Scene3D | 1 | [Ф] MIT |
| Claude Code CLI 2.1.304 | Рантайм агентов через `AgentRuntimeAdapter` | 1 | [Ф] |
| FFmpeg 7.1.1 | Финальное кодирование (Remotion использует свой встроенный ffmpeg), ffprobe, прокси, waveform | 1–5 | [Ф] |
| `ai-platform/.../asr_worker.py` + mlx-audio venv + веса | `AsrAdapter` вызывает CLI-воркер подпроцессом | 2 | [Ф] код, [Д] запуск из чужого процесса |
| `ai-platform /api/photo/jobs` | Опциональная генерация изображений-ассетов, только если платформа запущена | 4+ | [Ф] API, [Д] стабильность контракта |
| Протокол прогресса `PROGRESS n stage` ASR-воркера | Часть контракта CLI-воркера: парсим его в прогресс задачи | 2 | [Ф] |

## 3. Что не переиспользуем и почему

| Актив | Причина |
|---|---|
| HTTP-сервер и фронтенд ai-platform | stdlib-сервер и ванильный JS без сборки; Remotion и React-компоненты требуют Node-тулчейна. Встраивание потребовало бы второго рантайма внутри ai-platform. |
| `aiplatform/motion/` (устаревший эксперимент) | Исключён решением человека из источников требований и решений (`01-current-state.md` §3.2а); не используется ни как код, ни как референс |
| HTTP-путь ASR «Монтажа» | Копирует видео (гигабайты) в данные ai-platform, язык жёстко `ru`, требует запущенную платформу. CLI-путь проще и принимает `--language`. |
| `tools/kb.py build/patterns` | Перезаписывают файлы каталога; адаптер только читает. |
| remotion-boilerplate | UNLICENSED — только как референс, код не копируем. |

## 4. Точки интеграции

### 4.1. Knowledge Base (Phase 1)

- Вход: `KB_ROOT` = `<repo>/knowledge`, `KB_SOURCE_ROOT` = main checkout
  `my-remotion` (там лежат `templates/` и `official_skills/`). Оба — настройки.
- Загрузка: `capabilities.jsonl` + `repositories.json` + `compatibility/results.jsonl`
  в память при старте (836 записей, ≈2 МБ); перечитывание по mtime.
- Выдача по контракту §9 ТЗ (имена полей `CapabilityView`): `repository`, `repository_url`,
  `commit` (джойн с `repositories.json`), `license` + нормализованный `license_class`,
  `source_paths[]`, `documentation_paths[]` (у записи KB обычно несколько файлов, поэтому
  `source_path`/`documentation_path` из ТЗ — списки), `compatibility_status`
  (= `remotion_compat`), `tested_status` (= `verification` или результат из
  `results.jsonl`), `confidence` (вычисляемое правило или `unknown`).
- Отсутствующий исходник → `exists: false`, а не исключение.
- Запись результатов рендер-проверок — в `PROVENANCE.md` motion-kit (срез, без БД), затем
  в собственную таблицу `component_tests` в SQLite платформы (P1-03). В `knowledge/compatibility/results.jsonl` пишет только
  человек или отдельная задача с PR (KB — артефакт репозитория).

### 4.2. ASR (Phase 2)

```text
AsrAdapter.transcribe(mediaAssetId, {language, model, hotwords})
  1. ffmpeg -i source -ac 1 -ar 16000 -c:a pcm_s16le audio16k.wav
  2. spawn <AIP_MONTAGE_ASR_PYTHON> <AI_PLATFORM_ROOT>/app/platform/aiplatform/montage/asr_worker.py
        --kind whisper --model <AIP_MODELS_DIR>/asr/whisper-large-v3-turbo
        --audio audio16k.wav --out words.json --language <lang> [--splits …] [--hotwords …]
  3. парсинг PROGRESS → прогресс job; таймаут; отмена = SIGTERM
  4. words.json → Transcript{words[w,s,e], segments (строим по паузам/пунктуации), confidence: unknown}
```

- Пути `AI_PLATFORM_ROOT`, `AIP_MONTAGE_ASR_PYTHON`, `AIP_MODELS_DIR` — настройки.
- Фиксируем коммит ai-platform, с которым проверен контракт (`asr_contract_commit` в
  манифесте транскрипта); при расхождении версии схемы — ошибка, а не тихий парсинг.
- Capability detection: нет venv / весов / внешнего SSD → статус `unavailable` с причиной.
- Конфликт за память GPU, если одновременно работает ai-platform: GPU-замок
  ai-platform внутрипроцессный и нас не видит. Мера — свой семафор «одна тяжёлая
  модель» + предупреждение в UI, если порт 8780 занят ([Д], проверить на Phase 2).

### 4.3. Claude Code (Phase 1)

См. `04-agent-workflows.md` §5. Точка интеграции — исполняемый `claude`
(путь из настройки `CLAUDE_BIN`), авторизация — существующий логин пользователя.

### 4.4. Remotion и FFmpeg (Phase 1)

- Новый пакет `app/motion-studio/render/` с точно закреплёнными `remotion`,
  `@remotion/bundler`, `@remotion/renderer`, `@remotion/fonts` = **4.0.537** (`@remotion/cli` не нужен:
  браузер ставится через `ensureBrowser()` из `@remotion/renderer`).
- Рендер через `@remotion/renderer` (`bundle` → `selectComposition` →
  `renderMedia`/`renderStill`) в дочернем процессе, по одному на задачу.
- Chrome Headless Shell скачивается Remotion при первом рендере
  (`storage.googleapis.com` — в allowlist sandbox).

## 5. Внешние сетевые зависимости

| Куда | Когда | Обязательно |
|---|---|---|
| `registry.npmjs.org` | установка зависимостей | один раз |
| `storage.googleapis.com` | скачивание Chrome Headless Shell | один раз |
| `api.anthropic.com` | вызовы агентов | да, для генерации |
| `fonts.googleapis.com` / `fonts.gstatic.com` | только если используем `@remotion/google-fonts` | **нет** — шрифты кладём локально (см. `06-motion-engine.md` §4) |

Сгенерированный код сцены сетевых обращений делать не может (см. `03-target-architecture.md` §6).
