# AcidSquares — `react-bits/acid-squares`

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

Повёрнутое поле скруглённых плиток, по которым бегут волны и пульсы
кислотных цветов с раздельным освещением (`lighting = 'split'`) и зерном.

## Когда использовать

Яркий клубный/поп-фон, техно, «энергия», промо с дерзким настроением.

## Фразы из озвучки

- «громко, ярко, смело»
- «ритм, который не остановить»
- «новая волна»

## Визуальный стиль

Тёмные плитки (`#120f17`) с розовым (`#ff4fb8`) и синим (`#3b6bff`)
светом, поворот 35°.

## Входные данные

Из usage: `color = '#120f17'`, `accentColor = '#ff4fb8'`,
`secondaryColor = '#3b6bff'`, `tileSize = 1`, `gap = 0.12`,
`roundness = 0.25`, `rotation = 35`, `waves = 1`, `pulse = 1`,
`lighting = 'split'`, `tilt = 0.7`, `grain = 0.12`, `intro = true`,
`mouseInteraction = true`.

## Анимации

GPU-шейдер (импортов нет), волны/пульсы по времени (rAF), интро.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/AcidSquares/AcidSquares.jsx` (+ `AcidSquares.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/AcidSquares/AcidSquares.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/AcidSquaresDemo.jsx`

## Зависимости

`react`; без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`, `intro={false}`.

## Паттерны

`abstract-concepts`, `system-structure`
