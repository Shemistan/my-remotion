# ECharts effectScatter — `echarts/effect-scatter`

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

Точки с расходящимися кольцами-волнами (ripple): маркеры городов,
активные события, горячие точки на карте или графике.

## Когда использовать

Акцент на нескольких точках. Для массы точек — `echarts/scatter`.

## Фразы из озвучки

- «вот где сейчас пик активности»
- «мы открылись в пяти городах»
- «сигнал пришёл отсюда»

## Визуальный стиль

Точка + 3 кольца до scale 2.5 за 4 с, заливка или обводка; «радарный».

## Входные данные

`EffectScatterSeriesOption`: `data`, `coordinateSystem`, `effectType`
(`'ripple'`), `showEffectOn` (`'render'`|`'emphasis'`), `rippleEffect`
({period 4, scale 2.5, brushType 'fill', number 3, color}), `symbol`,
`symbolSize` (10), `clip` (true).

## Анимации

Бесконечная петля в `EffectSymbol.startEffectAnimation`: каждое кольцо
`animate('', true).when(period, {scaleX, scaleY})` и `opacity → 0`,
`period` в секундах ×1000, сдвиг фазы по индексу точки. Петля **не
зависит** от `animation: false`.

```ts
ripplePath.animate('', true)
  .when(effectCfg.period, { scaleX: effectCfg.rippleScale / 2, scaleY: … })
  .delay(delay).start();
```

## Исходники и документация

- `templates/infografika/echarts/src/chart/effectScatter/EffectScatterSeries.ts`
- `templates/infografika/echarts/src/chart/effectScatter/EffectScatterView.ts`
- `templates/infografika/echarts/src/chart/helper/EffectSymbol.ts` — петля ripple
- `templates/infografika/echarts/test/effectScatter.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. Выключить петлю: `showEffectOn: 'emphasis'` (кольца стартуют
только при hover). Пульс покадрово: второй `scatter`-ряд с
`symbolSize` и `itemStyle.opacity` от `(frame % period) / period`.
Остальное — `knowledge/compatibility/echarts.md`.

## Паттерны

`key-point-emphasis`, `spatial`
