# Пример Edges (подписи, маркеры, свои рёбра) — `xyflow/example-edges`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | example |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events`, `svg`, `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE) |

## Что визуализирует

Граф на 17 узлов, где каждое ребро показывает приём оформления: подписи
всех встроенных типов, ребро «только подпись» (`stroke: none`), красное
анимированное, подпись на жёлтой скруглённой подложке, стрелки
`Arrow`/`ArrowClosed` разных цветов и размеров с обеих сторон,
многострочная подпись `<tspan>`, свои рёбра: текст по пути (`textPath`)
и `EdgeText` на красной плашке.

## Когда использовать

Каталог приёмов для схемы с говорящими связями: «что передаётся по
каждой стрелке». Текст вдоль кривой (`CustomEdge`) — выразительная
подпись потока.

## Фразы из озвучки

- «по этой стрелке идут заказы, по этой — возвраты»
- «связь двусторонняя: запрос и ответ»
- «здесь важна не стрелка, а то, что на ней написано»

## Визуальный стиль

Пёстрый демонстрационный: зелёные рёбра через `--xy-edge-stroke:
#00ff00`, жёлтые/красные/синие маркеры, фиолетовый `defaultMarkerColor`.
Для ролика выбрать 1–2 приёма.

## Входные данные

`initialNodes` (17), `initialEdges` (16: `type`, `label`, `labelStyle`,
`labelBgPadding [8,4]`, `labelBgBorderRadius 4`, `labelBgStyle`,
`markerStart`/`markerEnd {type, color, width, height, markerUnits,
orient, strokeWidth}`, `animated`, `style`); `edgeTypes = {custom,
custom2, custom3}`; `defaultEdgeOptions.markerEnd` (красная стрелка
20×20), `defaultMarkerColor='purple'`, `snapToGrid`.

## Анимации

CSS `dashdraw` на ребре `e3-5`.

## Исходники и документация

- `templates/infografika/xyflow/examples/react/src/examples/Edges/index.tsx`
- `templates/infografika/xyflow/examples/react/src/examples/Edges/CustomEdge.tsx` — `textPath`
- `templates/infografika/xyflow/examples/react/src/examples/Edges/CustomEdge2.tsx` — `EdgeText`
- https://reactflow.dev/examples/edges/custom-edges

## Зависимости

`@xyflow/react` (`BaseEdge`, `EdgeText`, `getBezierPath`, `MarkerType`).

## Совместимость и адаптация

`adaptable`: подписи `EdgeText`/`edge.label` меряются `getBBox()` после
монтирования (первый кадр без подписи) — шрифт загрузить заранее, анимацию
подписей начинать не с 0-го кадра; `textPath` (`CustomEdge`) замеров не
требует — `startOffset` можно вести от кадра («бегущий» текст).
`animated` → `strokeDashoffset`; обработчики мыши, `MiniMap`, `Controls`
убрать; `<style>` с CSS-переменными перенести в стили композиции.

## Паттерны

`relationships`, `cause-effect`
