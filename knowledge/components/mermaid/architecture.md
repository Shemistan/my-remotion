# Architecture diagram (beta) — `mermaid/architecture`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, экспериментальный (`architecture-beta`, v11.1.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `engine:other`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Схема облачной или CI-архитектуры: сервисы с иконками (database, disk,
server, cloud…), группы-контейнеры, рёбра между сторонами L/R/T/B и
узлы-развилки (junction).

## Когда использовать

Показать инфраструктуру: какие сервисы есть и как соединены. Для логики
процесса — `mermaid/flowchart`, для уровней C4 — `mermaid/c4`.

## Фразы из озвучки

- «сервер читает данные из базы»
- «все сервисы живут внутри одного облака»
- «хранилище подключено к серверу напрямую»

## Визуальный стиль

Иконки сервисов с подписями, пунктирные рамки групп, ортогональные рёбра.
Современный техно-стиль.

## Входные данные

Текстовый DSL (`docs/syntax/architecture.md`):

```
architecture-beta
    group api(cloud)[API]
    service db(database)[Database] in api
    service server(server)[Server] in api
    db:L -- R:server
```

Также `junction id` и стрелки на рёбрах. Иконки берутся из
зарегистрированных icon packs (`registerIconPacks`). Детектор принимает и
`architecture` без суффикса.

## Анимации

Своей анимации нет. По кадру: группы, затем сервисы, затем рёбра.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/architecture/architectureDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/architecture/architectureDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/architecture/architectureRenderer.ts` — cytoscape + fcose, `withSeededRandom`
- `templates/infografika/mermaid/docs/syntax/architecture.md`, `templates/infografika/mermaid/demos/architecture.html`

## Зависимости

`mermaid` 12.2.0 (полная сборка), `d3`, `cytoscape`, `cytoscape-fcose`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: раскладка
fcose обёрнута в `withSeededRandom` (`architectureSeed.ts`), поэтому при
одинаковом входе результат повторяется. Тип регистрируется только при
`includeLargeFeatures`. Внешние icon packs грузить до render под
`delayRender`. Классы сервисов и групп сверить по готовому SVG.

## Паттерны

`system-structure`, `relationships`
