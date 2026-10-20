# @ms/render

Рендер версии сцены на Remotion 4.0.537 (ADR 0004): бандл → стоп-кадры → превью
H.264 → ffprobe. Зависит только от `@ms/core` и `@ms/contracts`.

## API

| Функция | Что делает |
|---|---|
| `ensureRenderBrowser()` | Chrome Headless Shell через `ensureBrowser()`; качает при отсутствии. Зовёт `npm run doctor` |
| `findRenderBrowser()` | Путь к уже скачанному браузеру без сети; нет или не та версия — Error «запусти doctor» |
| `contentKey(versionDir)` | sha256 `src/**` (относительный путь + байты) и `props.json`; плюс версия Remotion, шаблона entry и содержимое motion-kit |
| `writeEntry(versionDir, cacheDir, settings)` | `<cacheDir>/entries/<key>/index.tsx`: `registerRoot` + `<Composition id="Scene">` |
| `renderVersion(req, signal?)` | Рендер в отслеживаемом дочернем процессе, см. ниже |
| `ffprobe(path)` / `probeGate(probe, settings, scale)` | Проба файла и сверка: длительность ± 1 кадр, размеры × scale, fps, h264 |

Сцена экспортирует компонент `Scene` (именованный экспорт; default тоже принимается)
из `src/Scene.tsx`; `props.json` — JSON-объект, он же `defaultProps` и `inputProps`.

## Как устроен renderVersion

1. Проверки до запуска: кадры в `0..duration_frames-1`, исходники версии (`src/`,
   `props.json`) → иначе `ok:false` (`still` / `bundle`). Нет браузера, ffprobe,
   хранилища — исключение: рендер невозможен в принципе.
2. `writeEntry`; каталоги `<versionDir>/frames`, `<cacheDir>/{entries,bundles}` —
   по одному уровню; `run/tmp` — через `safeMkdir`.
3. `worker.ts` через `spawnTracked` (своя группа, запись в `run/processes/`). Env —
   только `PATH`, `HOME`, `LANG` и `TMPDIR=<root>/run/tmp/<runId>-a<attempt>-*`:
   временные файлы Remotion и профиль Chrome лежат в хранилище, не на системном диске.
   Задание — JSON в stdin.
4. Worker: `bundle()` (кэш `<cacheDir>/bundles/<key>`, сборка во временный каталог и
   `rename`; кэш webpack выключен) → `openBrowser` → `selectComposition` → настройки
   поверх композиции → `renderStill` PNG → `renderMedia` H.264 (`crf`, `scale`) во
   временный файл → `rename` в `preview.mp4`.
5. ffprobe превью — тоже через `spawnTracked`.

Протокол stdout worker: `@@ms:stage <bundle|still|media>` и `@@ms:log <json>` по ходу
работы, последней строкой — JSON-результат. Поэтому при таймауте логи браузера и этап
падения остаются у родителя.

### Этапы ошибок (`error.stage`)

| stage | Когда |
|---|---|
| `bundle` / `still` / `media` | Ошибка в worker на этом этапе (или его падение без результата — по последнему начатому этапу); битые исходники версии — `bundle`, кадры вне сцены — `still` |
| `probe` | ffprobe не отработал или вывод не разобран |
| `timeout` | Не уложились в `timeoutMs`: SIGTERM группе, через 5 с SIGKILL |
| `aborted` | Сработал `signal` вызывающего |
| `orphaned` | Группа worker/ffprobe или Chrome не исчезла после SIGKILL. Попытка не завершена, запись в `run/processes/` оставлена для `reapStale`; ни успехом, ни обычной ошибкой это считать нельзя (ADR 0007, `stale_process`) |

`probeGate` renderVersion не применяет — это делает вызывающий по `probe`.

### Chrome вне группы worker

Remotion запускает Chrome с `detached: true` — в собственной группе процессов, и
убийство группы worker его не задевает. Две защиты: worker на SIGTERM сразу выходит,
и обработчик `exit` в Remotion добивает группу Chrome; если worker убит SIGKILL,
renderVersion находит процессы с TMPDIR попытки в командной строке (`--user-data-dir`)
и бьёт их группы SIGKILL; не исчезли за 5 с — `orphaned`. E2e-тест убивает worker
SIGKILL и проверяет, что Chrome не остался.

## Как запускается worker.ts

Встроенным стиранием типов Node 22.18+ (`node --disable-warning=ExperimentalWarning
worker.ts`; в 22.21.1 включено по умолчанию). Ни tsx, ни шага сборки: меньше
зависимостей в рантайме и нечему устаревать. Цена — в `worker.ts` нельзя рантайм-импорты
из локальных `.js`-путей (Node не подменяет расширение), только `import type`, `node:*`
и `@remotion/*`; общие типы — в `protocol.ts`. На Node без стирания типов renderVersion
бросает исключение.

## Сеть

Рендер в сеть не ходит: браузер передаётся путём (`browserExecutable`), качает его
только `ensureRenderBrowser` (doctor) в `app/motion-studio/node_modules/.remotion/`;
`licenseKey` не передаётся — с ним Remotion шлёт usage-событие; кэш webpack выключен.
Сетевые запросы самой сцены отсекает статическая проверка (Task 5).

## Версии

`remotion`, `@remotion/bundler`, `@remotion/renderer`, `@remotion/fonts` — точно 4.0.537.
Peer-зависимость Remotion — `react >=16.8.0`, точной версии в ней нет; закреплены
`react`/`react-dom` 19.2.3 — версия из devDependencies `remotion@4.0.537`, на которой
Remotion собран и протестирован.

## Время рендера

hello-scene: 640×360, 30 fps, 60 кадров, 3 стоп-кадра PNG, превью scale 1, CRF 23.
Apple M1 Pro (10 ядер), Node 22.21.1, `make e2e`, хранилище и кэш в `tmp/` репозитория
(системный SSD); браузер уже скачан.

| Прогон | Первый (сборка бандла) | Повтор (бандл из кэша, копия версии) | scale 0.5, 45 кадров, 1 кадр | hang-scene, таймаут 15 с |
|---|---|---|---|---|
| 1 | 13,6 с | 2,8 с | 2,1 с | 15,1 с |
| 2 | 12,9 с | 2,7 с | 2,0 с | 15,1 с |
| 3 | 13,5 с | 5,9 с | 3,0 с | 15,1 с |

Сборка бандла (webpack) — около 10 с (разница первого и повторного прогона); дальше
кэш по contentKey.
Загрузка Chrome Headless Shell (один раз, doctor) — 18 с.
