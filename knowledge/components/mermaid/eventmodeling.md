# Event Modeling — `mermaid/eventmodeling`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type (v11.15.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Диаграмма Event Modeling: таймлайн тайм-фреймов по дорожкам (UI и
процессоры, команды, read-модели, события). Связи между сущностями
выводятся автоматически.

## Когда использовать

Как меняется информация в системе по шагам: пользователь → команда →
событие → представление; event sourcing, DDD. Для простой
последовательности вызовов — `mermaid/sequence-diagram`.

## Фразы из озвучки

- «пользователь добавляет товар в корзину»
- «команда порождает событие „товар добавлен“»
- «экран обновляется из read-модели»

## Визуальный стиль

Цветные стикеры по типам сущностей на дорожках, время идёт слева
направо. Методологический вид.

## Входные данные

Текстовый DSL (`docs/syntax/eventmodeling.md`):

```
eventmodeling

tf 01 ui CartUI
tf 02 cmd AddItem
tf 03 evt ItemAdded
```

Есть компактная (`tf`) и полная (`timeframe`) нотации; полный список
типов сущностей — в доке.

## Анимации

Своей анимации нет. По кадру тайм-фреймы идут слева направо, как на
таймлайне.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/eventmodeling/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/eventmodeling/diagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/eventmodeling/renderer.ts`
- `templates/infografika/mermaid/docs/syntax/eventmodeling.md`, `templates/infografika/mermaid/demos/eventmodeling.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `@mermaid-js/parser` (langium, `parse('eventmodeling', …)`).

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: рисует
`renderer.ts` на d3 с `setupGraphViewbox`. Фреймы идут в порядке номеров
`tf`. Классы сверить по готовому SVG.

## Паттерны

`timeline`, `sequence-steps`
