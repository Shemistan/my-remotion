# Transform3D + interpolate3d — `remotion-bits/transform3d`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; иммутабельный цепочечный 3D-трансформ (позиция,
кватернион, масштаб) с конвертацией в CSS `matrix3d(...)` и интерполяцией
между трансформами без «кувырков» (slerp).

## Когда использовать

Свои 3D-траектории карточек и камер в CSS 3D, «разлёт» элементов в
случайные позиции и сборка обратно, передача матриц в `transform` у
`StaggeredMotion`/`Scene3D`.

## Фразы из озвучки

Косвенно — под реплики с пространственным движением:
- «карточки разлетаются и собираются снова»
- «объект поворачивается к нам другой стороной»
- «всё рассыпается на части»

## Входные данные

`new Transform3D({position?, rotation?, scale?, id?})`; статические
`fromMatrix`, `fromEuler(x,y,z (рад), position?, scale?, order='XYZ')`,
`identity()`. Методы (возвращают новый объект): `translate`, `rotate(q)`,
`rotateX/Y/Z(angle: число в градусах | "45deg" | "1rad")`, `rotateAround`,
`scaleBy`, `multiply`, `inverse`, `apply`, `lerp`, `randomTranslate`,
`randomRotateX/Y/Z` (seed по id), `toMatrix4`, `toCSSMatrix3D`, `toEuler`,
`toProps`, `reseed`. В `interpolate3d.ts`: `interpolateTransform`,
`interpolateMatrix4`, `interpolateTransformKeyframes`, `matrixToCSS`,
`transformToCSS`, `decomposeMatrix`, `lerpVector3`, `slerpQuaternion`.

## Анимации

Нет собственных.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/transform3d.ts` — класс
- `templates/remotion-components/remotion-bits/src/utils/interpolate3d.ts` — интерполяция и CSS
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/transform3d.mdx` — справка

## Зависимости

`three` (Matrix4, Quaternion, Vector3, Euler — только математика),
внутренний `random.ts`.

## Совместимость и адаптация

`native`. Случайные методы используют `random()` remotion, но seed по
умолчанию зависит от `id` из глобального счётчика `_idCounter` — порядок
создания объектов меняет результат; для стабильности передавать `seed` явно.

## Паттерны

нет
