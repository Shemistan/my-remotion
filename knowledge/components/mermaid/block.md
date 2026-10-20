# Block diagram — `mermaid/block`

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

Блок-диаграмма с ручной сеткой: блоки по колонкам, вложенные блоки,
пустые ячейки `space`, стрелки-блоки и связи. Расположение задаёт автор.

## Когда использовать

Высокоуровневая схема системы, где важна точная компоновка: слои, стек,
ряды компонентов. Если раскладку можно отдать автомату — `mermaid/flowchart`.
Облако с иконками — `mermaid/architecture`.

## Фразы из озвучки

- «система состоит из трёх слоёв»
- «данные идут из базы вниз, в сервис»
- «посередине — ключевой компонент»
- «каждый блок отвечает за свою часть работы»

## Визуальный стиль

Аккуратная сетка прямоугольников и стрелок-блоков. Схематичный,
инженерный.

## Входные данные

Текстовый DSL (сокращено из примера `docs/syntax/block.md`):

```
block
columns 1
  db(("DB"))
  space
  D
```

`columns N`, `block:ID … end`, ширина блока `id:N`, `space`, стрелка-блок
`<["…"]>(down)`, связи `-->`, `style`. Допустимо ключевое слово
`block-beta`.

## Анимации

Своей анимации нет. По кадру блоки появляются по рядам или колонкам,
затем связи.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/block/blockDetector.ts` — `block(-beta)?`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/block/blockDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/block/blockRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/block.md`, `templates/infografika/mermaid/demos/block.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: своя
раскладка блоков в `blockRenderer.ts`, маркеры из
`rendering-elements/markers`. Классы элементов сверить по готовому SVG.
Расположение задаёт автор, поэтому при смене подписей оно не меняется.

## Паттерны

`system-structure`, `spatial`
