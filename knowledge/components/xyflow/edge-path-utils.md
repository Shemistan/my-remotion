# Утилиты путей рёбер — `xyflow/edge-path-utils`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/system/package.json) |

## Что визуализирует

Собственной картинки нет: чистые функции, возвращающие строку SVG-пути
`d` между двумя точками и центр для подписи. Дают «рёбра React Flow» в
любом своём SVG без холста, store и DOM-замеров.

## Когда использовать

Стрелки и связи в своей Remotion-сцене (карточки, иконки, блоки на
`AbsoluteFill`): плавная кривая, ортогональная ломаная, прямая. Нужна
вся схема с узлами — `xyflow/react-flow`.

## Фразы из озвучки

- «отсюда — туда, одним движением»
- «эти два блока связаны»
- «путь заявки огибает склад и приходит в доставку»

## Визуальный стиль

Определяется вашим `<path>`: обводка, толщина, маркеры.

## Входные данные

Все возвращают кортеж `[path, labelX, labelY, offsetX, offsetY]`:
- `getBezierPath({sourceX, sourceY, sourcePosition = Position.Bottom,
  targetX, targetY, targetPosition = Position.Top, curvature = 0.25})`
- `getSimpleBezierPath({sourceX, sourceY, sourcePosition = Bottom,
  targetX, targetY, targetPosition = Top})` — из `@xyflow/react`
- `getSmoothStepPath({sourceX, sourceY, sourcePosition = Bottom, targetX,
  targetY, targetPosition = Top, borderRadius = 5, centerX, centerY,
  offset = 20, stepPosition = 0.5})` — step = `borderRadius: 0`
- `getStraightPath({sourceX, sourceY, targetX, targetY})`
- `getEdgeCenter({sourceX, sourceY, targetX, targetY})` →
  `[centerX, centerY, offsetX, offsetY]`; `getBezierEdgeCenter(...)`.
`Position`: `'left' | 'top' | 'right' | 'bottom'`.

## Анимации

Нет. Для прорисовки: `<path d={path} pathLength={1}
strokeDasharray={1} strokeDashoffset={1 - p}/>`; концы можно двигать —
путь пересчитывается из координат каждый кадр.

## Исходники и документация

- `templates/infografika/xyflow/packages/system/src/utils/edges/bezier-edge.ts`
- `templates/infografika/xyflow/packages/system/src/utils/edges/smoothstep-edge.ts`
- `templates/infografika/xyflow/packages/system/src/utils/edges/straight-edge.ts`
- `templates/infografika/xyflow/packages/system/src/utils/edges/general.ts` — `getEdgeCenter`
- `templates/infografika/xyflow/packages/react/src/components/Edges/SimpleBezierEdge.tsx` — `getSimpleBezierPath`
- `templates/infografika/xyflow/packages/system/src/types/utils.ts` — `Position`
- https://reactflow.dev/api-reference/utils/get-bezier-path

## Зависимости

`@xyflow/system` (или реэкспорт из `@xyflow/react`). Сами функции не
трогают d3/DOM, но пакет тянет d3-зависимости в бандл.

## Совместимость и адаптация

`adaptable` по формальному критерию (не написано для Remotion), на деле
адаптации не требует: детерминированные функции от координат, можно
вызывать каждый кадр с интерполированными концами.

## Паттерны

`relationships`, `cause-effect`, `sequence-steps`
