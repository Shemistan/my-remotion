# LineChart — `recharts/line-chart`

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

Линейный график: одна или несколько кривых по точкам данных, с точками
(`dot`), подписями, интерполяцией кривой (`type`: linear, monotone, step…),
пунктиром, осями и сеткой.

## Когда использовать

Динамика показателя во времени, тренды, сравнение 2–4 рядов. Для объёма
под кривой — `recharts/area-chart`; для смешения со столбцами —
`recharts/composed-chart`.

## Фразы из озвучки

- «за год аудитория выросла втрое»
- «после запуска кривая резко пошла вверх»
- «в марте был провал, но к лету восстановились»
- «сравним, как менялись цены у двух конкурентов»

## Визуальный стиль

Тонкие линии со скруглёнными стыками, круглые точки; цвет — `stroke`
на `Line` или тема. Деловой, «аналитический» вид.

## Входные данные

`<LineChart>`: `data`, `width`, `height`, `margin`, `layout`, `style`,
`className` (общие `CartesianChartProps`). `<Line dataKey type ('linear')
stroke strokeWidth strokeDasharray dot (true) activeDot (true) label
(false) connectNulls (false) shape hide isAnimationActive ('auto')
animationBegin (0) animationDuration (1500) animationEasing ('ease')
animateNewValues (true) animationInterpolateFn animationMatchBy>`.

## Анимации

Вход — «прорисовка» линии через `strokeDasharray` в `LineDrawShape`:
длина пути берётся `path.getTotalLength()` (DOM). Обновление данных —
интерполяция точек. Всё на `JavascriptAnimate` (rAF + `performance.now`).

## Исходники и документация

- `templates/infografika/recharts/src/chart/LineChart.tsx` — обёртка
- `templates/infografika/recharts/src/cartesian/Line.tsx` — `LineProps`
- `templates/infografika/recharts/src/cartesian/LineDrawShape.tsx` — вход через stroke-dasharray
- `templates/infografika/recharts/storybook/stories/API/chart/LineChart.stories.tsx` — примеры

## Зависимости

`recharts`, `victory-vendor` (d3-shape для кривых), redux внутри.

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}` на каждом `<Line>`. Рост линии
по кадру — три способа: (1) оставить все категории в `data`, а значения
после текущего индекса заменить на `null` (последнюю точку интерполировать
к следующей для плавности) — ось X не перестраивается; (2) свой `shape`:
`<Curve>` с `pathLength={1}` и `strokeDasharray={\`${p} 1\`}` — без DOM-
измерений; (3) `clip-path` по ширине области графика. Домен `YAxis`
фиксировать. Подробно — `knowledge/compatibility/recharts.md`.

## Паттерны

`growth-decline`, `timeline`, `comparison`
