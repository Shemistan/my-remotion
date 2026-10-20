# Kanban — `mermaid/kanban`

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

Канбан-доска: колонки-стадии с заголовками и карточки задач в них. У
карточек могут быть метаданные: исполнитель, тикет, приоритет.

## Когда использовать

Состояние работы по стадиям: что в очереди, что в работе, что готово. Для
хронологии — `mermaid/gantt` или `mermaid/timeline`.

## Фразы из озвучки

- «три задачи сейчас в работе»
- «эта карточка уже переехала в „Готово“»
- «в бэклоге копятся запросы»
- «каждая колонка — отдельная стадия процесса»

## Визуальный стиль

Колонки с карточками в спокойных цветах секций. Продуктовый вид,
как в таск-трекере.

## Входные данные

Текстовый DSL (`docs/syntax/kanban.md`):

```
kanban
  column1[Column Title]
    task1[Task Description]
```

Колонка — `id[Title]`, задача — `id[Text]` с отступом. Метаданные:
`@{ assigned: …, ticket: …, priority: … }`. Конфиг kanban описан в доке.

## Анимации

Своей анимации нет. По кадру: колонки, затем карточки сверху вниз.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/kanban/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/kanban/kanban-definition.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/kanban/kanbanRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/kanban.md` (демо в `demos/` нет)

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
`kanbanRenderer.ts` (`selectSvgElement` + `setupGraphViewbox`). Классы
колонок и карточек сверить по готовому SVG. Переезд карточки между
колонками средствами mermaid не анимируется: нужны два рендера с
cross-fade или перенос клона карточки вручную по кадру.

## Паттерны

`sequence-steps`, `comparison`
