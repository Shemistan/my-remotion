# BarChart — `recharts/bar-chart`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Столбчатая диаграмма в SVG: вертикальные (`layout="horizontal"`) или
горизонтальные (`layout="vertical"`) столбцы, группы и стеки (`stackId`),
скруглённые углы, фон столбца, подписи значений, оси и сетка.

## Когда использовать

Сравнение категорий по одному-трём показателям, рейтинги, разбивка в стеке.
Для динамики во времени — `recharts/line-chart` / `recharts/area-chart`, для
долей целого — `recharts/pie-chart`. Если нужен готовый Remotion-native
вариант без адаптации — `remotion-bits/bit-bar-chart`.

## Фразы из озвучки

- «больше всего продаж — в Москве, следом Петербург»
- «сравним выручку пяти продуктов»
- «топ-5 причин обращений в поддержку»

## Визуальный стиль

Нейтральный «дашбордный»: плоские прямоугольники, цвета задаются `fill`
на `Bar`/`Cell` или темой (`RechartsThemeProvider`, `darkTheme`/`lightTheme`).

## Входные данные

`<BarChart>` (`CartesianChartProps`): `data`, `width`, `height` (числа),
`margin` (`{5,5,5,5}`), `layout` (`'horizontal'`), `barCategoryGap`
(`'10%'`), `barGap` (4), `barSize`, `maxBarSize`, `stackOffset` (`'none'`),
`reverseStackOrder` (false), `responsive` (false), `style`, `className`.
Дети: `<Bar dataKey stackId barSize radius background label shape
minPointSize isAnimationActive ('auto') animationBegin (0)
animationDuration (400) animationEasing ('ease') animationInterpolateFn
animationMatchBy>`, `Cell`, `XAxis`/`YAxis`, `CartesianGrid`, `Legend`,
`ReferenceLine`… `shape` получает `animationElapsedTime`, `isAnimating`,
`isEntrance`.

## Анимации

Встроенная: рост столбцов/перетекание между наборами данных через
`AnimatedItems` → `JavascriptAnimate`; время — `requestAnimationFrame` +
`performance.now()` (`RequestAnimationFrameTimeoutController`). Длительность
и задержка в миллисекундах, не в кадрах.

## Исходники и документация

- `templates/infografika/recharts/src/chart/BarChart.tsx` — обёртка над `CartesianChart`
- `templates/infografika/recharts/src/cartesian/Bar.tsx` — `BarProps`
- `templates/infografika/recharts/src/animation/JavascriptAnimate.tsx` — таймер анимации
- `templates/infografika/recharts/storybook/stories/API/chart/BarChart.stories.tsx` — примеры

## Зависимости

`recharts` (peer `react`, `react-dom`, `react-is`); внутри redux, `victory-vendor`.

## Совместимость и адаптация

`adaptable`: рендер — чистый SVG, но анимация живёт на rAF и при
`isAnimationActive='auto'` в headless Chrome включена. Рецепт: на каждом
`<Bar>` `isAnimationActive={false}`; прогресс `p = interpolate(frame, …)`;
в `data` умножать значения на `p` (или по столбцу со stagger); **зафиксировать
домен** `YAxis domain={[0, max]}`, иначе ось перемасштабируется вместе с
данными. `width`/`height` задавать числами, без `ResponsiveContainer`.
Общий рецепт — `knowledge/compatibility/recharts.md`.

## Паттерны

`comparison`, `quantities`, `growth-decline`
