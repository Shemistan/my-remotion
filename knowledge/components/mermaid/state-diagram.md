# State diagram — `mermaid/state-diagram`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Диаграмма состояний: скруглённые состояния, стрелки переходов с
событиями, начальная и конечная точки `[*]`, вложенные (составные)
состояния, fork/join, заметки.

## Когда использовать

Жизненный цикл объекта: статусы заказа, состояния соединения, конечный
автомат. Если важны шаги, а не статусы, — `mermaid/flowchart`.

## Фразы из озвучки

- «заказ переходит из статуса „новый“ в „оплачен“»
- «из любого состояния можно вернуться в ожидание»
- «система всегда находится в одном из трёх состояний»
- «после ошибки соединение снова пытается подключиться»

## Визуальный стиль

Скруглённые прямоугольники, тонкие стрелки, чёрные точки старта и финиша.

## Входные данные

Текстовый DSL (`docs/syntax/stateDiagram.md`):

```
stateDiagram-v2
    [*] --> Still
    Still --> Moving
    Moving --> Crash
    Crash --> [*]
```

`stateDiagram` или `stateDiagram-v2`; `state X { … }`,
`<<fork>>/<<join>>/<<choice>>`, `note`, `classDef`, `direction`. Конфиг
`state`: `arrowMarkerAbsolute`, `useMaxWidth`.

## Анимации

Своей анимации нет. По кадру удобно подсвечивать текущее состояние и
рисовать переход.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/state/stateDetector-V2.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/state/stateDiagram-v2.ts` — `new StateDB(2)`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/state/stateRenderer-v3-unified.ts`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/createGraph.ts`
- `templates/infografika/mermaid/docs/syntax/stateDiagram.md`, `templates/infografika/mermaid/demos/state.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `dagre-d3-es`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
unified-рендерер (`g.nodes > g.node`, `g.edges.edgePaths`). Для видео
хорошо работает так: отрендерить один раз и по кадру менять `fill`
активного `g.node` без перерендера.

## Паттерны

`transformation`, `sequence-steps`
