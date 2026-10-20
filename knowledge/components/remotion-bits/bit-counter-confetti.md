# Counter Confetti (bit) — `remotion-bits/bit-counter-confetti`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `numbers-counters` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Крупное число по центру докручивается от 0 до 1000, при этом увеличивается
с перелётом (scale 0.2 → 1.3 → 1) и светится. В момент финиша с левого и
правого края и снизу вылетает разноцветное конфетти, которое вращается,
падает и гаснет.

## Когда использовать

Празднование рубежа: тысячный клиент, миллион скачиваний, рекорд продаж.
Если праздновать нечего, а нужно просто показать метрику, бери
`bit-stat-rings` или `animated-counter`.

## Фразы из озвучки

- «и вот нас уже тысяча!»
- «мы достигли отметки в миллион скачиваний»
- «новый рекорд продаж»
- «поздравляем с первым юбилеем»

## Визуальный стиль

Моноширинный жирный шрифт 15 vmin, `textShadow` цветом `currentColor`;
конфетти — скруглённые прямоугольники 3 vmin восьми ярких цветов. Тон
праздничный, игривый. 180 кадров, 1920×1080.

## Входные данные

Props нет. Внутри заданы `CONFETTI_COLORS` (8 hex), `counterEnd = 90`,
`confettiStart = 85`, три `Spawner` (`burst` 40/40/30, `lifespan` 120, `max`),
позиции через `resolvePoint(rect, {x:"-5%"|"105%"|"center", y})`, скорости в
долях `rect.width/height`.

## Анимации

- `AnimatedCounter` `values [0,1000]`, 90 кадров `easeOutQuart`, scale с
  перелётом, opacity 0 → 1.
- `Sequence from={85}` → `Particles`: три залпа burst.
- `Behavior`: `gravity y 0.3`, свой `handler` (rotation += velocity.x·0.8),
  `drag 0.98`, `opacity [1,0]`.
- Цвет у частицы выбирается по seed.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-counter/CounterConfetti.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/counter-confetti.mdx` — документация
- карточки: `components/remotion-bits/animated-counter.md`, `particle-system.md`

## Зависимости

`remotion` (`AbsoluteFill`, `Sequence`); `remotion-bits` (`AnimatedCounter`,
`Particles`, `Spawner`, `Behavior`, `useViewportRect`, `resolvePoint`).

## Совместимость и адаптация

`native`, всё детерминировано. Цвет числа и фон берутся от родителя
(`currentColor`), их нужно задать. `ConfettiPiece` объявлен внутри
`Component`, поэтому пересоздаётся на каждом кадре. Это безвредно, но его
лучше вынести наружу.

## Паттерны

`key-point-emphasis`, `quantities`, `growth-decline`
