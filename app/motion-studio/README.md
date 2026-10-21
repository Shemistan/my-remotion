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
| `server` (`@ms/server`) | CLI `doctor` |

## Node

Нужен Node из `.nvmrc` (22.21.1) через nvm. Все команды — через обёртку:

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
- Кадры галереи хореографии kit пересобирает `scripts/kit-evidence.mts` (см.
  `render/src/motion-kit/PROVENANCE.md`).

## Хранилище и doctor

Все данные приложения — только в `MS_DATA_DIR` (ADR 0006); значения по умолчанию нет.
Для этой машины: `/Volumes/External SSD/MotionStudio`.

```sh
export MS_DATA_DIR="/Volumes/External SSD/MotionStudio"
./scripts/with-node.sh npm run doctor             # хранилище + Chrome Headless Shell (качает при отсутствии); код 1 при сбое
./scripts/with-node.sh npm run doctor -- --init   # создать корень и маркер (родитель должен существовать)
./scripts/with-node.sh npm run doctor -- --adopt  # после переноса данных на другой том
```

Переменные: `MS_ALLOW_SYSTEM_DISK=1` разрешает хранилище на системном томе,
`MS_MIN_FREE_GB` — порог свободного места (по умолчанию 10 ГиБ).
