# Agentflow (beta) — `mermaid/agentflow`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`agentflow-beta`, v12.0.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `engine:other`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Схема агентного workflow: контейнеры `flow` с агентами, внутри задачи,
инструменты, решения и входы разных форм. Рёбра трёх видов:
последовательность, ссылка, отказ. Раскладка — ELK.

## Когда использовать

Объяснить, как устроена система из LLM-агентов: кто что делает, какой
инструмент вызывается, где ветвление. Для обычного процесса —
`mermaid/flowchart`.

## Фразы из озвучки

- «агент собирает изменения и запускает линтер»
- «если проверка не прошла, задача уходит обратно»
- «каждый агент вызывает свой инструмент»

## Визуальный стиль

По умолчанию тема `redux-color` и look `neo`, контейнеры-рамки, форма
узла несёт смысл. Современное AI-техно.

## Входные данные

Текстовый DSL (`docs/syntax/agentflow.md`):

```
agentflow-beta TB
  flow reviewer["Review Agent"]
    analyse["Analyse diff"]@{ shape: task }
    lint["run_linter"]@{ shape: tool }
    analyse --> lint
  end
```

Вложенные `flow … end`, формы `input/task/tool/decision` и др.,
метаданные `@{ … }`. Конфиг `agentflow`: `nodeSpacing`, `rankSpacing`,
`diagramPadding` (8), `titleTopMargin`, `useMaxWidth` (true), плюс `layout`.

## Анимации

Своей анимации нет. По кадру: контейнер, затем шаги по стрелкам.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/agentflow/afDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/agentflow/diagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/agentflow/renderer.ts` — маркеры `point/circle/cross/hierarchy`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/render.ts`
- `templates/infografika/mermaid/docs/syntax/agentflow.md` (демо в `demos/` нет)

## Зависимости

`mermaid` 12.2.0 (полная сборка — ради ELK), `d3`, `elkjs`; `dagre-d3-es`
как запасная раскладка.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
unified-рендерер (`g.clusters`, `g.nodes`, `g.edges.edgePaths`). По
умолчанию ELK; в tiny-сборке молча включается dagre, и раскладка
получается другой. Поддерживает ли агентный синтаксис `animate` у рёбер,
не проверено; если поддерживает — не включать.

## Паттерны

`sequence-steps`, `system-structure`
