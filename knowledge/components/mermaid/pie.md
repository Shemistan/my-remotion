# Pie chart — `mermaid/pie`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Круговая диаграмма (кольцевая, если задан `donutHole`) с процентами на
секторах, заголовком и легендой.

## Когда использовать

Доли целого из 2–6 частей: структура выручки, доля рынка. Сектора меньше
1 % рендерер отбрасывает. Для динамики — `mermaid/xychart`, для
иерархических долей — `mermaid/treemap`.

## Фразы из озвучки

- «почти половина бюджета уходит на маркетинг»
- «собаки — абсолютный лидер среди питомцев»
- «три четверти пользователей приходят с мобильных»
- «остальное делят между собой два небольших сегмента»

## Визуальный стиль

Классический пирог: цвета `pie1…pie12` из темы, проценты на секторах,
легенда.

## Входные данные

Текстовый DSL (`docs/syntax/pie.md`):

```
pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
    "Rats" : 15
```

`showData` выводит значения в легенде. Конфиг `pie` (`pieRenderer.ts`):
`textPosition`, `donutHole` (0…0.9), `legendPosition` (center/top/…),
`highlightSlice` (`'hover'` или метка). `themeVariables`: `pie1…pie12`,
`pieOuterStrokeWidth`.

## Анимации

Своей анимации нет. По кадру: сектора раскрываются по кругу маской или
появляются по одному.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/pie/pieDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/pie/pieDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/pie/pieRenderer.ts` — d3 `arc`/`pie`, легенда
- `templates/infografika/mermaid/docs/syntax/pie.md`, `templates/infografika/mermaid/demos/pie.html`

## Зависимости

`mermaid` 12.2.0, `d3` (`arc`, `pie`, `scaleOrdinal`).

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика
(`pieRenderer.ts`): сектор — `path.pieCircle`, процент — `text.slice`,
легенда — `g.legend`, обводка — `circle.pieOuterCircle`, заголовок —
`text.pieTitleText`; центр задан `transform` группы. Раскрытие по кругу
делается `clip-path`/маской-сектором с углом от кадра. `highlightSlice:
'hover'` не включать. Ширина легенды меряется `getBoundingClientRect`, так
что шрифт грузится заранее.

## Паттерны

`quantities`, `comparison`
