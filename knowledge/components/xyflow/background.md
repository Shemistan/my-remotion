# Background (точки / линии / кресты) — `xyflow/background`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

Бесконечная SVG-сетка за схемой: точечная (`dots`), клетка (`lines`)
или крестики (`cross`), привязанная к viewport — при pan/zoom сетка
сдвигается и масштабируется вместе с узлами. Несколько фонов можно
наложить (мелкая + крупная клетка).

## Когда использовать

Подложка «инженерного листа» под схему из `xyflow/react-flow`; камера,
едущая по холсту, за счёт фона ощущается как движение. Вне холста не
работает (читает `transform` из store) — для отдельного фона-сетки
брать компоненты из категории `backgrounds-gradients` других
репозиториев.

## Фразы из озвучки

- «разложим архитектуру по полочкам, как на чертеже»
- «давайте приблизимся к этому блоку»
- «на доске проектировщика это выглядит так»

## Визуальный стиль

Тихий технический: точки `#91919a`, линии `#eee`, кресты `#e2e2e2` на
прозрачном фоне; в тёмной теме `#555`/`#333` на `#141414`.

## Входные данные

`BackgroundProps`: `id` (обязателен при нескольких фонах), `variant`
(`BackgroundVariant.Dots`; `'lines'|'dots'|'cross'`), `gap` (20, число
или `[x,y]`), `size` (dots 1, cross 6), `lineWidth` (1), `offset` (0),
`color`, `bgColor`, `style`, `className`, `patternClassName`.

## Анимации

Нет. Сетка пересчитывается из `transform` viewport'а (`x % gap`, масштаб
`gap * zoom`).

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/additional-components/Background/Background.tsx`
- `templates/infografika/xyflow/packages/react/src/additional-components/Background/Patterns.tsx`
- `templates/infografika/xyflow/packages/react/src/additional-components/Background/types.ts`
- `templates/infografika/xyflow/examples/react/src/examples/Backgrounds/index.tsx` — 4 варианта
- https://reactflow.dev/api-reference/components/background

## Зависимости

`@xyflow/react` (store `transform`, `rfId`).

## Совместимость и адаптация

`adaptable`: чистый SVG `<pattern>`, без таймеров и измерений, но
только внутри `ReactFlow`/`ReactFlowProvider`. Движение — через
`viewport` холста от кадра (сетка поедет сама) или через `offset` от
кадра (параллакс без движения узлов); проявление — `style.opacity`.

## Паттерны

`spatial`, `system-structure`
