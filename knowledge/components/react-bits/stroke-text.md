# StrokeText — `react-bits/stroke-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `svg`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Контуры букв «прорисовываются» пером (stroke-dashoffset) с задержкой между
буквами, затем буквы заливаются цветом — шторкой (wipe) или проявлением;
контур может быть пунктиром/точками и «бежать» по кругу, залитый текст —
приподниматься с мягкой тенью.

## Когда использовать

Подпись, «рождается идея», чертёж, дизайн, рукописный характер; заголовок,
который рисуется на глазах. Для ровного входа без контура — `react-bits/split-text`.

## Фразы из озвучки

- «Всё начинается с одной линии»
- «Набросаем идею и наполним её смыслом»
- «Наш логотип — нарисован с нуля»

## Визуальный стиль

Фиолетовый контур `#A78BFA` 1.4px, заливка `currentColor`, 128px/800;
прорисовка 1,6 с `power2.out` — изящно, «дизайнерски».

## Входные данные

`text='Draw Attention'`, `strokeColor='#A78BFA'`, `fillColor='currentColor'`,
`strokeWidth=1.4`, `drawDuration=1.6`, `fillDelay=0.2`, `stagger=0.05`,
`ease='power2.out'`, `trigger='mount'` (`mount|scroll|hover|loop`),
`fillMode='wipe'` (`wipe|fade|none`), `wipeFrom='left'` (`left|right|top|bottom`),
`fontSize=128`, `fontWeight=800`, `fontFamily='inherit'`, `letterSpacing=-4`,
`reverse=false`, `strokeStyle='solid'` (`solid|dashed|dotted`), `dashLength=10`,
`marching=false`, `hoverRedraw=false`, `shadow=false`, `shadowColor`,
`className`, `style`.

## Анимации

`gsap.timeline`: `strokeDashoffset dash→0` по `<tspan>` со stagger, затем
`attr` прямоугольника `clipPath` (wipe) или opacity заливки, затем
`feDropShadow dx/dy`; `marching` — бесконечный сдвиг dashoffset; `loop` —
`repeat:-1, yoyo`. Размер viewBox — из `getBBox()`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/StrokeText/StrokeText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/StrokeText/StrokeText.css` — стили svg
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/StrokeText/StrokeText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/StrokeTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/stroke-text

## Зависимости

`gsap` (+ `ScrollTrigger`).

## Совместимость и адаптация

`adaptable`: SVG-разметка остаётся, анимируются атрибуты. Рецепт: для буквы
`i` `strokeDashoffset = dash * (1 - ease(clamp((t - i*stagger)/drawDuration)))`,
wipe — `width` (или x/y/height) rect в clipPath по `interpolate` после
`drawDuration + fillDelay`, тень — `dx/dy` так же; `t = frame/fps`. `getBBox`
выполнять после загрузки шрифта (`delayRender`). GSAP, `ScrollTrigger`,
hover-перерисовку убрать; `marching` — `strokeDashoffset = -period * (t*speed % 1)`.

## Паттерны

`key-point-emphasis`, `transformation`
