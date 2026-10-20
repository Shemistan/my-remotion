# LineChartDraw — `remotion-video-templates/line-chart-draw`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | template |
| Категория | `charts-data` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Линейный график нескольких серий в SVG: сетка с подписями оси Y, метки шагов
по X, легенда; каждая линия «рисуется» слева направо с бегущей точкой на
кончике, затем под ней проявляется бледная заливка-площадь.

## Когда использовать

Динамика показателя во времени, тренды, сравнение траекторий 1–6 серий.
Для смены рангов — `bar-chart-race` (та же форма данных).

## Фразы из озвучки

- «за полгода аудитория выросла в семь раз»
- «посмотрим на динамику по месяцам»
- «одна линия уверенно идёт вверх, другая стоит на месте»

## Визуальный стиль

Белый фон, светло-серая сетка (`zinc200`), линии 6 px со скруглением,
Inter. 1920×1080, 30 fps; длительность считается.

## Входные данные

`chartSchema`: `title`, `steps: string[]` (2..24), `series: {label, color,
values: number[]}[]` (1..6); default — `sampleChartData`. Композиция в Root
называется `LineChartDraw`, компонент — `LineChart`.
`lineChartCalculateMetadata`: (60 + steps×8) + (series−1)×12 + 45.

## Анимации

Прогресс серии `interpolate(frame, [si*12, si*12+draw], [0,1])`; линия
через `pathLength={1}` + `strokeDashoffset={1-progress}`; маркер на ведущем
крае по линейной интерполяции точек; площадь opacity 0→0.1 на 85–100 %.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/ChartVideo/LineChart.tsx`
- `templates/remotion-components/remotion-video-templates/src/templates/ChartVideo/sample-data.ts`

## Зависимости

`remotion`, `zod`, `@remotion/zod-types`, `lib/colors`, `lib/fonts`.

## Совместимость и адаптация

`native`. Линии — ломаные (`L`), без сглаживания; ось Y от 0 до
`globalMax`; подписи — целые числа.

## Паттерны

`growth-decline`, `timeline`, `comparison`, `quantities`
