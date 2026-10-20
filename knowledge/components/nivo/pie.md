# Pie — `nivo/pie`

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

Круговая диаграмма или «пончик» (`innerRadius`): сектора с подписями
внутри (`arcLabels`) и выносками (`arcLinkLabels`). Через custom layer
можно положить метрику в центр. Задаются диапазон углов, отступы, скругления.
`PieCanvas` — canvas-вариант.

## Когда использовать

Доли целого, 2–6 частей: структура выручки, доля рынка, «60 % — мобильные».
Если частей много или их нужно точно сравнить — `nivo/bar`, если доля
одна — `nivo/radial-bar` или `nivo/waffle`.

## Фразы из озвучки

- «шестьдесят процентов трафика — с мобильных»
- «почти половина выручки приходится на один продукт»
- «как распределяется бюджет по направлениям»

## Визуальный стиль

Плоские сектора, `padAngle` и `cornerRadius` дают современный
«пончиковый» вид. Палитра `nivo`, линии выносок цвета осей.

## Входные данные

`PieSvgProps` (`types.ts`, defaults в `props.ts`): `data: {id, value,
label?, color?}[]`, `width`, `height`, `margin`, `id` (`'id'`), `value`
(`'value'`), `valueFormat`, `sortByValue` false, `innerRadius` 0,
`padAngle` 0, `cornerRadius` 0, `startAngle` 0, `endAngle` 360, `fit`
true, `activeInnerRadiusOffset`/`activeOuterRadiusOffset` 0,
`activeId`/`defaultActiveId`, `colors`, `borderWidth`, `borderColor`,
`enableArcLabels` true, `arcLabel` `formattedValue`,
`arcLabelsSkipAngle`, `arcLabelsRadiusOffset` 0.5, `arcLabelsTextColor`,
`enableArcLinkLabels` true, `arcLinkLabel` `'id'`,
`arcLinkLabelsDiagonalLength` 16, `arcLinkLabelsStraightLength` 24,
`arcLinkLabelsThickness`, `arcLinkLabelsTextOffset`, `arcLinkLabelsColor`,
`layers` (`arcs, arcLinkLabels, arcLabels, legends` + custom), `legends`,
`defs/fill`, `transitionMode` (`'innerRadius'`), `animate` (true),
`motionConfig` (`'gentle'`), `isInteractive`.

## Анимации

Дуги переходят через `@nivo/arcs` (react-spring), режим задаёт
`transitionMode`. Подписи и выноски тоже анимируются.

## Исходники и документация

- `templates/infografika/nivo/packages/pie/src/Pie.tsx`, `types.ts`, `props.ts`
- `templates/infografika/nivo/website/src/data/components/pie/meta.yml`
- `templates/infografika/nivo/storybook/stories/pie/Pie.stories.tsx` (метрика в центре, custom legend)

## Зависимости

`@nivo/pie`, `@nivo/arcs`, `@nivo/core`, `@nivo/legends`, `@react-spring/web`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
`endAngle = interpolate(frame, …, [0, 360])` раскрывает весь круг «веером»:
все сектора сжаты пропорционально. При этом `fit={false}`, иначе
радиус будет подгоняться под дугу и «прыгать». Для эффекта «сектор за сектором» нужна
маска `clip-path`/conic или custom layer. Акцент на секторе — `activeId` и
`activeOuterRadiusOffset`. Число в центре — custom layer с
`interpolate(frame)`.

## Паттерны

`quantities`, `comparison`, `key-point-emphasis`
