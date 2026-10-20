# PrismaticBurst — `react-bits/prismatic-burst`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Взрыв призматических лучей из центра: радиальные пучки света, вращающиеся
в 3D (`animationType = 'rotate3d'`), с закруткой и вспышкой от клика.

## Когда использовать

Кульминация, «большой взрыв», анонс, вау-момент, раскрытие логотипа.

## Фразы из озвучки

- «и вот — большой запуск»
- «взрывной рост»
- «момент, которого все ждали»

## Визуальный стиль

Фиолетовые лучи (`#A855F7`, `#7C3AED`, `#6366F1`), интенсивность 2.

## Входные данные

Из usage: `colors = ['#A855F7', '#7C3AED', '#6366F1']`,
`animationType = 'rotate3d'`, `intensity = 2`, `speed = 0.5`, `zoom = 1`,
`rayWidth = 1`, `twist = 0`, `mouseInteraction`, `clickBurst`, `intro`.

## Анимации

WebGL2-шейдер (импортов нет), вращение лучей по времени (rAF), интро,
вспышка от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/PrismaticBurst/PrismaticBurst.jsx` (+ `PrismaticBurst.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/PrismaticBurst/PrismaticBurst.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/PrismaticBurstDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; вспышку под ключевую фразу задавать по кадру.

## Паттерны

`key-point-emphasis`, `growth-decline`
