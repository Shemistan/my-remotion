# PulseHeart — `react-bits/pulse-heart`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `dom`, `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Кнопка «лайк» в виде пилюли: иконка (сердце, звезда, палец вверх) с
пульсом и разлётом точек при лайке и счётчик, число в котором
«прокручивается» (1 203 → 1 204).

## Когда использовать

Имитация соцсетей: «пост набрал лайки», реакция аудитории, отзывы.
Состояние управляемо (`liked`), поэтому лайк можно поставить на нужном кадре.

## Фразы из озвучки

- «и аудитория это оценила»
- «тысячи лайков за первый день»
- «людям понравилось»

## Визуальный стиль

Тёмная пилюля `#232326`, розовое сердце `#ff4d6d`, серая иконка
`#8b8b93` в покое; иконки из `@hugeicons/core-free-icons`.

## Входные данные

`liked` (управляемый), `defaultLiked = false`, `count = 0`, `onChange`,
`showCount = true`, `icon = 'heart'` (`heart|star|thumb`),
`idleOutline = true`, `size = 40`, `corner = 32`, `likedColor = '#ff4d6d'`,
`idleColor = '#8b8b93'`, `pillColor = '#232326'`, `textColor = '#f5f5f5'`,
`duration = 560` (мс), `dotSize = 0.3`, `overshoot = 1.7`, `beat = 3`,
`rollDuration = 350`, `disabled = false`, `label = 'Like'`, `className`.

## Анимации

Пульс иконки — функция `swellOf(t, overshoot)` (кривая с отскоком),
прогоняемая в rAF; прокрутка счётчика — с таймером `rollTimer` и CSS.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Micro/PulseHeart/PulseHeart.jsx` (+ `PulseHeart.css`)
- `templates/react-libriry/react-bits/src/ts-default/Micro/PulseHeart/PulseHeart.tsx`
- `templates/react-libriry/react-bits/src/demo/Micro/PulseHeartDemo.jsx`

## Зависимости

`@hugeicons/core-free-icons`

## Совместимость и адаптация

`adaptable`: кривая пульса — чистая функция `swellOf(t)`; заменить rAF на
`t = (frame - likeFrame) / (duration / 1000 * fps)`, прокрутку числа —
на `interpolate` translateY. CSS-переходы в `PulseHeart.css` — проверить и
заменить (рецепт R4).

## Паттерны

`quantities`, `growth-decline`
