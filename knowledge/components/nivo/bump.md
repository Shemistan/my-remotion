# Bump — `nivo/bump`

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

Bump chart: позиции серий в рейтинге во времени. Плавные линии меняются
местами, на концах подписи, в узлах точки. В том же пакете `AreaBump`:
ленты, толщина которых показывает величину, а положение — ранг.

## Когда использовать

«Кто на каком месте» по годам: рейтинги языков, брендов, команд, обгоны.
Если важны абсолютные значения — `nivo/line` или `AreaBump`.

## Фразы из озвучки

- «за три года Python обогнал Java и вышел на первое место»
- «наша команда поднялась с пятой строчки на вторую»
- «посмотрите, как менялся рейтинг браузеров»

## Визуальный стиль

Сглаженные (`interpolation: 'smooth'`) толстые линии, яркая палитра,
подписи цветом серии; можно выделить серию через
`activeLineWidth/inactiveOpacity`.

## Входные данные

`BumpSvgProps` (`bump/types.ts`, defaults в `bump/defaults.ts`): `data:
{id, data: {x, y|null}[]}[]` (y — ранг), `width`, `height`, `margin`,
`interpolation` `smooth|linear`, `xPadding` 0.6, `xOuterPadding` 0.5,
`yOuterPadding` 0.5, `colors`, `lineWidth` 2, `activeLineWidth` 4,
`inactiveLineWidth` 1, `opacity/activeOpacity/inactiveOpacity` (0.3),
`startLabel` false, `endLabel` true, `start/endLabelPadding` 16,
`start/endLabelTextColor`, `pointSize` 6, `activePointSize`,
`inactivePointSize`, `pointColor`, `pointBorderWidth/Color`,
`pointComponent`, `enableGridX/Y` true, `axisTop/Bottom/Left` `{}`,
`axisRight` null, `defaultActiveSerieIds` [], `layers`, `useMesh`,
`animate` (true), `motionConfig` (`'gentle'`). `AreaBump` — отдельный
компонент (`area-bump/AreaBump.tsx`).

## Анимации

`bump/Line.tsx`: путь морфится `useAnimatedPath` (interpolateString
старого и нового `d`); цвет, opacity и толщина — `useSpring`. Точки и
подписи — пружины.

## Исходники и документация

- `templates/infografika/nivo/packages/bump/src/bump/Bump.tsx`, `bump/Line.tsx`, `bump/types.ts`, `bump/defaults.ts`
- `templates/infografika/nivo/packages/bump/src/area-bump/AreaBump.tsx`
- `templates/infografika/nivo/website/src/data/components/bump/meta.yml`
- `templates/infografika/nivo/storybook/stories/bump/Bump.stories.tsx`, `AreaBump.stories.tsx`

## Зависимости

`@nivo/bump`, `@nivo/core`, `@nivo/axes`, `@react-spring/web`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
«Прорисовка во времени» — срез `data[i].data` по кадру (x-шкала point
пересчитается, поэтому лучше маскировать `clip-path` по ширине) или
`stroke-dashoffset` в custom layer. Подсветка лидера — `defaultActiveSerieIds`
по кадру.

## Паттерны

`comparison`, `timeline`, `growth-decline`
