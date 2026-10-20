# Stat Rings (bit) — `remotion-bits/bit-stat-rings`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `numbers-counters` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Три круговых прогресс-кольца в ряд: кольца по очереди появляются с
пружинкой, дуга заполняется до нужного процента, а число в центре
докручивается синхронно с ней. Под каждым кольцом стоит подпись капсом.

## Когда использовать

Слайд «ключевые метрики» с долями и процентами: аптайм, покрытие тестами,
конверсия, доля рынка. Подходит для 2–4 показателей. Если нужно сравнить
абсолютные величины, бери `bit-bar-chart`.

## Фразы из озвучки

- «аптайм — 99,9 процента»
- «покрытие тестами выросло до 87 %»
- «две трети запросов попадают в кэш»

## Визуальный стиль

- Тёмный фон, белые числа с табличными цифрами, знак `%` мелким шрифтом
  справа.
- Дорожка кольца `--color-surface-light`, дуга `--color-primary` со
  скруглёнными концами.
- Шрифт sans-serif. 120 кадров, 1920×1080.

## Входные данные

Props нет. Данные заданы в `stats` (`{label, value, toFixed}[]`: Uptime
99.9, Test coverage 87, Cache hits 64). Размеры через `vmin`
(`ringSize` 34 vmin, `strokeWidth` 2.6 vmin). Тайминги: `stagger 12`,
`fillDuration 60`, `startFrame 20`.

## Анимации

- `StaggeredMotion`: opacity 0 → 1, scale 0.6 → 1, 30 кадров, easing
  `spring`, задержка между кольцами 12 кадров.
- Дуга: `strokeDashoffset` через `interpolate` remotion,
  `Easing.out(Easing.cubic)`, clamp.
- Счётчик: `AnimatedCounter` 0 → value, `easeOutCubic`, с тем же `delay`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-counter/StatRings.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/stat-rings.mdx` — документация
- карточки: `components/remotion-bits/animated-counter.md`, `staggered-motion.md`

## Зависимости

`remotion` (`useCurrentFrame`, `interpolate`, `Easing`); `remotion-bits`
(`StaggeredMotion`, `AnimatedCounter`, `useViewportRect`).

## Совместимость и адаптация

`native`. Нужно определить CSS-переменные `--color-background-dark`,
`--color-surface-light`, `--color-primary`, `--color-primary-hover` или
заменить их цветами. Данные `stats` стоит вынести в props.

## Паттерны

`quantities`, `comparison`, `key-point-emphasis`
