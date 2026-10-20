# TreeMap — `nivo/treemap`

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

Treemap (d3-hierarchy treemap): прямоугольники, площадь которых
пропорциональна значению, вложены по иерархии. У родителей полосы с
подписью (`enableParentLabel`). Варианты в пакете — `TreeMapHtml`,
`TreeMapCanvas`.

## Когда использовать

Доли многих элементов с иерархией: капитализация компаний по секторам,
место на диске, бюджет. Для 2–6 долей — `nivo/pie`, для структуры без
величин — `nivo/tree`.

## Фразы из озвучки

- «пять компаний занимают больше половины рынка»
- «больше всего места на диске съедают видео»
- «разложим бюджет по статьям»

## Визуальный стиль

Плотная мозаика прямоугольников, подписи внутри (`labelSkipSize`),
поворот подписей (`orientLabel`). Финансово-аналитический («карта рынка»).

## Входные данные

`TreeMapSvgProps` (`types.ts`): `data` (дерево), `width`, `height`,
`margin`, `identity`, `value`, `valueFormat`, `tile` (`TileType`),
`leavesOnly`, `innerPadding`, `outerPadding`, `enableLabel`, `label`,
`labelFormat`, `labelSkipSize`, `labelTextColor`, `orientLabel`,
`enableParentLabel`, `parentLabel`, `parentLabelSize`,
`parentLabelPosition` `top|right|bottom|left`, `parentLabelPadding`,
`parentLabelTextColor`, `colors`, `colorBy`, `nodeOpacity`,
`borderWidth`, `borderColor`, `nodeComponent`, `layers` (`nodes` +
custom), `defs/fill`, `animate`, `motionConfig`, `isInteractive`.

## Анимации

Узлы получают `animatedProps` (`SpringValues<NodeAnimatedProps>`) —
позиции, размеры, цвета переходят пружинами.

## Исходники и документация

- `templates/infografika/nivo/packages/treemap/src/TreeMap.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/treemap/meta.yml`
- `templates/infografika/nivo/storybook/stories/treemap/TreeMap.stories.tsx`

## Зависимости

`@nivo/treemap`, `@nivo/core`, `@nivo/colors`, `@react-spring/web`, `d3-hierarchy`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Появление — custom `nodeComponent` с `opacity`/`scale` от кадра (stagger
по индексу или глубине). Изменение значений по кадру перестраивает
раскладку, и прямоугольники «скачут». Плавный переход между двумя
состояниями — только своя интерполяция геометрии.

## Паттерны

`quantities`, `system-structure`, `comparison`
