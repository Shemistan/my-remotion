# Tooltip — `recharts/tooltip`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | component |
| Категория | `interactive-widgets` |
| Совместимость с Remotion | unsuitable |
| Флаги | `user-events`, `dom`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Всплывающая HTML-карточка со значениями под курсором и курсор-
подсветка (линия/полоса) — появляется при наведении, касании или фокусе
клавиатуры.

## Когда использовать

В видео — не использовать: смысл компонента в реакции на указатель.
Нужна «карточка со значением у точки» — нарисовать её самим
(`recharts/label`, `recharts/reference-dot` + свой `<foreignObject>`/
абсолютный div по координатам из `shape`-функции).

## Фразы из озвучки

- «наведём на точку — и увидим точное значение»
- «в этот день было ровно 1 240 заказов»

## Визуальный стиль

Белая карточка с рамкой (`DefaultTooltipContent`), плавное следование
за курсором.

## Входные данные

`TooltipProps`: `active` (undefined — управляет Recharts; true — показывать
при заданном activeIndex), `defaultIndex`, `content`, `cursor` (true),
`trigger` (`'hover'` | `'click'`), `shared`, `position`, `offset` (10),
`allowEscapeViewBox`, `reverseDirection`, `formatter`, `labelFormatter`,
`contentStyle`, `itemStyle`, `labelStyle`, `wrapperStyle`, `separator`
(`' : '`), `filterNull` (true), `includeHidden`, `itemSorter`, `axisId`,
`portal`, `useTranslate3d` (false), `isAnimationActive` (`'auto'`),
`animationDuration` (400), `animationEasing` (`'ease'`).

## Анимации

Перемещение карточки — CSS `transition: transform …ms`
(`TooltipBoundingBox`), размер карточки меряется
(`useElementOffset`), `keydown`-слушатель на `document` (Escape).

## Исходники и документация

- `templates/infografika/recharts/src/component/Tooltip.tsx` — компонент
- `templates/infografika/recharts/src/component/TooltipBoundingBox.tsx` — позиционирование и transition
- `templates/infografika/recharts/storybook/stories/API/component/Tooltip.stories.tsx` — примеры

## Зависимости

`recharts` (redux tooltip-slice, `createPortal`).

## Совместимость и адаптация

`unsuitable` как интерактивный элемент: по умолчанию без указателя
карточка не появляется. Лазейка для статичного кадра — `<Tooltip active
defaultIndex={i} isAnimationActive={false} />` (props есть в типах;
что карточка встаёт на место в первом же кадре, рендером не
проверено). Перебор `defaultIndex` по кадрам даст «прыжки» без
плавности — для движущейся выноски лучше своя разметка. Из обычных
видео-композиций `<Tooltip>` убирать. См. `knowledge/compatibility/recharts.md`.

## Паттерны

`key-point-emphasis`
