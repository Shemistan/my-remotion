# TopDownLetters — `animata/top-down-letters`

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

Слово «падает» сверху: буквы по одной спускаются с −46px лесенкой; уход —
вниз на 14px.

## Когда использовать

Короткий заголовок, который «приземляется»: снижение, падение, «сверху вниз».
Зеркало `animata/bottom-up-letters`.

## Фразы из озвучки

- «показатель упал»
- «спускаемся на уровень ниже»
- «и вот результат»

## Визуальный стиль

Кинетичный, staircase-подача, типографика через `className`.

## Входные данные

`text?: string | string[]` (по умолчанию `["Drop","Above","Title"]`),
`enter?`, `exit?`, `speed?` (0.72), `holdMs?` (550), `gapMs?` (320),
`yTravel?` (0.58), `className?`. Спека: `per-character`; enter 400 / 88 /
`cubic-bezier(0.18,1,0.32,1)`, from `{opacity 0, yPx −46}`; exit 280 / 28, to
`{opacity 0, yPx 14}`; swap `sequential`, `microDelayMs 35`.

## Анимации

Посимвольный stagger opacity + translateY сверху вниз.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/top-down-letters.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/top-down-letters.mdx` — документация
- `templates/react-libriry/animata/animata/text/top-down-letters.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

WAAPI + `setTimeout` + `Math.random` задержка старта. Рецепт «TextAnimator →
кадр» в `compatibility/animata-text-graphs-cards.md`.

## Паттерны

`growth-decline`, `key-point-emphasis`
