# Grainient — `react-bits/grainient`

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

Плавно текущий многоцветный градиент (до 8 цветов) с плёночным зерном и
шёлковыми переливами — «grain + gradient».

## Когда использовать

Универсальный тёплый/модный фон под титры, цитаты, обложки, переходы.

## Фразы из озвучки

- «тепло, которое чувствуется»
- «закат одной эпохи и рассвет другой»
- «мягкий переход к главному»

## Визуальный стиль

Палитра заката (`#120f17`, `#2a0f0a`, `#9a3412`, `#f97316`, `#fed7aa`),
угол 55°, зерно 0.08.

## Входные данные

Из usage: `colors = [...]` (до 8), `angle = 55`, `flow = 0.8`,
`silk = 0.35`, `grainAmount = 0.08`. Остальное — PropTable демо.

## Анимации

WebGL2-шейдер (импортов нет), течение градиента по времени в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Grainient/Grainient.jsx` (+ `Grainient.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Grainient/Grainient.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GrainientDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1. Если нужен только статичный кадр-градиент — проще
CSS `linear-gradient` + SVG-шум с `interpolate` угла.

## Паттерны

`transformation`, `abstract-concepts`
