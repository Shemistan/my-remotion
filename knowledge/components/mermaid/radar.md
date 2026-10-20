# Radar chart (beta) — `mermaid/radar`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`radar-beta`, v11.6.0+) |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Радар («паутина»): оси-лучи из центра, концентрическая сетка (круг или
многоугольник), замкнутые полупрозрачные кривые объектов, легенда.

## Когда использовать

Сравнить 2–4 объекта по 4–8 характеристикам: навыки, параметры продукта,
оценки. Для одной метрики во времени — `mermaid/xychart`.

## Фразы из озвучки

- «по математике Алиса сильнее, по истории — Боб»
- «наш продукт выигрывает по скорости и цене»
- «профиль кандидата почти идеально сбалансирован»

## Визуальный стиль

Круглая или многоугольная сетка, полупрозрачные заливки серий.
Аналитический вид.

## Входные данные

Текстовый DSL (`docs/syntax/radar.md`):

```
radar-beta
  axis m["Math"], s["Science"], e["English"]
  curve a["Alice"]{85, 90, 80}
  curve b["Bob"]{70, 75, 85}
  max 100
```

Опции из доки: `showLegend`, `max`, `min` (0), `graticule circle|polygon`
(по умолчанию circle), `ticks` (5). Значения кривой можно задать
парами `{ axis3: 30, … }`.

## Анимации

Своей анимации нет. По кадру кривые «раздуваются» из центра по одной.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/radar/detector.ts` — `radar-beta`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/radar/diagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/radar/renderer.ts`
- `templates/infografika/mermaid/docs/syntax/radar.md`, `templates/infografika/mermaid/demos/radar.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `@mermaid-js/parser` (langium).

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: простой
рендерер (`selectSvgElement` + `configureSvgSize`), кривые идут в порядке
`curve`. Классы сверить по готовому SVG. Рост кривой — `transform:
scale(p)` с origin в центре сетки.

## Паттерны

`comparison`, `quantities`
