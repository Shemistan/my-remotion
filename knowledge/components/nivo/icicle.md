# Icicle — `nivo/icicle`

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

Icicle-диаграмма: иерархия прямоугольниками по уровням глубины. Ширина
пропорциональна значению, дети под родителем. При `orientation: 'bottom'`
получается flame chart. Есть зум и навигация с клавиатуры. `IcicleHtml` —
HTML-вариант.

## Когда использовать

Структура с долями по уровням: дерево расходов, профиль производительности
(flame graph), структура каталога. Радиальный аналог — `nivo/sunburst`.

## Фразы из озвучки

- «вот где программа тратит больше всего времени»
- «бюджет раскладывается на направления, а те — на проекты»
- «спустимся на уровень ниже»

## Визуальный стиль

Полосы-прямоугольники со скруглением (`borderRadius`), зазоры
`gapX/gapY`, цвет по id или глубине. Технично, «инженерно».

## Входные данные

`IcicleSvgProps` (`types.ts`): `data` (дерево `{id, value?, children?}`),
`width`, `height`, `margin`, `identity`, `value`, `valueFormat`, `sort`
`input|asc|desc|fn`, `orientation` `top|right|bottom|left`, `gapX`,
`gapY`, `colors`, `colorBy` `id|depth`, `inheritColorFromParent`,
`childColor`, `borderRadius`, `borderWidth`, `borderColor`,
`enableLabels` + label-props из `@nivo/rects`, `enableZooming`,
`zoomMode` `lateral|global`, `layers` (`rects, labels`), `nodeComponent`,
`labelComponent`, `animate`, `motionConfig`, `animateOnMount`,
`rectsTransitionMode`, `labelsTransitionMode`, `isInteractive`, `context`,
a11y-props.

## Анимации

Прямоугольники и метки переходят через `@nivo/rects` (react-spring), режим
задают `rectsTransitionMode`/`labelsTransitionMode`. При `animateOnMount`
анимация идёт уже на mount.

## Исходники и документация

- `templates/infografika/nivo/packages/icicle/src/Icicle.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/icicle/meta.yml`
- `templates/infografika/nivo/storybook/stories/icicle/Icicle.stories.tsx`

## Зависимости

`@nivo/icicle`, `@nivo/core`, `@nivo/rects`, `@nivo/colors`, `@react-spring/web`, `d3-hierarchy`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `animateOnMount={false}`,
`isInteractive={false}`, `enableZooming={false}`, явные размеры.
Пошаговое раскрытие уровней — `opacity`/`clip-path` по `hierarchy.depth` в
custom layer или `nodeComponent`.

## Паттерны

`system-structure`, `quantities`
