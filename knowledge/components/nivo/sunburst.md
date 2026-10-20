# Sunburst — `nivo/sunburst`

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

Sunburst — радиальная иерархия: центр — корень, каждое следующее кольцо
— уровень глубже, угол дуги пропорционален значению. Подписи на дугах.

## Когда использовать

Иерархия с долями, 2–4 уровня: структура расходов, состав продаж по
категориям и подкатегориям, файловая система. Прямоугольный аналог —
`nivo/icicle` или `nivo/treemap`.

## Фразы из озвучки

- «из всех расходов треть — маркетинг, и внутри него лидирует реклама»
- «разложим выручку по категориям и подкатегориям»
- «каждое кольцо — следующий уровень детализации»

## Визуальный стиль

Концентрические кольца, цвет по ветке или глубине, дочерние цвета
выводятся из родительского (`inheritColorFromParent`, `childColor`).
`cornerRadius` для мягкости.

## Входные данные

`SunburstSvgProps` (`types.ts`): `data` (дерево), `id`, `value`,
`valueFormat`, `width`, `height`, `margin`, `cornerRadius`, `colors`,
`colorBy` `id|depth`, `inheritColorFromParent`, `childColor`,
`borderWidth`, `borderColor`, `enableArcLabels` + `ArcLabelsProps`
(`arcLabel`, `arcLabelsSkipAngle`, …), `layers` + custom (метрика в
центре), `transitionMode`, `defs/fill`, `animate`, `motionConfig`,
`isInteractive`, `role`.

## Анимации

Дуги — `@nivo/arcs` с переходами react-spring, режим задаёт
`transitionMode`. Drill-down из storybook — интерактив.

## Исходники и документация

- `templates/infografika/nivo/packages/sunburst/src/Sunburst.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/sunburst/meta.yml`
- `templates/infografika/nivo/storybook/stories/sunburst/Sunburst.stories.tsx`

## Зависимости

`@nivo/sunburst`, `@nivo/arcs`, `@nivo/core`, `@nivo/colors`, `@react-spring/web`, `d3-hierarchy`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Раскрытие по кольцам — custom layer или маска по радиусу (`clip-path:
circle(r)` с `r` от кадра). Drill-down — подмена `data` поддеревом по кадру
(переход без анимации, скачком).

## Паттерны

`system-structure`, `quantities`
