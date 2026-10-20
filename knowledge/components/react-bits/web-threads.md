# WebThreads — `react-bits/web-threads`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Несколько светящихся нитей-паутинок с белым ядром, расходящихся и
колышущихся в пространстве.

## Когда использовать

Связи, сеть, «паутина интернета», тонкие зависимости.

## Фразы из озвучки

- «всё связано тонкими нитями»
- «сеть, которая держит всё вместе»
- «каждая связь важна»

## Визуальный стиль

Фиолетово-розовые нити (`#5227FF`, `#FF9FFC`) с белым ядром, 6 нитей.

## Входные данные

Из usage: `colors = ['#5227FF', '#FF9FFC']`, `coreColor = '#FFFFFF'`,
`threadCount = 6`, `spread = 0.18`. Остальное (включая интерактив) —
PropTable демо.

## Анимации

GPU-шейдер (импортов нет), колыхание по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/WebThreads/WebThreads.jsx` (+ `WebThreads.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/WebThreads/WebThreads.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/WebThreadsDemo.jsx`

## Зависимости

`react`; без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1.

## Паттерны

`relationships`, `system-structure`
