# Venn diagram (beta) — `mermaid/venn`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`venn-beta`, v11.12.3+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Диаграмма Венна: перекрывающиеся круги-множества с подписями и подписанные
пересечения двух и трёх множеств.

## Когда использовать

Пересечение понятий («желаемое ∩ выполнимое ∩ жизнеспособное»), общие
черты групп, сегменты аудитории.

## Фразы из озвучки

- «хорошая фича лежит на пересечении трёх кругов»
- «у этих групп есть общая часть»
- «то, что одновременно нужно и выполнимо, мы и строим»

## Визуальный стиль

Полупрозрачные цветные круги. По умолчанию тема `redux-color` и look `neo`.
Концептуальный, презентационный.

## Входные данные

Текстовый DSL (`docs/syntax/venn.md`):

```
venn-beta
  title What makes a good feature
  set Desirable
  set Feasible
  union Desirable,Feasible["Buildable"]
```

`set`, `union A,B["label"]`, стили (`VennStyleData`). Конфиг —
`VennDiagramConfig`.

## Анимации

Своей анимации нет. По кадру круги съезжаются и перекрываются, затем
появляются подписи пересечений.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/venn/vennDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/venn/vennDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/venn/vennRenderer.ts` — d3, khroma
- `templates/infografika/mermaid/docs/syntax/venn.md`, `templates/infografika/mermaid/demos/venn.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `khroma`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: цвета
`vennRenderer.ts` считает через khroma (`lighten`/`darken`/`transparentize`).
Классы кругов и подписей сверить по готовому SVG. Сведение кругов —
`translate` каждого круга от внешней позиции к итоговой по кадру.

## Паттерны

`relationships`, `comparison`, `abstract-concepts`
