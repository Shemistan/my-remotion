# ECharts funnel — `echarts/funnel`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Воронка из трапеций: ширина этапа пропорциональна значению, сортировка
по убыванию, подписи снаружи с линиями или внутри.

## Когда использовать

Конверсия по этапам. Ветвление — `echarts/sankey`; React-вариант —
`recharts/funnel-chart`.

## Фразы из озвучки

- «из тысячи посетителей до оплаты доходят тридцать»
- «больше всего теряем на шаге корзины»
- «воронка продаж за квартал»

## Визуальный стиль

Цветные трапеции с белой обводкой, `colorBy: 'data'`; маркетинговый.

## Входные данные

`FunnelSeriesOption`: `data` ([{name, value}]), `min`, `max`, `minSize`
('0%'), `maxSize` ('100%'), `sort` (`'descending'`|`'ascending'`|`'none'`),
`orient` (`'vertical'`), `gap` (0), `funnelAlign` (`'center'`), `label`
({position 'outer'}), `labelLine` ({length 20}), `itemStyle`
({borderWidth 1}), `left` 80 / `top` 60 / `right` 80 / `bottom` 65.

## Анимации

Проявление трапеций на входе, переход формы на update.

## Исходники и документация

- `templates/infografika/echarts/src/chart/funnel/FunnelSeries.ts`
- `templates/infografika/echarts/src/chart/funnel/FunnelView.ts`
- `templates/infografika/echarts/test/funnel.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; поэтапно — `itemStyle.opacity` по
индексу от кадра при заданных `min`/`max` (форма стабильна); срез
`data` перестраивает ширины. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`sequence-steps`, `quantities`, `transformation`
