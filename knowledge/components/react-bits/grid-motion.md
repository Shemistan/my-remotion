# GridMotion — `react-bits/grid-motion`

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

Наклонённая «стена» из рядов плиток (картинки, текст или JSX), ряды едут
горизонтально в противоположные стороны, края растушёваны маской; опционально
3D-наклон (`tilt`) и подсветка плиток рядом с курсором.

## Когда использовать

Фон-коллаж: портфолио, «сотни клиентов», галерея продуктов, лента отзывов.
Не брать, когда нужно акцентировать один объект.

## Фразы из озвучки

- «нам доверяют сотни компаний»
- «посмотрите, сколько всего уже создано»
- «тысячи работ в нашей библиотеке»

## Визуальный стиль

Скруглённые тёмные плитки (`theme = 'dark' | 'light'`), мягкое затемнение
(`dim`), опциональный grayscale; спокойный дрейф.

## Входные данные

`items = []` (строки-URL картинок, текст, `{src, alt}`, JSX), `rows = 4`,
`aspectRatio = 1.33`, `gap = 16`, `radius = 14`, `angle = -12`, `tilt = 0`,
`speed = 24` (px/с), `direction = 'alternate'` (`alternate|left|right`),
`parallax = 0.5`, `spotlight = 0.6`, `dim = 0.35`, `grayscale = false`,
`fade = 0.5`, `tileColor`, `textColor`, `theme = 'dark'`, `className`,
`style`.

## Анимации

rAF: `offsets[r] += speed * drift * PACE[r] * dt`, затем
`row.style.transform = translate3d(...)`; интро — opacity плоскости за 0.9 с;
`--spot` на плитках от курсора; параллакс рядов от курсора.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/GridMotion/GridMotion.jsx` (+ `GridMotion.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/GridMotion/GridMotion.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GridMotionDemo.jsx`

## Зависимости

`react`; только DOM/CSS-трансформы.

## Совместимость и адаптация

`adaptable`: движение — линейная функция времени. Заменить rAF на
`offset_r = r*step*0.37 + speed*drift*PACE[r]*frame/fps` в рендере,
`parallax = 0`, `spotlight = 0`; размеры из `useVideoConfig` вместо
ResizeObserver. Картинки — `staticFile` + `<Img>` (в примере — внешние URL
unsplash, их ждать нельзя).

## Паттерны

`quantities`, `relationships`
