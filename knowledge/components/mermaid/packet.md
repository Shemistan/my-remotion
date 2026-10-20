# Packet diagram — `mermaid/packet`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type (v11.0.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Структура сетевого пакета или битового формата: ряды бит, поля-ячейки с
подписью и номерами битов.

## Когда использовать

Объяснить формат заголовка TCP/IP, бинарного протокола, регистра. Для
общей структуры системы — `mermaid/block`.

## Фразы из озвучки

- «первые шестнадцать бит — порт отправителя»
- «заголовок TCP занимает двадцать байт»
- «дальше идут флаги и размер окна»

## Визуальный стиль

Таблица-сетка ячеек с номерами битов. Строгий, учебный.

## Входные данные

Текстовый DSL (`docs/syntax/packet.md`):

```
packet
0-15: "Source Port"
16-31: "Destination Port"
+8: "Block name"
```

Поле задаётся как `start-end` или `+count` (v11.7.0+). `title` — через
front-matter. Допустимо ключевое слово `packet-beta`. Конфиг —
`PacketDiagramConfig`.

## Анимации

Своей анимации нет. По кадру поля заполняются слева направо.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/packet/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/packet/diagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/packet/renderer.ts`
- `templates/infografika/mermaid/docs/syntax/packet.md`, `templates/infografika/mermaid/demos/packet.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `@mermaid-js/parser` (langium, асинхронный
`parse`).

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: простой
рендерер (`selectSvgElement` + `configureSvgSize`), поля идут в порядке
DSL. Классы сверить по готовому SVG.

## Паттерны

`system-structure`, `quantities`
