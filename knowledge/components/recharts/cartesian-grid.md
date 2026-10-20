# CartesianGrid — `recharts/cartesian-grid`

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

Координатная сетка за графиком: горизонтальные и вертикальные линии по
тикам осей (или по заданным точкам/значениям), чередующиеся полосы
фона (`horizontalFill`/`verticalFill`).

## Когда использовать

Фон любого декартова графика (`recharts/bar-chart`, `recharts/line-chart`,
`recharts/area-chart`), когда зритель должен оценить уровни на глаз. Для
минималистичной подачи — отключить или оставить только горизонтальные
линии.

## Фразы из озвучки

- «по шкале видно, что рост — почти вдвое»
- «каждая линия — десять тысяч»

## Визуальный стиль

Тонкие серые линии, часто пунктир `strokeDasharray="3 3"`; полосы
«зебры» для таблиц-графиков.

## Входные данные

`CartesianGridProps`: `horizontal` (true), `vertical` (true) — boolean |
SVG-props | элемент | функция(`GridLineTypeFunctionProps`);
`horizontalPoints`/`verticalPoints` ([]), `horizontalValues`/
`verticalValues`, `horizontalCoordinatesGenerator`/
`verticalCoordinatesGenerator`, `syncWithTicks` (false), `fill`,
`fillOpacity`, `horizontalFill`/`verticalFill` ([]), `strokeDasharray`,
`x`, `y`, `width`, `height`, `xAxisId`/`yAxisId` (0), `zIndex` (-100).

## Анимации

Нет.

## Исходники и документация

- `templates/infografika/recharts/src/cartesian/CartesianGrid.tsx` — компонент
- `templates/infografika/recharts/storybook/stories/API/cartesian/CartesianGrid.stories.tsx` — примеры

## Зависимости

`recharts` (тики осей из redux-store чарта).

## Совместимость и адаптация

`adaptable`. Статичный SVG; «прорисовка» сетки — функции в
`horizontal`/`vertical`: вернуть `<line {...props} pathLength={1}
strokeDasharray={\`${p} 1\`}/>` с задержкой по `props.index`, или общий
`strokeOpacity` от кадра. См. `knowledge/compatibility/recharts.md`.

## Паттерны

`quantities`
