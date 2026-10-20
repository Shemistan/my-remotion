# FunnelChart — `recharts/funnel-chart`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Воронка: стопка трапеций сверху вниз, ширина каждой пропорциональна
значению этапа; последний этап — треугольник или прямоугольник
(`lastShapeType`), подписи через `LabelList`.

## Когда использовать

Конверсия по этапам: визиты → корзина → оплата, найм, продажи. Для
потоков с ветвлением — `recharts/sankey`.

## Фразы из озвучки

- «из тысячи посетителей до оплаты доходят тридцать»
- «больше всего теряем на шаге корзины»
- «воронка продаж за квартал»

## Визуальный стиль

Цветные трапеции по `Cell`/`fill`, подписи справа или внутри;
маркетинговый, презентационный стиль.

## Входные данные

`<FunnelChart>`: общие `CartesianChartProps` (`width`, `height`,
`margin`). `<Funnel data dataKey nameKey ('name') lastShapeType
('triangle' | 'rectangle') reversed label shape activeShape hide
legendType ('rect') isAnimationActive ('auto') animationBegin (400)
animationDuration (1500) animationEasing ('ease') animationInterpolateFn
animationMatchBy>`; `Cell`, `LabelList`.

## Анимации

Раскрытие трапеций через `AnimatedItems` → `JavascriptAnimate` (rAF),
по умолчанию с задержкой 400 мс. `shape`-функция получает
`animationElapsedTime`.

## Исходники и документация

- `templates/infografika/recharts/src/chart/FunnelChart.tsx` — обёртка
- `templates/infografika/recharts/src/cartesian/Funnel.tsx` — `FunnelProps`
- `templates/infografika/recharts/storybook/stories/API/chart/FunnelChart.stories.tsx` — примеры

## Зависимости

`recharts` (`Trapezoid` из `src/shape`), redux.

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}`; поэтапное появление по кадру —
`shape`-функция с `<Trapezoid>` и `opacity`/`scaleX` от
`interpolate(frame - index*stagger, …)` или срез `data` сверху вниз
(ширины считаются от максимума — первый этап обычно максимален, поэтому
срез не меняет масштаб). См. `knowledge/compatibility/recharts.md`.

## Паттерны

`sequence-steps`, `quantities`, `transformation`
