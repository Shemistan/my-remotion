# ZenUML sequence (plugin) — `mermaid/zenuml`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`, пакет `packages/mermaid-zenuml`) |
| Вид | diagram-type (внешний плагин, ленивая загрузка) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:other`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (packages/mermaid-zenuml/package.json, LICENSE) |

## Что визуализирует

Диаграмма последовательности в нотации ZenUML: участники, сообщения,
вложенные вызовы и блоки, похожие на код.

## Когда использовать

По смыслу то же, что `mermaid/sequence-diagram`, но для авторов, которым
удобнее «кодоподобная» запись вызовов. Плагин ставится отдельно, поэтому
без причины лучше брать встроенный sequence.

## Фразы из озвучки

- «Алиса спрашивает Джона, как дела»
- «сервис вызывает репозиторий, а тот — базу»
- «ответ возвращается по той же цепочке»

## Визуальный стиль

Сдержанный UML-стиль ZenUML, внешне отличается от встроенного sequence.

## Входные данные

Текстовый DSL (`docs/syntax/zenuml.md`):

```
zenuml
    title Demo
    Alice->John: Hello John, how are you?
    John->Alice: Great!
```

Подключение: `mermaid.registerExternalDiagrams([zenuml])` из
`@mermaid-js/mermaid-zenuml`. Остальной синтаксис — в доке.

## Анимации

Своей анимации нет. По кадру сообщения появляются по порядку.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid-zenuml/src/detector.ts` — `/^\s*zenuml/`, import `zenuml-definition`
- `templates/infografika/mermaid/packages/mermaid-zenuml/src/zenumlRenderer.ts` — `renderToSvg` из `@zenuml/core`
- `templates/infografika/mermaid/packages/mermaid-zenuml/package.json`
- `templates/infografika/mermaid/docs/syntax/zenuml.md`, `templates/infografika/mermaid/demos/zenuml.html`

## Зависимости

`@mermaid-js/mermaid-zenuml` 1.0.1, `@zenuml/core` ^3.47.9, peer `mermaid`
^10 || ^11 || ^12.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`, плюс регистрация
плагина до первого render. Специфика: `draw` вызывает `renderToSvg(code)` и
вставляет `innerSvg` в `svg#id`, ставит `viewBox` и размер. d3 здесь не
используется. Как `@zenuml/core` меряет текст и какие у элементов классы,
неизвестно: пакет внешний и в клон не входит. Проверять по готовому SVG.

## Паттерны

`sequence-steps`, `relationships`
