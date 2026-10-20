# SoftAurora — `react-bits/soft-aurora`

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

Мягкая светлая полоса сияния поперёк кадра, переходящая от белого к
пурпурному, с медленным колыханием.

## Когда использовать

Светлый деликатный фон под заголовок, лёгкий акцент, «новое начало».
Мягче, чем `react-bits/aurora`.

## Фразы из озвучки

- «лёгкость в каждом движении»
- «новая глава начинается»
- «всё становится проще»

## Визуальный стиль

`color1 = '#f7f7f7'`, `color2 = '#e100ff'`, размытая полоса, спокойно.

## Входные данные

Из usage: `speed = 0.6`, `scale = 1.5`, `brightness = 1`,
`color1 = '#f7f7f7'`, `color2 = '#e100ff'`, `bandHeight = 0.5`,
`bandSpread = 1`, `enableMouseInteraction`, `mouseInfluence = 0.25`.
До 4 пульсов (`MAX_PULSES`).

## Анимации

WebGL2-шейдер (импортов нет), колыхание по времени (rAF), пульсы.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/SoftAurora/SoftAurora.jsx` (+ `SoftAurora.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/SoftAurora/SoftAurora.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/SoftAuroraDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `enableMouseInteraction={false}`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
