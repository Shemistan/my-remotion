---
тип: adr
статус: принято
обновлено: 2026-10-25
---

# Переносимая установка: `./setup` ставит зависимости в проект, тяжёлое — на SSD

**Контекст.** До S19 приложение опиралось на окружение одной машины: Node — из nvm, ffmpeg —
из Homebrew в PATH, воркер ASR и его Python-окружение — из соседнего репозитория ai-platform
(`~/.local/share/montage/mlx-audio-0.5.8`), веса Whisper — в его папке
`/Volumes/External SSD/local_models`. Цель человека (2026-10-25): «все зависимости проекта лежали
в одном месте, и только тяжёлые файлы — условное хранилище — лежало уже на ssd. Я должен
склонировать проект на другом компьютере, запустить его и начать работать».

**Решение.**
- Зависимости — в `<repo>/.deps/` (в .gitignore), их ставит идемпотентный `./setup`: Node из
  `.nvmrc` (официальный tarball darwin-arm64, sha256 закреплён и сверяется с SHASUMS256),
  ffmpeg + ffprobe, uv → Python 3.12 → окружение ASR `asr-venv` по
  `app/motion-studio/tools/asr-worker/requirements.lock`. npm-пакеты с Chrome Headless Shell и
  `vision-detect` — как раньше, `make install`. Версии и sha256 — `tools/setup/manifest.sh`.
- **1а.** Воркер ASR скопирован в проект (`app/motion-studio/tools/asr-worker/asr_worker.py`, без
  изменений: sha256 = закреплённый контракт). ai-platform на новой машине не нужен и не меняется;
  `asr.aiPlatformRoot`/`AI_PLATFORM_ROOT` оставлены для совместимости (воркер из ai-platform).
- **2а.** ffmpeg — закреплённая статическая сборка 7.1.1 (Martin Riedl, macOS arm64), а не brew.
- Тяжёлое — в папке материалов на SSD: веса — `moution-studio-materials/models/asr/<модель>`
  (те же репозитории и ревизии Hugging Face, что у ai-platform; лежат в `local_models` — копия
  clonefile, папка ai-platform только читается), хранилище — `store/` (`doctor --init`).
- Порядок поиска: `.deps` (и `.deps` main checkout для worktree агента) → env/config.json → PATH,
  nvm и прежние места ai-platform как запасной путь; `doctor` показывает его строкой
  `warning deps`. Умолчание выбирается по признаку готовности, а не по наличию пути: окружение
  ASR — по штампу `.ms-lock`, веса — по `config.json` и файлу весов модели `asr.model`. `./setup` первым делом проверяет систему (arm64, Command Line Tools, `claude`
  и вход, подключённый SSD) и при отказе ничего не ставит; без SSD не пишет на системный диск.

**Лицензия ffmpeg.** Сборка собрана с `--enable-gpl` (libx264, libx265 и др.) — это GPL. Для
личного использования на своей машине ограничений нет. Распространять приложение вместе с этой
сборкой (архив, установщик) можно только с соблюдением GPL (исходники, текст лицензии) — или
заменить сборку на LGPL-вариант без libx264.

**Последствия.** Новый компьютер: `git clone` → `./setup` → `./studio`. `.deps` ≈ 1,5–2,5 ГБ на
системном диске, веса ≈ 1,6 ГБ на SSD. Поднять версию инструмента — правка `manifest.sh` (URL и
sha256) и повторный `./setup`; окружение ASR пересоздаётся при смене lock-файла. Исходники KB
(`./setup --kb`) — по `tools/setup/kb-sources.tsv` (полные коммиты тех же, что в
`knowledge/repositories.json`), клоны без истории.
