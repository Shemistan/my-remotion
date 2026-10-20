# Bar Chart (bit) — `remotion-bits/bit-bar-chart`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `charts-data` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Горизонтальная столбчатая диаграмма: заголовок, подписи строк слева, бары
растут слева направо с задержкой между строками, справа у каждого бара
докручивается значение.

## Когда использовать

Сравнение 3–7 категорий по одному показателю (языки, регионы, продукты).
Для динамики во времени лучше линия; для долей — кольца (`bit-stat-rings`).

## Фразы из озвучки

- «больше всего коммитов — на TypeScript»
- «лидирует первый вариант, остальные заметно отстают»
- «сравним пять направлений по выручке»

## Визуальный стиль

Тёмный фон, градиентные бары со скруглением, sans-serif, табличные цифры;
цвета через CSS-переменные `--color-background-dark`, `--color-primary`,
`--color-primary-hover` (в проекте их надо определить). Длительность 120
кадров, 1920×1080.

## Входные данные

Это самодостаточная сцена без props: данные зашиты в `rows` (`{label,
value}[]`) внутри `Component`; размеры через `useViewportRect()` (`vw`,
`vmin`). Для переиспользования вынести `rows`, заголовок и цвета в props.

## Анимации

`StaggeredMotion` для заголовка (opacity+y), подписей (opacity+x), баров
(`scaleX: [0,1]`, `transformOrigin: left`), значений (opacity) +
`AnimatedCounter` `values: [0, value]`; stagger 8 кадров, бар 45 кадров,
easing `easeOutQuart`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-counter/BarChart.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/bar-chart.mdx` — документация

## Зависимости

`remotion-bits` (`StaggeredMotion`, `AnimatedCounter`, `useViewportRect`);
registry: `staggered-motion`, `animated-counter`, `use-viewport-rect`.

## Совместимость и адаптация

`native`. Задать CSS-переменные темы или заменить на цвета; снять
предположение о внешней обёртке playground (добавить свой фон/размер).

## Паттерны

`comparison`, `quantities`, `growth-decline`
