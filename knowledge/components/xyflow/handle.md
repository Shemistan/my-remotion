# Handle — `xyflow/handle`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

Точка подключения на краю узла (кружок 6px) — место, откуда выходит или
куда входит ребро. В своём узле задаёт, с какой стороны и в какой точке
крепятся связи; несколько ручек с `id` — несколько выходов (ветвление).

## Когда использовать

Свой узел в `nodeTypes`, где рёбра должны выходить из конкретных мест:
«да/нет» у ромба решения, порты у блока сервиса. Видимую точку можно
скрыть (`style={{opacity:0}}`), оставив только привязку рёбер.

## Фразы из озвучки

- «если проверка пройдена — идём направо, если нет — вниз»
- «у сервиса два выхода: в очередь и в лог»

## Визуальный стиль

Чёрный кружок `#1a192b` с белой обводкой 1px, по центру стороны узла
(`translate(-50%, ±50%)`); стиль переопределяется `style`/`className`.

## Входные данные

`HandleProps`: `type` (`'source'`), `position` (`Position.Top`; `left |
top | right | bottom`), `id`, `isConnectable` (true),
`isConnectableStart` (true), `isConnectableEnd` (true),
`isValidConnection`, `onConnect`, `style`, `className`, `children` +
HTML-атрибуты `div`. Альтернатива без DOM-замера — `node.handles:
NodeHandle[]` (`{id?, type, position, x, y, width?, height?}`).

## Анимации

Нет.

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/components/Handle/index.tsx`
- `templates/infografika/xyflow/packages/system/src/types/handles.ts`
- `templates/infografika/xyflow/packages/system/src/utils/dom.ts` — `getHandleBounds` (`getBoundingClientRect`)
- `templates/infografika/xyflow/examples/react/src/examples/CustomNode/ColorSelectorNode.tsx` — две ручки `a`/`b`
- https://reactflow.dev/api-reference/components/handle

## Зависимости

`@xyflow/react` (контекст узла, store).

## Совместимость и адаптация

`adaptable`. Координаты ручек для рёбер берутся из DOM:
`getHandleBounds` → `getBoundingClientRect()` относительно узла, делённое
на zoom, после замера узла `ResizeObserver`. До замера рёбер нет. В
видео: дублировать ручки в `node.handles` с теми же `id`/`position` и
явными `x`/`y` — рёбра встанут с первого кадра; позже DOM-замер их
заменит (`handleBounds` приоритетнее `handles`), поэтому `x`/`y` должны
совпадать с CSS-положением ручек, иначе рёбра дёрнутся. Выключить
`nodesConnectable`.

## Паттерны

`relationships`, `system-structure`
