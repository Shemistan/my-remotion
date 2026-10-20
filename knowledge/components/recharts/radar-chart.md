# RadarChart — `recharts/radar-chart`

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

Лепестковая диаграмма: многоугольник значений по 4–10 осям-критериям
поверх паутины `PolarGrid`, подписи осей `PolarAngleAxis`, шкала
`PolarRadiusAxis`; несколько полупрозрачных профилей для сравнения.

## Когда использовать

Профиль по многим критериям: навыки, характеристики продукта, сравнение
двух-трёх объектов «по всем параметрам». Для одного критерия — столбцы.

## Фразы из озвучки

- «по скорости мы впереди, а по цене уступаем»
- «сравним два смартфона по шести параметрам»
- «профиль идеального кандидата»

## Визуальный стиль

Геометричный, «игровой» (как характеристики персонажа): заливка с
`fillOpacity`, контур, паутина-сетка.

## Входные данные

`<RadarChart>`: `width`, `height`, `margin`, `cx`/`cy` (`'50%'`),
`startAngle` (90), `endAngle` (-270), `innerRadius` (0), `outerRadius`
(`'80%'`), `data`. `<Radar dataKey stroke fill fillOpacity dot (false)
activeDot (true) label (false) connectNulls isRange shape hide legendType
('rect') angleAxisId radiusAxisId isAnimationActive ('auto') animationBegin
(0) animationDuration (1500) animationEasing ('ease')
animationInterpolateFn animationMatchBy>`; `PolarGrid`, `PolarAngleAxis`,
`PolarRadiusAxis`.

## Анимации

Многоугольник «вырастает» из центра; `AnimatedItems` →
`JavascriptAnimate` (rAF).

## Исходники и документация

- `templates/infografika/recharts/src/chart/RadarChart.tsx` — обёртка, значения по умолчанию
- `templates/infografika/recharts/src/polar/Radar.tsx` — `RadarProps`
- `templates/infografika/recharts/src/polar/PolarGrid.tsx` — сетка
- `templates/infografika/recharts/storybook/stories/API/chart/RadarChart.stories.tsx` — примеры

## Зависимости

`recharts` (`Polygon`), redux.

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}`; рост по кадру — умножение
значений на `p` при фиксированном `PolarRadiusAxis domain={[0, max]}`;
второй профиль — со сдвигом по времени. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`comparison`, `abstract-concepts`
