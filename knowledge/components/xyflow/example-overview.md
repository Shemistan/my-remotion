# Пример Overview — `xyflow/example-overview`

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

Демонстрационная схема на 7 узлов сверху вниз: input-узел «Welcome to
React Flow!», default-узлы (один с кастомным фоном `#D6D5E6`), два
output-узла; рёбра всех видов — bezier с подписью, анимированное
пунктирное, smoothstep, оранжевое step с подписью; поверх — `MiniMap`,
`Controls`, точечный `Background` (gap 25).

## Когда использовать

Образец «витрины возможностей» и отправная точка для сцены
«дерево процесса»: один вход, развилка, два исхода. Для видео убрать
`MiniMap`/`Controls`, оставить `Background`.

## Фразы из озвучки

- «всё начинается с одного входа, а дальше процесс ветвится»
- «в конце у нас два возможных результата»
- «по этой связи данные идут постоянно»

## Визуальный стиль

Классический светлый React Flow: белые узлы 150px, серые рёбра, подписи
на белых плашках, акцент `#f6ab6c` на step-ребре.

## Входные данные

`initialNodes` (7 шт., `position`, `type`, `data.label` с JSX, `style`),
`initialEdges` (6 шт.: `label`, `animated`, `type: 'smoothstep'|'step'`,
`style`, `labelStyle`); на холсте `snapToGrid`, `snapGrid [25,25]`,
`fitView` с `padding: 0.1`, `attributionPosition="top-right"`,
`maxZoom={Infinity}`, `connectionMode={ConnectionMode.Strict}`.

## Анимации

Только CSS `dashdraw` у рёбер `e3-4` и `e5-7` (`animated: true`).

## Исходники и документация

- `templates/infografika/xyflow/examples/react/src/examples/Overview/index.tsx`
- https://reactflow.dev/examples/overview

## Зависимости

`@xyflow/react` (`ReactFlow`, `MiniMap`, `Controls`, `Background`,
`useNodesState`, `useEdgesState`, `addEdge`).

## Совместимость и адаптация

`adaptable`: убрать все `on*`-логгеры, `onBeforeDelete` с `confirm()`,
`MiniMap`, `Controls`; `fitView` заменить на `viewport` (узлы без
`width` меряются после монтирования — fit до замера даёт неверный кадр);
задать узлам `width: 150`/`height` и `handles`; `animated` → `style.strokeDashoffset`
от кадра; появление узлов по очереди — `style.opacity` со stagger по индексу.
Ссылка `<a>` в узле 4 в видео не нужна.

## Паттерны

`sequence-steps`, `cause-effect`, `system-structure`
