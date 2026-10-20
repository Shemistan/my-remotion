# SvgPathDraw — `motion-primitives-website/svg-path-draw`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

SVG-обёртка, в которой все фигуры (`path, line, polyline, polygon,
circle, ellipse, rect`) «рисуются» штрихом от начала к концу, по очереди.

## Когда использовать

Подпись от руки, логотип, иконка, стрелка, схема или маршрут, которые
прорисовываются под озвучку; «нарисуем путь клиента».

## Фразы из озвучки

- «проведём линию от идеи к результату»
- «вот маршрут, который проходит заказ»
- «нарисуем схему по шагам»

## Визуальный стиль

Без заливки (`fill="none"`), цвет/толщина — из детей или
`strokeColor`/`strokeWidth`; `power2.inOut`, 2 с, stagger 0.15 с.

## Входные данные

`SvgPathDrawProps`: `children` (SVG-фигуры); `trigger?: 'mount'|'scroll'|
'hover'|'inView'` (`'inView'`); `duration?` (2); `delay?` (0);
`stagger?` (0.15); `ease?` (`'power2.inOut'`); `strokeColor?`;
`strokeWidth?`; `scrub?` (true); `once?` (true); `viewBox?`, `width?`,
`height?`; `className?`.

## Анимации

`getTotalLength()` → `strokeDasharray = strokeDashoffset = len`; GSAP
`to(paths, {strokeDashoffset: 0, stagger})` по триггеру (ScrollTrigger
для inView/scroll, `onMouseEnter` для hover).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент (все 12 SVG-компонентов)

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: измерение длины не нужно — задать фигурам `pathLength={1}`,
`strokeDasharray: 1`, `strokeDashoffset: 1 - p_i`, где
`p_i = interpolate(frame, [s + i*stagger*fps, s + (i*stagger + duration)*fps], [0,1], {clamp, easing: Easing.inOut(Easing.quad)})`.
GSAP, ScrollTrigger и hover удалить; детей рендерить с индексом.

## Паттерны

`sequence-steps`, `timeline`, `relationships`
