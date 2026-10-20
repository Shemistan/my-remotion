# GradientWaves — `react-bits/gradient-waves`

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

Океан градиентных волн с рельефом и светлыми гребнями до горизонта,
освещённый под углом; клик поднимает волну.

## Когда использовать

Спокойствие, масштаб, «на волне успеха», горизонт возможностей.

## Фразы из озвучки

- «мы на волне успеха»
- «горизонт открыт»
- «спокойно, уверенно, вперёд»

## Визуальный стиль

Горизонт `#5227FF`, волны `#FF9FFC`, гребни `#FFFFFF`, свет под 120°.

## Входные данные

Из usage: `horizonColor = '#5227FF'`, `waveColor = '#FF9FFC'`,
`crestColor = '#FFFFFF'`, `speed = 0.4`, `amplitude = 2.5`, `relief = 1`,
`lightAngle = 120`, `mouseInteraction`, `swellOnClick`.

## Анимации

GPU-шейдер (импортов нет), волны по времени (rAF), волна от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/GradientWaves/GradientWaves.jsx` (+ `GradientWaves.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/GradientWaves/GradientWaves.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GradientWavesDemo.jsx`

## Зависимости

`react`; без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, интерактив выключить.

## Паттерны

`abstract-concepts`, `growth-decline`
