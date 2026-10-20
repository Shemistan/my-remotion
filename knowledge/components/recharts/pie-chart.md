# PieChart — `recharts/pie-chart`

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

Круговая и кольцевая (donut, `innerRadius > 0`) диаграммы, полукруг
(`startAngle`/`endAngle`), несколько вложенных колец, выносные подписи с
линиями (`label` + `labelLine`), отступы между секторами (`paddingAngle`).

## Когда использовать

Доли целого, 2–6 сегментов: структура выручки, бюджет, опрос. Больше
сегментов или иерархия — `recharts/treemap`/`recharts/sunburst-chart`;
одна метрика-прогресс — `recharts/radial-bar-chart`.

## Фразы из озвучки

- «больше половины пользователей — с телефонов»
- «бюджет делится на три основные статьи»
- «каждый четвёртый выбрал второй вариант»

## Визуальный стиль

Плоские сектора, цвета через `Cell`/`fill` или тему; donut с цифрой в
центре (`<Label position="center">`) — инфографичный вид.

## Входные данные

`<PieChart>` (`PolarChartProps`): `width`, `height`, `margin`, `cx`/`cy`
(`'50%'`), `startAngle` (0), `endAngle` (360), `innerRadius` (0),
`outerRadius` (`'80%'`). `<Pie data dataKey nameKey ('name') cx cy
startAngle endAngle innerRadius outerRadius paddingAngle cornerRadius
minAngle (0) label (false) labelLine (true) shape legendType ('rect')
isAnimationActive ('auto') animationBegin (400) animationDuration (1500)
animationEasing ('ease') animationInterpolateFn animationMatchBy>`; `Cell`,
`Label`, `LabelList`.

## Анимации

Сектора «разворачиваются» по углу; `AnimatedItems` → `JavascriptAnimate`
(rAF), стартовая задержка 400 мс.

## Исходники и документация

- `templates/infografika/recharts/src/chart/PieChart.tsx` — обёртка, значения по умолчанию
- `templates/infografika/recharts/src/polar/Pie.tsx` — `PieProps`, `PieDef`
- `templates/infografika/recharts/src/chart/PolarChart.tsx` — общие полярные props
- `templates/infografika/recharts/storybook/stories/API/chart/PieChart.stories.tsx` — примеры

## Зависимости

`recharts` (`Sector`), redux.

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}` на `<Pie>`; разворот по кадру —
`endAngle={startAngle + 360 * p}` на `<Pie>` (доли пересчитываются в
пределах угла, картинка как у встроенной анимации). Выносные подписи
измеряют текст через DOM — шрифты загрузить до рендера. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`quantities`, `comparison`, `system-structure`
