# RadialBar — `nivo/radial-bar`

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

Радиальные бары: концентрические кольца (по одному на серию), в каждом —
дуги категорий, длина дуги — значение. Фоновые треки (`enableTracks`)
делают кольца похожими на прогресс-индикаторы.

## Когда использовать

Несколько прогрессов или долей кругом: выполнение плана по командам,
заполненность ресурсов, «кольца активности». Для одной метрики против
цели подходит и `nivo/bullet`.

## Фразы из озвучки

- «три команды уже закрыли больше восьмидесяти процентов плана»
- «заполняемость серверов по регионам»
- «каждое кольцо — отдельный продукт»

## Визуальный стиль

Округлые дуги (`cornerRadius`), треки приглушённого цвета, стиль
фитнес-трекеров и dashboard-ов.

## Входные данные

`RadialBarSvgProps` (`types.ts`): `data: {id, data: {x, y}[]}[]`, `width`,
`height`, `margin`, `maxValue` auto, `valueFormat`, `startAngle`,
`endAngle`, `innerRadius`, `padding`, `padAngle`, `cornerRadius`,
`colors`, `borderWidth`, `borderColor`, `enableTracks`, `tracksColor`,
`enableRadialGrid`, `enableCircularGrid`, `radialAxisStart`,
`radialAxisEnd`, `circularAxisInner`, `circularAxisOuter`,
`enableLabels`, `label`, `labelsSkipAngle`, `labelsSkipRadius`,
`labelsRadiusOffset`, `labelsTextColor`, `legends`, `layers` + custom,
`transitionMode`, `defs/fill`, `animate`, `motionConfig`, `isInteractive`.

## Анимации

Дуги — `@nivo/arcs` с переходами react-spring (`transitionMode`).

## Исходники и документация

- `templates/infografika/nivo/packages/radial-bar/src/RadialBar.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/radial-bar/meta.yml`
- `templates/infografika/nivo/storybook/stories/radial-bar/RadialBar.stories.tsx`

## Зависимости

`@nivo/radial-bar`, `@nivo/arcs`, `@nivo/polar-axes`, `@nivo/core`, `@react-spring/web`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Заполнение колец — `y * progress` при числовом `maxValue`. Можно добавить
по кольцу stagger. Число в центре — custom layer с `interpolate(frame)`.

## Паттерны

`quantities`, `comparison`, `key-point-emphasis`
