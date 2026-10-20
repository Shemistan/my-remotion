# InteractiveGrid — `animata/interactive-grid`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `interactive-widgets` |
| Совместимость с Remotion | unsuitable |
| Флаги | `user-events`, `timers`, `dom`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Голубовато-сиреневый фон с разреженной сеткой квадратиков 24px (зеркально
слева/справа); при наведении на клетку 5 раз подсвечиваются случайные
«линии» клеток с волновой задержкой.

## Когда использовать

В видео — только как статичный фон с рамками-квадратиками. Подсветка
существует лишь как реакция на hover.

## Фразы из озвучки

- «каждая клетка — отдельный модуль»
- «сигнал расходится по системе»

## Визуальный стиль

Светлый градиент `rgb(200,215,255)`, контурные квадраты gray-400/30,
скругление 3xl.

## Входные данные

`children` (обязателен), `className?`, `contentClassName?`. Шаг клеток —
константа `size = 24`.

## Анимации

`onMouseEnter`/`onFocus` на клетке → `setInterval` 1 с × 5 выбирает
случайную клетку (`Math.random`); подсветка через CSS `transition-all
duration-700` с `transitionDelay: x+y ms`; размеры — `getBoundingClientRect`
+ `resize`.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/interactive-grid.tsx` — компонент
- `templates/react-libriry/animata/content/docs/background/interactive-grid.mdx` — документация
- `templates/react-libriry/animata/animata/background/interactive-grid.stories.tsx` — пример

## Зависимости

React, `@/lib/utils` (`cn`).

## Совместимость и адаптация

`unsuitable`: смысл — реакция на курсор. Максимум — статичный кадр. Если
нужна «волна по клеткам», проще написать заново: позиции клеток из
`plotSquares`, активная клетка из `random(seed + cycle)`, opacity из
`interpolate(frame - (x+y)/1000*fps)`.

## Паттерны

`abstract-concepts`
