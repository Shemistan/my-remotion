# Типы рёбер (bezier, straight, step, smoothstep, simplebezier) — `xyflow/edge-types`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `css-animation`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

SVG-связи между узлами: плавная кривая (`default` = bezier), упрощённая
кривая (`simplebezier`), прямая (`straight`), ортогональная ломаная
(`step`) и ломаная со скруглёнными углами (`smoothstep`); стрелки
`markerStart`/`markerEnd` (`arrow`, `arrowclosed`), подпись в центре с
подложкой, пунктир «бегущих муравьёв» (`animated`).

## Когда использовать

Связи на схеме: кривые — для потоков данных и «органичных» графов,
step/smoothstep — для оргструктур, архитектуры, блок-схем. Своё ребро
(рисование, точки, текст по пути) — `BaseEdge` + `xyflow/edge-path-utils`.

## Фразы из озвучки

- «запрос уходит из приложения прямо в базу»
- «каждый отдел подчиняется директору»
- «данные текут непрерывно, без пауз»

## Визуальный стиль

Линия `#b1b1b7` 1px, подпись 10px на белой подложке; `edge.style` или `--xy-edge-stroke*`.

## Входные данные

`Edge`: `id`, `source`, `target`, `sourceHandle`, `targetHandle`, `type`
(`'default'|'straight'|'step'|'smoothstep'|'simplebezier'`), `animated`,
`hidden`, `style`, `className`, `markerStart`/`markerEnd` (строка или
`{type, color, width, height, markerUnits, orient, strokeWidth}`),
`label`, `labelStyle`, `labelShowBg` (true), `labelBgStyle`,
`labelBgPadding` (`[2,4]`), `labelBgBorderRadius` (2), `pathOptions`
(bezier `{curvature}`, smoothstep `{offset, borderRadius, stepPosition}`,
step `{offset}`), `zIndex`, `interactionWidth` (20). `BaseEdge`: `path`,
`labelX`, `labelY`, `label…`, `interactionWidth`, любые SVG-атрибуты
`<path>` (в т.ч. `pathLength`, `strokeDasharray`).

## Анимации

`animated: true` → `.animated path { stroke-dasharray: 5; animation:
dashdraw 0.5s linear infinite }` (`from { stroke-dashoffset: 10 }`).

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/components/Edges/BezierEdge.tsx`, `StraightEdge.tsx`, `StepEdge.tsx`, `SmoothStepEdge.tsx`, `SimpleBezierEdge.tsx`
- `templates/infografika/xyflow/packages/react/src/components/Edges/BaseEdge.tsx`, `EdgeText.tsx`
- `templates/infografika/xyflow/packages/react/src/components/EdgeWrapper/index.tsx`, `utils.ts` — `builtinEdgeTypes`
- `templates/infografika/xyflow/packages/system/src/styles/init.css` — `.animated`, `dashdraw`
- https://reactflow.dev/api-reference/types/edge

## Зависимости

`@xyflow/react`, `@xyflow/system`.

## Совместимость и адаптация

`adaptable`. (1) `animated` — CSS `@keyframes`; вместо него без
`animated`: `style: { strokeDasharray: 5, strokeDashoffset: 10 * (1 -
((frame / fps / 0.5) % 1)) }`; (2) `EdgeText` меряет подпись `getBBox()`
в `useEffect`, до замера `visibility="hidden"` — первый кадр без
подписи; (3) ребро ждёт размеров узлов (см. `xyflow/react-flow`).
Прорисовка — своё ребро на `BaseEdge` с `pathLength={1}
strokeDasharray={1} strokeDashoffset={1 - p}` (встроенным рёбрам
`pathLength` не передать, только `style`).

## Паттерны

`relationships`, `cause-effect`, `system-structure`
