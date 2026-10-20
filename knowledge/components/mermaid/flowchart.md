# Flowchart — `mermaid/flowchart`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data`, `css-animation`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Блок-схема: узлы разных форм (прямоугольник, ромб, круг и десятки форм
через `@{ shape }`), стрелки с подписями, подграфы-контейнеры. Раскладка
автоматическая: dagre или ELK.

## Когда использовать

Процесс с ветвлениями, алгоритм, путь решения, «если — то». Для линейного
списка шагов проще stagger-список. Если важны роли — `mermaid/swimlanes`.
Для облачной инфраструктуры с иконками — `mermaid/architecture`.

## Фразы из озвучки

- «сначала запрос попадает в шлюз, затем — в очередь»
- «если проверка не прошла, возвращаемся на шаг назад»
- «весь процесс укладывается в пять шагов»
- «здесь путь разветвляется на два сценария»

## Визуальный стиль

Плоские фигуры с тонкой обводкой. Темы default/neutral/dark/forest/base,
`look`: classic, handDrawn или neo. Цвета задаются через
`classDef`/`style`/`themeVariables`.

## Входные данные

Текстовый DSL (`docs/syntax/flowchart.md`):

```
flowchart TB
    A --> C
    A --> D
    B --> C
    B --> D
```

- Ключевое слово `flowchart` или `graph`; направление TB/TD/BT/LR/RL.
- Формы `[] () {} (())` и `A@{ shape: … }`; `subgraph … end`.
- Рёбра `--> --- -.-> ==>`, метки `|…|`, id ребра `e1@-->`.
- Стили: `classDef`, `class`, `style`.
- Конфиг `flowchart`: `nodeSpacing`/`rankSpacing` (50), `diagramPadding`
  (8), `titleTopMargin`, `useMaxWidth`; глобально `layout: dagre | elk`.

## Анимации

Своей анимации появления нет. Единственное движение — анимированные рёбра
`e1@{ animate: true }` / `animation: fast|slow`: классы
`.edge-animation-fast|slow` с бесконечным `@keyframes dash` в `src/styles.ts`.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/flowchart/flowDetector-v2.ts` — детектор `graph|flowchart`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/flowchart/flowDiagram.ts` — `createFlowDiagram` (его же использует swimlanes)
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/flowchart/flowRenderer-v3-unified.ts` — draw
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/render.ts`, `createGraph.ts` — unified-рендер
- `templates/infografika/mermaid/packages/mermaid/src/styles.ts` — keyframes рёбер
- `templates/infografika/mermaid/docs/syntax/flowchart.md`, `templates/infografika/mermaid/demos/flowchart.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `dagre-d3-es`; `elkjs` (ленивый import при
`layout: elk`); `roughjs` для handDrawn.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: группы
`g.root > g.clusters / g.edges.edgePaths / g.edgeLabels / g.nodes`; узел —
`g.node` с id `<svgId>-<domId>`. `animate` у рёбер не включать: рёбра
«рисовать» по кадру через `stroke-dashoffset`. `click`/`href` игнорировать.
handDrawn — только с `handDrawnSeed`.

## Паттерны

`sequence-steps`, `cause-effect`, `system-structure`
