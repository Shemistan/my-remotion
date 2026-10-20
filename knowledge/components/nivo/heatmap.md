# HeatMap — `nivo/heatmap`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:other`, `engine:d3`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, package.json) |

## Что визуализирует

Матрица ячеек «строка × столбец», цвет — по значению (непрерывная
шкала), опционально размер ячейки (`sizeVariation`), форма `rect`/`circle`.
Подписи значений, оси, непрерывная цветовая легенда. `HeatMapCanvas` — для
больших матриц.

## Когда использовать

Интенсивность по двум измерениям: часы × дни недели, корреляции,
когорты удержания. Для дат по дням — `nivo/calendar`.

## Фразы из озвучки

- «пик нагрузки — по будням с десяти до двенадцати»
- «вот матрица корреляций между метриками»
- «удержание лучше всего у январской когорты»

## Визуальный стиль

Плотная сетка, дивергентная или последовательная палитра (по умолчанию
`brown_blueGreen`), подписи темнее цвета ячейки. Аналитический.

## Входные данные

`HeatMapSvgProps` (`types.ts`, defaults в `defaults.ts`): `data: {id,
data: {x, y|null}[]}[]`, `width`, `height`, `margin`, `forceSquare`
false, `sizeVariation` false|config, `xInnerPadding`, `xOuterPadding`,
`yInnerPadding`, `yOuterPadding` (0), `opacity`, `activeOpacity`,
`inactiveOpacity` 0.15, `borderWidth`, `borderColor`, `borderRadius`,
`enableGridX/Y` false, `colors` (`{type:'sequential', scheme}` или
функция), `emptyColor`, `enableLabels` true, `label` `formattedValue`,
`labelTextColor`, `legends`, `annotations`, `axisTop`/`axisLeft` `{}`,
`axisRight/Bottom` null, `cellComponent` `rect|circle|компонент`,
`hoverTarget`, `layers`, `valueFormat`, `animate` (true), `motionConfig`
(`'gentle'`). Canvas: `renderCell`, `pixelRatio`.

## Анимации

Ячейки — react-spring (`CellAnimatedProps`: x, y, width, height, цвет,
opacity).

## Исходники и документация

- `templates/infografika/nivo/packages/heatmap/src/HeatMap.tsx`, `types.ts`, `defaults.ts`
- `templates/infografika/nivo/website/src/data/components/heatmap/meta.yml`
- `templates/infografika/nivo/storybook/stories/heatmap/HeatMap.stories.tsx`

## Зависимости

`@nivo/heatmap`, `@nivo/core`, `@nivo/axes`, `@nivo/legends`, `@nivo/colors`, `@react-spring/web`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Заполнение ячеек по кадру — `y: null` для ещё не показанных (пустой цвет)
или `opacity` в custom `cellComponent`. Границы цветовой шкалы
зафиксировать в `colors` (`ContinuousColorScaleConfig` из `@nivo/colors`;
имена полей там не сверялись), иначе при неполных данных цвета поплывут.

## Паттерны

`comparison`, `quantities`, `relationships`
