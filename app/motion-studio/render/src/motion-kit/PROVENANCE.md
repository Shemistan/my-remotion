# Происхождение motion-kit (v0.1 → v0.2)

Весь код kit написан заново и считается от кадра. Из источников взяты приёмы и идеи,
а не файлы: ни один файл и ни один фрагмент кода не скопирован. Лицензии и коммиты
взяты из `knowledge/repositories.json`, идентификаторы — из `knowledge/capabilities.jsonl`.
`kb_id` = `own` — своя разработка без внешнего источника. Сверку таблиц с KB (запись
есть, лицензия permissive, commit совпадает, у каждого компонента `components/*` есть
строка) делает `server/test/scenes/kit-provenance.test.ts`.

Restricted-источники не использовались даже как идея: `react-bits` (MIT + Commons
Clause) и `remotion-boilerplate` (UNLICENSED).

`rendered` — итог реального рендера в галерее `render/test/fixtures/kit-gallery`
(1920×1080, 150 кадров, три пресета) и просмотра кадров глазами 2026-10-20. Кадры
лежат в `docs/evidence/phase-1/slice/kit/`.

| Компонент | kb_id | Репозиторий @ commit | Лицензия | Что взято | rendered |
|---|---|---|---|---|---|
| `AnimatedNumber` | `remotion-bits/animated-counter` | remotion-bits @ de35fda | MIT (package.json) | приём: значение = интерполяция с easing, фиксированное число знаков | ok |
| | `free-remotion-templates/kpi-counter` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | идея автоматического выбора K/M в сокращении (у нас — `formatNumber` с «тыс./млн/млрд», своя реализация) | ok |
| | `remotion-motion-graphics-skill/traps` | remotion-motion-graphics-skill @ 1fc2869 | MIT (LICENSE) | правила: clamp при интерполяции кадра, tabular-nums против дрожания цифр | ok |
| `LineChart` | `free-remotion-templates/line-chart-anim` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём: рисование линии через `strokeDasharray/strokeDashoffset` от кадра; точки вспыхивают, когда линия до них доходит; подписи X проявляются вслед. Добавлено своё: монотонная кривая, LUT-длина, «голова», заливка через clipPath, пульс и выноска | ok |
| | `remotion-video-templates/line-chart-draw` | remotion-video-templates @ 9014946 | MIT (LICENSE) | идея оси Y от 0 до максимума с сеткой; у нас «круглые» деления `niceTicks` | ok |
| `FlowGraph` | `xyflow/edge-path-utils` | xyflow @ 654ba5a5e | MIT (LICENSE) | идея: ребро — кубическая кривая между портами узлов, контрольные точки смещены по оси порта | ok |
| | `free-remotion-templates/logo-stroke-draw` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём прорисовки обводки `strokeDasharray` (рёбра) | ok |
| `PulseAlongPath` | `magicui/animated-beam` | magicui @ efe76fc5 | MIT (LICENSE.md) | идея светового луча с градиентом вдоль пути. Переписано на кадры: позиция — `pointAtLength` по своей LUT, без DOM-измерений и CSS-анимации | ok |
| `Card` | `free-remotion-templates/lower-third-glass-card` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём «стекла»: вертикальный градиент-блик поверх поверхности, светлая кромка сверху | ok |
| | `remotion-bits/scene-3d` | remotion-bits @ de35fda | MIT (package.json) | идея входа с перспективой (поворот к зрителю); у нас — CSS `perspective/rotateX` от пружины | ok |
| `KineticText` | `remotion-video-templates/kinetic-text` | remotion-video-templates @ 9014946 | MIT (LICENSE) | приём: пружина на каждое слово с задержкой по индексу, подъём и масштаб | ok |
| | `remotion-bits/animated-text` | remotion-bits @ de35fda | MIT (package.json) | идея режимов разбиения по словам и по буквам | ok |
| `Background` | `xyflow/background` | xyflow @ 654ba5a5e | MIT (LICENSE) | идея точечной и линейной сетки-подложки (варианты `paper`, `grid`) | ok |
| | `free-remotion-templates/lower-third-glass-card` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | идея: размытое радиальное пятно акцента, чтобы фон «дышал» (вариант `aurora`) | ok |
| `useBeat`, `beatProgress`, `formatNumber`, геометрия (`pathLUT`, `pointAtLength`, `smoothSegments`), токены, пресеты, `SafeArea`, `useSafeArea` | `own` | — | — | монотонная интерполяция Фритча — Карлсона; LUT длины пути | ok (юнит-тесты, рендер) |
| `LayoutRect`, `useLayoutRect`, `layoutRectPx` | `own` | — | — | Task 35′ (0.5.9, Р-V5): графика видеосцены в прямоугольнике зоны плана, края по пикселям без зазора | ok (юнит-тесты layout-rect) |

## v0.2: StyleBible-система и хореография

Написано заново, без внешних источников: ни kb_id, ни скопированного кода. `rendered` —
итог рендера галереи `render/test/fixtures/choreo-gallery` (1920×1080, 180 кадров,
dark-premium, e2e `test/kit/choreo.e2e.test.ts`) и просмотра кадров глазами 2026-10-21.
Кадры лежат в `docs/evidence/phase-1/kit-v0.2/choreo/`.

| Примитив | kb_id | Репозиторий @ commit | Лицензия | Что взято | rendered |
|---|---|---|---|---|---|
| `resolveStyle`, `ResolvedStyle`, `StyleProvider` (разрешение под fps) | `own` | — | — | — | ok (юнит-тесты, рендер) |
| `contrastRatio`, `relativeLuminance` | `own` | — | — | формула WCAG 2.x (спецификация W3C, не код) | ok (юнит-тесты) |
| `typeSize(style, level, height)` | `own` | — | — | — | ok |
| `enterStyle`, `<Enter>`, `staggerBeat` | `own` | — | — | `rise` у `Card` — через `enterStyle` | ok |
| `Emphasis`, `Halo`, `accentPulse`, `pulseArrival` | `own` | — | — | единый удар + дыхание удержания, гауссов ореол `closest-side`, вспышка узла FlowGraph в кадр прихода импульса (Task 17, fix B) | ok (patterns-gallery/accent, flow) |
| `StatusChip`, `DataToken`, `LatencyRace`, `SceneTitle`, `useArrivalCount`, `arrivalCount`, `pathArrivals`, `backgroundLayout`, `flowLabelSizes` | `own` | — | — | статус на месте со сменой, данные-объект по ребру, скорость во времени (проход ∝ задержке), режимы заголовка, счётчик по приходам импульсов, раскладка фона по seed (motion-kit 0.3, Task 17 fix E) | ok (юнит-тесты, patterns-gallery/process-speed) |
| `Comet`, `RadarRing`, `CardRadar`, `TickLabel`, `useHold`, `useHoldFrame`, `PulseTrails`, `flowHoldPlan`, `heroBreath`, `holdAccent` | `own` | — | — | hold engine: живой финал по режиму удержания — блик по пути, волна радара, подпись тика, наезд settle-push, потоки в удержании (motion-kit 0.5.0, S3b) | ok (юнит-тесты hold, hold-gallery e2e, QA hold-frames) |
| `emphasisHold`, `repeatTick`, `shimmerPaths`, `settlePushHeadroom`, `HOLD_MAX_S`, `PAYOFF_MAX_S` | `own` | — | — | S3-fix (0.5.2): передача акцента в финал смешением, подпись тика по приходу, блик цепочкой к герою, запас наезда, потолки хвоста длинной сцены в секундах | ok (юнит-тесты hold, plan; hold-gallery e2e) |
| `ColdOpen`, `useColdOpen`, `coldOpenAt`, `coldOpenStyle`, `coldOpenTiming`, `TEXT_POSTER_S`, `textPosterOk`, `steadyLive`, `steadyContinues`, `flowHoldMarks`, `steadyFlowIssue`, `useHoldQuiet`, `beginHoldFrame` | `own` | — | — | S3-fix2 (0.5.3): cold-open — крючок в полную силу, уход целиком, возврат ударом (без приглушённого итога); текст-постер только у текста первых 1,5 с; метки пробы QA от движения и по кадру; kitWarn steady-flow без потока | ok (юнит-тесты cold-open, hold-wiring, plan; hold-gallery e2e) |
| `textHalo`, `haloLayerStyle`, `withHalo`, `dimText`, `NO_HALO` | `own` | — | — | S6 (0.5.4): ореол текста цвета `palette.bg` в transparent-режиме (наложение поверх видео), `muted` ближе к `text`, приглушение цветом вместо `opacity` | ok (юнит-тесты text-halo; композиты поверх кадров MyProtocol — docs/evidence/script-mvp/overlay) |
| `KineticText enter="type"` | `own` | — | — | — | ok |
| `PosterGate`, `posterStyle`, `FlowNode.kind` (облики узлов), `flowStatusSlot`, `tokenShot`, `tokenSpan`, `summarizeLayout`, `axisTicks`, `minTextPx` | `own` | — | — | кадр-постер (Freeze итогового вида), облик узла по роли, места данных и статуса, токен без копий текста, реестр раскладки для QA, предел кегля (motion-kit 0.4.0, S2) | ok (юнит-тесты, patterns-gallery/queue, kinds, cache, flow; `docs/evidence/phase-1/kit-v0.4/`) |
| `cameraAt`, `<Camera>`, `<Parallax>` | `own` | — | — | — | ok |
| `safeRect`, `gridColumns`, `layoutLayered` | `own` | — | — | слои по топологическому порядку (общеизвестный приём, без кода dagre/elk) | ok (юнит-тесты; `layoutLayered` в рендере — с Task 15) |
| глубина `depth` в `Card`, `FlowGraph`, `KineticText`, `Background` | `own` | — | — | — | ok |

Evidence пересобирается одной командой из `app/motion-studio` (реальный рендер фикстуры,
JPEG 960 px в `docs/evidence/phase-1/kit-v0.2/choreo/`, полные PNG — в `tmp/kit-evidence-*/`):

```sh
./scripts/with-node.sh npx tsx scripts/kit-evidence.mts
```

Итог просмотра кадров (`rendered: ok`, fix round 1, 2026-10-21):

- Шесть элементов входят по-разному, и их входы перекрываются во времени. Кикер
  набирается с кареткой (`type`, кадры 2–44). Заголовок открывается шторкой снизу
  (`mask`, кадры 8–44, S-кривая): на кадре 16 видны только хвосты букв, на 26 — нижняя
  строка, на 34 — обе. Подзаголовок проявляется из размытия (`blur`, с 14). График
  рисуется (`draw`, 10–120). Карточки поднимаются каскадом через 4 кадра (`rise`, 18–40).
  Бейдж «+38 %» выскакивает с перелётом (`pop`, с 22). На кадре 24 ещё идут все шесть
  входов.
- По пикселям, вариант без камеры: остаток середины входа против чистого смешения —
  0.45–0.91 (fade дал бы ≈ 0). Негативный контроль, все элементы одним fade: 0.002–0.016,
  проверка разных входов падает (`choreo.e2e.test.ts`).
- Камера плавно наезжает до 1.08 без перелёта, ближний слой расходится сильнее. В кадре
  179 до края safe area остаётся ≥ 40 px (кикер x ≈ 170 при поле 115, низ карточек ≈ 960
  при поле 994).
- Глубина 0 → 3 различима по соседним уровням: светлее поверхность, сильнее блик и
  кромка, у depth 2 — мягкий ореол, у depth 3 — ореол сильнее и полоса акцента.
- Кириллица набрана своими шрифтами, обрезки нет.

## v0.2: примитивы паттернов ТЗ §8.4

Компоненты написаны заново; из источников — только приёмы и идеи, описанные в карточках
KB (`knowledge/components/…`), без копирования кода. Где источник — React-компонент с
CSS-анимацией, таймерами или сторонними пакетами (prism, rough-notation, canvas), приём
переписан на кадры: всё движение — от `useCurrentFrame()`, случайность — `random(seed)`.
`rendered` — итог рендера галереи `render/test/fixtures/patterns-gallery` (шесть сцен
1920×1080 по 150 кадров, e2e `test/kit/patterns.e2e.test.ts`) и просмотра кадров глазами
2026-10-21. Кадры — `docs/evidence/phase-1/kit-v0.2/patterns/`.

| Компонент | kb_id | Репозиторий @ commit | Лицензия | Что взято | rendered |
|---|---|---|---|---|---|
| `BarChart` | `free-remotion-templates/bar-chart-anim` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём: столбцы растут пружиной с задержкой по индексу, подписи проявляются вместе со столбцом | ok (data) |
| | `remotion-bits/bit-bar-chart` | remotion-bits @ de35fda | MIT (package.json) | идея: счётчик значения у растущего столбца; у нас — `AnimatedNumber`, привязанный к высоте столбца | ok (data) |
| | `own` | — | — | акцент после роста: световой столб и подпись акцентом у выделенного, нейтральный тон остальных; `barLayout`; общая ось `chartAxis` | ok (data) |
| `AreaChart` | `recharts/area-chart` | recharts @ 17272500987 | MIT (package.json, LICENSE) | идея: заливка раскрывается слева направо; у нас — SVG-маска с растушёванным фронтом от кадра, без таймера | ok (data) |
| | `free-remotion-templates/line-chart-anim` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | общая с LineChart часть: подписи X проявляются вслед за точками | ok (data) |
| | `own` | — | — | волна подъёма точек на мягкой пружине, блик по фронту маски, выноска `valueCallout` | ok (data) |
| `ComparisonSplit` | `free-remotion-templates/split-screen` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём: две панели раскрываются clip-path-шторкой по очереди, разделитель по центру появляется отдельно | ok (comparison) |
| | `motion-primitives/image-comparison` | motion-primitives @ 120f64f | MIT (LICENCE.md, © 2024 ibelick) | идея вертикального разделителя «до / после» | ok (comparison) |
| | `own` | — | — | встречные входы с параллаксом содержимого, бейдж VS на пружине pop с волной, прорисовка значков ✕ / ✓, перенос акцента на «стало» | ok (comparison) |
| `Timeline` | `animata/animated-timeline` | animata @ e7478b8 | MIT (LICENSE.md) | идея: точка вехи вырастает при активации, линия прорастает, каскад задержек | ok (timeline) |
| | `mermaid/timeline` | mermaid @ 6d8921f94 | MIT (LICENSE, package.json) | идея раскладки: горизонтальная ось, события по обе стороны | ok (timeline) |
| | `own` | — | — | голова оси со свечением, вехи `pop` в кадр прохода головы, стебли к подписям, «сейчас» с дыханием; `timelineLayout` | ok (timeline) |
| `ProcessSteps` | `own` | — | — | активация шагов по очереди: кольцо прорисовывается, номер выскакивает, свечение переходит к следующему; коннекторы `draw` (стрелка или линия с точкой) | ok (process) |
| `Callout` | `own` | — | — | кольцо или рамка прорисовываются по контуру, линия-указатель с изломом, подпись из маски от конца линии | ok (code) |
| `Highlight` | `magicui/highlighter` | magicui @ efe76fc5 | MIT (LICENSE.md) | идея режимов выделения (маркер, подчёркивание); у нас без rough-notation: свой неровный мазок из `random(seed)`, прорисовка штриха от кадра | ok (emphasis) |
| | `animata/double-underline` | animata @ e7478b8 | MIT (LICENSE.md) | идея второй, тонкой черты подчёркивания | ok (emphasis) |
| | `own` | — | — | режим glow: разгорание акцентом, удар масштаба, блик по буквам | ok (emphasis) |
| `CodeBlock` | `remotion-bits/code-block` | remotion-bits @ de35fda | MIT (package.json) | идея: подсветка выбранных строк и приглушение остальных, номера строк | ok (code) |
| | `remotion-bits/bit-typing-code-block` | remotion-bits @ de35fda | MIT (package.json) | приём: набор кода от кадра с курсором; у нас — по токенам своим лексером вместо prism, вспышка свежего токена | ok (code) |
| | `own` | — | — | `tokenizeCode`, `typedTokens`, `codeLineRect` | ok (юнит-тесты, code) |
| `Particles` | `free-remotion-templates/particle-snow` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём: слои глубины с разной скоростью и размером, покачивание sin по X, мерцание | ok (emphasis) |
| | `remotion-bits/particle-system` | remotion-bits @ de35fda | MIT (package.json) | идея: частицы детерминированы от кадра; у нас без симуляции — замкнутая формула от кадра и `random(seed)` | ok (emphasis) |
| `niceTicks` (`ticks.ts`), `drawDash`, ось LineChart | `own` | — | — | деления оси вынесены из geometry; ось LineChart/AreaChart/BarChart появляется целиком и не меняет шкалу во время рисования | ok (choreo, data) |

Итог просмотра кадров (`rendered: ok`, 2026-10-21):

- **comparison** (dark-premium): панели въезжают навстречу, шторка обгоняет сдвиг рамки —
  содержимое не режется краем. Бейдж VS выскакивает в момент встречи, по линии-разделителю
  свечение. Пункты входят со своих сторон, ✕ / ✓ прорисовываются. В конце «Было»
  приглушена и обесцвечена, «Стало» приподнята, кромка и «15 минут» светятся акцентом.
- **timeline** (light-clean): ось прорисовывается с головой, вехи выскакивают в кадр
  прохода головы, стебли прорастают, даты (моно, акцент) и подписи чередуются над и под
  осью. Подписи крайних вех выровнены внутрь: всё в safe area (первая x ≈ 138 при поле 115,
  последняя кончается ≈ 1782 при границе 1805). «2025» — крупнее, с ореолом.
- **process** (dark-premium): шаги 01–04 активируются по очереди, кольцо обегает номер,
  свечение переходит к активному шагу, стрелки прорисовываются между шагами; пройденные —
  контур и номер акцентом.
- **code** (tech-neon): окно поднимается, код набирается по токенам, свежий токен
  вспыхивает, каретка идёт за набором и мигает в конце. Строки 3–4 подсвечены полосой,
  остальные приглушены. Рамка выноски обегает строку цикла, линия выходит вправо за окно,
  подпись «До трёх попыток» открывается из маски. Остатков штриха до старта нет.
- **emphasis** (dark-premium): строки открываются шторкой, «объяснять» — неровный мазок
  маркера, «украшать» — двойная рукописная линия (после ревью кадров шторка `Enter` больше
  не срезает её: клип снимается в конце входа), «Одна мысль» разгорается янтарём. Пылинки
  и боке двух слоёв видны, не спорят с текстом.
- **data** (light-clean): ось встаёт целиком, столбцы растут каскадом с подписями-
  счётчиками; затем IV кв. получает световой столб, подпись акцентом и метку, остальные
  уходят в серо-синий. AreaChart наливается волной слева направо, блик по фронту, итог —
  выноска «640 000».
- **Варианты** (`props.content`, e2e и листы `*-<ключ>-<значение>-*.jpg`): вертикальный
  `Timeline` (даты слева, подписи справа, отступ за ореолом «сейчас»), `ProcessSteps
  connector="line"` (пунктир и бегущая точка), `ComparisonSplit divider="line"` (линия
  прорастает от центра), `Callout shape="ring"` на «3» в условии цикла — кольцо читается,
  но линия к подписи пересекает строку 2, поэтому в сцене по умолчанию — рамка на строку.
- **LineChart** (choreo): подписи оси Y появляются все вместе (кадр 26 — 0…80 тыс. сразу),
  шкала не перестраивается 20 → 60 → 80 по ходу рисования.

Повторный просмотр после ревью (fix round 1, 2026-10-21, `rendered: ok`):

- **CodeBlock**: docstring (py) и JSDoc (ts) раскладываются по своим строкам — номера 1–10 /
  1–11, полоса подсветки на строках 6–7, каретка в конце последней строки (e2e проверяет по
  пикселям; со старой раскладкой проверка каретки падает).
- **code**: блок кода слева (1060 px), мысль «До трёх попыток» — `h2` с пояснением в
  правой колонке; кольцо на «3» в py-варианте выходит линией прямо вбок (`exit:
  "horizontal"`), справа на этой высоте пусто.
- **timeline / process**: на кадре 120 блок занимает ~51 % / ~53 % высоты кадра (было ~30 %).
  Даты `h2`, ось ~7 px, пояснения под подписями, «2025» — залитый узел с ореолом и плашкой.
  У шагов — карточки с подписью и пояснением, активная — с акцентной кромкой.
- **AreaChart**: линия идёт по итоговой кривой и обрезана по фронту, заливка доливается под
  неё; ложного провала у линии нет.
- **Подписи графиков** — из шкалы кадра (caption 32 px, выноска — body). В kit-gallery v0.1
  подписи X при крупном кегле налезали («янв 22июл 22…») — теперь прореживаются
  (`xLabelIndices`: янв 22 · янв 23 · янв 24 · янв 25). Кадры `docs/evidence/phase-1/slice/kit/`
  пересняты.

Evidence пересобирается: `./scripts/with-node.sh npx tsx scripts/kit-evidence.mts patterns`
(контактные листы ключевых кадров e2e, JPEG 3 × 2 по 480 px); вариант —
`… patterns timeline:orientation=v`.

## Шрифты

| Семейство | Пакет | Начертания | Лицензия |
|---|---|---|---|
| Inter | `@fontsource/inter@5.3.0` | 400, 500, 600, 700 | OFL-1.1 |
| Manrope | `@fontsource/manrope@5.3.0` | 600, 700, 800 | OFL-1.1 |
| JetBrains Mono | `@fontsource/jetbrains-mono@5.3.0` | 400, 500, 700 | OFL-1.1 |

Подмножества latin и cyrillic, woff2. Файлы лежат в `fonts/`, тексты лицензий — в
`fonts/OFL.txt`. Обновляет их `app/motion-studio/scripts/sync-fonts.mjs`.

## Итог просмотра кадров (2026-10-20)

- Кириллица везде набрана своим шрифтом: Manrope (заголовки dark-premium), Inter
  (light-clean и подписи), JetBrains Mono (tech-neon и кикеры). Системных подмен нет.
- Обрезки нет. Подписи узлов FlowGraph сначала обрезались многоточием, теперь кегль
  подбирается по ширине узла. Надпись «Уровень 0» в карточках переносилась на две строки —
  исправлено в раскладке галереи.
- Импульсы видны на путях: голова, ореол и хвост; обратный импульс — третьим акцентом.
- Тени различимы по elevation 0–3 во всех трёх пресетах: тень, светлота поверхности,
  у elevation 3 — ореол или неоновое свечение.
- После ревью: число стало главным акцентом (120 px против 64 px у заголовка). На
  light-clean уровни 0 и 1 теперь хорошо различимы: 0 «вдавлен» к фону, у 1 тень
  сильнее. Нулевая линия графика выровнена по низу ряда карточек.
