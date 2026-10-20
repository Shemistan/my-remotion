# Bullet — `nivo/bullet`

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

Bullet chart: полоса с диапазонами-фонами (плохо/норма/хорошо), поверх неё
бар фактического значения (measure) и вертикальные риски целей (markers).
Несколько показателей идут строками с заголовками.

## Когда использовать

KPI против плана: «выполнили 87 % плана», «цель — 100, факт — 92». Это
компактная замена спидометру. Для простого сравнения категорий — `nivo/bar`.

## Фразы из озвучки

- «план по продажам выполнен на 87 процентов»
- «мы почти достигли цели квартала»
- «по трём метрикам из пяти мы уже в зелёной зоне»

## Визуальный стиль

Деловой dashboard-стиль. Диапазоны в последовательной схеме
(`rangeColors: 'seq:cool'`), measure и marker — `seq:red_purple`.

## Входные данные

`BulletSvgProps` (`types.ts`, defaults в `props.ts`): `data: {id, title?,
ranges: number[], measures: number[], markers?: number[]}[]`, `width`,
`height`, `margin`, `layout` horizontal, `reverse` false, `spacing` 30,
`minValue` 0, `maxValue` auto, `titlePosition` before, `titleAlign` middle,
`titleOffsetX/Y`, `titleRotation`, `rangeColors`, `rangeBorderWidth/Color`,
`rangeComponent`, `measureColors`, `measureSize` 0.4,
`measureBorderWidth/Color`, `measureComponent`, `markerColors`,
`markerSize` 0.6, `markerComponent`, `axisPosition` after, `theme`,
`animate`, `motionConfig`, `isInteractive`.

## Анимации

Прямоугольники диапазонов/measure и маркеры получают `animatedProps`
(`SpringValues`) — x/y/width/height/color, у маркеров transform.

## Исходники и документация

- `templates/infografika/nivo/packages/bullet/src/Bullet.tsx`, `types.ts`, `props.ts`
- `templates/infografika/nivo/website/src/data/components/bullet/meta.yml`
- `templates/infografika/nivo/storybook/stories/bullet/Bullet.stories.tsx`

## Зависимости

`@nivo/bullet`, `@nivo/core`, `@nivo/axes`, `@react-spring/web`, `d3-scale`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Заполнение по кадру — `measures.map(v => v * progress)`. `maxValue` задать
числом, чтобы шкала не менялась.

## Паттерны

`quantities`, `comparison`, `key-point-emphasis`
