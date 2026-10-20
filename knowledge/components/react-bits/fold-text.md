# FoldText — `react-bits/fold-text`

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

Буквы, слова или строки разворачиваются, как сложенная бумага: поворот вокруг
петли (верх/низ/лево/право) с тенью сгиба; варианты `blinds` (две «жалюзи»
на букву) и `flip` (переворот карточки с подъёмом). В цикле текст снова
складывается после паузы.

## Когда использовать

«Раскрываем идею», новая глава, разворот проекта, редакционные/печатные
темы. Для простого подъёма — `react-bits/split-text`.

## Фразы из озвучки

- «Давайте развернём эту идею»
- «Страница за страницей открывается история»
- «Дизайн раскрывается в деталях»

## Визуальный стиль

80px/800, плотный трекинг -0.04em; бумажная тень сгиба (`creaseShading=0.55`);
0,65 с на кусочек, 45 мс между ними, `power3.out` — аккуратно, «печатно».

## Входные данные

`text='Design unfolds'`, `splitBy='char'` (`char|word|line`), `hinge='top'`
(`top|bottom|left|right`), `foldStyle='paper'` (`paper|blinds|flip`),
`duration=0.65`, `stagger=0.045`, `staggerFrom='start'`, `foldAngle=92`,
`ease='power3.out'`, `perspective=700`, `creaseShading=0.55`, `trigger='mount'`
(`mount|scroll|hover|loop`), `loopDelay=1.4`, `hoverRefold=false`,
`refoldRadius=140`, `refoldAngle=45`, `fontSize=80`, `fontWeight=800`,
`color='currentColor'`, `className`, `style`.

## Анимации

GSAP-таймлайн двигает только прогресс `t` (0→1, `ease:'none'`, stagger) у
каждого кусочка; функция `render()` чисто из `t/f` считает `rotateX/Y`,
opacity и `--fold-crease`; `loop` добавляет сворачивание `f`. Hover-«подгиб»
у курсора — экспоненциальное сглаживание в `gsap.ticker`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/FoldText/FoldText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/FoldText/FoldText.css` — петли и тень сгиба
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/FoldText/FoldText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/FoldTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/fold-text

## Зависимости

`gsap` (+ `ScrollTrigger`).

## Совместимость и адаптация

`adaptable`: картинка — чистая функция прогресса. Рецепт: для кусочка `i`
`t_i = clamp((frame/fps - i*stagger)/duration, 0, 1)`, применить логику
`render()` (`unfoldEase(t)` — например `Easing.out(Easing.cubic)`) инлайн в
style; для `loop` — `f_i` после `duration + loopDelay`. GSAP-таймлайн,
`ScrollTrigger` и `hoverRefold` убрать.

## Паттерны

`transformation`, `key-point-emphasis`
