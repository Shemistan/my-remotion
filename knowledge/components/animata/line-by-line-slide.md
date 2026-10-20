# LineByLineSlide — `animata/line-by-line-slide`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Многострочный текст: строки по очереди выезжают слева (−48px) и
проявляются, уходят вправо. Строки разделяются `\n`.

## Когда использовать

Абзац или двустишие, читаемое сверху вниз: цитата, определение, тезис в 2–3
строки. Для одной строки — `animata/fade-through`.

## Фразы из озвучки

- «прочитаем внимательно»
- «первое — …, второе — …»
- «вот как это звучит целиком»

## Визуальный стиль

Плавный, редакционный (900 мс на строку, stagger 120).

## Входные данные

`text?: string | string[]` (строки через `\n`), `enter?`, `exit?`, `speed?`
(0.72), `holdMs?` (550), `gapMs?` (320), `yTravel?` (0.58), `className?`.
Спека: `target: "per-line"`; enter 900 / 120 / `cubic-bezier(0.22,1,0.36,1)`,
from `{opacity 0, xPx −48}`; exit 600 / 80, to `{opacity 0, xPx 48}`; swap
`crossfade`, `overlapMs 0`.

## Анимации

Stagger по строкам: opacity + translateX.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/line-by-line-slide.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/line-by-line-slide.mdx` — документация
- `templates/react-libriry/animata/animata/text/line-by-line-slide.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`
(юнит = строка, `display: block`).

## Паттерны

`sequence-steps`, `key-point-emphasis`
