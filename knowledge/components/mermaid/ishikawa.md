# Ishikawa / fishbone — `mermaid/ishikawa`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, новый (v11.12.3+, `-beta` необязателен) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Диаграмма Исикавы («рыбий скелет»): проблема в голове, хребет, наклонные
кости категорий причин и вложенные подпричины.

## Когда использовать

Разбор причин проблемы: почему упала конверсия, почему фото размыто,
анализ инцидента.

## Фразы из озвучки

- «у размытого фото четыре группы причин»
- «проблема может быть в процессе, людях или оборудовании»
- «копнём глубже: что именно не так с объективом»

## Визуальный стиль

Горизонтальный скелет с наклонными ветвями, подписи вдоль костей.
Аналитический, методичный.

## Входные данные

Текстовый DSL (`docs/syntax/ishikawa.md`):

```
ishikawa-beta
    Blurry Photo
    Process
        Out of focus
    User
```

Первая строка — проблема, дальше категории и причины по отступам на любую
глубину. Ключевое слово `ishikawa` или `ishikawa-beta`, регистр не важен.

## Анимации

Своей анимации нет. По кадру хребет дорисовывается к голове, затем по
очереди появляются кости категорий.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/ishikawa/ishikawaDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/ishikawa/ishikawaDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/ishikawa/ishikawaRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/ishikawa.md`, `templates/infografika/mermaid/demos/ishikawa.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
`ishikawaRenderer.ts` (`selectSvgElement`), категории в порядке DSL.
Классы костей и подписей сверить по готовому SVG. Линии костей удобно
«рисовать» через `stroke-dashoffset`.

## Паттерны

`cause-effect`
