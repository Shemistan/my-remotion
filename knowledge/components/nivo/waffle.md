# Waffle — `nivo/waffle`

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

Вафельная диаграмма: сетка `rows × columns` клеток, доли закрашены цветами
категорий в порядке `fillDirection`, остаток — `emptyColor`. Слой `areas`
обводит область каждой категории. Варианты — `WaffleHtml`, `WaffleCanvas`.

## Когда использовать

Доли в «человеческих» единицах: «каждый третий», «7 из 10», проценты от
сотни. Нагляднее пирога, когда нужно считать штуки. Для одной метрики
против цели — `nivo/bullet`.

## Фразы из озвучки

- «семь из десяти пользователей заходят с телефона»
- «каждый третий клиент возвращается»
- «из ста заявок одобряют только двенадцать»

## Визуальный стиль

Ровная сетка квадратов (`borderRadius` для точек-кружков), `padding`
между клетками, палитра `nivo`. Дружелюбный, плакатный.

## Входные данные

`WaffleSvgProps` (`types.ts`, defaults в `defaults.ts`): `data: {id,
label, value}[]`, `total`, `rows`, `columns` (все обязательны), `width`,
`height`, `margin`, `hiddenIds` [], `valueFormat`, `fillDirection`
(`'top'`), `padding` 1, `colors`, `emptyColor` `#cccccc`, `emptyOpacity`
1, `borderRadius` 0, `borderWidth` 0, `borderColor`, `layers` (`cells,
areas, legends` + custom), `legends`, `cellComponent`, `motionStagger` 0,
`defs/fill`, `animate` (true), `motionConfig` (`'gentle'`),
`isInteractive`.

## Анимации

`WaffleCells.tsx`: `useAnimatedCells` (react-spring transition) с
задержкой между клетками `motionStagger`.

## Исходники и документация

- `templates/infografika/nivo/packages/waffle/src/Waffle.tsx`, `WaffleCells.tsx`, `types.ts`, `defaults.ts`
- `templates/infografika/nivo/website/src/data/components/waffle/meta.yml`
- `templates/infografika/nivo/storybook/stories/waffle/Waffle.stories.tsx`

## Зависимости

`@nivo/waffle`, `@nivo/grid`, `@nivo/core`, `@nivo/legends`, `@react-spring/web`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Заполнение клетка за клеткой — `value * progress`, округлённое до целых
клеток при фиксированном `total` (встроенный `motionStagger` заменяется
этим). Скрытие категорий — `hiddenIds` по кадру.

## Паттерны

`quantities`, `comparison`, `key-point-emphasis`
