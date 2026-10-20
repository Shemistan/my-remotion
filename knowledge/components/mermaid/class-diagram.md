# Class diagram — `mermaid/class-diagram`

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

UML-диаграмма классов: прямоугольники с именем, полями и методами; связи
наследования, композиции, агрегации и ассоциации; заметки.

## Когда использовать

Модель предметной области или структура кода: сущности, их поля и
наследование. Таблицы БД лучше показывать через `mermaid/er-diagram`,
процессы — через `mermaid/flowchart`.

## Фразы из озвучки

- «у базового класса три наследника»
- «каждый заказ содержит список позиций»
- «утка умеет плавать и летать — это её методы»
- «вот как устроена модель данных приложения»

## Визуальный стиль

Строгий UML с секциями внутри класса. Цвета — из темы и `classDef`.

## Входные данные

Текстовый DSL (`docs/syntax/classDiagram.md`):

```
classDiagram
    Animal <|-- Duck
    Animal <|-- Fish
    Animal : +int age
    Animal: +isMammal()
```

`class X{ … }`, `note`, `note for X`, связи `<|-- *-- o-- --> ..>`,
кардинальность, `direction`. Конфиг `class`: `arrowMarkerAbsolute`,
`useMaxWidth`.

## Анимации

Своей анимации нет. По кадру: сначала классы по одному, потом связи.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/class/classDetector-V2.ts` — `classDiagram` и `classDiagram-v2`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/class/classDiagram-v2.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/class/classRenderer-v3-unified.ts`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/createGraph.ts`
- `templates/infografika/mermaid/docs/syntax/classDiagram.md`, `templates/infografika/mermaid/demos/classchart.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `dagre-d3-es`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: тот же
unified-рендерер, что у flowchart: классы лежат в `g.nodes > g.node`, связи —
в `g.edges.edgePaths`, подписи связей — в `g.edgeLabels`; id узлов с
префиксом id диаграммы. `click`/callback игнорировать.

## Паттерны

`system-structure`, `relationships`
