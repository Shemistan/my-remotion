# ScatterChart — `recharts/scatter-chart`

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

Точечная диаграмма: точки по двум числовым осям, размер по третьей
(`ZAxis`), форма-символ (`circle`, `diamond`, `star`…), опционально
соединяющая линия или линия регрессии (`lineType="fitting"`).

## Когда использовать

Корреляция двух величин, кластеры, выбросы, «пузырьковая» диаграмма.
Не для временных рядов — там `recharts/line-chart`.

## Фразы из озвучки

- «чем выше цена, тем ниже спрос»
- «вот эти точки выбиваются из общей картины»
- «компании разделились на две группы»

## Визуальный стиль

Аналитический, научный; точки-символы с заливкой, тонкие оси.

## Входные данные

`<ScatterChart>`: общие `CartesianChartProps`. `<Scatter data dataKey
xAxisId yAxisId zAxisId shape ('circle' | элемент | функция) line (false)
lineType ('joint' | 'fitting') lineJointType ('linear') legendType
('circle') label (false) hide isAnimationActive ('auto') animationBegin
animationDuration animationEasing animationInterpolateFn animationMatchBy>`;
`<XAxis type="number" dataKey>`, `<YAxis type="number">`, `<ZAxis
range>`.

## Анимации

Появление/перемещение точек через `AnimatedItems` → `JavascriptAnimate`
(rAF). Функция `shape` получает `animationElapsedTime`.

## Исходники и документация

- `templates/infografika/recharts/src/chart/ScatterChart.tsx` — обёртка
- `templates/infografika/recharts/src/cartesian/Scatter.tsx` — `ScatterProps`
- `templates/infografika/recharts/storybook/stories/API/chart/ScatterChart.stories.tsx` — примеры

## Зависимости

`recharts`, `victory-vendor` (d3-scale, d3-shape для symbols).

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}`; появление точек по кадру —
`shape` как функция, которая масштабирует/проявляет символ по
`interpolate(frame - index*stagger, …)`, либо срез `data` по индексу.
Домены `XAxis`/`YAxis` фиксировать (`domain={[a,b]}`), иначе срез данных
сдвинет оси. См. `knowledge/compatibility/recharts.md`.

## Паттерны

`relationships`, `comparison`, `spatial`
