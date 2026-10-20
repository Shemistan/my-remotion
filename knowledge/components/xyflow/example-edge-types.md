# Пример Edge Types (галерея рёбер) — `xyflow/example-edge-types`

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

Сетка из 80 пар «Source → Target»: для каждого из 5 типов рёбер
(`default`, `step`, `smoothstep`, `straight`, `simplebezier`) и двух
ориентаций ручек (снизу→вверх, справа→налево) цель стоит в 8 направлениях
от источника. Узлы 80px, бирюзовая и синяя палитры по типу ребра.

## Когда использовать

Справочник «как поведёт себя ребро при таком взаимном положении узлов»
для разработчика сцены; в ролике — фрагмент как «узор связей» или
сравнение стилей линий (кривая vs ломаная).

## Фразы из озвучки

- «связи бывают прямыми, ступенчатыми и плавными»
- «как бы ни стояли блоки, линия найдёт дорогу»

## Визуальный стиль

Плотная сетка мелких цветных узлов (`#0c5956`…`#8ddfd4`,
`#0f4c75`…`#4fa6e0`), белый текст 11px, серые рёбра.

## Входные данные

`getElements()` из `utils.ts`: `nodeWidth = 80`, `nodeGapWidth = 160`,
`sourceTargetPositions`, `nodeColors`, `edgeTypes`, `offsets` (8
направлений); узлы со `style {width, fontSize, color, background}`,
`sourcePosition`/`targetPosition`; холст `minZoom={0.2}`, `onInit →
fitView()`.

## Анимации

Нет.

## Исходники и документация

- `templates/infografika/xyflow/examples/react/src/examples/EdgeTypes/index.tsx`
- `templates/infografika/xyflow/examples/react/src/examples/EdgeTypes/utils.ts`
- https://reactflow.dev/examples/edges/edge-types

## Зависимости

`@xyflow/react`.

## Совместимость и адаптация

`adaptable`: 160 узлов меряются `ResizeObserver` — задать `width: 80`,
`height` и `handles`; `fitView` → фиксированный `viewport` или
`getViewportForBounds(bounds, W, H, 0.2, 2, 0.1)` по известной сетке узлов;
`MiniMap`/`Controls` и горячие клавиши убрать. Счётчик `id` модульный
(`let id = 0`) — при повторном вызове `getElements()` id не совпадут,
вызывать один раз.

## Паттерны

`comparison`, `relationships`
