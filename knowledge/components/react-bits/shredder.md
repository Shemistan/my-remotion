# Shredder — `react-bits/shredder`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Список карточек-элементов, которые затягиваются в шредер и выходят
снизу закручивающимися полосками, падающими вниз; остальные элементы
стопки сдвигаются. Есть автопроигрывание (`autoAnimate`, `loop`).

## Когда использовать

«Удаляем лишнее», уничтожение данных, отказ от старых процессов,
приватность, «выбросить в корзину».

## Фразы из озвучки

- «старые отчёты отправляются в шредер»
- «ваши данные удаляются безвозвратно»
- «избавляемся от лишнего»

## Визуальный стиль

Карточки из `renderItem` (любая разметка), полоски шириной 10 px с
завитком (`curl`), падение на 140 px.

## Входные данные

Из usage: `items`, `renderItem`, `onShred`, `onReorder`, `width = 340`,
`height = 460`, `feedSpeed = 180`, `bite = 18`, `stripWidth = 10`,
`curl = 1`, `autoAnimate = false`, `loop = false`,
`loopAfterDelete = false`, `fallHeight = 140`.

## Анимации

DOM-элемент снимается в текстуру через SVG `foreignObject` → `<img>` →
canvas (`snapshot`), полоски рисуются по форме `shape(st, len, time, tear)`;
стопка — пружины (`STACK_K = 320`, `STACK_C = 22`), сглаживание `ease(...)`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Micro/Shredder/Shredder.jsx` (+ `Shredder.css`)
- `templates/react-libriry/react-bits/src/ts-default/Micro/Shredder/Shredder.tsx`
- `templates/react-libriry/react-bits/src/demo/Micro/ShredderDemo.jsx`

## Зависимости

`react`, `react-dom` (`flushSync`)

## Совместимость и адаптация

`complex`: асинхронный снимок DOM (нужен `delayRender` до готовности
текстуры; картинки внутри конвертируются в data URL), накопительные пружины
и падение — рецепт R3; `autoAnimate` даёт сценарий без указателя. Тяжело.

## Паттерны

`transformation`, `cause-effect`
