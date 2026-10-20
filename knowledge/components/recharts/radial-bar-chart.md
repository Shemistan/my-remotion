# RadialBarChart — `recharts/radial-bar-chart`

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

Радиальные столбцы: концентрические дуги-кольца, длина дуги — значение;
фон-дорожка (`background`), скруглённые концы (`cornerRadius`). Одна дуга
даёт «прогресс-кольцо» / gauge.

## Когда использовать

Процент выполнения, рейтинг нескольких категорий в компактном круге,
KPI-кольца. Для долей одного целого — `recharts/pie-chart`.

## Фразы из озвучки

- «план выполнен на 87 процентов»
- «три цели года и прогресс по каждой»
- «уровень удовлетворённости клиентов»

## Визуальный стиль

Яркие дуги на тёмном фоне, скруглённые концы — «фитнес-трекер»/
инфографика.

## Входные данные

`<RadialBarChart>`: `width`, `height`, `data`, `cx`/`cy` (`'50%'`),
`startAngle` (0), `endAngle` (360), `innerRadius` (0), `outerRadius`
(`'80%'`), `barSize`, `barCategoryGap`. `<RadialBar dataKey background
(false) cornerRadius (0) cornerIsExternal forceCornerRadius minAngle (0)
minPointSize (0) stackId label (false) shape legendType ('rect')
isAnimationActive ('auto') animationBegin animationDuration
animationEasing ('ease') animationInterpolateFn animationMatchBy>`;
`PolarAngleAxis type="number" domain`.

## Анимации

Дуги растут по `endAngle` (`defaultRadialBarAnimateItems`) на
`JavascriptAnimate` (rAF). Подписи `label` скрыты, пока идёт анимация
(`showLabels={!isAnimating}`).

## Исходники и документация

- `templates/infografika/recharts/src/chart/RadialBarChart.tsx` — обёртка
- `templates/infografika/recharts/src/polar/RadialBar.tsx` — props, интерполяция
- `templates/infografika/recharts/storybook/stories/API/chart/RadialBarChart.stories.tsx` — примеры

## Зависимости

`recharts` (`Sector`), redux.

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}` (тогда подписи видны сразу);
рост дуг по кадру — умножать значения на `p` при `<PolarAngleAxis
type="number" domain={[0, 100]} tick={false}>` (без фиксированного домена
самая длинная дуга всегда полная), либо менять `endAngle` чарта. Цифру в
центре — `remotion-bits/animated-counter` или свой `<text>`. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`quantities`, `comparison`, `key-point-emphasis`
