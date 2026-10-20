# Legend — `recharts/legend`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Легенда рядов: иконка (`legendType` ряда — line, rect, circle…) и
название, горизонтально или вертикально, снизу/сверху/сбоку от графика.

## Когда использовать

Когда на графике 2+ ряда и цвета нужно расшифровать. В видео часто
лучше подписать ряды прямо на линиях (`recharts/label`) — легенду
читать некогда.

## Фразы из озвучки

- «синим — наш продукт, оранжевым — конкурент»
- «сравним три канала продаж»

## Визуальный стиль

HTML-список (`<ul>`) поверх SVG, иконки 14 px (`iconSize`), неактивные
ряды серые (`inactiveColor: '#ccc'`).

## Входные данные

`Props`: `content` (элемент | функция, должна возвращать HTML),
`layout` (`'auto'`), `align` (`'center'`), `verticalAlign` (`'bottom'`,
deprecated), `position` (`CartesianPosition`, с 3.10), `offset` (0),
`iconSize` (14), `iconType`, `inactiveColor`, `itemSorter` (`'value'`),
`wrapperStyle`, `width`, `height`, `payloadUniqBy`, `portal`,
`onBBoxUpdate`, обработчики клика/hover из `DefaultLegendContent`.

## Анимации

Нет. Размер легенды меряется (`useElementOffset`) и через redux
уменьшает область графика.

## Исходники и документация

- `templates/infografika/recharts/src/component/Legend.tsx` — компонент
- `templates/infografika/recharts/storybook/stories/API/component/Legend.stories.tsx` — примеры

## Зависимости

`recharts` (`DefaultLegendContent`, `react-dom` `createPortal` в
обёртку чарта).

## Совместимость и адаптация

`adaptable`. Рендерится в HTML-портал внутри `recharts-wrapper`, размер
читается из DOM в `useLayoutEffect`. Появление — `wrapperStyle={{opacity:
interpolate(frame, …)}}` или своя `content`-функция со stagger по
элементам. Чтобы график не «прыгал» при измерении легенды, задать
`height`/`width` легенды явно. Обработчики клика не нужны. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`comparison`
