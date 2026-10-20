# Пример Floating Edges (звезда) — `xyflow/example-floating-edges`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | example |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE) |

## Что визуализирует

Радиальная схема: узел «Target» в центре и 8 узлов «Source» по кругу
радиусом 250px; «плавающие» bezier-рёбра выходят не из фиксированных
ручек, а из точки пересечения линии центр–центр с границей узла —
связи всегда смотрят друг на друга.

## Когда использовать

«Всё сходится в одну точку» / «хаб и спицы»: источники данных вокруг
хранилища, каналы привлечения вокруг продукта, участники вокруг
платформы. Хорошо работает с вращением или «втягиванием» узлов к
центру — рёбра пересчитываются сами.

## Фразы из озвучки

- «все восемь источников стекаются в одно хранилище»
- «вокруг продукта — каналы, которые приводят пользователей»
- «центр системы — вот этот сервис»

## Визуальный стиль

Симметричная звезда белых узлов, тонкие кривые рёбра без стрелок,
точечный фон.

## Входные данные

`createElements()` (центр `window.innerWidth/2, innerHeight/2`, 8 узлов
по `250 * cos/sin`), `edgeTypes = { floating: FloatingEdge }`,
`connectionLineComponent = FloatingConnectionLine`;
`getEdgeParams(source, target)` → `{sx, sy, tx, ty, sourcePos,
targetPos}` из `measured` размеров и `internals.positionAbsolute`.

## Анимации

Нет.

## Исходники и документация

- `templates/infografika/xyflow/examples/react/src/examples/FloatingEdges/index.tsx`
- `templates/infografika/xyflow/examples/react/src/examples/FloatingEdges/FloatingEdge.tsx`
- `templates/infografika/xyflow/examples/react/src/examples/FloatingEdges/utils.ts`
- https://reactflow.dev/examples/edges/floating-edges

## Зависимости

`@xyflow/react` (`useStore`, `getBezierPath`, `Background`).

## Совместимость и адаптация

`adaptable`: `window.innerWidth/innerHeight` заменить на размеры
композиции из `useVideoConfig()`; `getNodeIntersection` берёт
`node.measured` — до замера ширина 0 и рёбра сходятся в угол, поэтому
задать узлам `width`/`height` и в `utils.ts` брать
`measured ?? {width, height}` узла. Узел `1` в примере сделан дочерним
(`parentId: '0'`, позиция `0,0`) — для чистой звезды убрать. `onInit →
fitView()` заменить на `viewport`. Позиции узлов можно вращать по
кадру: `angle = i*45° + frame*k`.

## Паттерны

`relationships`, `system-structure`, `cause-effect`
