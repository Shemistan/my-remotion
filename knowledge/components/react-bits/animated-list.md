# AnimatedList — `react-bits/animated-list`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Прокручиваемый список строк (иконка/картинка, заголовок, описание, мета
справа) в стеклянной рамке: строки по очереди «выпрыгивают» с пружиной,
выделенная строка подсвечена скользящим индикатором с кольцом, края
списка плавно затухают.

## Когда использовать

Список файлов, задач, уведомлений, транзакций, «последние события»,
перечень пунктов с метаданными. Для сетки карточек — `react-bits/magic-bento`.

## Фразы из озвучки

- «Вот все файлы проекта в одном месте»
- «Последние изменения — за сегодня»
- «Выбираем нужный документ из списка»

## Визуальный стиль

Тёмная стеклянная рамка, строки-плитки с градиентом `#3a3644→#27242f`,
ширина 420 px, макс. высота 440, радиус 14, шаг 8 px; пружинный CSS-easing
`linear(...)` 620 мс.

## Входные данные

`items` (по умолчанию 15 файлов `{icon,title,description,meta}`; строка или
объект с `image`), `onItemSelect`, `renderItem`, `initialSelectedIndex=-1`,
`selectOnHover=true`, `enableArrowNavigation=true`, `loop=false`,
`animation='pop'` (`pop|slide|fade|none`), `animateOnce=false`,
`stagger=0.05`, `showGradients=true`, `fadeSize=56`, `displayScrollbar=true`,
`frame=true`, `theme='dark'`, `accentColor`, `radius=14`, `gap=8`,
`width=420`, `maxHeight=440`, `className`, `itemClassName`, `style`.

## Анимации

Строкам ставится скрытый `transform` (`pop`: сдвиг ±12 px + scale 0.8) и
CSS-transition с `transitionDelay = order * stagger`; запуск —
`IntersectionObserver`, далее — по скроллу. Индикатор выделения ведёт
rAF-пружина (ω=30, ζ=0.78) по `offsetTop/offsetHeight`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/AnimatedList/AnimatedList.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/AnimatedList/AnimatedList.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/AnimatedList/AnimatedList.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/AnimatedListDemo.jsx` — демо
- https://reactbits.dev/components/animated-list

## Зависимости

`@hugeicons/react`, `@hugeicons/core-free-icons` (данные по умолчанию).

## Совместимость и адаптация

`adaptable`: вход — stagger по монтированию. Рецепт: убрать CSS-transition,
для строки `i` `s = spring({frame: frame - i*stagger*fps, fps})` →
`transform: translate3d(0, (1-s)*12px, 0) scale(0.8 + 0.2*s)`, `opacity = s`;
выделение «бегущей» строки — индекс от кадра и `interpolate` высоты/позиции
индикатора (позиции строк измерить один раз). Скролл, клавиатуру, hover,
`IntersectionObserver` убрать; `maxHeight` подобрать, чтобы строки
помещались без прокрутки.

## Паттерны

`sequence-steps`, `timeline`
