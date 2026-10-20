# SplitText — `react-bits/split-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `dom`, `raf`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Заголовок, который разбивается на буквы, слова или строки, и кусочки по очереди
въезжают на место: подъём снизу, fade, blur, 3D-переворот, pop, skew или волна.
Опционально — маска по строкам и стартовый акцентный цвет.

## Когда использовать

Главный заголовок сцены, название раздела, ключевой тезис, который должен
«собраться» на глазах. Для мягкого фокуса лучше `react-bits/blur-text`, для
печати — `react-bits/text-type`, для смены слов — `react-bits/rotating-text`.

## Фразы из озвучки

- «Итак, главное, что нужно запомнить…»
- «Встречайте новую версию продукта»
- «Глава вторая: как всё устроено»

## Визуальный стиль

Нейтральная типографика родителя (`p` по умолчанию, `textAlign: 'center'`),
характер задаёт `effect`; easing GSAP (`power3.out`, `back.out(1.6)` у pop,
`expo.out` у skew). Темп по умолчанию — 50 мс между кусочками, 1,25 с на кусочек.

## Входные данные

`text`, `className=''`, `delay=50` (мс между кусочками), `duration=1.25` (с),
`ease`, `splitType='chars'` (`chars|words|lines`), `from`, `to` (свои
GSAP-vars, по умолчанию `{opacity:0,y:40}`→`{opacity:1,y:0}`),
`threshold=0.1`, `rootMargin='-100px'`, `textAlign='center'`, `tag='p'`,
`staggerFrom='start'`, `mask=false`, `effect='rise'`
(`fade|blur|flip|pop|skew|wave|rise`), `trigger='view'` (`load|view|hover|click`),
`loop=false`, `loopDelay=1.5`, `hoverEffect='none'` (`lift|wave`), `color`,
`accentColor`, `onLetterAnimationComplete`.

## Анимации

`gsap.timeline().fromTo(pieces, from, {…to, stagger: gsap.utils.distribute({each: delay/1000, from: staggerFrom})})`;
запуск через `ScrollTrigger` (или сразу при `trigger='load'`); цикл
conceal→reveal через `gsap.delayedCall`; hover-эффекты — пружины в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/SplitText/SplitText.jsx` — компонент
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/SplitText/SplitText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/SplitTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/split-text

## Зависимости

`gsap` (+ плагины `ScrollTrigger`, `SplitText`), `@gsap/react` (`useGSAP`).

## Совместимость и адаптация

`adaptable`: эффект — классический stagger по монтированию/inView. Рецепт:
разбить `text` на спаны в React (без GSAP SplitText), для кусочка `i`
считать `p = interpolate(frame - startFrame - i*delayFrames, [0, durFrames], [0,1], clamp)`
с нужным easing и применять `opacity`, `translateY`, `filter: blur`, `rotateX`
по пресету `effect`. `ScrollTrigger`/`trigger='view'` заменить немедленным
стартом, hover-пружины (`hoverEffect`) и `loop` не переносить. Ожидание
`document.fonts.ready` заменить на загрузку шрифта через `delayRender`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
