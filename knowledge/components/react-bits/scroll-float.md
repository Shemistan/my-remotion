# ScrollFloat — `react-bits/scroll-float`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Огромный жирный заголовок, буквы (или слова) которого по очереди
«всплывают» снизу, вытянутые по вертикали и сжатые по горизонтали, и
пружинисто встают на место. Варианты: 3D-переворот (`flip`), разлёт из
хаоса (`scatter`), фокус из размытия (`blur`), волна с покачиванием
(`wave`); буквы могут прийти из цвета `fromColor`.

## Когда использовать

Эффектный вход заголовка раздела или ключевого слова. Порядок `order`
(`start|end|center|edges|random`) задаёт характер. Для абзацев —
`scroll-reveal`.

## Фразы из озвучки

- «встречайте — новая версия»
- «глава вторая: рост»
- «и вот результат»

## Визуальный стиль

Плакатный, упругий (`back.inOut(2)`), `font-weight: 900`,
`clamp(1.6rem, 8vw, 10rem)`; маска `overflow: hidden` для `float`.

## Входные данные

`children` (строка), `scrollContainerRef?`, `containerClassName=''`,
`textClassName=''`, `effect='float'` (`float|flip|scatter|blur|wave`),
`splitBy='chars'` (`chars|words`), `direction='up'` (`up|down`),
`order='start'`, `fromColor='currentColor'`, `animationDuration=1`,
`ease='back.inOut(2)'`, `scrollStart='center bottom+=50%'`,
`scrollEnd='bottom bottom-=40%'`, `stagger=0.03`, `distance=120`,
`stretch=2.3`, `smoothing=0`.

## Анимации

`gsap.timeline` с ScrollTrigger `scrub`: для каждого куска `fromTo`
(opacity, `yPercent`, `scaleY=stretch`, `scaleX=stretch^-0.43`,
`rotationX`, blur…) с задержкой `getDelays(count, order, stagger)`;
псевдослучайность детерминирована (`Math.sin`-хэш по индексу).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrollFloat/ScrollFloat.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/ScrollFloat/ScrollFloat.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/ScrollFloat/ScrollFloat.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ScrollFloatDemo.jsx` — демо
- https://reactbits.dev/text-animations/scroll-float

## Зависимости

`react`, `gsap` (+ `gsap/ScrollTrigger`).

## Совместимость и адаптация

`adaptable`: таймлайн управляется только прогрессом, случайность
детерминирована. Рецепт: создать таймлайн с `paused: true` без
`scrollTrigger` и в `useLayoutEffect` на каждый кадр вызывать
`timeline.progress(interpolate(frame, [s, e], [0, 1], {extrapolateRight:
'clamp'}))` — либо (надёжнее) переписать на `interpolate` по букве:
`t_i = (frame - delay_i*fps) / (animationDuration*fps)`, `easeBack`
вместо `back.inOut`. Шрифт — `delayRender` до загрузки.

## Паттерны

`key-point-emphasis`, `transformation`
