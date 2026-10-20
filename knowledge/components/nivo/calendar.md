# Calendar — `nivo/calendar`

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

Календарная тепловая карта: квадрат на каждый день года по неделям,
месяцы обведены, цвет по значению (как граф активности GitHub). В пакете
также `TimeRange` (произвольный диапазон с подписями дней недели) и
`CalendarCanvas`.

## Когда использовать

Активность или события по дням: коммиты, тренировки, продажи, сезонность.
Для агрегатов по месяцам лучше `nivo/bar` или `nivo/heatmap`.

## Фразы из озвучки

- «весь год мы коммитили почти каждый день»
- «пик активности пришёлся на декабрь»
- «видно, что по выходным продаж почти нет»

## Визуальный стиль

Сетка мелких квадратов, 4-цветная шкала (`#61cdbb … #f47560`), пустые дни
`emptyColor` (`#fff`), чёрные границы месяцев. Инфографичный, «технарский».

## Входные данные

`CalendarSvgProps` (`types.ts`, defaults в `props.ts`): `from`, `to`
(string|Date, обязательно), `data: {day: 'YYYY-MM-DD', value}[]`, `width`,
`height`, `margin`, `direction` horizontal, `align` center, `colors`,
`colorScale`, `emptyColor`, `minValue` 0, `maxValue` auto, `yearSpacing`
30, `yearLegend`, `yearLegendPosition`, `yearLegendOffset` 10,
`monthSpacing` 0, `monthBorderWidth` 2, `monthBorderColor`, `monthLegend`
(`%b`), `monthLegendPosition`, `monthLegendOffset`, `daySpacing` 0,
`dayBorderWidth` 1, `dayBorderColor`, `valueFormat`, `legendFormat`,
`legends`, `theme`, `isInteractive`. `TimeRange`: + `dayRadius`, `square`,
`firstWeekday`, `weekdays`, `weekdayTicks`, `weekdayLegendOffset`.

## Анимации

Встроенной нет: в `package.json` нет `@react-spring/web`, в props нет
`animate`.

## Исходники и документация

- `templates/infografika/nivo/packages/calendar/src/Calendar.tsx`, `types.ts`, `props.ts`
- `templates/infografika/nivo/website/src/data/components/calendar/meta.yml`
- `templates/infografika/nivo/storybook/stories/calendar/Calendar.stories.tsx`

## Зависимости

`@nivo/calendar`, `@nivo/core`, `@nivo/legends`, `d3-time`, `d3-time-format`, `d3-scale`.

## Совместимость и адаптация

`adaptable`: чистый SVG без таймеров. Брать `Calendar`, а не
`ResponsiveCalendar`, с `isInteractive={false}`. «Заполнение по дням» —
фильтр `data` по `day <= currentDay(frame)`; `maxValue` задать числом,
чтобы цвета не плыли.

## Паттерны

`timeline`, `quantities`
