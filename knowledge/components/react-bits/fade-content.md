# FadeContent — `react-bits/fade-content`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `dom`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Обёртка, которая проявляет детей (по одному со stagger): простое
появление, фокусировка из размытия (`focus`), «проявка фото» (`develop`)
или шумовые маски через SVG-фильтр (`dissolve`, `mist`, `pixel`).

## Когда использовать

Появление заголовка, абзаца, карточки, картинки на сцене; `mist` и
`dissolve` — мягкое «из тумана», `pixel` — цифровое. Для движения
со сдвигом — `react-bits/animated-content`.

## Фразы из озвучки

- «и вот проступает главное»
- «картина постепенно проясняется»
- «из тумана появляется ответ»

## Визуальный стиль

Нейтральный, оформление — у детей. Шумовые маски — `feTurbulence` с
кривой прозрачности.

## Входные данные

`children`, `container`, `effect = 'fade'` (`fade|focus|develop|dissolve|mist|pixel`),
`blur = false`, `duration = 1`, `ease = 'power2.out'`, `delay = 0`,
`threshold = 0.1`, `initialOpacity = 0`, `stagger = 0`,
`staggerFrom = 'start'`, `trigger = 'scroll'` (или `'mount'`),
`once = true`, `exit = false`, `scrub = false`, `disappearAfter = 0`,
`disappearDuration = 0.5`, `disappearEase = 'power2.in'`, `onStart`,
`onComplete`, `onDisappearanceComplete`, `className`, `style`.

## Анимации

GSAP-таймлайн `gsap.timeline({ paused: true })`, запуск `ScrollTrigger`
или `tl.play()` при `trigger = 'mount'`; шумовые маски обновляют
`tableValues` у `feFuncA` в `onUpdate`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/FadeContent/FadeContent.jsx`
- `templates/react-libriry/react-bits/src/ts-default/Animations/FadeContent/FadeContent.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/FadeContentDemo.jsx`

## Зависимости

`gsap` (+ `gsap/ScrollTrigger`)

## Совместимость и адаптация

`adaptable`: таймлайн уже на паузе — рецепт R5: `tl.progress(frame / total)`
в эффекте или переписать на `interpolate` (opacity/blur/scale). Seed шума
— `Math.random()` в `createNoiseMask`: заменить на фиксированный, иначе
кадры при параллельном рендере разойдутся. ScrollTrigger не нужен.

## Паттерны

`key-point-emphasis`, `sequence-steps`
