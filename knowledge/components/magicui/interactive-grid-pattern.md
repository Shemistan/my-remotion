# InteractiveGridPattern — `magicui/interactive-grid-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Сетка из отдельных квадратов-`rect`; клетка под курсором подсвечивается
и плавно гаснет после ухода (шлейф подсветки).

## Когда использовать

В видео — как сетка, по которой «пробегает» подсветка (путь, сканирование,
выбор ячейки). Без переработки — статичная клетка, как `grid-pattern`.

## Фразы из озвучки

- «сканируем каждую ячейку»
- «вот здесь — нужная точка»
- «шаг за шагом по сетке»

## Визуальный стиль

Серые квадраты 40×40, подсветка `fill-gray-300/30`, вход 100 мс,
затухание 1000 мс.

## Входные данные

- `width?` = `40`, `height?` = `40`, `squares?: [cols, rows]` = `[24, 24]`
- `className?`, `squaresClassName?`, атрибуты `svg`.

## Анимации

`useState(hoveredSquare)` по `onMouseEnter/Leave`; Tailwind
`transition-all duration-100`, при уходе `duration-1000`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/interactive-grid-pattern.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/interactive-grid-pattern.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`adaptable`. Hover заменить на путь клеток по кадру: для клетки `k`
время активации `t_k`; `fill-opacity = interpolate(frame - t_k, [0, 3,
3 + 30], [0, 1, 0], clamp)` — повторяет шлейф без `transition`.

## Паттерны

`spatial`, `sequence-steps`
