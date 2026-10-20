# Treemap (beta) — `mermaid/treemap`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, новый (`treemap-beta`, синтаксис может меняться) |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Тримэп: вложенные прямоугольники, площадь которых пропорциональна
значению. Секции-родители с заголовками, листья со значениями.

## Когда использовать

Иерархические доли: бюджет по отделам и статьям, размер модулей кода,
рынок по сегментам. Для 2–6 долей без иерархии — `mermaid/pie`.

## Фразы из озвучки

- «самый большой кусок бюджета — инфраструктура»
- «внутри маркетинга почти всё съедает реклама»
- «видно, какие модули занимают больше всего места»

## Визуальный стиль

Плотная мозаика прямоугольников, цвет по секциям, подписи внутри.
Аналитический вид.

## Входные данные

Текстовый DSL (`docs/syntax/treemap.md`):

```
treemap-beta
"Section 1"
    "Leaf 1.1": 12
"Section 2"
    "Leaf 2.1": 20
```

Иерархия задаётся отступами, лист — `"Leaf": value`, стили — `:::class` и
`classDef`. Детектор принимает и `treemap` без суффикса.

## Анимации

Своей анимации нет. По кадру проявляются секции, затем листья внутри них.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/treemap/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/treemap/diagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/treemap/renderer.ts`
- `templates/infografika/mermaid/docs/syntax/treemap.md`, `templates/infografika/mermaid/demos/treemap.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `@mermaid-js/parser` (langium).

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
`renderer.ts` (`selectSvgElement` + `setupViewPortForSVG`, поддерживает
`classDef`). Классы секций и листьев сверить по готовому SVG. Смену
значений показывать заранее отрендеренными состояниями, а не перерендером
на каждый кадр.

## Паттерны

`quantities`, `system-structure`
