# Basic Counter (bit) — `remotion-bits/bit-basic-counter`

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

Одна строка `width: N px`, в которой число проходит цепочку значений
0 → 10 → 10 → 50 → 10 за 120 кадров: растёт, стоит, резко растёт и
откатывается обратно.

## Когда использовать

Минимальная демонстрация `animated-counter` с несколькими ключевыми
значениями, когда в озвучке величина меняется туда и обратно. Для
оформленной KPI-сцены — `bit-stat-rings` или `bit-counter-confetti`.

## Фразы из озвучки

- «сначала десять, потом пятьдесят, и снова десять»
- «значение подскочило и вернулось обратно»
- «ширина меняется на лету»

## Визуальный стиль

Без оформления: span шириной 300px, префикс и постфикс цветом `currentColor`,
фон и шрифт приходят от родителя. 1920×1080, 120 кадров.

## Входные данные

Props нет. Внутри `AnimatedCounter`: `transition.values: [0, 10, 10, 50, 10]`,
`duration: 120`, `prefix` «width: », `postfix` «px». Для переиспользования
вынести values, подписи и стиль в props.

## Анимации

Интерполяция по 5 ключевым значениям через равные отрезки прогресса,
easing линейный (не задан); повтор 10 → 10 даёт паузу.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-counter/BasicCounter.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/animated-counter.mdx` — документация
- карточка компонента: `components/remotion-bits/animated-counter.md`

## Зависимости

`remotion-bits` (`AnimatedCounter`); registry: `animated-counter`.

## Совместимость и адаптация

`native`. Задать шрифт, цвет и фон: сцена рассчитана на обёртку playground.

## Паттерны

`quantities`, `growth-decline`
