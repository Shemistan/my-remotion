# Use case diagram (beta) — `mermaid/usecase`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`usecase-beta`, 12.0.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `engine:other`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

UML-диаграмма вариантов использования: актёры-человечки, овалы вариантов
в рамке системы, связи. Раскладка — ELK.

## Когда использовать

Кто и что может делать в системе: роли и функции продукта. Для
последовательности действий — `mermaid/sequence-diagram`.

## Фразы из озвучки

- «покупатель может оформить заказ и отследить доставку»
- «поддержка видит все обращения клиентов»
- «у системы две основные роли»

## Визуальный стиль

Классический UML: человечки, овалы, рамка системы. По умолчанию тема
`redux-color` и look `neo`.

## Входные данные

Текстовый DSL (`docs/syntax/usecase.md`):

```
usecase-beta
direction LR
actor Customer("Customer")
systemBoundary "Order system"
  Checkout("Place order")
end
Customer --> Checkout
```

Каждое утверждение — на отдельной строке. `direction`:
TD/TB/BT/LR/RL.

## Анимации

Своей анимации нет. По кадру: актёры, затем варианты, затем связи.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/usecase/usecaseDetector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/usecase/usecaseDiagram.ts` — парсер `usecase.chevrotain`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/usecase/usecaseRenderer.ts` — LayoutData → `render.ts`
- `templates/infografika/mermaid/packages/mermaid/src/rendering-util/render.ts`
- `templates/infografika/mermaid/docs/syntax/usecase.md`, `templates/infografika/mermaid/demos/usecase.html`

## Зависимости

`mermaid` 12.2.0 (полная сборка — ради ELK), `d3`, `elkjs`, chevrotain.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: unified
`render.ts`, по умолчанию ELK; в tiny-сборке включается dagre. Есть ли у
связей CSS-анимация (`edge-animation-*`), не проверено; если есть —
отключить. Классы актёров и вариантов сверить по готовому SVG.

## Паттерны

`relationships`, `system-structure`
