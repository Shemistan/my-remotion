# Cynefin framework (beta) — `mermaid/cynefin`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`cynefin-beta`, v11.16.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Фреймворк Кеневин: пять доменов (Clear, Complicated, Complex, Chaotic,
Confusion) с волнистой границей и «обрывом», метки-элементы внутри
доменов, подписанные стрелки переходов.

## Когда использовать

Показать, к какому типу относится проблема и как на неё реагировать:
менеджмент, agile, принятие решений.

## Фразы из озвучки

- «в сложном домене действуем через эксперименты»
- «самоуспокоенность сбрасывает нас в хаос»
- «эту задачу уже можно отнести к понятным»

## Визуальный стиль

Четыре области с органичной границей и зоной Confusion в центре.
Концептуальный, консалтинговый.

## Входные данные

Текстовый DSL (`docs/syntax/cynefin.md`):

```
cynefin-beta
title Optional Diagram Title
complex
"Item label"
complex --> complicated : "Pattern identified"
```

Блоки доменов `complex/complicated/clear/chaotic/confusion` со списком
меток в кавычках, переходы `a --> b : "подпись"`.

## Анимации

Своей анимации нет. По кадру: домены по одному, затем элементы и стрелки.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/cynefin/cynefinDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/cynefin/cynefinDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/cynefin/cynefinRenderer.ts`
- `templates/infografika/mermaid/docs/syntax/cynefin.md` (демо в `demos/` нет)

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: цвета
`cynefinRenderer.ts` берёт из `getThemeVariables` темы default. Классы
доменов и элементов сверить по готовому SVG.

## Паттерны

`abstract-concepts`, `spatial`
