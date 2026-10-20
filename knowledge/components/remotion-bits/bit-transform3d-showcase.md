# Transform3D Showcase (bit) — `remotion-bits/bit-transform3d-showcase`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Облёт из шести шагов-«слайдов» с карточками кода про API Transform3D:
квадрат, двигающийся по цепочке матриц; куб с тремя орбитальными
спутниками; вложенные вращающиеся рамки; переходы через blur.

## Когда использовать

Технические объяснения 3D/матриц, «как устроено внутри», демонстрация
орбит, иерархии объектов (родитель–потомок). Чаще — как справочник
приёмов Transform3D, чем как готовая сцена для ролика.

## Фразы из озвучки

- «спутники вращаются вокруг центра»
- «каждый элемент наследует движение родителя»
- «сложное движение складывается из простых шагов»

## Визуальный стиль

Фон `var(--color-background-dark)`, полупрозрачные карточки с рамкой
`var(--color-border-light)`, акцент `var(--color-primary(-hover))`, `pre` с
кодом; 500 кадров, 1920×1080, `perspective` 1200.

## Входные данные

Без props. Шаги задаются `Transform3D...toProps()` (intro, chainable,
relative) и числами (interpolation, composition, outro); переход
`{blur: [20,0]}`, выход `{blur: [0,20]}`.

## Анимации

`Scene3D` (`transitionDuration` 60, `stepDuration` 80, у chainable
`duration` 120); `StaggeredMotion` с `transform` = массив из 5 `Transform3D`
(delay 20, 80 кадров); орбиты — `(frame % 100)/100` → `toCSSMatrix3D()`;
вложенные `Element3D` с `rotateX(frame·0.05)`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/Transform3DShowcase.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/transform3d-showcase.mdx` — документация

## Зависимости

`remotion` (`AbsoluteFill`, `useCurrentFrame`), `remotion-bits` (`Scene3D`,
`Step`, `Element3D`, `StaggeredMotion`, `Transform3D`, `Vector3`; импорт
`interpolateTransform`, `Matrix4` не используется), `three`. См.
`remotion-bits/transform3d`, `remotion-bits/scene-3d`.

## Совместимость и адаптация

`native`. Странности кода: `rotateZ(Math.PI / 8)` трактуется как градусы
(≈0,4°), массив `keyframes` не используется, `rotateX(frame·0.05)` в
`Element3D` через `toProps()` даёт очень медленное вращение. Определить
CSS-переменные темы.

## Паттерны

`system-structure`, `relationships`, `spatial`
