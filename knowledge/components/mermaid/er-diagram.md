# Entity Relationship diagram — `mermaid/er-diagram`

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

ER-диаграмма: сущности-таблицы с атрибутами и связи в нотации «вороньих
лапок» (один-ко-многим и т.п.) с подписями.

## Когда использовать

Схема базы данных, связи между бизнес-сущностями. Классы с методами лучше
показывать через `mermaid/class-diagram`.

## Фразы из озвучки

- «у одного клиента может быть много заказов»
- «каждый заказ состоит из позиций»
- «таблицы связаны через идентификатор пользователя»

## Визуальный стиль

Прямоугольники-таблицы, линии связей с маркерами кардинальности. Деловой
технический вид.

## Входные данные

Текстовый DSL (`docs/syntax/entityRelationshipDiagram.md`):

```
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
```

Атрибуты задаются как `ENTITY { type name PK/FK "comment" }`.
Кардинальности: `|o || }o }|`. Связи бывают идентифицирующие `--` и
неидентифицирующие `..`.

## Анимации

Своей анимации нет. По кадру: сначала сущности, потом связи.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/er/erDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/er/erDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/er/erRenderer-unified.ts`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/createGraph.ts`
- `templates/infografika/mermaid/docs/syntax/entityRelationshipDiagram.md`, `templates/infografika/mermaid/demos/er.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `dagre-d3-es`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
unified-рендерер (`erRenderer-unified.ts` → `render.ts`), структура групп
такая же, как у flowchart.

## Паттерны

`relationships`, `system-structure`
