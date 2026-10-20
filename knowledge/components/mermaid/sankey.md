# Sankey diagram — `mermaid/sankey`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type (в доке — experimental) |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Диаграмма Санкея: прямоугольники-узлы по слоям и полупрозрачные ленты
потоков, толщина ленты пропорциональна значению. У узлов подписи и
значения.

## Когда использовать

Куда уходят ресурсы, деньги или трафик: распределение бюджета,
энергобаланс, воронка с ответвлениями. Для простой доли — `mermaid/pie`.

## Фразы из озвучки

- «большая часть энергии уходит в промышленность»
- «из каждого рубля бюджета тридцать копеек идут на зарплаты»
- «трафик распадается на три основных потока»
- «на этом шаге теряется заметная доля»

## Визуальный стиль

Узлы в цветах `schemeTableau10`, градиентные ленты с `mix-blend-mode:
multiply`. Аналитический, «инфографичный».

## Входные данные

DSL — по сути CSV `source,target,value` (`docs/syntax/sankey.md`):

```
sankey

Agricultural 'waste',Bio-conversion,124.729
Bio-conversion,Liquid,0.597
Bio-conversion,Losses,26.862
```

Ключевое слово `sankey` или `sankey-beta`. Конфиг `sankey`
(`sankeyRenderer.ts`): `width`, `height`, `nodeAlignment`, `nodeWidth`
(10), `nodePadding` (12), `showValues`, `prefix`, `suffix`, `linkColor`
(gradient/source/target/цвет), `nodeColors`, `labelStyle`
(legacy/outlined), `useMaxWidth`.

## Анимации

Своей анимации нет. По кадру узлы появляются слева направо, ленты
«натекают» вдоль пути.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/sankey/sankeyDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/sankey/sankeyDiagram.ts` — `prepareTextForParsing`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/sankey/sankeyRenderer.ts` — `d3-sankey`
- `templates/infografika/mermaid/docs/syntax/sankey.md`, `templates/infografika/mermaid/demos/sankey.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `d3-sankey`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: узлы —
`g.nodes > g.node > rect`, подписи — `g.node-labels`, ленты —
`g.links > g.link > path` (толщина потока задана в `stroke-width`). id
узлов и градиентов выдаёт глобальный счётчик `Uid.next`, и между
рендерами они меняются, поэтому выбирать по индексу. Ленту «рисовать»
через `stroke-dasharray`/`stroke-dashoffset` по `getTotalLength()`.

## Паттерны

`quantities`, `cause-effect`, `transformation`
