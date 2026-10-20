# CommitGraph — `animata/commit-graph`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тепловая карта активности в стиле GitHub: сетка 53 недели × 7 дней,
квадратики четырёх оттенков (серый → зелёный-200/400/600) по числу
коммитов 0–3.

## Когда использовать

«Активность разработки», регулярность, привычки, календарь вкладов.
В доках `published: false`; данные случайные — для видео нужны свои.

## Фразы из озвучки

- «мы коммитили каждый день»
- «год активной разработки»
- «посмотрите на плотность работы»

## Визуальный стиль

GitHub contributions, квадраты 4–16px (по брейкпоинтам), первые 20 недель
скрыты до `md`.

## Входные данные

Props нет. Данные — `Array(53)×Array(7)` из `Math.floor(Math.random()*4)`
при каждом рендере; цвет — `getColor(count)` (0 `bg-gray-300`, 1
`bg-green-200`, 2 `bg-green-400`, ≥3 `bg-green-600`).

## Анимации

Нет — статичная картинка.

## Исходники и документация

- `templates/react-libriry/animata/animata/graphs/commit-graph.tsx` — компонент
- `templates/react-libriry/animata/content/docs/graphs/commit-graph.mdx` — документация (published: false)
- `templates/react-libriry/animata/animata/graphs/commit-graph.stories.tsx` — пример

## Зависимости

`@/lib/utils`.

## Совместимость и адаптация

Обязательно: заменить `Math.random` на props `data: number[][]` или
`random(seed)` из remotion — иначе каждый кадр новая картинка. Анимацию
добавить самостоятельно: проявление столбцов-недель по кадрам (opacity/scale
со stagger). Адаптивные классы (`hidden md:flex`, `sm:/md:/lg:` размеры)
заменить фиксированными.

## Паттерны

`timeline`, `quantities`
