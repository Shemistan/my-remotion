# @ms/motion-kit — справка для агента

Детерминированные компоненты Remotion 4.0.537. Всё движение считается от
`useCurrentFrame()`; оформление берётся из StyleBible (`useStyle()`). Импорт —
только `@ms/motion-kit`, `remotion`, `react`.

```tsx
import { AnimatedNumber, Background, Card, FlowGraph, KineticText, LineChart,
  PulseAlongPath, SafeArea, StyleProvider } from "@ms/motion-kit";
```

Время задаётся битами: `beat = { start_frame, end_frame }` (поля `Beat` из MotionSpec).
Бит компонента — это окно, в котором идёт его анимация. После `end_frame` элемент
остаётся в итоговом состоянии. Исчезает он, только если это задано явно (`exit`).
Размеры указаны в px для кадра 1920×1080.

## Каркас сцены

```tsx
export const Scene = () => (
  <StyleProvider style="dark-premium">       {/* или "light-clean" | "tech-neon" | StyleBible */}
    <Background beat={{ start_frame: 0, end_frame: 40 }} />
    <SafeArea>{/* весь контент внутри безопасной зоны */}</SafeArea>
  </StyleProvider>
);
```

| Пресет | Характер |
|---|---|
| `dark-premium` | графитовый фон, световые пятна, Manrope 800, фиолетовый, бирюзовый и янтарный акценты, мягкие пружины |
| `light-clean` | светлый фон с точечной сеткой, Inter 700, синий акцент, мягкие тени, сдержанное движение |
| `tech-neon` | почти чёрный фон, неоновая сетка-пол, JetBrains Mono, циан и маджента, свечение вместо теней, резкое движение (energetic) |

Шрифты (Inter, Manrope, JetBrains Mono, латиница и кириллица) загружаются при
импорте kit. `ensureFonts()` звать не нужно. Своих шрифтов и `staticFile` для шрифтов
не добавляй.

## Компоненты

### Background
`{ beat?, variant?: "aurora" | "grid" | "paper" | "solid", grain? = true, seed? }`. По
умолчанию вариант выбирается по пресету. Атмосфера проявляется за бит, пятна медленно
дрейфуют. `seed` меняет расположение пятен.
```tsx
<Background beat={{ start_frame: 0, end_frame: 45 }} seed="intro" />
```

### SafeArea / useSafeArea()
`<SafeArea style?>` — `AbsoluteFill` с полями из `grid.safe_area`. `useSafeArea()`
возвращает `{ left, top, width, height }` в px, если раскладку нужно считать вручную.

### KineticText
`{ text, beat, mode: "words" | "letters", enter: "rise" | "fade" | "scale" | "slide",
size? = 6, font? = "display" | "body" | "mono", weight?, color?, highlight?: string[],
align?, maxWidth?, lineHeight?, delay?, stagger?, exit?, caps?, style? }`

- `rise` — текст выходит из маски снизу с перелётом (для заголовков);
- `fade` — проявляется из размытия (для подписей и кикеров);
- `scale` — вырастает из глубины (для акцентного слова);
- `slide` — сдвиг со скосом (для перечислений и смены темы).

`size` — шаг шкалы 0..8 (18, 22, 28, 36, 48, 64, 88, 120, 160 px) или кегль в px,
если больше 8. Разбег частей не превышает 60% бита. Задержки частей слегка разбросаны
(`random(seed)`), поэтому части не входят строем.
```tsx
<KineticText text="Рост пользователей" beat={{ start_frame: 4, end_frame: 50 }}
  mode="words" enter="rise" highlight={["Рост"]} />
<KineticText text="Данные · 2022–2025" beat={{ start_frame: 0, end_frame: 30 }}
  mode="letters" enter="fade" size={1} font="mono" caps />
```

### AnimatedNumber
`{ from, to, beat, locale: "ru" | "en", prefix?, suffix?, compact?, decimals?, size? = 7,
font? = "display" | "mono", reserveWidth?, color?, align?, style? }`

Счёт идёт весь бит: разгон, затем долгое торможение (`EASE.count`). Цифры
моноширинные. На финише (`end_frame`) — короткий удар масштаба и свечения акцентом.
При быстром счёте цифры слегка смазываются. `reserveWidth` держит ширину под итоговое
значение; по умолчанию включено только без `prefix`/`suffix`.
```tsx
<AnimatedNumber from={10_000} to={1_000_000} beat={{ start_frame: 12, end_frame: 100 }}
  locale="ru" suffix="пользователей" size={6} />
```

### LineChart
`{ points: { label, value }[], beat, area? = true, highlightLast? = true, width? = 1100,
height? = 560, locale? = "ru", compact? = true, accentIndex? = 0, yTicks? = 4,
valuePrefix?, valueSuffix? }`

Порядок внутри бита: сетка и подписи оси Y (первые 30%), затем гладкая монотонная
линия рисуется со светящейся «головой» (12–80% бита). Точки вспыхивают, когда линия до
них доходит, заливка открывается вслед. В конце последняя точка пульсирует, рядом
появляется выноска со значением. Подписи осей форматирует `formatNumber`. Точки
передавай по порядку оси X.
```tsx
<LineChart points={[{ label: "янв 22", value: 10_000 }, /* … */ { label: "янв 25", value: 1_000_000 }]}
  beat={{ start_frame: 20, end_frame: 110 }} width={830} height={500} />
```

### Card
`{ elevation: 0 | 1 | 2 | 3, children, beat?, enter?: "rise" | "scale" | "flip" | "none",
delay?, accentIndex?, width?, height?, padding?, style? }`

`elevation` задаёт тень, светлоту поверхности и блик кромки: 0 — плоская, 3 — самая
«высокая». Вход по умолчанию: `flip` (поворот к зрителю) для 2–3 и `rise` для 0–1.
`accentIndex` рисует светящуюся кромку сверху. Для своих блоков в стиле kit есть
`cardSurface(style, elevation)` (только оформление, без анимации).
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
| `useStyle()` | StyleBible ближайшего `StyleProvider` |
| `useBeat(beat)` | `{ progress 0..1, phase: before/enter/hold/exit/after, local, length }` |
| `beatProgress(frame, beat, easing?)` | доля бита 0..1 с clamp |
| `springAt(frame, fps, style, start, role)` | пружина 0→1 роли `soft`/`snappy`/`bouncy` из стиля; не хук, можно в `.map()` |
| `easingOf(style, "enter" \| "exit" \| "emphasis")`, `EASE.*` | кривые стиля и именованные (`outExpo`, `count`, `inOutCubic`, `outQuart`) |
| `frames(style, n)` | длительность с учётом интенсивности (calm ×1.3, energetic ×0.8) |
| `formatNumber(v, { locale, compact?, decimals? })` | `1 000 000`, `10,000`, `12,5 тыс.`, `2.4B`. Минус — U+2212, в ru 4-значные числа без пробела |
| `accent(style, i)`, `alpha(c, a)`, `mix(a, b, t)`, `shadow(style, e)`, `radius`, `space`, `typeSize`, `fontFamily` | токены StyleBible |
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

Не делай:
- CSS `transition`/`animation`, `setTimeout`, `Math.random`, `Date.now` — статическая
  проверка их отклонит. Случайность — `random("seed")` из remotion.
- `interpolate` от кадра без clamp. Выход пружины (`springAt`) не зажимай: перелёт —
  часть движения.
- Хуки (`useBeat`, `useStyle`, `useCurrentFrame`) внутри `.map()` и условий. В цикле
  зови `springAt`/`beatProgress`.
- Свои тени, цвета и шрифты поверх пресета. Нужен другой вид — смени пресет или
  передай свой StyleBible в `StyleProvider`.
- `scaleX` на блоке с текстом (текст растягивается), анимацию `width` у карточек,
  пропорциональные цифры в счётчиках.
