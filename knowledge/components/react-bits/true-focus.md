# TrueFocus — `react-bits/true-focus`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers`, `dom`, `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Фраза, в которой слова по очереди «попадают в фокус»: активное слово чёткое,
остальные размыты; вокруг активного переезжает рамка — уголки-скобки,
прямоугольник, подчёркивание или мягкая подсветка.

## Когда использовать

Перебор ключевых слов одной фразы: «быстро. надёжно. просто», разбор
формулы, акцент на каждом термине по очереди. Не для длинного текста.

## Фразы из озвучки

- «Три слова: быстро, надёжно, удобно»
- «Давайте сфокусируемся на каждом пункте»
- «Сначала идея, потом прототип, потом продукт»

## Визуальный стиль

Крупный жирный текст (`3rem`, `900` в CSS), зелёные уголки по умолчанию
(`borderColor='green'`), опциональное свечение `glowColor`. Ритм: 0,5 с
переезд + 1 с пауза.

## Входные данные

`sentence='True Focus'`, `separator=' '`, `manualMode=false`,
`focusStyle='brackets'` (`brackets|box|underline|highlight`),
`order='sequential'` (`sequential|random`), `easing='smooth'` (`smooth|spring`),
`blurAmount=5`, `focusScale=1`, `borderColor='green'`, `highlightColor`,
`glowColor='transparent'`, `animationDuration=0.5`,
`pauseBetweenAnimations=1`, `cornerSize=16`, `borderWidth=3`,
`unfocusedOpacity=1`.

## Анимации

`setInterval` меняет индекс активного слова; координаты рамки берутся из
`offsetLeft/Top/Width/Height` слова и анимируются `motion.span` (tween или
spring); blur/opacity/scale слов — CSS-transition.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/TrueFocus/TrueFocus.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/TrueFocus/TrueFocus.css` — стили слов и уголков
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/TrueFocus/TrueFocus.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/TrueFocusDemo.jsx` — демо
- https://reactbits.dev/text-animations/true-focus

## Зависимости

`motion` (`motion`, `useReducedMotion`).

## Совместимость и адаптация

`adaptable`. Рецепт: `step = (animationDuration + pauseBetweenAnimations)*fps`,
`active = floor(frame/step) % words.length` (для `random` — `random(seed)`),
`p = interpolate(frame % step, [0, animationDuration*fps], [0,1], clamp)`.
Прямоугольники слов измерить один раз (layout статичен; шрифт загрузить через
`delayRender`) и интерполировать рамку между прямоугольником предыдущего и
текущего слова по `p`; blur/opacity слов тоже от `p`. `setInterval`,
CSS-transition и `manualMode` убрать.

## Паттерны

`key-point-emphasis`, `sequence-steps`
