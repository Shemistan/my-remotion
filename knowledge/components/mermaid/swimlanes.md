# Swimlanes (beta) — `mermaid/swimlanes`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`swimlane-beta`, v11.16.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Кросс-функциональная блок-схема: дорожки (по одной на `subgraph`) с
шагами внутри и стрелками передачи работы между дорожками.

## Когда использовать

Процесс, где важно, кто отвечает за шаг: согласование, поддержка,
доставка, передача между командами. Если роли не нужны —
`mermaid/flowchart`.

## Фразы из озвучки

- «клиент оплачивает, и заказ уходит на склад»
- «финансы выставляют счёт параллельно со сборкой»
- «здесь работа переходит от одной команды к другой»

## Визуальный стиль

Полосы-дорожки с заголовками. По умолчанию тема `redux-color` и look
`neo`. Деловой процессный вид.

## Входные данные

Текстовый DSL (`docs/syntax/swimlanes.md`):

```
swimlane-beta LR
  subgraph Customer
    Pay[Pay]
  end
  Pay --> Pick
```

Синтаксис flowchart целиком (`createFlowDiagram`), каждая `subgraph` —
дорожка. Раскладка — `layout: swimlane`, задана в схеме как
`swimlane.layout`.

## Анимации

Своей анимации нет. От flowchart унаследованы анимированные рёбра
`animate` (CSS `@keyframes`). По кадру: дорожки, затем шаги и передачи.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/swimlanes/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/swimlanes/swimlanesDiagram.ts` — `createFlowDiagram({ styles })`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/flowchart/flowDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/render.ts` — layout `swimlane`
- `templates/infografika/mermaid/docs/syntax/swimlanes.md` (демо в `demos/` нет)

## Зависимости

`mermaid` 12.2.0, `d3`, раскладка `rendering-util/layout-algorithms/swimlanes`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: это
flowchart со своей раскладкой и стилями. Структура та же: `g.clusters`
(дорожки), `g.nodes`, `g.edges.edgePaths`. `animate` у рёбер не
включать.

## Паттерны

`sequence-steps`, `relationships`
