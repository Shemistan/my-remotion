# ECharts pictorialBar — `echarts/pictorial-bar`

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

Пиктографические столбцы: столбец из повторяющихся иконок
(человечки, бутылки) или одна фигура, обрезанная по значению.

## Когда использовать

Количество «на пальцах»: 7 из 10, литры, деревья. Точное сравнение —
`echarts/bar`.

## Фразы из озвучки

- «семь из десяти человек пользуются смартфоном»
- «на одну футболку уходит 2700 литров воды»
- «каждая иконка — тысяча пользователей»

## Визуальный стиль

Иконки `symbol` (встроенные, `path://`, `image://`), повтор с
отступами, клип по значению; плакатная инфографика.

## Входные данные

`PictorialBarSeriesOption`: `data` (на элементе — свои `symbol*` и
`animation*`), `symbol` (`'circle'`), `symbolSize`, `symbolRotate`,
`symbolPosition` (`'start'`|`'end'`|`'center'`), `symbolOffset`,
`symbolMargin`, `symbolRepeat` (false | true | число | `'fixed'`),
`symbolRepeatDirection` (`'end'`), `symbolClip` (false),
`symbolBoundingData`, `symbolPatternSize` (400), `barGap` ('-100%'),
`barWidth`, `clip` (false).

## Анимации

Иконки появляются по одной (задержка от индекса иконки,
`getAnimationDelayParams`); анимация может задаваться на элементе.

## Исходники и документация

- `templates/infografika/echarts/src/chart/bar/PictorialBarSeries.ts`
- `templates/infografika/echarts/src/chart/bar/PictorialBarView.ts`
- `templates/infografika/echarts/test/pictorial-single.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; «набор» иконок — значение × p при
`symbolRepeat: 'fixed'` + `symbolClip: true` и `symbolBoundingData` =
максимум (обрезка плавная) либо целое число повторов от кадра.
`image://` — картинки через `staticFile` + `delayRender`. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`quantities`, `comparison`, `abstract-concepts`
