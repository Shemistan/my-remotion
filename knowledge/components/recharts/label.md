# Label — `recharts/label`

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

Одиночная SVG-подпись, привязанная к области: оси, опорной линии,
сектору, центру donut-диаграммы. Позиции `top`, `inside*`, `center`,
полярные `insideStart`/`insideEnd`/`end`; поворот `angle`; подложка
`background`.

## Когда использовать

Заголовок оси, цифра в центре кольца, подпись порога у
`recharts/reference-line`. Подписи для каждой точки ряда —
`recharts/label-list`.

## Фразы из озвучки

- «в центре — итоговая сумма»
- «по горизонтали — месяцы, по вертикали — выручка»
- «вот отметка цели»

## Визуальный стиль

Обычный SVG `<text>` через компонент `Text`; шрифт и цвет из
`style`/`fill` или темы.

## Входные данные

`LabelProps`: `value` или `children` (`RenderableText`), `position`
(`'middle'`), `offset` (5), `angle` (0), `formatter`, `content` (элемент |
функция), `viewBox`, `textBreakAll` (false), `background` (boolean |
`TextBackgroundProps`, с 3.11), `zIndex` (2000), `className`, `id`, SVG-
атрибуты `<text>`.

## Анимации

Нет собственной анимации.

## Исходники и документация

- `templates/infografika/recharts/src/component/Label.tsx` — компонент
- `templates/infografika/recharts/src/component/Text.tsx` — отрисовка текста
- `templates/infografika/recharts/src/util/DOMUtils.ts` — измерение строк через DOM
- `templates/infografika/recharts/storybook/stories/API/component/Label.stories.tsx` — примеры

## Зависимости

`recharts` (`Text`, контекст viewBox чарта).

## Совместимость и адаптация

`adaptable`. Появление — `opacity`/`fillOpacity` от кадра через
SVG-атрибуты; «докрутка» числа — `value={Math.round(interpolate(frame, …))}`
или `formatter`. Размер текста (перенос, `background`) меряется
`getStringSize` → скрытый `<span>` + `getBoundingClientRect` с LRU-кэшем:
шрифт загрузить до первого кадра (`@remotion/google-fonts`/
`delayRender`), иначе в кэше останутся неверные размеры. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`key-point-emphasis`, `quantities`
