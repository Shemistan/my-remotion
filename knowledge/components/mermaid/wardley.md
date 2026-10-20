# Wardley map (beta) — `mermaid/wardley`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`wardley-beta`, v11.14.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Карта Уордли: компоненты цепочки ценности на осях «видимость» и
«эволюция» (от genesis до commodity), связи зависимостей, стрелки
эволюции, заметки.

## Когда использовать

Стратегия: что строить, что покупать, какие компоненты становятся
товаром. Для простой матрицы 2×2 — `mermaid/quadrant-chart`.

## Фразы из озвучки

- «электричество давно стало товаром»
- «чайник движется в сторону стандартизации»
- «всё начинается с потребности клиента наверху карты»

## Визуальный стиль

Координатное поле с этапами эволюции, кружки компонентов, стрелки.
Стратегический, консалтинговый.

## Входные данные

Текстовый DSL (`docs/syntax/wardley.md`):

```
wardley-beta
title Tea Shop Value Chain
anchor Business [0.95, 0.63]
component Tea [0.63, 0.81]
Business -> Tea
```

`component`/`anchor` с координатами `[visibility, evolution]`, связи `->`,
`evolve X 0.62`, `note "…" [x, y]`.

## Анимации

Своей анимации нет. По кадру компоненты появляются сверху вниз по цепочке,
затем стрелки эволюции.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/wardley/wardleyDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/wardley/wardleyDiagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/wardley/wardleyRenderer.ts` — модель из `wardleyBuilder`
- `templates/infografika/mermaid/docs/syntax/wardley.md`, `templates/infografika/mermaid/demos/wardley.html`

## Зависимости

`mermaid` 12.2.0, `d3`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика:
координаты задаёт автор, так что раскладка стабильна. Классы элементов
сверить по готовому SVG. Сдвиг `evolve` можно показать `translate`
компонента по кадру.

## Паттерны

`spatial`, `transformation`
