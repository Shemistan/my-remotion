# XY chart — `mermaid/xychart`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Столбчатый и/или линейный график. По X — категории или числовая шкала, по
Y — диапазон. Серий `bar` и `line` может быть несколько, ориентация
вертикальная или горизонтальная.

## Когда использовать

Динамика метрики по месяцам, сравнение категорий, столбцы вместе с линией
тренда. Для долей — `mermaid/pie`, для многих измерений одного объекта —
`mermaid/radar`.

## Фразы из озвучки

- «выручка росла до июля, а потом пошла вниз»
- «пик продаж пришёлся на лето»
- «столбцы — факт, линия — тренд»
- «за год показатель вырос почти вдвое»

## Визуальный стиль

Простой плоский график без лишнего декора, цвета серий из
`themeVariables.xyChart`.

## Входные данные

Текстовый DSL (`docs/syntax/xyChart.md`):

```
xychart
    title "Sales Revenue"
    x-axis [jan, feb, mar, apr, may, jun]
    y-axis "Revenue (in $)" 4000 --> 11000
    bar [5000, 6000, 7500, 8200, 9500, 10500]
```

Также `line [...]` и `xychart horizontal`; допустимо ключевое слово
`xychart-beta`. Из конфига рендерер читает `width`, `height`,
`chartOrientation`, `showDataLabel`, `showDataLabelOutsideBar`.

## Анимации

Своей анимации нет. По кадру бары растут от базовой линии, линия
дорисовывается через `stroke-dashoffset`.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/xychart/xychartDetector.ts` — `xychart(-beta)?`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/xychart/xychartDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/xychart/xychartRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/xyChart.md`, `templates/infografika/mermaid/demos/xychart.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика
(`xychartRenderer.ts`): всё лежит в `g.main`, фон — `rect.background`.
Элементы собраны во вложенные `g` с классами из `shape.groupTexts`
(chartBuilder; точные имена групп серий сверить по SVG). Бары — `rect` в
порядке данных, линия — `path`. Рост бара — `scaleY` с `transform-origin`
на базовой линии. `viewBox` задан явно (`0 0 width height`), поэтому
масштабировать удобно.

## Паттерны

`growth-decline`, `quantities`, `comparison`
