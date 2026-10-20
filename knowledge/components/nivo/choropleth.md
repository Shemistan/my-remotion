# Choropleth / GeoMap — `nivo/choropleth`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`), пакет `@nivo/geo` |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:d3`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, packages/geo/package.json) |

## Что визуализирует

Карта-хороплет: регионы из GeoJSON закрашены по значению, проекции d3-geo
(mercator, orthographic-глобус, naturalEarth1 и др.), есть сетка
меридианов (graticule) и легенда. `GeoMap` в том же пакете рисует карту без
данных, а `ChoroplethCanvas`/`GeoMapCanvas` — те же карты на canvas.

## Когда использовать

Показатель по странам или регионам: проникновение продукта, продажи,
население. Анимация вращения глобуса для «мы работаем по всему миру».

## Фразы из озвучки

- «сервисом пользуются в сорока странах»
- «больше всего клиентов — в Европе и Северной Америке»
- «посмотрим на карту продаж по регионам»

## Визуальный стиль

Плоская карта с последовательной цветовой схемой (`colors: 'PuBuGn'`),
серый `unknownColor` для регионов без данных, тонкие границы.

## Входные данные

`ChoroplethProps` (`packages/geo/index.d.ts`, defaults в `src/props.js`):
`features: GeoJSON Feature[]` (обязательно), `data: any[]`, `domain:
number[]`, `width`, `height`, `margin`, `match` (`'id'`), `label` (`'id'`),
`value` (`'value'`), `valueFormat`, `colors` (`'PuBuGn'`), `unknownColor`
(`'#999'`), `projectionType` (`mercator`, `orthographic`, `equalEarth`,
`naturalEarth1`, …), `projectionScale` 100, `projectionTranslation`
`[0.5,0.5]`, `projectionRotation` `[0,0,0]`, `enableGraticule` false,
`graticuleLineWidth` 0.5, `graticuleLineColor`, `borderWidth` 0,
`borderColor`, `layers` (`graticule, features, legends`), `legends`,
`defs/fill`, `isInteractive`. `GeoMap`: `features`, `fillColor`,
`borderWidth/Color` + проекция.

## Анимации

Встроенной нет (react-spring в пакете не используется).

## Исходники и документация

- `templates/infografika/nivo/packages/geo/src/Choropleth.js`, `GeoMap.js`, `props.js`
- `templates/infografika/nivo/packages/geo/index.d.ts` — типы props
- `templates/infografika/nivo/website/src/data/components/choropleth/meta.yml`, `geomap/meta.yml`
- `templates/infografika/nivo/website/src/data/components/geo/world_countries.json` — пример GeoJSON

## Зависимости

`@nivo/geo`, `@nivo/core`, `@nivo/legends`, `d3-geo`, `d3-format`;
внешние данные GeoJSON (в пакет не входят).

## Совместимость и адаптация

`adaptable`: детерминированный SVG. **Нужен GeoJSON**: компонент ничего не
грузит сам, `features` передаются массивом. В Remotion импортировать JSON
статически (попадёт в бандл) или грузить `staticFile` + `fetch` внутри
`delayRender`. Анимация по кадру: `projectionRotation` (вращение глобуса в
`orthographic`), `projectionScale` (наезд), `value × progress` или
`domain` (заливка). `isInteractive={false}`, без `ResponsiveChoropleth`.

## Паттерны

`spatial`, `comparison`, `quantities`
