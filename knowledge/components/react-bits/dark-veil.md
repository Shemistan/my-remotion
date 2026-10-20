# DarkVeil — `react-bits/dark-veil`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Тёмная дымчатая вуаль одного цвета, медленно меняющая форму, с мягким
свечением, зерном и опциональными шёлковыми бликами.

## Когда использовать

Тёмный «киношный» фон под текст: тайна, премиум, ночь, вступление.

## Фразы из озвучки

- «всё начинается в темноте»
- «за занавесом скрывается что-то важное»
- «тихий старт большой истории»

## Визуальный стиль

Фиолетовая вуаль (`color = '#6b12ff'`) на чёрном, зерно 0.03; есть
`lightMode`.

## Входные данные

`color = '#6b12ff'`, `speed = 0.5`, `scale = 1`, `rotation = 0`,
`flow = 1`, `warp = 0`, `variation = 0`, `brightness = 1`, `sheen = 0`,
`glow = 0.4`, `grain = 0.03`, `quality = 0.5`, `mouseInteraction = true`,
`mouseStrength = 1`, `intro = true`, `fade = 0`, `opacity = 1`,
`lightMode = false` (PropTable демо).

## Анимации

Сырой WebGL2 (квад + шейдер), дрейф по времени в rAF, интро, искажение
курсором.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/DarkVeil/DarkVeil.jsx` (+ `DarkVeil.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/DarkVeil/DarkVeil.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/DarkVeilDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`, `intro={false}`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
