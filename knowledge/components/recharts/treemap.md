# Treemap — `recharts/treemap`

| Поле | Значение |
|---|---|
| Репозиторий | `recharts` (`templates/infografika/recharts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `css-transition`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

Дерево-карта: прямоугольники, площадь которых пропорциональна значению,
раскладка squarify с целевым `aspectRatio`; вложенные уровни, отступы
`nodeInset`/`nodeGap`, подписи внутри плиток.

## Когда использовать

Структура большого целого с иерархией: бюджет по ведомствам, доли рынка,
размер файлов. До 5–6 частей проще `recharts/pie-chart`; кольцевая
иерархия — `recharts/sunburst-chart`.

## Фразы из озвучки

- «из чего складывается бюджет города»
- «самый большой кусок рынка занимает лидер»
- «основную массу кода составляют три модуля»

## Визуальный стиль

Плотная мозаика из цветных плиток (`colorPanel` или тема), белые
разделители, подписи слева; дашбордный.

## Входные данные

`<Treemap data (с children для вложенности) width height dataKey
('value') nameKey ('name') aspectRatio (1.618…) nodeInset (0) nodeGap (0)
content (элемент | функция(TreemapNode)) type ('flat' | 'nest', 'flat')
colorPanel fill stroke nestIndexContent isAnimationActive ('auto')
isUpdateAnimationActive ('auto') animationBegin (0) animationDuration
(1500) animationEasing ('linear')>`.

## Анимации

Через `CSSTransitionAnimate`: React ставит конечное значение, плавность
даёт CSS `transition`, окончание отслеживается таймером на rAF. Режим
`type="nest"` — навигация кликом по плиткам и breadcrumb.

## Исходники и документация

- `templates/infografika/recharts/src/chart/Treemap.tsx` — раскладка, props, рендер
- `templates/infografika/recharts/src/animation/CSSTransitionAnimate.tsx` — CSS-transition анимация
- `templates/infografika/recharts/storybook/stories/API/chart/Treemap.stories.tsx` — примеры

## Зависимости

`recharts` (`Rectangle`, `Polygon`), `es-toolkit`, redux.

## Совместимость и адаптация

`adaptable`. `isAnimationActive={false}` и `isUpdateAnimationActive={false}`
(CSS transition Remotion не проиграет по кадрам), `type="flat"`.
Появление плиток — своя `content`-функция: `<rect>` с `opacity`/`scale`
от `interpolate(frame - index*stagger, …)`. Подписи по умолчанию
показываются, только если влезают — ширина текста меряется DOM-span
(`getStringSize`); шрифт должен быть загружен до первого кадра. См.
`knowledge/compatibility/recharts.md`.

## Паттерны

`system-structure`, `quantities`, `comparison`
