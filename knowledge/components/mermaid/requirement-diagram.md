# Requirement diagram — `mermaid/requirement-diagram`

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

Диаграмма требований SysML: карточки требований (id, текст, риск, метод
проверки) и элементов, связи satisfies/traces/contains/verifies и т.п.

## Когда использовать

Трассировка требований к компонентам и тестам, системная инженерия. Для
связей бизнес-сущностей — `mermaid/er-diagram`.

## Фразы из озвучки

- «это требование закрывает модуль симуляции»
- «каждое требование проверяется тестом»
- «риск у этого пункта высокий»

## Визуальный стиль

Карточки со стереотипом `<<requirement>>`, линии с подписями типа связи.
Формальный инженерный вид.

## Входные данные

Текстовый DSL (`docs/syntax/requirementDiagram.md`):

```
requirementDiagram
    requirement test_req {
    id: 1
    text: the test text.
    }
```

Также `element X { type: … }`, `risk`, `verifymethod`, связи
`a - satisfies -> b`, `classDef`/`style`, `direction`. Детектор принимает
`requirement` и `requirementDiagram`.

## Анимации

Своей анимации нет. По кадру: требования, затем элементы, затем связи.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/requirement/requirementDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/requirement/requirementDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/requirement/requirementRenderer.ts`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/createGraph.ts`
- `templates/infografika/mermaid/docs/syntax/requirementDiagram.md`, `templates/infografika/mermaid/demos/requirements.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `dagre-d3-es`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
unified-рендерер (`requirementRenderer.ts` → `render.ts`), группы
`g.nodes`, `g.edges.edgePaths`, `g.edgeLabels` как у flowchart.

## Паттерны

`relationships`, `system-structure`
