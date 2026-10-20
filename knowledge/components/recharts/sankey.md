# Sankey — `recharts/sankey`

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

Диаграмма потоков: узлы-прямоугольники по колонкам глубины и
связи-ленты (кубические кривые), толщина ленты пропорциональна величине
потока. Раскладка своя (итеративная релаксация, `iterations`).

## Когда использовать

Куда «утекает» ресурс: бюджет по статьям, путь пользователя, энергобаланс,
источники трафика → цели. Линейная цепочка без ветвлений — лучше
`recharts/funnel-chart`.

## Фразы из озвучки

- «откуда приходят деньги и куда они уходят»
- «из всех визитов только часть доходит до покупки»
- «основной поток идёт через поиск»

## Визуальный стиль

Полупрозрачные серые ленты (`stroke: '#333'`, `strokeOpacity: 0.2`) и
синие узлы (`#0088fe`) без темы; с темой — ленты цвета узла-источника.

## Входные данные

`<Sankey data={{nodes, links:[{source, target, value}]}} width height
nodePadding (10) nodeWidth (10) linkCurvature (0.5) iterations (32) node
(объект | элемент | функция(NodeProps)) link (объект | элемент |
функция(LinkProps)) sort (true) verticalAlign ('justify' | 'top') align
('justify' | 'left') margin (5) nameKey ('name') dataKey ('value')>`.
`LinkProps`: `sourceX`, `targetX`, `sourceY`, `targetY`,
`sourceControlX`, `targetControlX`, `linkWidth`, `index`, `payload`.

## Анимации

Встроенной анимации **нет** — модуль `animation` не импортируется, рендер
статичный. Есть только hover/click-обработчики для Tooltip.

## Исходники и документация

- `templates/infografika/recharts/src/chart/Sankey.tsx` — раскладка, props, рендер
- `templates/infografika/recharts/storybook/stories/API/chart/Sankey.stories.tsx` — примеры

## Зависимости

`recharts` (`Rectangle`, `Surface`, `Layer`), `es-toolkit`, redux.

## Совместимость и адаптация

`adaptable`: детерминированный SVG без таймеров, но движение нужно
добавить самим. Через `link`-функцию рисовать `<path>` с
`pathLength={1}` и `strokeDasharray={\`${p} 1\`}` (ленты «текут» слева
направо, stagger по `index`/глубине источника); через `node`-функцию —
`opacity`/`scaleY` узлов. `width`/`height` числами (сам компонент
форсирует `responsive={false}`). См. `knowledge/compatibility/recharts.md`.

## Паттерны

`relationships`, `transformation`, `cause-effect`, `system-structure`
