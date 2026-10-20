# HexagonPattern — `magicui/hexagon-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Фоновые соты: повторяющаяся сетка шестиугольников (flat-top или
pointy-top), с зазором и выборочно залитыми ячейками.

## Когда использовать

Фон для тем «экосистема», «ячейки», «блокчейн», «улей/команда»,
химия/наука; подсветка отдельных сот как элементов системы. Для
нейтральной клетки — `grid-pattern`.

## Фразы из озвучки

- «каждая ячейка — часть экосистемы»
- «как пчёлы в улье, команда работает слаженно»
- «из маленьких блоков складывается целое»

## Визуальный стиль

Серые контуры `stroke-gray-400/30`, радиус 40 px; техно-научный.

## Входные данные

- `radius?` = `40`, `gap?` = `0`, `x?` = `-1`, `y?` = `-1`
- `direction?: "horizontal"|"vertical"` = `"horizontal"`
- `strokeDasharray?` = `"0"` (при пунктире рисуются уникальные рёбра `line`)
- `hexagons?: [col, row][]` — залитые соты; `className?`

## Анимации

Нет. Геометрия тайла считается функциями `getTileGeometry`,
`hexCenter`, `collectUniqueHexEdges`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/hexagon-pattern.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/hexagon-pattern.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`adaptable`, адаптации не нужны. Анимация — заливка `hexagons` по
одному по кадру или сдвиг `x/y`.

## Паттерны

`system-structure`, `relationships`
