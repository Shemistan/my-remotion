# Sequence diagram — `mermaid/sequence-diagram`

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

Участники сверху, вертикальные линии жизни, стрелки сообщений с подписями
сверху вниз по времени. Плюс заметки, блоки loop/alt/opt и активации.

## Когда использовать

Обмен сообщениями во времени: запрос-ответ API, протокол, сценарий
авторизации. Для статичной структуры — `mermaid/flowchart` или
`mermaid/c4`. Альтернативная нотация — `mermaid/zenuml`.

## Фразы из озвучки

- «клиент отправляет запрос, сервер отвечает токеном»
- «дальше сервис обращается к базе и ждёт ответа»
- «вот как выглядит обмен сообщениями по шагам»
- «если токен истёк, клиент повторяет запрос»

## Визуальный стиль

Строгий UML: прямоугольники актёров, тонкие стрелки, пунктир у ответов.
Сама форма задаёт естественный темп «по шагам сверху вниз».

## Входные данные

Текстовый DSL (`docs/syntax/sequenceDiagram.md`):

```
sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!
```

`participant`/`actor`, `Note`, `loop/alt/opt/par … end`,
`activate`/`deactivate`, `autonumber`, `rect rgb(…)`. В конфиге `sequence`
из кода рендерера видны `wrap`, `showSequenceNumbers`, `rightAngles`,
`messageAlign`, `arrowMarkerAbsolute`.

## Анимации

Своей анимации нет, SVG статичный.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/sequence/sequenceDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/sequence/sequenceDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/sequence/sequenceRenderer.ts` — `drawMessage`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/sequence/svgDraw.js`
- `templates/infografika/mermaid/docs/syntax/sequenceDiagram.md`, `templates/infografika/mermaid/demos/sequence.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `@braintree/sanitize-url`; KaTeX — только при
формулах.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика из
`drawMessage`: линия сообщения — `line`/`path` с классом `messageLine0`
(сплошная) или `messageLine1` (пунктир) и атрибутами `data-et="message"`,
`data-id="i<id>"`, `data-from`, `data-to`; подпись — `text.messageText`.
По кадру показывать n-е сообщение вместе с подписью, стрелку рисовать
через `stroke-dashoffset`. Ширина текста считается в
`calculateTextDimensions`, поэтому шрифт загружается до render. Popup-меню
актёров игнорировать.

## Паттерны

`sequence-steps`, `relationships`
