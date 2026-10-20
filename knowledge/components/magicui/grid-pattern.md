# GridPattern — `magicui/grid-pattern`

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

Фоновая клеточная сетка (сплошная или пунктирная) на SVG `pattern`;
отдельные клетки по координатам можно залить.

## Когда использовать

Нейтральный «инженерный» фон для схем, графиков и UI-мокапов;
подсветка конкретных клеток — «точки на карте», «заполненные слоты».
Анимированная версия — `animated-grid-pattern`.

## Фразы из озвучки

- «разложим всё по полочкам»
- «точная инженерная работа»
- «на этой сетке видно, где пробелы»

## Визуальный стиль

Серые линии `stroke-gray-400/30`, шаг 40 px; маска-градиент часто
задаётся через `className` (в примерах `mask-[radial-gradient…]`).

## Входные данные

- `width?` = `40`, `height?` = `40` (шаг), `x?` = `-1`, `y?` = `-1`
- `strokeDasharray?` = `"0"`
- `squares?: [x, y][]` — залитые клетки
- `className?`, прочие атрибуты `svg`.

## Анимации

Нет: `<pattern>` с путём `M.5 h V.5 H w` + `rect`-ы клеток.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/grid-pattern.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/grid-pattern.mdx` — документация (варианты linear-gradient, dashed)

## Зависимости

React, `cn`.

## Совместимость и адаптация

`adaptable`, адаптации не нужны. Движение — сдвиг `x`/`y` pattern по
кадру (бесконечный скролл сетки) или появление `squares` по одному
(`squares.slice(0, n(frame))`).

## Паттерны

`system-structure`, `spatial`
