# Mindmap — `mermaid/mindmap`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type (иконки — экспериментальная часть) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `engine:other`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Карта мыслей: центральная идея и расходящиеся ветви. Узлы бывают разных
форм (круг, облако, взрыв, шестиугольник), у каждой ветки свой цвет,
можно добавить иконки.

## Когда использовать

Разложить тему на подтемы, обзор понятия, мозговой штурм. Для строгой
файловой иерархии — `mermaid/tree-view`, для пропорций —
`mermaid/treemap`.

## Фразы из озвучки

- «у этой идеи три большие ветви»
- «всё начинается с одного центрального понятия»
- «каждое направление делится на несколько подтем»

## Визуальный стиль

Органичная раскладка вокруг центра, цветные ветви, мягкие формы.
Дружелюбный обзорный вид.

## Входные данные

Текстовый DSL (`docs/syntax/mindmap.md`):

```
mindmap
  root((mindmap))
    Origins
      Long history
    Tools
```

Иерархия задаётся отступами. Формы: `[] () (()) )) (( {{ }}`. Есть
`::icon(fa fa-book)` (экспериментально) и `:::class`. Раскладка —
`layout`, по умолчанию `cose-bilkent`.

## Анимации

Своей анимации нет. По кадру: центр, затем ветви уровень за уровнем.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/mindmap/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/mindmap/mindmap-definition.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/mindmap/mindmapRenderer.ts` — `fallback: 'cose-bilkent'`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/render.ts`
- `templates/infografika/mermaid/docs/syntax/mindmap.md`, `templates/infografika/mermaid/demos/mindmap.html`

## Зависимости

`mermaid` 12.2.0 — нужна полная сборка, не tiny. Плюс `d3` и cytoscape с
cose-bilkent (`rendering-util/layout-algorithms/cose-bilkent`).

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
unified-рендер с раскладкой cose-bilkent. Тип регистрируется только при
`includeLargeFeatures`. Детерминизм cose-bilkent не проверен: рендерить
один раз и между кадрами не перерендеривать. Узлы — `g.node`, ветви — в
`g.edges.edgePaths`. Иконки работают только с подключённым icon pack или
шрифтом FontAwesome, иначе на их месте пусто.

## Паттерны

`abstract-concepts`, `system-structure`
