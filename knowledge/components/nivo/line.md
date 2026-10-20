# Line — `nivo/line`

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

Линейный график: одна или несколько серий, точки, области под линией
(в том числе стопкой), кривые d3 (`curve`), шкалы point/linear/time/log,
маркеры-линии, легенды. Разрывы на `null`. `LineCanvas` — для больших
рядов.

## Когда использовать

Тренд во времени, рост или падение, сравнение нескольких рядов, «до и
после» события (маркер). Для рангов — `nivo/bump`, для состава во
времени — `nivo/stream`.

## Фразы из озвучки

- «за пять лет аудитория выросла в десять раз»
- «после запуска новой версии ошибки резко пошли вниз»
- «сравним динамику трёх продуктов»
- «в марте был провал, но к лету всё восстановилось»

## Визуальный стиль

Чистые линии `lineWidth` 2, точки с обводкой цвета фона, градиентные
области через `defs/fill`, сетка по обеим осям. Классический дашборд.

## Входные данные

`LineSvgProps` (`types.ts`, defaults в `defaults.ts`): `data: {id, data:
{x, y}[]}[]`, `width`, `height`, `margin`, `xScale` (`{type:'point'}`),
`yScale` (`{type:'linear', min:0, max:'auto'}`), `xFormat`, `yFormat`,
`curve` (`'linear'`), `colors`, `lineWidth` 2, `enablePoints` true,
`pointSize` 6, `pointColor`, `pointBorderWidth` 0, `pointBorderColor`,
`pointSymbol`, `enablePointLabel` false, `pointLabel`,
`pointLabelYOffset`, `enableArea` false, `areaBaselineValue` 0,
`areaOpacity` 0.2, `areaBlendMode`, `enableGridX/Y` true,
`gridXValues/gridYValues`, `axisTop/Right/Bottom/Left`, `markers`,
`legends`, `layers` (`grid, markers, axes, areas, crosshair, lines,
points, slices, mesh, legends` + custom), `enableSlices`,
`enableCrosshair` true, `useMesh`, `initialHiddenIds`, `defs/fill`,
`animate` (true), `motionConfig` (`'gentle'`), `isInteractive`.

## Анимации

Пути линий и областей морфятся `useAnimatedPath`, точки — пружинами.
Встроенного «рисования» линии нет.

## Исходники и документация

- `templates/infografika/nivo/packages/line/src/Line.tsx`, `types.ts`, `defaults.ts`
- `templates/infografika/nivo/website/src/data/components/line/meta.yml`
- `templates/infografika/nivo/storybook/stories/line/Line.stories.tsx`

## Зависимости

`@nivo/line`, `@nivo/core`, `@nivo/axes`, `@nivo/scales`, `@nivo/legends`, `@react-spring/web`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
«Рисование» — срез точек до текущего x по кадру, при этом шкалу `xScale`
и `yScale` (`min/max`) зафиксировать, или `clip-path` слева направо, или
custom layer с `stroke-dashoffset` по `lineGenerator`. Рост —
`y * progress`. Story «real time chart» опирается на таймер в самой
истории, в Remotion — данные от кадра.

## Паттерны

`growth-decline`, `timeline`, `comparison`
