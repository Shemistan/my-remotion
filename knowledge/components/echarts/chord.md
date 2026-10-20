# ECharts chord — `echarts/chord`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Хордовая диаграмма: узлы — дуги по кругу, связи — ленты-хорды между
дугами, толщина по величине потока.

## Когда использовать

Взаимные потоки между небольшим числом групп: миграция, переходы
клиентов между брендами. Направленный поток по уровням —
`echarts/sankey`.

## Фразы из озвучки

- «клиенты перетекают между тремя брендами»
- «больше всего обмена — между Европой и Азией»
- «каждая лента — поток людей»

## Визуальный стиль

Кольцо дуг radius 70–80 %, `padAngle` 3, ленты цвета источника
opacity 0.2, подписи снаружи.

## Входные данные

`ChordSeriesOption`: `data`/`nodes` ([{name, value, itemStyle}]),
`links`/`edges` ([{source, target, value}]), `center`, `radius`
(['70%','80%']), `clockwise` (true), `startAngle` (90), `endAngle`
(`'auto'`), `padAngle` (3), `minAngle` (0), `itemStyle` ({borderRadius
[0,0,5,5]}), `lineStyle` ({color 'source', opacity 0.2, curveness}),
`label` ({position 'outside', distance 5}), `edgeLabel`,
`emphasis.focus` (`'adjacency'`).

## Анимации

Стандартный вход серии; подсветка смежных при hover.

## Исходники и документация

- `templates/infografika/echarts/src/chart/chord/ChordSeries.ts`
- `templates/infografika/echarts/src/chart/chord/ChordView.ts`
- `templates/infografika/echarts/test/chord.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; появление — `lineStyle.opacity` связей
от кадра; разворот кольца — `endAngle` от кадра (поведение лент при
частичном угле не проверено). Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`relationships`, `system-structure`
