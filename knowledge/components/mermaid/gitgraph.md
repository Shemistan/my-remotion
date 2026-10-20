# GitGraph — `mermaid/gitgraph`

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

Граф git-истории: коммиты-кружки на цветных линиях веток, ответвления,
слияния, cherry-pick, теги.

## Когда использовать

Стратегия ветвления, git flow, история изменений, параллельная работа
команд. Для общей хронологии без веток — `mermaid/timeline`.

## Фразы из озвучки

- «от основной ветки отходит ветка разработки»
- «после двух коммитов мы сливаем изменения обратно»
- «релиз помечаем тегом»
- «фича живёт в отдельной ветке до ревью»

## Визуальный стиль

Яркие линии веток, кружки коммитов, подписи веток. Технический, но легко
читается.

## Входные данные

Текстовый DSL (`docs/syntax/gitgraph.md`):

```
gitGraph
   commit
   branch develop
   checkout develop
   commit
   checkout main
   merge develop
```

`commit id:/type:/tag:`, `cherry-pick id:`, `switch`; направление
LR/TB/BT. Опции конфига `gitGraph` описаны в доке, по коду рендерера не
сверялись.

## Анимации

Своей анимации нет. По кадру коммиты появляются в порядке DSL, линии веток
дорисовываются.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/git/gitGraphDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/git/gitGraphDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/git/gitGraphRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/gitgraph.md`, `templates/infografika/mermaid/demos/git.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
собственный d3-рендерер (`gitGraphRenderer.ts`, `setupGraphViewbox`).
Классы коммитов, веток и стрелок по коду не сверялись, их надо снять с
готового SVG. Порядок коммитов совпадает с DSL, показывать по индексу.

## Паттерны

`timeline`, `transformation`
