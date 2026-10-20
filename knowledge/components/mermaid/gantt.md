# Gantt chart — `mermaid/gantt`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Диаграмма Ганта: полосы задач по шкале времени, секции, зависимости
`after`, вехи, критические и выполненные задачи, сетка дат, линия
«сегодня».

## Когда использовать

План проекта, роадмап по датам, сравнение длительностей этапов. Для
событий без длительности — `mermaid/timeline`.

## Фразы из озвучки

- «разработка займёт шесть недель, тестирование — ещё две»
- «второй этап стартует сразу после первого»
- «к марту выходим на релиз»
- «критический путь проходит через интеграцию»

## Визуальный стиль

Полосы, окрашенные по секциям (`numberSectionStyles`), ось дат. Деловой
проектный вид.

## Входные данные

Текстовый DSL (`docs/syntax/gantt.md`):

```
gantt
    title A Gantt Diagram
    dateFormat YYYY-MM-DD
    section Section
        A task          :a1, 2014-01-01, 30d
```

Теги `done/active/crit/milestone`, `after id`, `excludes`, `axisFormat`,
`tickInterval`, `todayMarker`. В конфиге `gantt` рендерер читает
`barHeight`, `barGap`, `gridLineStartPadding`, `fontSize`,
`numberSectionStyles`.

## Анимации

Своей анимации нет. По кадру полосы растут слева направо, секция за
секцией.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/gantt/ganttDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/gantt/ganttDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/gantt/ganttRenderer.js` — d3 `scaleTime`, оси, бары
- `templates/infografika/mermaid/docs/syntax/gantt.md`, `templates/infografika/mermaid/demos/gantt.html`

## Зависимости

`mermaid` 12.2.0, `d3` (scaleTime, axisBottom/axisTop), `dayjs`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика
(`ganttRenderer.js`): бар — `rect` с классом `task` плюс
`active/done/crit/milestone` и номер секции. Рендерер ставит
`transform-origin` в центр бара; для роста слева направо origin нужно
перенести на левый край (`x`). Подпись — `text` с id `<svgId>-<taskId>-text`.
**Обязательно `todayMarker off`**, иначе линия «сегодня» зависит от даты
рендера. Клики по задачам игнорировать.

## Паттерны

`timeline`, `sequence-steps`, `comparison`
