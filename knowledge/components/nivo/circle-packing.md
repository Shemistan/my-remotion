# CirclePacking — `nivo/circle-packing`

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

Вложенные круги (d3-hierarchy pack): каждый узел дерева — круг, площадь
пропорциональна значению, дети внутри родителя. Есть зум на узел
(`zoomedId`). Варианты в пакете — `CirclePackingHtml`,
`CirclePackingCanvas`.

## Когда использовать

Иерархия с размерами: структура рынка, бюджет по статьям и подстатьям,
модули кода. Пузырями «кто больше» без строгой точности. Для точных долей —
`nivo/treemap`.

## Фразы из озвучки

- «рынок делится на три сегмента, а внутри каждого — десятки игроков»
- «самый крупный блок бюджета — инфраструктура»
- «приблизимся к одному отделу»

## Визуальный стиль

Мягкие круги, цвет по глубине (`colorBy: 'depth'`), можно наследовать от
родителя. Спокойный, «органичный» вид.

## Входные данные

`CirclePackingSvgProps` (`types.ts`, defaults в `defaults.ts`): `data`
(корень дерева), `width`, `height`, `margin`, `id` (`'id'`), `value`
(`'value'`), `valueFormat`, `padding` 0, `leavesOnly` false, `colors`,
`colorBy` `id|depth` (depth), `inheritColorFromParent` false,
`childColor`, `borderWidth` 0, `borderColor`, `enableLabels` false,
`label` `'id'`, `labelsFilter`, `labelsSkipRadius` 8, `labelTextColor`,
`layers` (`circles, labels`), `zoomedId`, `circleComponent`,
`labelComponent`, `defs/fill`, `animate` (true), `motionConfig`
(`'gentle'`), `isInteractive`.

## Анимации

Круги и подписи получают пружинные `x`, `y`, `radius`, `color`,
`opacity` (`CircleProps.style`). Смена `zoomedId` анимирует зум.

## Исходники и документация

- `templates/infografika/nivo/packages/circle-packing/src/CirclePacking.tsx`, `types.ts`, `defaults.ts`
- `templates/infografika/nivo/website/src/data/components/circle-packing/meta.yml`
- `templates/infografika/nivo/storybook/stories/circle-packing/CirclePacking.stories.tsx`

## Зависимости

`@nivo/circle-packing`, `@nivo/core`, `@nivo/colors`, `@react-spring/web`, `d3-hierarchy`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Появление по глубине — custom layer или `circleComponent`, где
`opacity`/`scale` считаются из кадра и `node.depth`. Плавный зум — своя
интерполяция `transform` обёртки к `node.x/y/radius`: переключение
`zoomedId` без анимации даёт скачок.

## Паттерны

`system-structure`, `quantities`, `comparison`
