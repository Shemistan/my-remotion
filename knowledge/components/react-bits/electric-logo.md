# ElectricLogo — `react-bits/electric-logo`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Логотип из SVG, по контуру которого бегут электрические разряды и дуги с
треском и свечением.

## Когда использовать

Энергичное раскрытие логотипа, «заряжено», мощь, tech-бренд.

## Фразы из озвучки

- «заряжено на успех»
- «энергия нашего бренда»
- «мощь в каждой детали»

## Визуальный стиль

Сиреневый разряд (`#ecc7ff`) со свечением `#ad6dff`, 4 нити.

## Входные данные

Из usage: `src = '/logo.svg'`, `color = '#ecc7ff'`, `glowColor = '#ad6dff'`,
`scale = 0.7`, `strands = 4`, `bend = 0.6`, `crackle = 1.5`, `arcs = 1`,
`speed = 2.5`, `interactive`.

## Анимации

OGL-шейдер по маске логотипа, разряды по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/ElectricLogo/ElectricLogo.jsx` (+ `ElectricLogo.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/ElectricLogo/ElectricLogo.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/ElectricLogoDemo.jsx`

## Зависимости

`ogl`

## Совместимость и адаптация

`complex`: рецепт R1 (OGL); SVG — `staticFile` + `delayRender` до
построения маски; `interactive = false`.

## Паттерны

`key-point-emphasis`
