# Cubes — `react-bits/cubes`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Сетка 3D-кубиков, которые поворачиваются волной вокруг «кисти»; при
`autoAnimate` кисть движется сама, клик пускает рябь. Вдохновлено
лендингом lambda.ai (Can Tastemel).

## Когда использовать

Модульность, инфраструктура, «кирпичики системы», вычисления, облако.

## Фразы из озвучки

- «система из тысяч модулей»
- «каждый блок на своём месте»
- «инфраструктура, которая подстраивается»

## Визуальный стиль

Тёмные грани `#120f17`, белые рёбра; пресеты `grid`, `dashed`, `wire`,
`dense`, `depth`.

## Входные данные

Из демо: `gridSize = 10`, `gap = 0.18`, `edgeStyle = 'solid'`,
`edgeWidth = 1`, `faceOpacity = 1`, `shading = 0.6`, `maxAngle = 45`,
`radius = 3`, `perspective = 0`, `faceColor`, `edgeColor`, `rippleColor`,
`speed = 1`, `bounce = 0.4`, `brush = 1`, `rippleSpeed = 1`,
`autoAnimate = true`, `rippleOnClick = true`, `intro = true`.

## Анимации

WebGL2 (3D-меш кубиков, атрибуты позиции/нормали/UV), повороты по
траектории кисти в rAF, пружинный отскок `bounce`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/Cubes/Cubes.jsx` (+ `Cubes.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/Cubes/Cubes.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/CubesDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1 + R3 (пружинный отскок накапливается): траекторию
автокисти и углы считать функцией времени; `rippleOnClick = false`.

## Паттерны

`system-structure`, `cause-effect`
