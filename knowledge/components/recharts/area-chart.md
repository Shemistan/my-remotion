# AreaChart — `recharts/area-chart`

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

График с заливкой под кривой: одиночные, накопленные (`stackId`,
`stackOffset="expand"` для 100 %) и диапазонные (`dataKey` → `[min,max]`)
области с контурной линией, осями и сеткой.

## Когда использовать

Объём или накопленный итог во времени, структура целого по периодам,
коридор значений (минимум–максимум). Если важна только форма тренда —
`recharts/line-chart`.

## Фразы из озвучки

- «суммарный трафик рос весь год»
- «доля каждого канала в общем потоке»
- «температура колебалась в этом коридоре»

## Визуальный стиль

Полупрозрачные заливки (`fill`, `fillOpacity`), мягкие кривые
(`type="monotone"`), градиент через `<defs><linearGradient>` в детях.

## Входные данные

`<AreaChart>`: общие `CartesianChartProps` (`data`, `width`, `height`,
`margin`, `layout`, `stackOffset`, `baseValue`). `<Area dataKey type
('linear') stackId baseValue connectNulls (false) dot (false) activeDot
(true) label (false) shape hide stroke fill isAnimationActive ('auto')
animationBegin (0) animationDuration (1500) animationEasing ('ease')
animationInterpolateFn animationMatchBy>`.

## Анимации

Вход — раскрытие слева направо через clipPath-прямоугольник шириной
`alpha × ширина` (`AreaRevealShape`), обновления — интерполяция точек.
Таймер: `JavascriptAnimate`, rAF + `performance.now`.

## Исходники и документация

- `templates/infografika/recharts/src/chart/AreaChart.tsx` — обёртка
- `templates/infografika/recharts/src/cartesian/Area.tsx` — `AreaProps`
- `templates/infografika/recharts/src/cartesian/AreaRevealShape.tsx` — вход через clip-path
- `templates/infografika/recharts/storybook/stories/API/chart/AreaChart.stories.tsx` — примеры

## Зависимости

`recharts`, `victory-vendor` (d3-shape), redux внутри.

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}`; раскрытие по кадру — `null`-хвост
в данных (как у линии) или свой `clipPath`/обёртка с
`clipPath: inset(0 ${(1-p)*100}% 0 0)` поверх области графика; рост
высоты — умножение значений на `p` при фиксированном домене `YAxis`.
См. `knowledge/compatibility/recharts.md`.

## Паттерны

`growth-decline`, `quantities`, `timeline`
