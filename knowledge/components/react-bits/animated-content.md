# AnimatedContent — `react-bits/animated-content`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:gsap`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Обёртка, в которой дети въезжают по одному со stagger: сдвиг по оси,
масштаб, поворот, наклон, размытие, появление прозрачности и маска-wipe
(`up|down|left|right|center`).

## Когда использовать

Появление списка пунктов, карточек, буллетов — «во-первых, во-вторых».
Только проявление без сдвига — `react-bits/fade-content`.

## Фразы из озвучки

- «вот три причины»
- «шаг за шагом»
- «добавим ещё один аргумент»

## Визуальный стиль

Нейтральный, оформление — у детей; характер задаётся `ease` GSAP.

## Входные данные

`children`, `container`, `distance = 100`, `direction = 'vertical'`
(`horizontal`), `reverse = false`, `duration = 0.8`, `ease = 'power3.out'`,
`initialOpacity = 0`, `animateOpacity = true`, `scale = 1`, `blur = 0`,
`rotate = 0`, `tilt = 0`, `wipe = 'none'`, `threshold = 0.1`, `delay = 0`,
`stagger = 0`, `staggerFrom = 'start'`, `trigger = 'scroll'`, `once = true`,
`scrub = false`, `disappearAfter = 0`, `disappearDuration = 0.5`,
`disappearEase = 'power3.in'`, `onStart`, `onComplete`,
`onDisappearanceComplete`, `className`, `style`.

## Анимации

GSAP `fromTo` от `{[axis]: distance*sign, scale, opacity}` к нулю, со
stagger; запуск через ScrollTrigger или при монтировании; wipe — CSS-маска
с переменной `--ac-wipe`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/AnimatedContent/AnimatedContent.jsx`
- `templates/react-libriry/react-bits/src/ts-default/Animations/AnimatedContent/AnimatedContent.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/AnimatedContentDemo.jsx`

## Зависимости

`gsap` (+ `gsap/ScrollTrigger`)

## Совместимость и адаптация

`adaptable`: рецепт R5 — либо `tl.progress(frame/total)`, либо (лучше)
переписать на `interpolate` по кадру с задержкой `i * stagger * fps`;
логика стилей тривиальна.

## Паттерны

`sequence-steps`, `key-point-emphasis`
