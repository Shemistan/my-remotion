# Схема данных графиков — `remotion-video-templates/chart-data-schema`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Своей картинки нет: общая zod-схема временного ряда для `bar-chart-race` и
`line-chart-draw`, пример данных и чистые функции для покадровой интерполяции.

## Когда использовать

Подать один и тот же набор данных в разные визуализации; интерполировать
значение ряда в дробной точке времени (`valueAt`) для любой своей анимации
графика; зафиксировать максимум оси (`globalMax`), чтобы ось не «прыгала».

## Фразы из озвучки

- «данные по месяцам для четырёх продуктов»
- «тот же набор цифр, но в другом виде»
- «посмотрим на эти цифры по-другому»

## Визуальный стиль

Нет.

## Входные данные

`chartSeriesSchema {label: string, color: zColor(), values: number[]}`,
`chartSchema {title: string, steps: string[] (2..24), series (1..6)}`,
`sampleChartData` (MAU: Morph, Norden, Fenris, Atlas за Jan–Jun),
`globalMax(props)`, `valueAt(values, t)` (линейно между шагами).

## Анимации

Нет.

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/ChartVideo/sample-data.ts`

## Зависимости

`zod`, `@remotion/zod-types`.

## Совместимость и адаптация

`native`: чистые функции. Контракт `values.length === steps.length` не
проверяется схемой — следить вручную.

## Паттерны

`quantities`, `timeline`
