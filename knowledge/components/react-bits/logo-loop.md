# LogoLoop — `react-bits/logo-loop`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Бесконечная бегущая строка логотипов (иконки-ноды или картинки):
горизонтально/вертикально, режим `orbit` (лента изогнута дугой с
увеличением в центре), пошаговый режим `step`, растушёвка краёв.

## Когда использовать

«Нам доверяют», партнёры, стек технологий, интеграции. Не брать для
одного логотипа.

## Фразы из озвучки

- «нам доверяют ведущие компании»
- «интеграция с вашими любимыми инструментами»
- «работает со всем стеком»

## Визуальный стиль

Монохромные/цветные логотипы высотой 48 px с промежутком 56 px; `muted`
приглушает неактивные.

## Входные данные

Из usage: `logos` (`{node, title, href, hoverColor}` или `{src, alt, href}`),
`speed = 100`, `direction = 'left'` (`up` и др.), `logoHeight = 48`,
`gap = 56`, `hoverSpeed = 0`, `scaleOnHover`, `ariaLabel`,
`layout = 'orbit'`, `bend`, `magnify`, `labels = 'hover'`, `muted`,
`focus`, `step`. Полный список — PropTable демо.

## Анимации

rAF: смещение ленты со сглаживанием скорости (`SMOOTH_TAU`), инерция после
перетаскивания (`GLIDE_TAU`, `MAX_FLING`), интро 0.7 с со stagger 0.45;
ширина набора измеряется в DOM.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/LogoLoop/LogoLoop.jsx` (+ `LogoLoop.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/LogoLoop/LogoLoop.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/LogoLoopDemo.jsx`

## Зависимости

`react`; в примере — `react-icons/si`.

## Совместимость и адаптация

`adaptable`: без drag и hover смещение линейно —
`offset = (speed * frame / fps) mod setWidth`; ширину набора можно мерить
в `useLayoutEffect` (DOM доступен) или задать из `logoHeight`/`gap`.
Картинки — `staticFile` + `<Img>`.

## Паттерны

`quantities`, `relationships`
