# LabelList — `recharts/label-list`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Подписи значений у каждого элемента ряда: над столбцами, внутри
секторов, у точек линии, рядом с этапами воронки.

## Когда использовать

Когда зритель должен прочитать точные цифры: рейтинги, доли, этапы
воронки. Для одной подписи — `recharts/label`.

## Фразы из озвучки

- «у лидера — 42 процента»
- «посмотрим на точные цифры по каждому месяцу»
- «на каждом этапе теряем всё больше»

## Визуальный стиль

SVG-текст рядом с фигурой; позиция `position`, поворот `angle`,
подложка `background` для читаемости на заливке.

## Входные данные

`LabelListProps`: `dataKey` (иначе — значение ряда), `valueAccessor`,
`content` (элемент | функция), `position`, `offset`, `angle` (0),
`formatter`, `clockWise` (полярные), `textBreakAll`, `background`
(с 3.11), `zIndex` (2000), `id`. Ставится ребёнком `Bar`/`Line`/`Area`/
`Pie`/`RadialBar`/`Funnel`/`Scatter` или через их prop `label`.

## Анимации

Своей нет. Во время встроенной анимации `RadialBar` подписи скрыты
(`showLabels={!isAnimating}`), появляются после её окончания.

## Исходники и документация

- `templates/infografika/recharts/src/component/LabelList.tsx` — компонент
- `templates/infografika/recharts/src/component/Label.tsx` — отрисовка каждой подписи
- `templates/infografika/recharts/storybook/stories/API/component/LabelList.stories.tsx` — примеры

## Зависимости

`recharts` (`Label`, `Text`, контекст родительского ряда).

## Совместимость и адаптация

`adaptable`. При `isAnimationActive={false}` у ряда подписи видны сразу.
Поочерёдное появление/докрутку делать через `content`-функцию: получает
`index`, `value`, координаты; вернуть `<text>` с `opacity` и числом от
`interpolate(frame - index*stagger, …)`. Шрифты — до первого кадра
(измерение текста через DOM). См. `knowledge/compatibility/recharts.md`.

## Паттерны

`quantities`, `comparison`
