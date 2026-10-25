# Воркер ASR (копия из ai-platform)

`asr_worker.py` — CLI-воркер расшифровки: wav 16 кГц моно → слова со временем (JSON). Скопирован
без изменений из ai-platform (решение 1а, ADR 0008), чтобы приложению не нужен был соседний
репозиторий. Код ai-platform не менялся.

| | |
|---|---|
| Откуда | `ai-platform/app/platform/aiplatform/montage/asr_worker.py` |
| Коммит ai-platform | `e3024ac8ff250a02bf21a8229c4c1706c40ffd44` (последний, менявший файл); HEAD при копировании — `99f75d6626a5525b165e8e0f74f99adf3e80cc15` |
| sha256 | `59b7e03bf5a8b7f940b2607d357528e7120f5bb6bbe98efa70de4b39bdce1073` (= `ASR_WORKER_SHA256` в `server/src/config.ts`) |
| Скопирован | 2026-10-25 (S19) |
| Лицензия | MIT (`ai-platform/LICENSE`, © 2026 Shemistan) — владелец тот же, что у этого репозитория; копирование разрешено |

Импортов ai-platform в воркере нет: только стандартная библиотека и (внутри функций) `numpy`,
`mlx_audio`. Контракт CLI и вывода закреплён sha256 — сервер сверяет его перед запуском
(`asr_contract_changed`); тест `config-video.test.ts` сверяет копию с `ASR_WORKER_SHA256`.
Правка файла — новая версия контракта: сверить вывод и обновить sha256.

`requirements.lock` — `uv pip freeze` окружения mlx-audio 0.5.8 ai-platform (Python 3.12) с
sha256 каждого дистрибутива (`uv pip compile --generate-hashes`, команда — в шапке файла);
`./setup` ставит ровно его в `<repo>/.deps/asr-venv` (`uv pip sync --require-hashes`).
