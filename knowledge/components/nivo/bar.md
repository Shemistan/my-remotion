# Bar — `nivo/bar`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:other`, `engine:d3`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, packages/bar/package.json) |

## Что визуализирует

Столбчатая диаграмма: вертикальные или горизонтальные бары, серии
стопкой (stacked) или рядом (grouped), отрицательные значения уходят ниже
оси. Подписи в барах, суммы над стопками, оси, сетка, легенды, маркеры,
аннотации.

## Когда использовать

Сравнение категорий по одной или нескольким метрикам, состав (stacked),
динамика по годам столбиками, «гонка» лидеров (race chart в storybook). Для
непрерывного тренда лучше `nivo/line`, для долей целого — `nivo/pie` или
`nivo/waffle`.

## Фразы из озвучки

- «сравним выручку по регионам»
- «больше всего продаж — в Германии, на втором месте Франция»
- «из чего складывается бюджет каждого отдела»
- «за пять лет показатель вырос почти вдвое»

## Визуальный стиль

Плоские прямоугольники, `borderRadius` для скругления, схемы цветов
`colors: {scheme}`, градиенты и паттерны через `defs/fill`, тема `theme`.
Корпоративно-аналитический вид, хорошо читается на 1080p.

## Входные данные

`BarSvgProps` (`types.ts`, defaults в `defaults.ts`): `data: D[]`
(обязательно), `width`, `height` (обязательно), `keys` (`['value']`),
`indexBy` (`'id'`), `groupMode` `'stacked'|'grouped'` (`stacked`), `layout`
`'vertical'|'horizontal'`, `valueScale` (`{type:'linear', nice:true}`/symlog),
`indexScale` band, `padding` 0.1, `innerPadding` 0, `margin`, `enableLabel`
true, `label`, `labelPosition` `start|middle|end`, `labelSkipWidth/Height`,
`enableTotals` false, `totalsOffset` 10, `borderRadius`, `borderWidth`,
`colors`, `colorBy` `id|indexValue`, `axisTop/Right/Bottom/Left`,
`enableGridX/Y`, `markers`, `annotations`, `legends`, `layers` (+ custom
layer), `barComponent`, `initialHiddenIds`, `valueFormat`, `theme`,
`animate` (true), `motionConfig` (`'default'`), `isInteractive` (true).
`BarCanvas`: те же данные + `renderBar`, `pixelRatio`, без переходов.

## Анимации

`useTransition` в `Bar.tsx`: на enter бар растёт из 0 по `height`
(vertical) или `width` (horizontal), `labelOpacity` 0→1. Update — пружина
к новым размерам, leave — схлопывание. Всё под `immediate: !animate`.

## Исходники и документация

- `templates/infografika/nivo/packages/bar/src/Bar.tsx`, `types.ts`, `defaults.ts`, `ResponsiveBar.tsx`
- `templates/infografika/nivo/website/src/data/components/bar/meta.yml`, `props.ts`
- `templates/infografika/nivo/storybook/stories/bar/Bar.stories.tsx` (race chart, totals, diverging)

## Зависимости

`@nivo/bar`, `@nivo/core`, `@nivo/axes`, `@nivo/legends`, `@nivo/annotations`,
`@react-spring/web`, `d3-scale`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные
`width/height` вместо `ResponsiveBar`. Рост по кадру — `value * progress`
в `data`, `valueScale.max` фиксировать. Stagger — своя задержка прогресса
на каждую категорию. Race — пересортировка `data` по кадру. Общий рецепт:
`compatibility/nivo.md`.

## Паттерны

`comparison`, `quantities`, `growth-decline`
