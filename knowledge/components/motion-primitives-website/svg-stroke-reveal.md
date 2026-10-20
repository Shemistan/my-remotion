# SvgStrokeReveal — `motion-primitives-website/svg-stroke-reveal`

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

Двухэтапное появление иллюстрации/логотипа: сначала контур
прорисовывается штрихом, затем фигура заливается цветом.

## Когда использовать

Появление логотипа в интро/аутро, «эскиз превращается в готовый
продукт», иконки фич.

## Фразы из озвучки

- «от наброска — к готовому решению»
- «знакомьтесь, наш логотип»
- «сначала форма, потом наполнение»

## Визуальный стиль

Заливка — `fillColor` или исходный `fill` пути; штрих `power2.inOut`
1.5 с, заливка `power1.in` 0.8 с; пути со сдвигом 0.2 с.

## Входные данные

`SvgStrokeRevealProps`: `children` (path); `strokeDuration?` (1.5);
`fillDuration?` (0.8); `fillDelay?` (0.3); `strokeColor?`; `fillColor?`;
`trigger?: 'mount'|'inView'|'scroll'` (`'inView'`); `viewBox?`,
`width?`, `height?`; `className?`.

## Анимации

GSAP timeline: на `i*0.2` — `strokeDashoffset len → 0`, затем
`fill transparent → originalFill` с перекрытием `-(fillDuration - fillDelay)`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/svg/animated-svg.tsx` — компонент

## Зависимости

`gsap`, `gsap/ScrollTrigger`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `pathLength={1}`; для пути `i` штрих
`ps = interpolate(frame, [s_i, s_i + strokeDuration*fps], [0,1], {clamp, easing: Easing.inOut(Easing.quad)})`,
`s_i = s + 0.2*i*fps`, `strokeDashoffset 1 - ps`; заливка
`pf = interpolate(frame, [s_i + (strokeDuration - fillDuration + fillDelay)*fps, …+ fillDuration*fps], [0,1], {clamp})`
→ `fillOpacity: pf` (вместо анимации цвета). GSAP/ScrollTrigger удалить.

## Паттерны

`transformation`, `key-point-emphasis`
