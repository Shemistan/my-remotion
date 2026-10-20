# GradientASCII — `react-bits/gradient-ascii`

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

Градиентная форма (например «горизонт»), нарисованная ASCII-символами по
яркости (` =+xX0S8#@`), с переливом цветов; курсор оставляет след, клик —
вспышку.

## Когда использовать

Код, терминал, генеративное искусство, «из символов рождается картина».

## Фразы из озвучки

- «из кода рождается картина»
- «каждый символ на своём месте»
- «рассвет цифровой эпохи»

## Визуальный стиль

Сине-белая палитра (`#1e3fd8`, `#f6f8ff`, `#a5d8ff`, `#38bdf8`), ячейка 18.

## Входные данные

Из usage: `colors` (до 8), `shape = 'horizon'`, `characters = ' =+xX0S8#@'`,
`cellSize = 18`, `density = 0.8`. Остальное — PropTable демо.

## Анимации

GPU-шейдер (импортов нет), перелив по времени (rAF), интро 2.4 с, след
курсора (до 24 точек, 0.7 с), клики (до 4, 1.2 с).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/GradientASCII/GradientASCII.jsx` (+ `GradientASCII.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/GradientASCII/GradientASCII.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GradientASCIIDemo.jsx`

## Зависимости

`react`; без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; след/клики выключить; шрифт символов дождаться
через `delayRender`.

## Паттерны

`transformation`, `abstract-concepts`
