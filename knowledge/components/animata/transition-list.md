# TransitionList — `animata/transition-list`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | complex |
| Флаги | `timers`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Окно высотой 144px со списком строк-подписок (иконка-буква, название,
категория, сумма): каждые 2.5 с верхняя строка схлопывается (height→0,
scale→0), остальные поднимаются, пока список не опустеет.

## Когда использовать

«Отписываемся от лишнего», «задачи закрываются одна за другой», очередь
обрабатывается. Для статичного списка операций — `animata/transaction-list`.

## Фразы из озвучки

- «лишние подписки уходят одна за другой»
- «очередь тает на глазах»
- «закрываем задачи по списку»

## Визуальный стиль

`bg-secondary`, строки с рамкой gray-400 и `bg-primary/5`, моно-иконки
N/G/Y/S/A цветами брендов (Netflix, Google, YouTube, Shopify, Apple).

## Входные данные

`itemList?: {id, icon: ReactNode, name, type, amount: number}[]`
(по умолчанию 5 подписок).

## Анимации

`useEffect` + `setTimeout(2500)` удаляет первый элемент;
`AnimatePresence` + `motion.div` `exit {height 0, scale 0, margin 0}`,
`animate {height 3rem, scale 1}`, 0.5 с.

## Исходники и документация

- `templates/react-libriry/animata/animata/list/transition-list.tsx` — компонент
- `templates/react-libriry/animata/content/docs/list/transition-list.mdx` — документация
- `templates/react-libriry/animata/animata/list/transition-list.stories.tsx` — пример

## Зависимости

`motion`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: удаление по таймеру + exit-анимации. Переписать: `removed =
Math.floor(frame / (2.5*fps))`, для строки `i < removed` высота/scale =
`interpolate(frame - i*2.5*fps - 2.5*fps, [0, 0.5*fps], [1, 0])`;
`AnimatePresence` не нужен. Названия брендов заменить на нейтральные.

## Паттерны

`sequence-steps`, `growth-decline`
