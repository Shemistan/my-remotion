# Timeline — `mermaid/timeline`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type (иконки — экспериментальная часть) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Хронология: ось с периодами, горизонтальная (LR) или вертикальная (TD).
Под каждым периодом одна или несколько карточек событий, секции окрашены
по порядку.

## Когда использовать

История продукта, этапы развития, ключевые годы. Если нужны длительности и
зависимости — `mermaid/gantt`, если ветки — `mermaid/gitgraph`.

## Фразы из озвучки

- «в 2004 году появился Facebook»
- «за десять лет рынок прошёл четыре этапа»
- «каждый год приносил новую платформу»
- «а затем всё изменилось»

## Визуальный стиль

Цветные плашки периодов и событий на линии времени. Лёгкий
презентационный вид.

## Входные данные

Текстовый DSL (`docs/syntax/timeline.md`):

```
timeline
    title History of Social Media Platform
    2002 : LinkedIn
    2004 : Facebook
         : Google
```

Есть `section …`. Направление `TD` включает вертикальный рендерер
(`timelineRendererVertical`). Иконки экспериментальные.

## Анимации

Своей анимации нет. По кадру периоды идут слева направо, события под ними
появляются с задержкой.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/timeline/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/timeline/timeline-definition.ts` — выбор LR/TD рендерера
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/timeline/timelineRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/timeline.md`, `templates/infografika/mermaid/demos/timeline.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: два
рендерера (LR и TD), рисуют через `svgDraw`. Классы периодов и событий по
коду не сверялись — снять с готового SVG. Порядок совпадает с DSL, так что
stagger по индексу ложится естественно.

## Паттерны

`timeline`, `sequence-steps`
