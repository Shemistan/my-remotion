# User journey — `mermaid/user-journey`

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

Карта пути пользователя: шаги-карточки по секциям слева направо. У
каждого шага оценка 1–5 со смайликом и список участников.

## Когда использовать

Опыт клиента по этапам: где ему хорошо, где больно. Для процессной логики —
`mermaid/flowchart`, для хронологии — `mermaid/timeline`.

## Фразы из озвучки

- «оформление заказа даётся пользователю тяжелее всего»
- «утро начинается хорошо, а потом настроение падает»
- «на этом шаге клиент чаще всего бросает покупку»

## Визуальный стиль

Цветные секции, карточки задач, лица-смайлики по уровню оценки.
Человечный продуктовый вид.

## Входные данные

Текстовый DSL (`docs/syntax/userJourney.md`):

```
journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Do work: 1: Me, Cat
```

Задача: `Название: оценка: участник1, участник2`. Конфиг `journey`
передаётся через `renderer.setConf`.

## Анимации

Своей анимации нет. По кадру шаги появляются по порядку, смайлик — с
задержкой.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/user-journey/journeyDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/user-journey/journeyDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/user-journey/journeyRenderer.ts` — d3 + `svgDraw`
- `templates/infografika/mermaid/docs/syntax/userJourney.md`, `templates/infografika/mermaid/demos/journey.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: свой
рендерер, шаги в порядке DSL. Классы задач и лиц сверить по готовому SVG.

## Паттерны

`sequence-steps`, `quantities`
