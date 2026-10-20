# ECharts graph — `echarts/graph`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE); `forceHelper.ts` — код d3, BSD-3 |

## Что визуализирует

Граф узлов и связей: ручная раскладка по `x/y`, круговая или силовая;
категории цветом, размер узла по значению, стрелки, подписи рёбер.

## Когда использовать

Соцграф, зависимости сервисов, карта знаний. Иерархия — `echarts/tree`;
потоки с величиной — `echarts/sankey`, `echarts/chord`.

## Фразы из озвучки

- «все сервисы связаны через шину»
- «этот человек — центр всей сети»
- «посмотрим, как связаны темы»

## Визуальный стиль

Круги 10 px, тонкие связи, цвета по `categories`; force — «молекула».

## Входные данные

`GraphSeriesOption`: `data`/`nodes` ([{name, x, y, value, category,
symbolSize, fixed}]), `links`/`edges` ([{source, target, value,
lineStyle}]), `categories`, `layout` (`'none'`|`'force'`|`'circular'`),
`circular` ({rotateLabel false}), `force` ({initLayout, repulsion [0,50],
gravity 0.1, friction 0.6, edgeLength 30, layoutAnimation true}),
`edgeSymbol`, `edgeSymbolSize` (10), `edgeLabel`, `autoCurveness`,
`symbol`, `symbolSize` (10), `roam`, `draggable` (false).

## Анимации

Force: шаги раскладки на каждом кадре zrender (`layoutAnimation`), при
этом обычная анимация серии выключена (`isAnimationEnabled`); `none`/
`circular` — обычный вход; перетаскивание узлов.

```ts
n.p = vec2.create(width * (Math.random() - 0.5) + center[0], …); // forceHelper.ts
```

## Исходники и документация

- `templates/infografika/echarts/src/chart/graph/GraphSeries.ts`
- `templates/infografika/echarts/src/chart/graph/GraphView.ts`
- `templates/infografika/echarts/src/chart/graph/forceLayout.ts`, `forceHelper.ts`
- `templates/infografika/echarts/test/graph.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. Force без `x/y` стартует с `Math.random()` — разные вкладки
рендера дадут разные раскладки. Брать `layout: 'none'` с заранее
посчитанными `x/y` или `'circular'`; `animation: false`, `roam: false`.
Появление — срез узлов/связей или `opacity` в данных от кадра. Общий
рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`relationships`, `system-structure`
