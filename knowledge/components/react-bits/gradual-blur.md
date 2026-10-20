# GradualBlur — `react-bits/gradual-blur`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `utilities` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Плавное нарастающее размытие у края блока (сверху/снизу/слева/справа):
стопка слоёв `backdrop-filter: blur()` с градиентными масками и
опциональным тоном.

## Когда использовать

Растушёвка края прокручиваемого списка, ленты, текста-титров, мягкий
уход контента «в туман» у края кадра. Сам по себе не анимирован.

## Фразы из озвучки

- «и так далее — список можно продолжать»
- «за кадром ещё много интересного»
- «история уходит вдаль»

## Визуальный стиль

Невидимый оверлей; задаёт мягкую виньетку-размытие, `tint` — тонировку.

## Входные данные

Из usage: `position = 'bottom'` (`top|bottom|left|right`), `height = '6rem'`,
`strength = 2`, `layers = 8`, `curve = 'linear'`
(`linear|bezier|ease-in|ease-out|ease-in-out`), `exponential`,
`tint = 'rgba(18, 15, 23, 0.6)'`, `autoHide`. Остальное — PropTable демо.

## Анимации

Собственной покадровой анимации нет; `autoHide` скрывает слой у конца
прокрутки (ищет scroll-контейнер `findScroller`, слушает scroll).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/GradualBlur/GradualBlur.jsx` (+ `GradualBlur.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/GradualBlur/GradualBlur.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/GradualBlurDemo.jsx`

## Зависимости

`react`; только CSS.

## Совместимость и адаптация

`adaptable`: статичный CSS-оверлей; `autoHide` выключить. `backdrop-filter`
в headless Chrome рендерится, но тяжёл — проверить скорость рендера.
Прозрачность/высоту можно анимировать `interpolate`.

## Паттерны

`key-point-emphasis`, `spatial`
