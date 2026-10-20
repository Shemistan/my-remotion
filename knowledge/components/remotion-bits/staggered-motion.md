# StaggeredMotion — `remotion-bits/staggered-motion`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Группа дочерних элементов, которые входят/выходят одной и той же анимацией
(сдвиг, масштаб, поворот, прозрачность, blur, цвет) с задержкой между
соседями. Базовый примитив для списков, сеток, карточек, lower-third.

## Когда использовать

Когда озвучка перечисляет несколько пунктов или элементы должны появиться
«по очереди». Вместо ручного расчёта фаз по кадрам. Не для текстового
посимвольного появления (там `animated-text`) и не для частиц.

## Фразы из озвучки

- «три главных причины…»
- «посмотрим на каждый шаг по порядку»
- «вот наши продукты» (сетка карточек)
- «и наконец…» (последний элемент)

## Визуальный стиль

Нейтральный контейнер `div`; каждый ребёнок получает inline-style с
трансформом. Характер — через `easing` и `staggerDirection`
(`forward | reverse | center | random`).

## Входные данные

`StaggeredMotionProps`:

- `transition?`: `TransformProps & VisualProps & TimingProps & { stagger?:
  number; staggerDirection?: "forward"|"reverse"|"center"|"random" }` —
  каждое свойство может быть числом или массивом ключевых значений с
  `hold()`: `x y z scale scaleX scaleY rotate rotateX rotateY rotateZ skew
  skewX skewY transform opacity color backgroundColor blur borderRadius`;
  тайминг `frames | duration (по умолчанию 30) | delay | easing`.
- `children`, `className?`, `style?`.
- `cycleOffset?: number` — для циклического повторения.

## Анимации

Для каждого ребёнка `useMotionTiming({delay, stagger, unitIndex})` даёт
прогресс по кадру; `buildMotionStyles` собирает `transform`, `opacity`,
`filter: blur`, цвета. `random`-порядок детерминирован через
`random('stagger-i')` из remotion.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/StaggeredMotion.tsx` — компонент
- `templates/remotion-components/remotion-bits/src/utils/motion/index.ts` — тайминг и сборка стилей
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/staggered-motion.mdx` — справочник
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/GridStagger.tsx` — пример сетки

## Зависимости

`remotion` (`random`, `useCurrentFrame` через utils), `three` (Matrix4 в
`transform`), внутренние `../utils`.

## Совместимость и адаптация

`native`. Адаптации не нужны. Нюанс: компонент клонирует детей и
перезаписывает их `style.transform` — у ребёнка не должно быть собственного
transform.

## Паттерны

`sequence-steps`, `comparison`, `key-point-emphasis`
