# EdgeLabelRenderer — `xyflow/edge-label-renderer`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

HTML-подписи на рёбрах: портал в слой `div.react-flow__edgelabel-renderer`
поверх SVG-рёбер, в координатах холста. Внутри — любые плашки, бейджи,
цифры, иконки, а не только SVG-текст.

## Когда использовать

Когда подпись ребра должна быть «карточкой»: сумма перевода, задержка
в мс, процент конверсии, статус. Простой текст на ребре — `edge.label`
(SVG `EdgeText`, `xyflow/edge-types`).

## Фразы из озвучки

- «на этом переходе мы теряем тридцать процентов пользователей»
- «между сервисами — двести миллисекунд»
- «деньги идут со счёта клиента на счёт продавца»

## Визуальный стиль

Без своего оформления: что передадите, то и будет; слой
`pointer-events: none`, `user-select: none`.

## Входные данные

`EdgeLabelRendererProps`: `children: ReactNode`. Позицию задаёт сам
ребёнок: `position: 'absolute'`, `transform: translate(-50%, -50%)
translate(${labelX}px, ${labelY}px)`, где `labelX/labelY` — из
`getBezierPath`/`getSmoothStepPath`… внутри своего ребра.

## Анимации

Нет.

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/components/EdgeLabelRenderer/index.tsx`
- `templates/infografika/xyflow/packages/system/src/styles/init.css` — `.xy-flow__edgelabel-renderer`
- https://reactflow.dev/api-reference/components/edge-label-renderer

## Зависимости

`@xyflow/react`, `react-dom` (`createPortal`).

## Совместимость и адаптация

`adaptable`. Цель портала ищется `domNode.querySelector(...)`; `domNode`
попадает в store после монтирования холста, поэтому на самом первом
рендере портала нет и компонент возвращает `null` — подписи появятся
со следующего коммита (на первом кадре композиции может не быть; при
сомнении — `delayRender` до появления элемента или старт анимации подписей
не с 0-го кадра). Появление плашки — `opacity`/`scale` от кадра в
`style` ребёнка, позиция — от `labelX/labelY`.

## Паттерны

`relationships`, `quantities`, `cause-effect`
