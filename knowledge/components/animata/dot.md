# Dot — `animata/dot`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Статичный фон из регулярной сетки точек (dot grid) на белом.

## Когда использовать

Подложка в стиле Figma/whiteboard: под схемы, карточки, mockup-и
интерфейсов. Соседи: `animata/grid`, `animata/diagonal-lines`.

## Фразы из озвучки

- «откроем доску и разложим идею»
- «вот как это выглядит в макете»
- «начнём с чистого листа»

## Визуальный стиль

Серые точки `#cacaca` радиусом 1px, шаг `spacing × size`; светлый,
«дизайнерский».

## Входные данные

`color = "#cacaca"`, `size = 1` (px), `spacing = 10` (множитель к size),
`children?` (без них — плашка-заглушка), `className?`,
`style = { backgroundColor: "white" }`.

## Анимации

Нет: `radial-gradient` + `backgroundSize: calc(spacing * size px)`.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/dot.tsx` — компонент
- `templates/react-libriry/animata/content/docs/background/dot.mdx` — документация
- `templates/react-libriry/animata/animata/background/dot.stories.tsx` — пример

## Зависимости

Только React.

## Совместимость и адаптация

`adaptable` без доработки: статичный CSS-фон. Для «живости» —
`backgroundPosition` или `size` из `interpolate(frame)` (параллакс,
наезд).

## Паттерны

`abstract-concepts`, `spatial`
