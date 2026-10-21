# @ms/motion-kit 0.2.1 — справка для агента

Детерминированные компоненты Remotion 4.0.537. Всё движение считается от
`useCurrentFrame()`; оформление берётся из StyleBible (`useStyle()`). Импорт —
только `@ms/motion-kit`, `remotion`, `react`.

```tsx
import { AnimatedNumber, AreaChart, Background, BarChart, Callout, Camera, Card, CodeBlock,
  ComparisonSplit, Enter, FlowGraph, Highlight, KineticText, LineChart, Parallax, Particles,
  ProcessSteps, PulseAlongPath, SafeArea, StyleProvider, Timeline } from "@ms/motion-kit";
```

Время задаётся битами: `beat = { start_frame, end_frame }` (поля `Beat` из MotionSpec).
Бит компонента — это окно, в котором идёт его анимация. Бит нулевой длины
(`start_frame === end_frame`) не ошибка: компонент показывает его ступенькой. После `end_frame` элемент
остаётся в итоговом состоянии. Исчезает он, только если это задано явно (`exit`).
Размеры указаны в px для кадра 1920×1080.

## Каркас сцены

```tsx
// props.json: { timing: { duration_frames, beats }, style: { preset, intensity, depth, transparent, safe_area?, font? }, content }
export const Scene = ({ timing, style, content }: Props) => (
  <StyleProvider style={style}>              {/* стиль — только из props.style */}
    <Background beat={{ start_frame: 0, end_frame: 40 }} />
    <SafeArea>{/* весь контент внутри безопасной зоны */}</SafeArea>
  </StyleProvider>
);
```

Тайминги битов бери из `props.timing.beats`, стиль — из `props.style`. Правки
«медленнее», «палитра из v1», «объёмнее» меняют props, а не код сцены.

| Пресет | Характер |
|---|---|
| `dark-premium` | графитовый фон, световые пятна, Manrope 800, фиолетовый, бирюзовый и янтарный акценты, мягкие пружины |
| `light-clean` | светлый фон с точечной сеткой, Inter 700, синий акцент, мягкие тени, сдержанное движение |
| `tech-neon` | почти чёрный фон, неоновая сетка-пол, JetBrains Mono, циан и маджента, свечение вместо теней, резкое движение (energetic) |

Шрифты (латиница и кириллица) загружаются при импорте kit, `ensureFonts()` звать не
нужно. Загружены только эти начертания:

| Семейство | `fontWeight` |
|---|---|
| Inter | 400, 500, 600, 700 |
| Manrope | 600, 700, 800 |
| JetBrains Mono | 400, 500, 700 |

Другие веса браузер синтезирует из ближайшего: 300 станет 400, 900 станет 800, а
жирность Inter 800 будет искусственной и грубой. Бери веса из таблицы. Своих шрифтов и
`staticFile` для шрифтов не добавляй.

Медиа сцены (картинки, видео, звук) — только `import` файла из `src/`
(`import clip from './clip.mp4'` → `<OffthreadVideo src={clip} />`). `staticFile()`,
`src` из props или шаблона, внешние URL и `/proxy` статическая проверка отклоняет.

## Стиль

`StyleProvider style=…` принимает `props.style` сцены (`{ preset, intensity, depth?,
transparent?, palette_overrides?, safe_area?, font? }`), id пресета, StyleBible или готовый
`ResolvedStyle`, и разрешает его через `resolveStyle` под fps композиции. Неизвестный id
пресета — ошибка. `useStyle()` возвращает `ResolvedStyle` = StyleBible + `amplitude` +
`depth` + `transparent` + `fpsScale`:

| Поле | Что значит |
|---|---|
| `motion.enter_frames`, `exit_frames`, `stagger_frames` | уже пересчитаны под fps (база 30) и интенсивность: бери как есть, в `frames()` не оборачивай |
| `amplitude` | размах движения: calm 0.6, balanced 1, energetic 1.35 (кадры: calm ×1.25, energetic ×0.75) |
| `depth` | 0 плоско · 1 как задумано · 2–3 объёмнее: тени карточек, перспектива, атмосфера фона, тень крупного текста |
| `transparent` | прозрачный экспорт: `Background` не рисуется, свой фон на корне сцены не ставь |
| `palette` | палитра пресета с `palette_overrides` (`accent[i]` заменяет `accent[i]`) |
| `grid.safe_area` | поля кадра: `props.style.safe_area` (из настроек сцены), без него — пресета |
| `fpsScale` | fps / 30: `frames()` пересчитывает им свои константы компонентов |

Типографская шкала — от высоты кадра, одна для 16:9, 9:16 и 1:1:
`typeSize(style, level, height)`, `level`: `display` 11 % · `h1` 7.5 % · `h2` 5.5 % ·
`body` 4.2 % · `caption` 3 % высоты (1080: 119 / 81 / 59 / 45 / 32 px). `KineticText size`
принимает эти уровни. Старая форма `typeSize(style, шаг)` — шаг шкалы 0..8 в px при 1080.

`contrastRatio(fg, bg)` — контраст WCAG (текст ≥ 4.5, крупный ≥ 3). Пресеты дают текст
≥ 7, `muted` ≥ 4.5, `accent[0]` ≥ 3 к `bg`; свои цвета поверх фона проверяй так же.

## Входы

Вид входа элемента — `entrance` из spec. Обёртка `<Enter>` анимирует любой блок:
```tsx
<Enter kind="mask" beat={beats.title}>…</Enter>
{items.map((it, i) => (
  <Enter key={it.id} kind="rise" beat={beats.list} index={i} total={items.length}>…</Enter>
))}
```
`{ kind, beat, index? = 0, total? = 1, direction?, distance?, duration?, exit?, style? }`.
Шторка `mask` после открытия снимает клип: выносные элементы (подчёркивание, свечение)
не срезаются. Но с `exit` в первом кадре выхода клип возвращается рывком (`inset(0…)` по
границе блока): всё, что выступает за блок, пропадает сразу, а не уходит со шторкой. Блоку
с подчёркиванием, выноской или свечением давай выход другим видом (`fade`, `blur`, `rise`)
или держи выступающее внутри блока (padding).
Старт элемента `index` сдвигается на `stagger_frames` (`staggerBeat`), вход длится
`enter_frames` по кривой `easing.enter`; `mask` — 1.5 × `enter_frames` по S-кривой (шторка
крупной формы читается, а не мелькает); `pop` — пружина `spring.pop` с перелётом.
`duration` — своя длительность в кадрах при 30 fps. С
`exit` элемент уходит обратным движением по `easing.exit` за `exit_frames` до конца бита.

| `kind` | Движение | Для чего |
|---|---|---|
| `rise` | подъём на `distance × amplitude` снизу (`direction: "up"` — сверху) | заголовки, карточки |
| `slide` | сдвиг сбоку (`direction` `left` по умолчанию / `right`) | перечисления, смена темы |
| `fade` | только прозрачность | фон второго плана, тихие подписи |
| `scale` | из глубины, 0.92 → 1 | акцентный блок |
| `mask` | шторка `clipPath`, открывается от стороны `direction` (снизу по умолчанию) | крупный заголовок, фото |
| `blur` | из размытия 12 px × amplitude | подзаголовок, вторичный текст |
| `pop` | масштаб с перелётом | бейдж, число-акцент, иконка |
| `type` | набор по буквам с кареткой — `KineticText enter="type"` | кикер, код, команда |
| `count` | счёт — `AnimatedNumber` | числа |
| `draw` | прорисовка линии — `LineChart`, рёбра `FlowGraph` | графики, схемы |
| `none` | без анимации | то, что уже на экране |

`enterStyle(kind, p, { amplitude, distancePx, direction? })` — стиль входа по доле `p`
(0 → 1), если анимируешь сам. Для `type`, `count`, `draw` он пустой: их рисует компонент.

**Правило соседей:** соседние элементы (рядом в кадре или по времени) входят разными
`kind` или со сдвигом старта не меньше `stagger_frames`. Одинаковый вход всем — брак.

## Камера

Камера — ключи `MotionSpec.camera`: `{ frame, scale, x, y }` (`x, y` — точка интереса, px
от центра кадра). `scale` — от 1 до `camera.max_scale` стиля: отъезда меньше кадра нет
(открылись бы края фона), spec с `scale < 1` не проходит контракт. Между ключами — кривая
`easing.emphasis` без перелёта.

Панорама живёт только в запасе наезда: `<Camera>` сам зажимает `x, y` (`panLimit`), чтобы
кадр не выходил за сцену (без полос по краям) и край safe area не уходил за край кадра. При
`scale = 1` и при `allow_zoom = false` камера стоит: сдвиг без наезда открыл бы край фона.
`x, y` — направление взгляда (к чему тянется наезд), а не точное попадание: при
`max_scale` 1.08 сдвиг — десятки px. Хочешь показать другой блок — смени состояние сцены
(вход, выход, перенос фокуса), а не уводи камеру.
```tsx
<Camera keys={[{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 179, scale: 1.08, x: 0, y: 0 }]}>
  <Parallax layer={0}><Background /></Parallax>          {/* дальний план: как камера */}
  <Parallax layer={1}>{/* текст, графики */}</Parallax>
  <Parallax layer={2}>{/* ближний план: карточки */}</Parallax>
</Camera>
```
`<Parallax layer>` двигает слой как камеру × (1 + 0.15·layer); при `camera.parallax = false`
слои едут вместе. Слой > 0 на наезде чуть крупнее кадра (`PARALLAX_OVERSCAN` = 3 px за
край, набирается за первый 1 % наезда): ближний план едет сильнее камеры, и без запаса
его край открывался бы на 1–3 px. `parallaxTransform(cam, layer, { width, height })` даёт ту
же трансформацию для своих слоёв. `layer` элемента — `depth_layer` из spec. `cameraAt(frame, keys, style, { width, height })`
→ `{ scale, x, y }` для своих расчётов (размер кадра — тот же зажим, что у `<Camera>`).
Камера — только когда помогает смыслу: один медленный наезд на главное к акценту. На наезде
контент уходит к краям: держи его в safe area, сжатой в `1 + (scale − 1)·(1 + 0.15·layer)`
раз от центра; ближний слой 2 у края кадра не ставь.

Поля safe area задают и запас камеры: наезд не больше `zoomLimit` (край зоны остаётся в
кадре хотя бы на половину поля), панорама — в остатке поля. **`safe_area` 0 по оси
выключает камеру:** при нулевом поле `zoomLimit` = 1, наезда нет, а без наезда нет и
панорамы — ключи `camera` в spec ни на что не влияют. Камере нужно поле: при 5 % наезд
≈ до 1.055, наезд 1.08 требует полей около 7 %.

## Safe area

`safeRect({ width, height, safe_area })` → `{ x, y, w, h }` в px — тот же расчёт, что у
`<SafeArea>` и `useSafeArea()` (она возвращает и `{ x, y, w, h }`, и
`{ left, top, width, height }`). Поля — `settings.safe_area`: пайплайн кладёт их в
`props.style.safe_area`, `StyleProvider` — в `grid.safe_area` стиля. Без поля — поля пресета.

## Раскладка

- `gridColumns(style, rect, n)` → `{ x, w }[]`: n равных колонок с `gutter` сетки стиля.
- `layoutLayered(nodes, edges, rect, gap)` → `Record<id, Rect>`: схема слоями слева
  направо по топологическому порядку, внутри слоя — столбиком по центру вертикали, без
  пересечений, внутри `rect`. Не влезает — ошибка с размерами (уменьши узлы или gap).
```tsx
const rect = useSafeArea();
const pos = layoutLayered(NODES, EDGES, { x: 0, y: 0, w: rect.w, h: rect.h }, { x: 120, y: 48 });
<FlowGraph nodes={NODES.map((n) => ({ ...n, ...pos[n.id]! }))} edges={EDGES} beat={…} width={rect.w} height={rect.h} />
```

## Паттерны (ТЗ §8.4) → примитивы

| Паттерн | slug (`PatternSlugSchema`) | Чем показывать |
|---|---|---|
| рост / падение | `growth-decline` | `LineChart` (линия рисуется), `AreaChart` (объём наливается), `AnimatedNumber` |
| сравнение | `comparison` | `ComparisonSplit` (было / стало, A / B), `BarChart` с `highlight` |
| причина → следствие | `cause-effect` | `ProcessSteps` (стрелки), `FlowGraph` + `PulseAlongPath` |
| шаги, последовательность | `sequence-steps` | `ProcessSteps`, `Enter` каскадом (`index`/`total`) |
| структура системы | `system-structure` | `FlowGraph` + `layoutLayered` |
| связи | `relationships` | `FlowGraph` + `PulseAlongPath` (поток по рёбрам) |
| хронология | `timeline` | `Timeline` |
| трансформация | `transformation` | `ComparisonSplit` (до / после), `Enter` с выходом и сменой блоков |
| количества | `quantities` | `BarChart`, `AnimatedNumber`, `Particles` (много мелкого) |
| пространство | `spatial` | `Camera`, `Parallax`, `Particles` по слоям |
| абстрактные понятия | `abstract-concepts` | `Particles`, `Background`, `KineticText` |
| акцент, главная мысль | `key-point-emphasis` | `Highlight` (marker / underline / glow), `Callout`, `KineticText highlight` |

Код (`CodeBlock` + `Callout` на строку) — приём для `sequence-steps` и `system-structure`
в технических сценах.

Один паттерн — одна мысль сцены. Примитивы различаются движением (шторка, волна, пружина,
прорисовка, набор), поэтому два соседних примитива уже входят по-разному; правило соседей
всё равно действует.

## Компоненты

### Background
`{ beat?, variant?: "aurora" | "grid" | "paper" | "solid", grain? = true, seed? }`. По
умолчанию вариант выбирается по пресету. Атмосфера проявляется за бит, пятна медленно
дрейфуют. `seed` меняет расположение пятен.
```tsx
<Background beat={{ start_frame: 0, end_frame: 45 }} seed="intro" />
```

### SafeArea / useSafeArea()
`<SafeArea style?>` — `AbsoluteFill` с полями из `grid.safe_area` (расчёт — `safeRect`). Дети лежат во flex-колонке
размером с безопасную зону: `AbsoluteFill` и `position: absolute` внутри отсчитываются
от её края, а не от края кадра. Свойства раскладки из `style` (`justifyContent`,
`alignItems`, `flexDirection`, `gap`, grid-свойства) действуют на этот блок. `useSafeArea()`
возвращает `{ x, y, w, h }` и `{ left, top, width, height }` в px, если раскладку нужно считать вручную.

### KineticText
`{ text, beat, mode: "words" | "letters", enter: "rise" | "fade" | "scale" | "slide" | "type",
size? = 6, font? = "display" | "body" | "mono", weight?, color?, highlight?: string[],
align?, maxWidth?, lineHeight?, delay?, stagger?, exit?, caps?, style? }`

- `rise` — текст выходит из маски снизу с перелётом (для заголовков);
- `fade` — проявляется из размытия (для подписей и кикеров);
- `scale` — вырастает из глубины (для акцентного слова);
- `slide` — сдвиг со скосом (для перечислений и смены темы);
- `type` — набор по буквам с мигающей кареткой акцентом (для кикеров, команд, кода);
  ещё не набранные буквы держат место, раскладка не прыгает.

`size` — уровень шкалы кадра (`"display"`, `"h1"`, `"h2"`, `"body"`, `"caption"`), шаг
шкалы 0..8 (18, 22, 28, 36, 48, 64, 88, 120, 160 px) или кегль в px, если больше 8. При
`depth` 2–3 крупный текст получает мягкую тень. Разбег частей не превышает 60% бита. Задержки частей слегка разбросаны
(`random(seed)`), поэтому части не входят строем.
```tsx
<KineticText text="Рост пользователей" beat={{ start_frame: 4, end_frame: 50 }}
  mode="words" enter="rise" size={5} highlight={["Рост"]} />
<KineticText text="Данные · 2022–2025" beat={{ start_frame: 0, end_frame: 30 }}
  mode="letters" enter="fade" size={1} font="mono" caps />
```

### AnimatedNumber
`{ from, to, beat, locale: "ru" | "en", prefix?, suffix?: string | PluralForms, compact?, decimals?, size?: TypeLevel | number = 7,
font? = "display" | "mono", reserveWidth?, color?, align?, style?, value?, enterAt? }`

`size` — как у KineticText: уровень шкалы от высоты кадра (`"display"`, `"h1"`, `"h2"`,
`"body"`, `"caption"` — одинаково в 16:9, 9:16 и 1:1), шаг шкалы v0.1 (0..8) или кегль в
px (> 8). Герой-число — `size="display"`.

`suffix` массивом — формы существительного по числу: `suffix={[" релиз", " релиза", " релизов"]}`
(en — `[one, other]`); форма меняется вместе с показанным значением («1 релиз», «2 релиза»,
«48 релизов»). Подпись со словом, согласованным с числом, — только так, не строкой.

`value` — внешнее значение вместо своего счёта: привязка к другому источнику движения
(см. `lineChartHead`). Удар на финише остаётся в `end_frame` бита.

Число входит в начале `beat` — до него его нет на экране. Чтобы зритель сначала прочитал
«от», а потом начался счёт, передай `enterAt` — кадр входа (начало бита входа числа):
число появляется со значением `from` и держит его до начала счёта. Своё `<Enter>` вокруг
`AnimatedNumber` не поможет — у числа собственный вход.

Счёт идёт весь бит: разгон, затем долгое торможение (`EASE.count`). Цифры
моноширинные. На финише (`end_frame`) — короткий удар масштаба и свечения акцентом.
При быстром счёте цифры слегка смазываются. `reserveWidth` держит ширину под итоговое
значение; по умолчанию включено только без `prefix`/`suffix`.
```tsx
{/* герой кадра: число крупнее заголовка; суффикс не повторяет слово из заголовка */}
<AnimatedNumber from={10_000} to={1_000_000} beat={{ start_frame: 12, end_frame: 100 }}
  locale="ru" size={7} />
```

### LineChart
`{ points: { label, value }[], beat, area? = true, callout? = true, endpointEmphasis?:
boolean | { beat?, loop? } = true, width? = 1100, height? = 560, locale? = "ru", compact? =
true, accentIndex? = 0, yTicks? = 4, valuePrefix?, valueSuffix? }`

Порядок внутри бита: сетка и подписи оси Y (первые 30%), затем гладкая монотонная
линия рисуется со светящейся «головой» (12–80% бита). Точки вспыхивают, когда линия до
них доходит, заливка открывается вслед. В конце последняя точка получает акцент, а рядом
появляется выноска со значением. Они включаются раздельно:
- `callout={false}` убирает выноску, если значение уже показывает герой-число;
- `endpointEmphasis` — акцент точки (тот же `accentPulse`, что у `Emphasis`): удар в
  конце прорисовки, ореол, кольца, дыхание до конца сцены. `{ beat, loop: false }` —
  свой бит акцента; после бита акцент гаснет (так акцент передают следующему элементу).
  `false` — точка без акцента.

Точка остаётся живой и без выноски: `callout={false}` + `endpointEmphasis` по умолчанию.
`highlightLast` устарел: `highlightLast={false}` без новых полей убирает и выноску, и акцент.
`lineHighlight(props, beat)` → `{ callout, emphasis: { beat, loop } | null }` — что
выделено у точки и в какие кадры (для своих привязанных слоёв). Подписи осей форматирует `formatNumber`. Точки
передавай по порядку оси X.

`lineChartHead(points, beat, frame, { width?, height?, yTicks?, frameHeight? })` → `{ progress, value,
startFrame, endFrame }` — голова линии в кадре (не хук). Линия трогается после
`startFrame` = `beat.start_frame + ⌈0.12 × длина бита⌉` (до того — сетка и подписи; в
самом `startFrame` голова ещё на первой точке), дорисована к
`endFrame` = `start + 80 %`. Счётчик, привязанный к линии, показывает ровно значение под
головой; чтобы «от» читалось, число входит (`enterAt`) не позже чем за 15 кадров до
`startFrame`:
```tsx
const head = lineChartHead(POINTS, CHART_BEAT, frame, { width: 900, height: 560 });
<AnimatedNumber from={10_000} to={1_000_000} value={head.value}
  beat={{ start_frame: CHART_BEAT.start_frame, end_frame: head.endFrame }} locale="ru" size={8} />
```
```tsx
<LineChart points={[{ label: "янв 22", value: 10_000 }, /* … */ { label: "янв 25", value: 1_000_000 }]}
  beat={{ start_frame: 20, end_frame: 110 }} width={830} height={500} />
{/* значение показывает герой-число; точка всё равно бьёт и дышит */}
<LineChart points={POINTS} beat={CHART_BEAT} callout={false} />
```

Ось Y у `LineChart`, `AreaChart`, `BarChart` общая: деления `niceTicks` считаются один раз
от всех данных, линии сетки прочерчиваются одновременно, подписи проявляются все вместе
(первые 30 % бита). Шкала не перестраивается, пока рисуется линия. Текст графиков — из
шкалы кадра: подписи осей — `caption` (`chartFont(height)`, 32 px при 1080), выноска
значения — `body`; поля под подписи растут вместе с кеглем. Ширину графика закладывай от
700 px, иначе подписи X теснятся. `lineChartHead(…, { frameHeight })` — та же высота кадра,
что у сцены (по умолчанию 1080).

### AreaChart
`{ points: { label, value }[], beat, highlightLast? = true, width? = 1100, height? = 560,
locale? = "ru", compact? = true, accentIndex? = 0, yTicks? = 4, valuePrefix?, valueSuffix? }`

Расширение `LineChart` (та же ось и выноска), но движение другое — объём «наливается»:
заливка поднимается от нуля волной слева направо на мягкой пружине (старты 14–50 % бита),
у фронта — растушёвка и блик. Линия идёт по итоговой кривой и обрезана по фронту волны:
склон волны она не повторяет, ложного провала нет. Для роста
накопленной величины (аудитория, выручка нарастающим итогом); для тренда без объёма —
`LineChart`.
```tsx
<AreaChart points={USERS} beat={{ start_frame: 24, end_frame: 140 }} width={800} height={700} accentIndex={1} />
```

### BarChart
`{ bars: { label, value }[], beat, highlight?, locale, width? = 1100, height? = 560,
accentIndex? = 0, compact? = true, decimals?, valueSuffix?, yTicks? = 4, gapRatio? = 0.38 }`

Ось встаёт целиком, столбцы растут от базовой линии каскадом (`stagger_frames × 1.5`,
разбег ≤ 40 % бита) на пружине с лёгким перелётом. Над каждым едет подпись-счётчик
`AnimatedNumber`, привязанная к высоте столбца. `highlight` — индекс главного столбца:
после роста он получает световой столб, подпись акцентом и метку под осью, остальные
уходят в нейтральный тон. Значения ≥ 0. `barTimings(beat, n, stagger)` → `{ startOf(i),
focusAt }` — кадры для своих элементов, привязанных к столбцам.
```tsx
<BarChart bars={[{ label: "I кв.", value: 42_000 }, /* … */ { label: "IV кв.", value: 87_000 }]}
  beat={{ start_frame: 8, end_frame: 118 }} highlight={3} locale="ru" width={800} height={700} />
```

### ComparisonSplit
`{ left: ComparisonSide, right: ComparisonSide, beat, divider: "vs" | "line",
emphasizeRight? = true, style? }`, `ComparisonSide = { label, title, items?: string[],
value?, tone?: "negative" | "positive" | "neutral" }`

Две панели на всю ширину родителя (дай ему размер). Панели въезжают навстречу и
открываются шторкой от внешнего края (0–34 % бита), содержимое едет медленнее рамки. На
встрече (24 %) — разделитель: `line` прорастает от центра, `vs` — бейдж выскакивает с
волной. Пункты (30–62 %) входят со своей стороны, значки ✕ / ✓ прорисовываются; `value`
выскакивает последним. С 72 % акцент на правой («стало»): она приподнимается и светится,
левая приглушается. Тон по умолчанию: слева negative, справа positive.
```tsx
<div style={{ flex: 1 }}>
  <ComparisonSplit beat={b.split} divider="vs"
    left={{ label: "Было", title: "Ручной отчёт", items: ["Выгрузка в Excel", "Сверка вручную"], value: "3 дня" }}
    right={{ label: "Стало", title: "Пайплайн данных", items: ["Данные из DWH", "Проверки в коде"], value: "15 минут" }} />
</div>
```

### Timeline
`{ items: { label, date, note? }[], beat, orientation: "h" | "v", width?, height?,
accentIndex? = 0, highlightLast? = true }` (по умолчанию h: 1690 × 620, v: 1100 × 760)

Тусклая дорожка проявляется, ось прогресса прорисовывается со светящейся головой
(10–80 % бита). Когда голова доходит до вехи, узел выскакивает с волной, прорастает
стебель, дата (моно, акцент) и подпись выезжают от оси. По горизонтали подписи чередуются
над и под осью, подписи крайних вех выровнены внутрь области (не выходят за её край).
Даты — крупные (`h2`, моно), подпись — `body`, `note` — короткое пояснение (`caption`,
приглушено). Ось толстая (~7 px при 1080). Последняя веха — «сейчас»: залитый узел в 1.5
раза крупнее; после появления дышит `accentPulse` (ореол, кольцо на каждый вдох, свечение
даты), дата акцентом, подпись в акцентной плашке; акцент в
таймлайне только у неё. 3–6 вех; подпись — до трёх слов. Таймлайн с пояснениями занимает
около половины высоты кадра — отдай ему всё место под заголовком. `timelineLayout(n, rect, orientation)` — те же позиции вех для своих слоёв.
```tsx
<Timeline items={[{ date: "2019", label: "Прототип", note: "два основателя" }, /* … */]} beat={b.timeline} orientation="h" />
```

### ProcessSteps
`{ steps: string[], notes?: string[], beat, connector: "arrow" | "line", width? = 1690,
height? = 600, accentIndex? = 0 }`

Шаги активируются по очереди (делят 6–82 % бита, `stepStarts(beat, n)`): номер
выскакивает, кольцо обегает его по кругу, вокруг активного — свечение, подпись поднимается
из маски в карточке шага под номером (`notes[i]` — пояснение под подписью, `caption`).
У активной карточки — акцентная кромка и подсветка. Пройденный шаг остаётся с контуром и
номером акцентом. Коннектор к следующему шагу прорисовывается за время шага: `arrow` —
линия со стрелкой, `line` — пунктир и бегущая точка. 3–5 шагов, подпись — 1–3 слова;
номера ~150 px, подписи ~`h2`: блок занимает около половины высоты кадра.
```tsx
<ProcessSteps steps={["Понять запрос", "Собрать раскадровку", "Написать код", "Проверить кадры"]}
  notes={["что и для кого", "биты и входы", "Remotion и kit", "QA по пикселям"]} beat={b.steps} connector="arrow" />
```

### Emphasis / Halo / useAccentPulse
`<Emphasis beat loop? = true accentIndex? = 0 color? halo? = true ring? = true shape? = "pill"
radius? spread? strength? = 1 display? = "inline-block" style?>цель</Emphasis>`

Акцент на цели — слове, числе, плашке, карточке. Один характер у всех акцентов kit
(`accentPulse`): короткий **удар** в `start_frame` (масштаб +6 % × амплитуда, вспышка
свечения, кольцо от кромки цели), затем **дыхание удержания**: свечение 0.66 ± 0.26 ×
амплитуда (balanced 0.4..0.92, во впадине не гаснет), масштаб ±1.8 % × амплитуда на четверть цикла позже
света, по кольцу на вдох (период ≈ 2.4 с при balanced). Свет и масштаб в противофазе
по четверти: два кадра удержания (N−20 и N−1) всегда различаются — финал не застывает.
Амплитуда и темп — из `intensity` стиля: calm мягче и медленнее, energetic резче.
`loop` (по умолчанию) — дышать и после `end_frame`, до конца сцены (финальный акцент
живой); `loop={false}` — после бита акцент гаснет за ~0.5 с. Свечение повторяет контур
цели (`drop-shadow`: плотная кромка и широкий шлейф, на тёмном фоне ярче), за целью —
`<Halo>`. Свой `box-shadow` / `radial-gradient` для
ореола не рисуй.

- `shape` — скругление кольца: `pill` (слово, плашка), `rounded` (карточка), `circle`.
- `radius` — у `rounded`: радиус углов цели в px (по умолчанию — радиус карточки стиля,
  `radius(s, 2)`). Кольцо идёт концентрично: его радиус = радиус цели + отступ от кромки,
  углы не острые. Оверлей поверх узла `FlowGraph` — передай радиус узла.
- Цель — **реальный объект**: не пустой блок-область. Примитив со своим акцентом
  (`Timeline highlightLast`, `LineChart endpointEmphasis`, `FlowNode flash`) в `Emphasis`
  не оборачивай — второй акцент поверх первого.
- `spread` — поля ореола за блок цели, равные со всех сторон: px или CSS-длина; `em` —
  от кегля самого `Emphasis` (наследуется). Если кегль задан внутри цели — передай px.
- `ring={false}` — без колец (тихий акцент текста), `halo={false}` — без ореола.
- Один акцент в момент: биты двух `Emphasis` не перекрывай; передавая акцент дальше,
  ставь прежнему `loop={false}`.

`<Halo level? = 1 color? accentIndex? spread? = "0.6em" style?>` — ореол сам по себе:
первый ребёнок блока с `position: relative` и `isolation: isolate`. Два слоя —
ядро по размеру блока и свечение на `spread` за край; гауссов спад `closest-side` до
нуля на кромке: жёсткой плашки не бывает, центр — центр блока.

`useAccentPulse(beat, { loop?, strength? })` → `{ level, scale, strike, hold, ripple,
rippleAlpha }` — тот же акцент для своих элементов (хук); `accentPulse(frame, style,
{ beat, loop?, strength? })` — не хук (SVG, `.map()`). `level` — сила свечения 0..1,
`ripple` — кольцо 0 → 1 (−1 — кольца нет).
```tsx
<Emphasis beat={{ start_frame: 112, end_frame: 150 }} spread={64}>
  <div style={{ padding: "0.3em 0.8em", borderRadius: 999, background: surfaceAt(s, 2), fontSize: 59 }}>×4 за год</div>
</Emphasis>
{/* слово в заголовке — тихий акцент без колец */}
<h1>Рост <Emphasis beat={B} ring={false}>×100</Emphasis></h1>
```

### Callout
`{ target: Rect, label, beat, side?: "left" | "right" | "auto", bounds?: Rect, shape?:
"ring" | "box" | "auto", exit?: "diagonal" | "horizontal", reach? = 90, size? = "body",
note?, accentIndex? = 0 }`

Слой поверх родителя (`position: absolute; inset: 0`), координаты `target` — px родителя.
Кольцо (`ring`, эллипс) или рамка (`box`, для вытянутых целей) прорисовывается по контуру
со вспышкой внутри (0–34 % бита), линия-указатель с изломом прорастает (26–52 %), подпись
открывается из маски от конца линии (с 46 %); затем кольцо мягко дышит. `auto` выбирает
сторону, где больше места в `bounds` (по умолчанию кадр). `size` — кегль подписи (уровень
шкалы или px): подпись — это мысль кадра, она не мельче окружающего текста (`body`, для
главной мысли — `h2`); `note` — пояснение под ней.

Как увести подпись из плотного текста (код, абзац):
- `exit: "diagonal"` (по умолчанию) — излом вверх или вниз на ~50 px, затем горизонталь
  `reach`: линия уходит со строки цели в зазор между строками и дальше вбок;
- `exit: "horizontal"` — прямо вбок от середины стороны цели, без излома: только когда
  на высоте цели в сторону подписи пусто (цель в конце строки, справа поля);
- цель внутри плотной строки — бери `shape: "box"` на всю строку: линия стартует с края
  строки и не пересекает текст;
- `reach` подбирай так, чтобы подпись встала за край текстового блока (в свободную колонку),
  а не на текст.
```tsx
<Callout target={{ x: 70, y: 280, w: 930, h: 49 }} label="До трёх попыток" note="затем — понятная ошибка"
  size="h2" beat={b.callout} side="right" shape="box" reach={60} />
```

### Highlight
`{ children, beat, mode: "marker" | "underline" | "glow", accentIndex? = 0, seed?, style? }`

Акцент на 1–4 словах внутри строки (фраза не переносится):
- `marker` — неровный мазок маркера прокатывается за текстом слева направо;
- `underline` — рукописная линия прорисовывается под текстом, следом вторая, тоньше;
- `glow` — текст разгорается акцентом со свечением и коротким ударом масштаба, по буквам
  проходит блик (`children` — текст).
Бит Highlight ставь после входа строки: сначала текст читается, потом выделяется.
`seed` меняет неровность мазка и линии.
```tsx
<Enter kind="mask" beat={b.line}>
  <div style={big}>
    <Highlight beat={b.marker} mode="marker">объяснять</Highlight>, а не{" "}
    <Highlight beat={b.underline} mode="underline" accentIndex={1}>украшать</Highlight>
  </div>
</Enter>
```

### CodeBlock
`{ code, lang: "ts" | "py" | "json" | "bash", beat, highlightLines?: number[], title?,
width? = 1100, fontSize? = 30, style? }`

Окно редактора поднимается, код набирается **по токенам** (10–70 % бита): свежий токен
вспыхивает, за набором идёт каретка, в конце мигает. Номер строки проявляется с первым
токеном строки. С 74 % строки `highlightLines` (с 1) получают полосу-подсветку, остальные
приглушаются. Шрифт — `typography.mono` стиля, подсветка — акценты палитры (ключевые слова
`accent[0]`, строки `accent[1]`, числа `accent[2]`, комментарии приглушены). До 12 строк
по ~60 знаков при 30 px. Многострочные токены (docstring, JSDoc, шаблонные строки) набираются целиком, но
раскладываются по своим строкам (`codeLines`): номера строк, подсветка и каретка не
съезжают. Знаки моноширинные без трекинга: `codeCharWidth(fontSize)` = 0.6 кегля.
`codeLineRect(line, { width, fontSize, cols? })` — прямоугольник строки (или знаков
`cols: [from, to)`) от левого верхнего угла блока: цель для `Callout`.

Компоновка кадра с кодом: блок кода — левые ~60 % safe area, правая колонка — под мысль:
`Callout` на ключевую строку с `size="h2"` и `note`, подпись встаёт в правую колонку
(`reach`). Пустая правая половина кадра — брак композиции; самый мелкий текст кадра — не
главная мысль.
```tsx
<div style={{ position: "absolute", left: 0, top: 190 }}>
  <CodeBlock code={CODE} lang="ts" beat={b.code} highlightLines={[3, 4]} title="pipeline.ts" width={1120} />
</div>
```

### Particles
`{ count, seed, beat, layer: 0 | 1 | 2, area?: Rect, accentShare? = 0.35 }`

Поле светящихся частиц одного слоя глубины: 0 — дальние пылинки (мелкие, медленные),
1 — средние, 2 — ближние размытые «боке». Частицы проявляются вразброс в первые 45 % бита,
поднимаются с покачиванием и мерцают до конца сцены. Только `random(seed)` и кадр.
Атмосфера, а не содержание: 40–80 штук на слое 0, 6–12 на слое 2; за текстом, не поверх.
Для параллакса камеры оберни в `<Parallax layer>`.
```tsx
<Particles count={70} seed="dust" beat={{ start_frame: 0, end_frame: 60 }} layer={0} />
<Particles count={10} seed="bokeh" beat={{ start_frame: 0, end_frame: 60 }} layer={2} accentShare={0.6} />
```

### Card
`{ elevation: 0 | 1 | 2 | 3, children, beat?, enter?: CardEnter, delay?, accentIndex?,
width?, height?, padding?, style? }`

`CardEnter` (у Card и узлов FlowGraph) — входы, различимые с первого взгляда:

| enter | движение |
|---|---|
| `rise` | подъём снизу с перелётом (пружина bouncy) |
| `scale` | из глубины 0.78 → 1 с фокусом (размытие 10 px → 0) |
| `flip` | поворот к зрителю вокруг нижней кромки (rotateX, перспектива) |
| `pop` | «выстрел» из центра 0.35 → 1 с перелётом (пружина pop) |
| `slide` | въезд слева со смазом по ходу |
| `swing` | дверца: поворот вокруг левой кромки (rotateY) с перелётом |
| `blur` | проявление из расфокуса (16 px → 0, масштаб 1.06 → 1, пружина soft) |
| `fade` | тихое проявление |
| `none` | сразу на месте |

`elevation` задаёт тень, светлоту поверхности и блик кромки: 0 — плоская, 3 — самая
«высокая». `depth` стиля сдвигает уровень (`elevation + depth − 1`, в пределах 0..3) и
силу перспективы входа: «объёмнее» — это `depth`, а не правка elevation в коде. Вход по умолчанию: `flip` (поворот к зрителю) для 2–3 и `rise` для 0–1.
`accentIndex` рисует светящуюся кромку сверху. Для своих блоков в стиле kit:
- `cardSurface(style, elevation)` — оформление поверхности (фон, тень, радиус) без анимации;
- `cardEnterStyle(style, frame, fps, start, enter)` — стиль входа (`opacity`, `transform`,
  `filter`) с кадра `start`, как у Card. Не хук: можно звать в `.map()`.
```tsx
<Card elevation={3} beat={{ start_frame: 30, end_frame: 80 }} accentIndex={0} width={420}>…</Card>
```

### FlowGraph
`{ nodes: { id, label, x, y, w, h, elevation? = 2, caption?, accentIndex?, enter?, enterAt?,
flash? }[], edges: { id, from, to }[], beat, width?, height?, enter? = "flip", children? }`

Координаты узлов — в px внутри области графа. Узлы — карточки с глубиной. Они входят
слева направо в первые ~45% бита. Ребро прорисовывается, когда оба его узла на месте,
и заканчивается стрелкой. Рёбра — S-кривые: горизонтальные, если узлы разнесены по x
(≥ 16 px), иначе вертикальные. Подписи всех узлов получают общий кегль, при котором
каждая влезает в свой узел без многоточия (не крупнее `body`); `caption` узла — уровня
`caption`. Ширину узла закладывай примерно 0.57 × кегль × число символов + 60 px (для
`body` при 1080: ≈ 26 px на символ + 60): узкий узел мельчит подписи всего графа.

**Входы по узлам.** `enter` графа — вход по умолчанию; у узла может быть свой `enter`
(`CardEnter`, таблица в Card): разные входы разделяют роли — например, запрос `slide`,
оркестратор `pop`, инструменты `rise`. Группа равноправных узлов — один вход каскадом.
`enterAt` — кадр входа узла вместо каскада (бит элемента из spec); рёбра ждут оба конца.

**Вспышка узла по приходу импульса.** `flash: pulseArrival(edgeId, beat, travel?, { count?,
repeat? })` — узел вспыхивает (удар `accentPulse`: ореол, кромка акцентом, кольцо, толчок
масштаба) ровно в кадр, когда импульс `PulseAlongPath` с теми же `edgeId`, `beat`,
`travel`, `count`, `repeat` касается узла (ядро головы ближе 10 px к концу ребра) — на
каждом проходе. Кадры считает граф: он знает, когда ребро дорисовано и сколько длится
проход. `flash` принимает и массив, и кадры числом. Цвет — `accentIndex` узла.
```tsx
const TRAVEL = 22;
const back = { start_frame: 116, end_frame: 150 };
<FlowGraph nodes={[
  { id: "user", label: "Запрос", x: 0, y: 270, w: 280, h: 120, enter: "slide" },
  { id: "orc", label: "Оркестратор", x: 450, y: 255, w: 400, h: 150, enter: "pop",
    flash: pulseArrival("e-db", back, TRAVEL, { repeat: false }) },
  { id: "db", label: "База", x: 1040, y: 270, w: 300, h: 120, enter: "blur" },
]} edges={EDGES} beat={{ start_frame: 6, end_frame: 70 }}>
  <PulseAlongPath edgeId="e-db" beat={back} travel={TRAVEL} repeat={false} reverse />
</FlowGraph>
```

Для своих слоёв поверх графа:
- `useFlowGeometry()` возвращает `{ edges: Map<edgeId, CubicSegment>, ready: Map<edgeId, frame>,
  arrivals(pulseArrival(...)) → frame[] }` ближайшего FlowGraph (`null` вне графа). `ready` —
  кадр, когда ребро дорисовано; `arrivals` — кадры прихода импульса (по возрастанию): так
  плашка «Ответ готов» входит в момент прихода. Так же делают подписи у середины ребра
  или свои маркеры.
- `flowTiming(nodes, edges, beat, style, fps)` — тот же тайминг без React: `nodeStart`,
  `edgeStart`, `ready`, `edges`, `arrivals`.
- `edgePath(a, b)` возвращает `CubicSegment` ребра между двумя `FlowNode` по тем же
  правилам портов, что в графе. Пригодится, чтобы провести путь для `PulseAlongPath
  segments` или своей SVG-линии вне FlowGraph.

### PulseAlongPath
`{ edgeId? | segments?, beat, color?, tail? = 120, size? = 7, count? = 1, travel?, repeat? = true,
reverse? }`

Светящийся импульс с хвостом-кометой. Внутри `<FlowGraph>` указывай `edgeId`: импульс
не стартует, пока ребро не дорисовано. Вне графа передавай `segments` (`CubicSegment[]`
в px родителя). Проходы повторяются до конца бита, начатый проход доигрывается.
`reverse` пускает импульс в обратную сторону: данные возвращаются.
```tsx
<FlowGraph nodes={NODES} edges={EDGES} beat={{ start_frame: 18, end_frame: 90 }} width={810} height={524}>
  <PulseAlongPath edgeId="e-user" beat={{ start_frame: 60, end_frame: 150 }} count={2} />
  <PulseAlongPath edgeId="e-code" beat={{ start_frame: 78, end_frame: 150 }} reverse />
</FlowGraph>
```

## Функции

| Функция | Что делает |
|---|---|
| `useStyle()` | `ResolvedStyle` ближайшего `StyleProvider` |
| `resolveStyle({ preset, intensity, palette_overrides?, font?, depth?, transparent?, safe_area?, fps? })` | разрешённый стиль вне провайдера |
| `useBeat(beat)` | `{ progress 0..1, phase: before/enter/hold/exit/after, local, length }` |
| `beatProgress(frame, beat, easing?)` | доля бита 0..1 с clamp |
| `springAt(frame, fps, style, start, role)` | пружина 0→1 роли `soft`/`snappy`/`bouncy` из стиля; не хук, можно в `.map()` |
| `easingOf(style, "enter" \| "exit" \| "emphasis")`, `EASE.*` | кривые стиля и именованные (`outExpo`, `count`, `inOutCubic`, `outQuart`) |
| `frames(style, n)` | своя константа в кадрах (при 30 fps) под fps и интенсивность (calm ×1.25, energetic ×0.75); токены `style.motion.*_frames` уже пересчитаны |
| `fpsFrames(style, n)` | константа при 30 fps → кадры при fps сцены, без интенсивности (ритмы вроде мигания) |
| `staggerBeat(beat, index, total, stagger)` | окно элемента каскада: старт + index × stagger, разбег ≤ половины бита |
| `formatNumber(v, { locale, compact?, decimals? })` | `1 000 000`, `10,000`, `12,5 тыс.`, `2.4B`. Минус — U+2212, в ru 4-значные числа без пробела |
| `pluralForm(v, forms, { locale, compact?, decimals? })` | форма слова при числе: ru `[«релиз», «релиза», «релизов»]` → «1 релиз», «2 релиза», «5 релизов», «21 релиз»; дробное — «2,5 релиза»; en `[one, other]` |
| `accent(style, i)`, `alpha(c, a)`, `mix(a, b, t)`, `shadow(style, e)`, `radius`, `space`, `typeSize`, `fontFamily`, `contrastRatio` | токены StyleBible |
| `pathLUT(segments, samples)`, `pointAtLength(lut, s)`, `smoothSegments(points)`, `edgeSegment(a, b)`, `pathD(segments)` | геометрия путей без DOM |
| `niceTicks(min, max, count)` | «круглые» деления оси (1/2/5 × 10^k), покрывающие диапазон |
| `barLayout(values, rect, gapRatio, { max? })` | столбцы `Rect[]` на общей базовой линии, высота ∝ значению (`max` — верх шкалы) |
| `timelineLayout(n, rect, "h" \| "v")` | позиции вех: от края до края rect по середине |
| `tokenizeCode(src, lang)` | токены `{ text, kind: kw/str/num/com/id/punct/ws }`; склейка = исходный текст |
| `typedTokens(tokens, p)` | набранная к доле p часть кода целыми токенами (пробелы — вместе со следующим) |
| `codeLineRect(line, { width?, fontSize?, cols? })`, `codeCharWidth(fontSize)` | прямоугольник строки (или знаков) CodeBlock — цель для `Callout` |
| `codeLines(tokens)`, `caretLine(tokens, count)` | токены по строкам (многострочные режутся по `\n` с тем же idx); строка каретки после набора count токенов |
| `chartFont(height)` | кегль подписей осей графиков (caption шкалы кадра) |
| `sizePx(style, size, height)` | кегль `size` компонента: уровень шкалы, шаг 0..8 или px |
| `accentPulse(frame, style, { beat, loop?, strength? })` | единый акцент kit (см. Emphasis), не хук |
| `pulseArrival(edgeId, beat, travel?, { count?, repeat? })` | приход импульса для `FlowNode.flash` и `useFlowGeometry().arrivals` |
| `parallaxTransform(cam, layer, size?)`, `PARALLAX_OVERSCAN` | трансформация слоя параллакса; с размером кадра — с запасом за край |
| `barTimings(beat, n, stagger)`, `stepStarts(beat, n)` | кадры роста столбцов и активации шагов — для своих привязанных слоёв |

## Правила качества движения

Делай:
- Разные элементы — разные входы: заголовок `rise`, кикер `fade` по буквам, число со
  своим ударом, карточки `flip`/`scale`, схема — каскадом. Одинаковый fade всем
  запрещён (ТЗ §8.2).
- Разводи старты по времени: биты элементов перекрываются, но начинаются с шагом
  6–15 кадров. Главный акцент (число, итоговая точка графика) — последним.
- Сначала опору, потом данные: фон → заголовок → оси → линия → акцент.
- Темп задавай через биты и `StyleBible.motion` (пресет, интенсивность), а не числами
  в коде компонентов. «Медленнее на 25%» — растяни биты в 1.25 раза.
- Держи всё в `SafeArea`. Подписи на кириллице проверяй по ширине: узлы FlowGraph и
  карточки не должны обрезать текст.
- Один главный акцент в кадре: одно выделенное слово (`highlight`), одна выноска.

- Строй иерархию размером: главный акцент (число, вывод) — самый крупный в кадре
  (`AnimatedNumber size={7}` и больше), заголовок на шаг-два меньше (`size={5}`),
  подписи и кикеры — 0–2. Подпись к числу не повторяет слово из заголовка.

Не делай:
- CSS `transition`/`animation`, `setTimeout`, `Math.random`, `Date.now` — статическая
  проверка их отклонит. Случайность — `random("seed")` из remotion.
- `interpolate` от кадра без clamp. Выход пружины (`springAt`) не зажимай: перелёт —
  часть движения.
- Хуки (`useBeat`, `useStyle`, `useCurrentFrame`) внутри `.map()` и условий. В цикле
  зови `springAt`/`beatProgress`.
- Свои тени, цвета и шрифты поверх пресета. Нужен другой вид — смени пресет или
  передай свой StyleBible в `StyleProvider`.
- Заголовок крупнее главного числа или два элемента одного кегля, спорящие за внимание.
- `scaleX` на блоке с текстом (текст растягивается), анимацию `width` у карточек,
  пропорциональные цифры в счётчиках.
