# Quadrant chart — `mermaid/quadrant-chart`

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

Матрица 2×2: четыре цветных квадранта с подписями, подписи краёв осей,
точки-объекты с метками по координатам 0…1.

## Когда использовать

Приоритизация (охват × вовлечённость, усилие × ценность),
позиционирование конкурентов, матрица Эйзенхауэра. Для стратегической
карты эволюции — `mermaid/wardley`.

## Фразы из озвучки

- «кампания C попадает в правый верхний угол — её масштабируем»
- «всё, что слева внизу, стоит пересмотреть»
- «разложим проекты по двум осям: усилие и эффект»

## Визуальный стиль

Четыре пастельных квадранта и кружки-точки. Деловой, консалтинговый.

## Входные данные

Текстовый DSL (`docs/syntax/quadrantChart.md`):

```
quadrantChart
    title Reach and engagement of campaigns
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    Campaign A: [0.3, 0.6]
```

Точки задаются как `Name: [x, y]` в диапазоне 0…1. Можно задать стиль точки
и `classDef` (см. доку).

## Анимации

Своей анимации нет. По кадру: проявляются квадранты, затем точки по одной
встают на места.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/quadrant-chart/quadrantDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/quadrant-chart/quadrantDiagram.ts` — `styles: () => ''`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/quadrant-chart/quadrantRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/quadrantChart.md`, `templates/infografika/mermaid/demos/quadrantchart.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
собственный d3-рендерер, CSS-стилей нет, цвета приходят из
`themeVariables`. Классы групп квадрантов и точек по коду не сверялись —
снять с готового SVG. Точки идут в порядке DSL.

## Паттерны

`comparison`, `spatial`
