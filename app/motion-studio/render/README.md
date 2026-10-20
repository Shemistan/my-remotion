# @ms/render

Рендер версии сцены на Remotion 4.0.537 (ADR 0004): бандл → стоп-кадры → превью
H.264 → ffprobe. Зависит только от `@ms/core` и `@ms/contracts`.

## API

| Функция | Что делает |
|---|---|
| `ensureRenderBrowser()` | Chrome Headless Shell через `ensureBrowser()`; качает при отсутствии. Только CLI (`doctor`) и e2e: на время вызова меняет `process.cwd()` — в сервере не звать |
| `findRenderBrowser()` | Путь к уже скачанному браузеру без сети и без смены cwd; нет или не та версия — Error «запусти doctor» |
| `contentKey(versionDir)` | sha256 `src/**` (относительный путь + байты) и `props.json`; плюс версия Remotion, исходники `entry.ts` и `worker.ts` (шаблон entry и опции `bundle()`) и содержимое motion-kit |
| `writeEntry(versionDir, cacheDir, settings)` | `<cacheDir>/entries/<key>/index.tsx`: `registerRoot` + `<Composition id="Scene">` |
| `renderVersion(req, signal?)` | Рендер в отслеживаемом дочернем процессе, см. ниже |
| `ffprobe(path)` / `probeGate(probe, settings, scale)` | Проба файла и сверка: длительность ± 1 кадр, размеры как у Remotion для H.264 (`h264Size`: чётные, 1350 × 0.5 → 674), fps дробью, h264 |
| `reapStrayRenderers(root)` | Восстановление под owner lock: процессы с `<root>/run/tmp/` в командной строке — SIGTERM, через 5 с SIGKILL, ждать до 30 с; возвращает выживших |

Сцена экспортирует компонент `Scene` (именованный экспорт; default тоже принимается)
из `src/Scene.tsx`; `props.json` — JSON-объект, он же `defaultProps` и `inputProps`.

## motion-kit

`src/motion-kit/` — библиотека компонентов сцен (`@ms/motion-kit`). Справка для агента
лежит в `API.md`, происхождение — в `PROVENANCE.md`.

- В бандле алиас `@ms/motion-kit` указывает на этот каталог. Импорты внутри kit пишутся
  с `.js`, как во всём пакете (NodeNext). webpack находит одноимённый `.ts`/`.tsx` через
  `resolve.extensionAlias` в `worker.ts`. Для `tsc` пакета фикстуры сцен видят kit через
  `paths` в `tsconfig.json`.
- Шрифты (`fonts/*.woff2`, OFL) лежат внутри kit и импортируются как ассеты webpack.
  Поэтому они попадают в contentKey и не зависят от `public/` версии.
  `../scripts/sync-fonts.mjs` копирует их из `@fontsource/*`.
- Файлы kit проходят статическую проверку сцен без нарушений
  (`server/test/scenes/kit-static.test.ts`).
- Галерея — фикстура `test/fixtures/kit-gallery` (все компоненты, 1920×1080, 150 кадров,
  пресет из props). Её e2e — `test/kit/gallery.e2e.test.ts`; там же
  `test/fixtures/kit-degenerate`: все компоненты на битах нулевой длины и обратных.

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
   временный файл → `rename` в `preview.mp4`. `timeoutInMilliseconds` Remotion чуть
   меньше внешнего (`innerTimeoutMs`: −10%, не меньше 2 с), так что зависший
   `delayRender` обычно падает с понятной ошибкой (`stage: "timeout"`) до убийства группы.
5. После выхода worker: Chrome попытки добивается и его записи закрываются (ниже),
   недоделки мёртвых worker (`bundles/<key>.tmp-<pid>`, `.preview-<pid>.tmp.mp4`) удаляются.
6. ffprobe превью — тоже через `spawnTracked`.

Отмена (`signal`) проверяется после каждого `await` подготовки: отмена до запуска worker
не теряется и возвращает `aborted` без spawn.

Протокол stdout worker: `@@ms:stage <bundle|still|media>` и `@@ms:log <json>` по ходу
работы, последней строкой — JSON-результат. Поэтому при таймауте логи браузера и этап
падения остаются у родителя.

### Этапы ошибок (`error.stage`)

| stage | Когда |
|---|---|
| `bundle` / `still` / `media` | Ошибка в worker на этом этапе (или его падение без результата — по последнему начатому этапу); битые исходники версии — `bundle`, кадры вне сцены — `still` |
| `probe` | ffprobe не отработал или вывод не разобран |
| `timeout` | Не уложились в `timeoutMs` (SIGTERM группе, через 5 с SIGKILL) или раньше сработал таймаут `delayRender` внутри Remotion |
| `aborted` | Сработал `signal` вызывающего |
| `orphaned` | Группа worker/ffprobe или Chrome не исчезла после SIGKILL. Попытка не завершена: записи в `run/processes/` оставлены (их добьёт `reapStale`), Chrome без записи найдёт `reapStrayRenderers`, `run/tmp/…` попытки переименован в `*.quarantined`. Ни успехом, ни обычной ошибкой это считать нельзя (ADR 0007, `stale_process`) |

`probeGate` renderVersion не применяет — это делает вызывающий по `probe`.

### Chrome вне группы worker

Remotion запускает Chrome с `detached: true` — в собственной группе процессов, и
убийство группы worker его не задевает. Защиты:

1. **Запись в реестре.** `browserExecutable` — `chrome-wrapper.sh`: до старта Chrome он
   пишет `run/processes/<runId>-a<attempt>-<pid>.json` (формат fileProcessRegistry,
   pgid = свой pid — он лидер группы, `startedAt` — как у `procInfo`) и exec-ает
   `chrome-headless-shell` с теми же аргументами. После выхода worker renderVersion
   добивает живые группы Chrome и удаляет запись только когда группа подтверждённо
   исчезла (ожидание 30 с, как у spawnTracked). Если сервер упал вместе с worker,
   Chrome остаётся обычной записью, и `reapStale(root, runId)` его убивает (e2e).
2. **Поиск по TMPDIR.** Профиль Chrome лежит в TMPDIR попытки (`--user-data-dir`):
   renderVersion после worker бьёт SIGKILL группы процессов с этим путём в командной
   строке. `reapStrayRenderers(root)` делает то же для всего `<root>/run/tmp/` при
   восстановлении. Группы с pgid ≤ 1 и наша собственная не трогаются никогда.
3. Worker на SIGTERM сразу выходит, и обработчик `exit` Remotion закрывает Chrome сам.

## Как запускается worker.ts

Встроенным стиранием типов Node 22.18+ (`node --disable-warning=ExperimentalWarning
worker.ts`; в 22.21.1 включено по умолчанию). Ни tsx, ни шага сборки: меньше
зависимостей в рантайме и нечему устаревать. Цена — в `worker.ts` нельзя рантайм-импорты
из локальных `.js`-путей (Node не подменяет расширение), только `import type`, `node:*`
и `@remotion/*`; общие типы — в `protocol.ts`. На Node без стирания типов renderVersion
бросает исключение.

## Сеть

Рендер в сеть не ходит, и это обеспечено, а не случайно:

- Chrome закрыт от сети. `chromiumOptions` Remotion прокси не настраивает, а его собственные
  `--no-proxy-server --proxy-server='direct://'` перебили бы флаг, поэтому
  `chrome-wrapper.sh` выкидывает их и добавляет `--proxy-server=127.0.0.1:9` (discard:
  соединение отклоняется). loopback Chrome не проксирует, так что бандл с локального
  сервера Remotion и ассеты из него грузятся. E2e `net-scene`: `<Img>` локального png
  рендерится, а `fetch` на `https://example.com/` и `http://1.1.1.1/` — `blocked`; без
  флага тот же тест видит `open`.
- Браузер передаётся путём; качает его только `ensureRenderBrowser` (doctor) в
  `app/motion-studio/node_modules/.remotion/`.
- `licenseKey` не передаётся — с ним Remotion шлёт usage-событие; кэш webpack выключен.

## fps дробью

Remotion принимает fps числом; worker передаёт `num / den`. ffmpeg приводит его к дроби
сам: e2e на 30000/1001 даёт `r_frame_rate` ровно `30000/1001`, gate проходит.

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
| 4 (после fix round 1, с обёрткой Chrome) | 9,1 с | 2,6 с | 1,9 с | 15,1 с |

Сборка бандла (webpack) — около 10 с (разница первого и повторного прогона); дальше
кэш по contentKey.
Загрузка Chrome Headless Shell (один раз, doctor) — 18 с.
