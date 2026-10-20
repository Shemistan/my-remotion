# BlurText — `react-bits/blur-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `timers`, `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Фраза, слова (или буквы) которой проявляются из размытия: сдвиг + blur +
opacity, варианты с zoom, 3D-наклоном, «наводкой фокуса» и дрейфом со skew.

## Когда использовать

Спокойное, «кинематографичное» появление подзаголовка, цитаты, слогана.
Подходит под мысль «становится ясно», «фокусируемся». Для акцентного
заголовка с отскоком — `react-bits/split-text`.

## Фразы из озвучки

- «И постепенно картина становится ясной»
- «Сфокусируемся на главном»
- «Представьте мир, где всё работает само»

## Визуальный стиль

Мягкий, кинематографичный; без своего оформления (`<p>` с `flex-wrap`), цвет
через `color`, опционально стартовый цвет `fromColor`. Пружинный «доезд»
движения (bounce 0.25–0.35).

## Входные данные

`text=''`, `delay=200` (мс stagger), `className`, `animateBy='words'`
(`words|letters`), `direction='top'` (`top|bottom|left|right`),
`threshold=0.1`, `rootMargin='0px'`, `animationFrom`, `animationTo` (массив
снимков), `easing`, `onAnimationComplete`, `stepDuration=0.35`, `blur=10`,
`distance=50`, `effect='blur'` (`blur|zoom|tilt|focus|drift`),
`staggerFrom='start'` (`start|end|center|random` — random детерминирован по
хэшу текста), `trigger='view'` (`load|view|hover|click`), `loop=false`,
`loopDelay=2`, `color`, `fromColor`, `focusOnHover=false`.

## Анимации

`motion.span` с keyframes `from → steps` (`times`, например `[0, .5, 1]`),
задержка `rank * delay/1000`; движение — spring (`visualDuration`, `bounce`),
opacity/blur — tween. Фазы `from/in/rest/out` переключает `setTimeout`;
старт — `IntersectionObserver`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/BlurText/BlurText.jsx` — компонент
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/BlurText/BlurText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/BlurTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/blur-text

## Зависимости

`motion` (`motion/react`: `motion`, `MotionConfig`).

## Совместимость и адаптация

`adaptable`: чистый React-рендер спанов. Рецепт: для кусочка с рангом `r`
локальный кадр `f = frame - r*delayFrames`; `blur = interpolate(f, [0, mid, end], [blur, blur/2, 0])`,
`opacity`/`translate` так же по `fx.times`, движение — `spring({frame: f, fps, config})`
из remotion. `IntersectionObserver`, таймеры фаз, `focusOnHover` и
CSS-transition цвета убрать; цвет `fromColor → color` интерполировать по кадру.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
