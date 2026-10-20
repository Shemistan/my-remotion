# ScrollVelocity — `react-bits/scroll-velocity`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Одна или несколько строк-бегущих лент крупного текста (marquee),
соседние строки едут в разные стороны; на сайте скорость, наклон и
растяжение зависят от скорости прокрутки, ленту можно «бросить» мышью.
Опции: разделитель между повторами, контурная каждая вторая строка,
растворение краёв.

## Когда использовать

Ритмичная вставка с ключевыми словами/брендами, «бегущая строка»
тегов, фон-лента под заголовком. В видео — базовый режим постоянной
скорости (без скролла). Для логотипов есть отдельный logo-loop.

## Фразы из озвучки

- «скорость, скорость и ещё раз скорость»
- «всё это — в одном продукте»
- «нас выбирают команды по всему миру»

## Визуальный стиль

Крупный жирный sans-serif, `white-space: nowrap`, лёгкая тень;
динамичный, рекламный; `outlineAlternate` — обводка через
`-webkit-text-stroke`.

## Входные данные

`ScrollVelocity`: `texts=[]`, `velocity=100` (px/с, нечётные строки
`-velocity`), `scrollContainerRef?`, `className=''`, `damping=50`,
`stiffness=400`, `numCopies=6`, `velocityMapping={input:[0,1000],
output:[0,5]}`, `parallaxClassName='parallax'`,
`scrollerClassName='scroller'`, `parallaxStyle?`, `scrollerStyle?`,
`separator=''`, `pauseOnHover=false`, `fadeEdges=false`,
`skewWithVelocity=0`, `scaleWithVelocity=0`, `outlineAlternate=false`,
`gap=0`, `fontSize?`, `fontWeight?`, `color?`, `draggable=false`.

## Анимации

`useAnimationFrame` из motion: `baseX += direction * baseVelocity *
delta/1000 * (1 + velocityFactor)`, `x = wrap(-copyWidth, 0, baseX)`;
`useScroll` → `useVelocity` → `useSpring` даёт добавку от скролла, плюс
skew/scaleY по «всплеску».

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrollVelocity/ScrollVelocity.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrollVelocity/ScrollVelocity.css` — стили `.parallax/.scroller`
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/ScrollVelocity/ScrollVelocity.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ScrollVelocityDemo.jsx` — демо
- https://reactbits.dev/text-animations/scroll-velocity

## Зависимости

`react`, `motion` (`motion/react`).

## Совместимость и адаптация

`adaptable` для базовой ленты; эффект от скорости скролла теряется
(имитируется профилем скорости по кадрам). Рецепт: убрать motion-хуки
и pointer-обработчики; `x = wrap(-copyWidth, 0, dir * velocity *
frame / fps)` в `style.transform`; ширину копии измерить один раз после
загрузки шрифта (`delayRender`) или задать фиксированной.

## Паттерны

`key-point-emphasis`, `quantities`
