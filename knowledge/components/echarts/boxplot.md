# ECharts boxplot — `echarts/boxplot`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Ящики с усами: min, Q1, медиана, Q3, max по категориям, горизонтально
или вертикально.

## Когда использовать

Разброс и медианы по группам: зарплаты, время ответа, оценки. Только
средние — `echarts/bar`.

## Фразы из озвучки

- «у половины сотрудников зарплата в этом диапазоне»
- «разброс у второго сервиса втрое шире»
- «медиана почти не изменилась»

## Визуальный стиль

Белые ящики с цветной обводкой `borderWidth` 1; строгий научный.

## Входные данные

`BoxplotSeriesOption`: `data` ([[min, Q1, median, Q3, max]] или
{value}), `layout` (`'horizontal'`|`'vertical'`), `boxWidth` ([7, 50]),
`itemStyle`, `clip` (true), `encode`. Подготовка данных —
`extension/dataTool` `prepareBoxplotData` (экспорт в `package.json`).

## Анимации

Рост ящиков, `animationDuration` 800 мс; update — переход формы.

## Исходники и документация

- `templates/infografika/echarts/src/chart/boxplot/BoxplotSeries.ts`
- `templates/infografika/echarts/src/chart/boxplot/BoxplotView.ts`
- `templates/infografika/echarts/test/boxplot.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; раскрытие — пять значений
интерполировать от медианы к реальным по кадру, ось фиксировать. Общий
рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`comparison`, `quantities`
