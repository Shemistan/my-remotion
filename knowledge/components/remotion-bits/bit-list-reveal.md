# List Reveal (bit) — `remotion-bits/bit-list-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Вертикальный список из шести пунктов меню (эмодзи-иконка, название,
точка-индикатор): строки по очереди всплывают с fade и лёгким масштабом,
а весь список одновременно медленно едет вверх.

## Когда использовать

Перечисление разделов, функций, шагов, пунктов повестки; «что входит в
продукт». Для коротких 3–5 пунктов с акцентом на тексте — тоже подходит;
для сетки — `bit-grid-stagger`.

## Фразы из озвучки

- «в приложении есть всё необходимое»
- «давайте пройдёмся по разделам»
- «аналитика, настройки, сообщения — в одном месте»

## Визуальный стиль

UI-строки zinc-800 со скруглением 12 px на фоне `#09090b`, текст 20 px
zinc-100; спокойный easeOutCubic, 90 кадров, 1080×1080.

## Входные данные

Без props: `items: {title, icon}[]` (Dashboard, Analytics, Settings,
Profile, Messages, Notifications), `itemWidth = min(width*0.8, 600)`,
`itemHeight = 80`.

## Анимации

Внешний `StaggeredMotion` `y: [200, -100]` (длительность по умолчанию =
fps кадров) — дрейф всего списка; внутренний: `y: [50, 0]`, `opacity`,
`scale: [0.9, 1]`, `frames: [0, 40]`, `stagger: 3`, forward.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/ListReveal.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/list-reveal.mdx` — страница bit

## Зависимости

`remotion-bits`: `StaggeredMotion`, `useViewportRect`.

## Совместимость и адаптация

`native`. Эмодзи рендерятся системным шрифтом — в headless Chrome могут
отличаться/отсутствовать; заменить на SVG-иконки. Внешний StaggeredMotion
кладёт transform на внутренний контейнер — не задавать ему свой transform.

## Паттерны

`sequence-steps`, `system-structure`, `key-point-emphasis`
