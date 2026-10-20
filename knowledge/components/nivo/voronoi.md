# Voronoi — `nivo/voronoi`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:d3`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, package.json) |

## Что визуализирует

Диаграмма Вороного и триангуляция Делоне (d3-delaunay) по точкам:
ячейки, связи-рёбра Делоне, сами точки, граница. На сайте помечена как
experimental. Пакет также служит mesh-слоем для hover в других графиках.

## Когда использовать

Абстрактная «геометрия данных»: зоны влияния, ближайший пункт
обслуживания, декоративный технологичный фон. Это не столько график,
сколько визуальная метафора.

## Фразы из озвучки

- «каждая точка обслуживает свою зону»
- «город делится на районы вокруг ближайших станций»
- «сеть покрывает всё пространство без пробелов»

## Визуальный стиль

Тонкие линии ячеек и рёбер, точки. Минималистично, «математично»,
хорошо как фон.

## Входные данные

`VoronoiSvgProps` (`types.ts`): `data: {id, x, y}[]`, `width`, `height`,
`margin`, `xDomain: [number, number]`, `yDomain`, `layers` (`links, cells,
points, bounds` + custom с `delaunay`/`voronoi`), `enableLinks`,
`linkLineWidth`, `linkLineColor`, `enableCells`, `cellLineWidth`,
`cellLineColor`, `enablePoints`, `pointSize`, `pointColor`, `theme`,
`role`.

## Анимации

Встроенной нет (в props нет `MotionProps`).

## Исходники и документация

- `templates/infografika/nivo/packages/voronoi/src/Voronoi.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/voronoi/meta.yml`
- `templates/infografika/nivo/storybook/stories/voronoi/Voronoi.stories.tsx`

## Зависимости

`@nivo/voronoi`, `@nivo/core`, `d3-delaunay`, `d3-scale`.

## Совместимость и адаптация

`adaptable`: чистый SVG, детерминирован при фиксированных `data` и
доменах. Анимация — точки, движущиеся по кадру (`x/y` от `frame`, с
`random(seed)` из remotion вместо `Math.random`). Ячейки пересчитываются
на каждом кадре: дёшево и детерминированно. Без `ResponsiveVoronoi`.

## Паттерны

`spatial`, `abstract-concepts`
