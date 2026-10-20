# ReferenceLine — `recharts/reference-line`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Опорная линия поверх декартова графика: горизонтальная (`y`),
вертикальная (`x`) или произвольный отрезок (`segment`) в координатах
данных, с подписью («План», «Среднее», «Запуск»).

## Когда использовать

Подчеркнуть порог, цель, среднее или момент события на графике
(`recharts/line-chart`, `recharts/bar-chart`, `recharts/area-chart`).
Для интервала — `recharts/reference-area`, для одной точки —
`recharts/reference-dot`.

## Фразы из озвучки

- «вот целевой уровень — и мы его превысили»
- «всё, что выше этой линии, — прибыль»
- «в этот момент вышло обновление»

## Визуальный стиль

Тонкая линия, часто пунктир (`strokeDasharray`), контрастный цвет,
короткая подпись у края.

## Входные данные

`ReferenceLineProps`: `x`, `y` (значения домена), `segment`
(`[{x,y},{x,y}]`), `position` (`'middle'`, для band-осей), `xAxisId`/
`yAxisId` (0), `ifOverflow` (`'discard' | 'hidden' | 'visible' |
'extendDomain'`), `shape` (элемент | функция), `label` (false | строка |
`Label`-props | элемент | функция), `zIndex` (400), `strokeWidth` и
прочие SVG-атрибуты `<line>`.

## Анимации

Нет: статичный `<line>`, позиция считается из шкалы оси.

## Исходники и документация

- `templates/infografika/recharts/src/cartesian/ReferenceLine.tsx` — компонент
- `templates/infografika/recharts/storybook/stories/API/cartesian/ReferenceLine.stories.tsx` — примеры

## Зависимости

`recharts` (`Label`, шкалы осей из redux-store чарта); работает только
внутри декартова чарта.

## Совместимость и адаптация

`adaptable`: детерминированный SVG, анимацию добавить самим. Прорисовка —
`shape`-функция: `<line {...props} pathLength={1} strokeDasharray={\`${p}
1\`}/>`; «въезд» уровня — `y={interpolate(frame, …)}` при
фиксированном домене оси; подпись — проявление через `label`-объект с
`opacity`. См. `knowledge/compatibility/recharts.md`.

## Паттерны

`key-point-emphasis`, `comparison`
