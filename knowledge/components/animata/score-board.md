# ScoreBoard — `animata/score-board`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Виджет 208×208 «Status Good»: мини бар-чарт из 9 столбиков (зелёные и
один красный) и строка «Overall progress 80% (score, progress)».

## Когда использовать

Статус проекта/здоровья системы, «всё в норме, кроме одного», KPI-тайл.

## Фразы из озвучки

- «статус — хороший»
- «общий прогресс — восемьдесят процентов»
- «только один показатель в красной зоне»

## Визуальный стиль

`bg-background`, rounded-3xl, столбики rounded-md green/red-500,
22px цифра; тон статуса good/warning/neutral.

## Входные данные

`className?`, `items?: {progress, label, className?, containerClassName?}[]`
(9 по умолчанию), `statusLabel = "Good"`, `statusTone: "good" | "warning"
| "neutral" = "good"`, `overallPercent = 80`, `overallCaption =
"score, progress"`.

## Анимации

`BarChart` (graphs): `setTimeout(250)` включает высоты, рост —
`transition-all duration-200`; высота контейнера фиксирована `90`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/score-board.tsx` — виджет
- `templates/react-libriry/animata/animata/graphs/bar-chart.tsx` — бар-чарт
- `templates/react-libriry/animata/content/docs/widget/score-board.mdx` — документация
- `templates/react-libriry/animata/animata/widget/score-board.stories.tsx` — пример

## Зависимости

`animata/graphs/bar-chart`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: передавать `items` с `progress × interpolate(frame - i*3,
[0, 15], [0, 1])` и в копии BarChart убрать таймер/transition (сразу
`shouldUseValue`). `overallPercent` — счётчиком по кадру.

## Паттерны

`quantities`, `comparison`
