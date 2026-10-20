# @ms/motion-kit 0.2.0 — справка для агента

Детерминированные компоненты Remotion 4.0.537. Всё движение считается от
`useCurrentFrame()`; оформление берётся из StyleBible (`useStyle()`). Импорт —
только `@ms/motion-kit`, `remotion`, `react`.

```tsx
import { AnimatedNumber, Background, Camera, Card, Enter, FlowGraph, KineticText, LineChart,
  Parallax, PulseAlongPath, SafeArea, StyleProvider } from "@ms/motion-kit";
```

Время задаётся битами: `beat = { start_frame, end_frame }` (поля `Beat` из MotionSpec).
Бит компонента — это окно, в котором идёт его анимация. Бит нулевой длины
(`start_frame === end_frame`) не ошибка: компонент показывает его ступенькой. После `end_frame` элемент
остаётся в итоговом состоянии. Исчезает он, только если это задано явно (`exit`).
Размеры указаны в px для кадра 1920×1080.

## Каркас сцены

```tsx
// props.json: { timing: { duration_frames, beats }, style: { preset, intensity, depth, transparent }, content }
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
transparent?, palette_overrides? }`), id пресета, StyleBible или готовый `ResolvedStyle`, и
разрешает его через `resolveStyle` под fps композиции. `useStyle()` возвращает
`ResolvedStyle` = StyleBible + `amplitude` + `depth` + `transparent`:

| Поле | Что значит |
|---|---|
| `motion.enter_frames`, `exit_frames`, `stagger_frames` | уже пересчитаны под fps (база 30) и интенсивность: бери как есть, в `frames()` не оборачивай |
| `amplitude` | размах движения: calm 0.6, balanced 1, energetic 1.35 (кадры: calm ×1.25, energetic ×0.75) |
| `depth` | 0 плоско · 1 как задумано · 2–3 объёмнее: тени карточек, перспектива, атмосфера фона, тень крупного текста |
| `transparent` | прозрачный экспорт: `Background` не рисуется, свой фон на корне сцены не ставь |
| `palette` | палитра пресета с `palette_overrides` (`accent[i]` заменяет `accent[i]`) |
| `grid.safe_area` | поля кадра (из настроек сцены) |

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
`{ kind, beat, index? = 0, total? = 1, direction?, distance?, exit?, style? }`. Старт
элемента `index` сдвигается на `stagger_frames` (`staggerBeat`), вход длится
`enter_frames` по кривой `easing.enter`; `pop` — пружина `spring.pop` с перелётом. С
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
от центра кадра). Масштаб зажат в `camera.max_scale` стиля, при `allow_zoom = false`
остаётся 1 (только панорама). Между ключами — кривая `easing.emphasis` без перелёта.
```tsx
<Camera keys={[{ frame: 0, scale: 1, x: 0, y: 0 }, { frame: 179, scale: 1.08, x: 0, y: 0 }]}>
  <Parallax layer={0}><Background /></Parallax>          {/* дальний план: как камера */}
  <Parallax layer={1}>{/* текст, графики */}</Parallax>
  <Parallax layer={2}>{/* ближний план: карточки */}</Parallax>
</Camera>
```
`<Parallax layer>` двигает слой как камеру × (1 + 0.15·layer); при `camera.parallax = false`
слои едут вместе. `layer` элемента — `depth_layer` из spec. `cameraAt(frame, keys, style)`
→ `{ scale, x, y }` для своих расчётов. Камера — только когда помогает смыслу: медленный
наезд на главное, панорама к следующему блоку. На наезде контент уходит к краям: держи
его в safe area, сжатой в `1 + (scale − 1)·(1 + 0.15·layer)` раз от центра.

## Safe area

`safeRect({ width, height, safe_area })` → `{ x, y, w, h }` в px — тот же расчёт, что у
`<SafeArea>` и `useSafeArea()` (она возвращает и `{ x, y, w, h }`, и
`{ left, top, width, height }`). Поля берутся из настроек сцены через стиль.

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
`{ from, to, beat, locale: "ru" | "en", prefix?, suffix?, compact?, decimals?, size? = 7,
font? = "display" | "mono", reserveWidth?, color?, align?, style?, value? }`

`value` — внешнее значение вместо своего счёта: привязка к другому источнику движения
(см. `lineChartHead`). Удар на финише остаётся в `end_frame` бита.

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
`{ points: { label, value }[], beat, area? = true, highlightLast? = true, width? = 1100,
height? = 560, locale? = "ru", compact? = true, accentIndex? = 0, yTicks? = 4,
valuePrefix?, valueSuffix? }`

Порядок внутри бита: сетка и подписи оси Y (первые 30%), затем гладкая монотонная
линия рисуется со светящейся «головой» (12–80% бита). Точки вспыхивают, когда линия до
них доходит, заливка открывается вслед. В конце последняя точка пульсирует, рядом
появляется выноска со значением (`highlightLast={false}` убирает выноску, если это
значение уже показывает герой-число). Подписи осей форматирует `formatNumber`. Точки
передавай по порядку оси X.

`lineChartHead(points, beat, frame, { width?, height?, yTicks? })` → `{ progress, value,
endFrame }` — голова линии в кадре (не хук). Счётчик, привязанный к линии, показывает
ровно значение под головой:
```tsx
const head = lineChartHead(POINTS, CHART_BEAT, frame, { width: 900, height: 560 });
<AnimatedNumber from={10_000} to={1_000_000} value={head.value}
  beat={{ start_frame: CHART_BEAT.start_frame, end_frame: head.endFrame }} locale="ru" size={8} />
```
```tsx
<LineChart points={[{ label: "янв 22", value: 10_000 }, /* … */ { label: "янв 25", value: 1_000_000 }]}
  beat={{ start_frame: 20, end_frame: 110 }} width={830} height={500} />
```

### Card
`{ elevation: 0 | 1 | 2 | 3, children, beat?, enter?: "rise" | "scale" | "flip" | "none",
delay?, accentIndex?, width?, height?, padding?, style? }`

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
`{ nodes: { id, label, x, y, w, h, elevation? = 2, caption?, accentIndex? }[],
edges: { id, from, to }[], beat, width?, height?, enter? = "flip", children? }`

Координаты узлов — в px внутри области графа. Узлы — карточки с глубиной. Они входят
слева направо в первые ~45% бита. Ребро прорисовывается, когда оба его узла на месте,
и заканчивается стрелкой. Рёбра — S-кривые: горизонтальные, если узлы разнесены по x
(≥ 16 px), иначе вертикальные. Подписи всех узлов получают общий кегль, при котором
каждая влезает в свой узел без многоточия. Ширину узла закладывай примерно
0.57 × кегль × число символов + 60 px.

Для своих слоёв поверх графа:
- `useFlowGeometry()` возвращает `{ edges: Map<edgeId, CubicSegment>, ready: Map<edgeId, frame> }`
  ближайшего FlowGraph (`null` вне графа). `ready` — кадр, когда ребро дорисовано. Так
  делают подписи у середины ребра или свои маркеры.
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
| `frames(style, n)` | своя константа в кадрах с учётом интенсивности (calm ×1.25, energetic ×0.75); токены `style.motion.*_frames` уже пересчитаны |
| `staggerBeat(beat, index, total, stagger)` | окно элемента каскада: старт + index × stagger, разбег ≤ половины бита |
| `formatNumber(v, { locale, compact?, decimals? })` | `1 000 000`, `10,000`, `12,5 тыс.`, `2.4B`. Минус — U+2212, в ru 4-значные числа без пробела |
| `accent(style, i)`, `alpha(c, a)`, `mix(a, b, t)`, `shadow(style, e)`, `radius`, `space`, `typeSize`, `fontFamily`, `contrastRatio` | токены StyleBible |
| `pathLUT(segments, samples)`, `pointAtLength(lut, s)`, `smoothSegments(points)`, `edgeSegment(a, b)`, `pathD(segments)` | геометрия путей без DOM |

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
