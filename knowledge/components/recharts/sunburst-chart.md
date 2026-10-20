# SunburstChart — `recharts/sunburst-chart`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

«Солнечные лучи»: иерархия в виде вложенных колец секторов — центр
корень, каждое следующее кольцо — уровень глубже, угол сектора —
доля значения; подписи на секторах.

## Когда использовать

Иерархическая структура 2–4 уровней: бюджет → статьи → подстатьи,
категории товаров, состав аудитории. Плоская структура — `recharts/pie-chart`,
прямоугольная мозаика — `recharts/treemap`.

## Фразы из озвучки

- «внутри каждого направления — свои подразделения»
- «разложим расходы по уровням»
- «из чего состоит каждая категория»

## Визуальный стиль

Концентрические кольца, белые разделители (`stroke: '#FFF'`), жирные
подписи с обводкой (`textOptions`); яркий, инфографичный.

## Входные данные

`<SunburstChart data (SunburstData: {name, value?, fill?, children?})
width height responsive (false) padding (2) ringPadding (2) innerRadius
(50) outerRadius cx cy startAngle (0) endAngle (360) dataKey ('value')
nameKey ('name') fill ('#333') stroke ('#FFF') textOptions>`.

## Анимации

Встроенной анимации **нет** (модуль `animation` не импортируется). Только
hover/click для Tooltip.

## Исходники и документация

- `templates/infografika/recharts/src/chart/SunburstChart.tsx` — props, рендер
- `templates/infografika/recharts/storybook/stories/API/chart/SunburstChart.stories.tsx` — примеры

## Зависимости

`recharts` (`Sector`, `Text`), `victory-vendor/d3-scale`, `es-toolkit`.

## Совместимость и адаптация

`adaptable`: статичный детерминированный SVG. Разворот по кадру —
`endAngle={startAngle + 360 * p}` (props есть у чарта; поведение подписей
на частичном угле рендером не проверено); проявление колец — по
уровню через `fill` с прозрачностью в данных. `width`/`height` числами.
См. `knowledge/compatibility/recharts.md`.

## Паттерны

`system-structure`, `quantities`
