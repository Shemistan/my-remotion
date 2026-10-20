# CalorieCounter — `animata/calorie-counter`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `css-transition`, `svg`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md); аватар по умолчанию — Unsplash |

## Что визуализирует

Высокий виджет (h-96, w-52/72) фитнес-приложения: дата и аватар сверху,
большое кольцо прогресса калорий с «Today N Cal» в центре, плашка «Your
goal N Cal» снизу.

## Когда использовать

Здоровье/питание, «цель на день», прогресс к норме. Квадратные
альтернативы — `animata/water-tracker`, `animata/battery`.

## Фразы из озвучки

- «сегодня вы набрали 120 калорий из четырёх тысяч»
- «до цели ещё далеко»
- «следите за питанием каждый день»

## Визуальный стиль

Светло-серый (dark: slate-800), кольцо 180px толщиной 18px green-400
(dark: cyan-300), оранжевая цель.

## Входные данные

`className?`, `goal = 4000`, `fulfilled = 120`, `avatarUrl` (по умолчанию
Unsplash; `image` — устаревший алиас), `weekday = "Monday"`,
`dateLabel = "25 October"`. Прогресс = `fulfilled/goal*100`.

## Анимации

Через `DonutChart`: `setTimeout(250)` + CSS transition `strokeDashoffset`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/calorie-counter.tsx` — виджет
- `templates/react-libriry/animata/animata/graphs/donut-chart.tsx` — кольцо
- `templates/react-libriry/animata/content/docs/widget/calorie-counter.mdx` — документация
- `templates/react-libriry/animata/animata/widget/calorie-counter.stories.tsx` — пример

## Зависимости

`animata/graphs/donut-chart`, `@/lib/utils`. Fallback аватара —
`avatar.vercel.sh`.

## Совместимость и адаптация

`adaptable`: прогресс и число `fulfilled` из `interpolate(frame)`; в копии
DonutChart убрать таймер. Аватар — `staticFile`, `onError`-fallback на
внешний сервис убрать.

## Паттерны

`quantities`, `growth-decline`
