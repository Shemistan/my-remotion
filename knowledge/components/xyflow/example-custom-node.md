# Пример Custom Node — `xyflow/example-custom-node`

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

Тёмный холст `#1A192B`: input-узел слева, в центре свой узел
`selectorNode` (текст + `<input type="color">`, один вход и два выхода
`a`/`b` сверху и снизу правой стороны), справа два output-узла; три
белых анимированных ребра. Выбранный цвет перекрашивает фон.

## Когда использовать

Образец своего узла с несколькими выходами: «один поток раздваивается»,
блок-распределитель, A/B-сплит. Для видео интерактив (color picker)
заменяется статичным содержимым — иконкой, цифрой, бейджем.

## Фразы из озвучки

- «трафик делится на два потока»
- «половина пользователей видит вариант А, половина — Б»
- «один вход, два выхода»

## Визуальный стиль

Тёмный фон, белые рёбра с бегущим пунктиром, узлы с рамкой `#777`,
ручки `#555`.

## Входные данные

`nodeTypes = { selectorNode: ColorSelectorNode }`; узел `data: {color,
onChange}`; в узле `Handle type="target" position={Position.Left}` и
`Handle type="source" position={Position.Right} id="a"|"b"` со
`style.top: 10` / `bottom: 10`; рёбра `sourceHandle: 'a'|'b'`,
`animated: true`, `style: {stroke: '#fff'}`; холст `snapGrid [16,16]`,
`fitView`, `minZoom 0.3`, `maxZoom 2`; `Background bgColor`.

## Анимации

CSS `dashdraw` на всех трёх рёбрах.

## Исходники и документация

- `templates/infografika/xyflow/examples/react/src/examples/CustomNode/index.tsx`
- `templates/infografika/xyflow/examples/react/src/examples/CustomNode/ColorSelectorNode.tsx`
- https://reactflow.dev/examples/nodes/custom-node

## Зависимости

`@xyflow/react`.

## Совместимость и адаптация

`adaptable`: узлы и рёбра выставляются в `useEffect` после монтирования
— в видео задать их сразу (`useMemo`); убрать `<input type="color">`,
`useOnViewportChange`, `MiniMap`, `Controls`; `animated` →
`strokeDashoffset` от кадра; для ручек `a`/`b` указать `node.handles`
с теми же `id` и координатами (top 10 / bottom 10), иначе рёбра ждут
DOM-замера.

## Паттерны

`cause-effect`, `comparison`, `relationships`
