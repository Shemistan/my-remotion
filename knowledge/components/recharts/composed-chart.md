# ComposedChart — `recharts/composed-chart`

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

Комбинированный декартов график: в одной системе координат столбцы
(`Bar`), линии (`Line`), области (`Area`) и точки (`Scatter`), при
необходимости на двух осях Y (`yAxisId`).

## Когда использовать

Связь двух показателей разной природы: объём и доля, факт и план,
выручка столбцами + маржа линией. Если ряд один — бери специализированный
тип (`recharts/bar-chart`, `recharts/line-chart`).

## Фразы из озвучки

- «продажи росли, а маржа при этом падала»
- «столбцы — факт, линия — план»
- «чем больше рекламы, тем выше заявки»

## Визуальный стиль

Дашбордный; смешение заливок и линий, вторая ось справа
(`<YAxis yAxisId="right" orientation="right">`).

## Входные данные

`<ComposedChart>`: общие `CartesianChartProps` (`data`, `width`, `height`,
`margin`, `layout`, `barCategoryGap`, `barGap`, `stackOffset`). Дети —
`Bar`, `Line`, `Area`, `Scatter` со своими props (см. карточки
`recharts/bar-chart`, `recharts/line-chart`, `recharts/area-chart`,
`recharts/scatter-chart`), `XAxis`/`YAxis`, `ReferenceLine` и т.д.

## Анимации

У каждого графического элемента своя встроенная анимация на
`JavascriptAnimate` (rAF), со своими `animationDuration` по умолчанию
(Bar 400 мс, Line/Area 1500 мс).

## Исходники и документация

- `templates/infografika/recharts/src/chart/ComposedChart.tsx` — обёртка
- `templates/infografika/recharts/src/chart/CartesianChart.tsx` — общие props и значения по умолчанию
- `templates/infografika/recharts/storybook/stories/API/chart/ComposedChart.stories.tsx` — примеры

## Зависимости

`recharts`, redux, `victory-vendor`.

## Совместимость и адаптация

`adaptable`. На каждом элементе `isAnimationActive={false}`; дальше
поэтапно по кадру: сначала столбцы (умножение значений), затем линия
(`null`-хвост или `pathLength`-shape). Домены обеих осей фиксировать.
См. `knowledge/compatibility/recharts.md`.

## Паттерны

`comparison`, `cause-effect`, `growth-decline`
