# BlurOutUp — `animata/blur-out-up`

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

Фраза появляется по словам: каждое слово всплывает на ~10px снизу из лёгкого
размытия; уходит вверх, растворяясь в нарастающем blur. Фразы сменяются по кругу.

## Когда использовать

Спокойная смена тезисов или подзаголовков, «воздушный» уход фразы. Для
посимвольной подачи — `animata/soft-blur-in`, для целой строки без stagger —
`animata/focus-blur-resolve`.

## Фразы из озвучки

- «и это уходит в прошлое»
- «следующая мысль»
- «лёгкий, ненавязчивый переход»

## Визуальный стиль

Минималистичный, премиальный; без цвета и фона — типографика задаётся
`className`. Темп средний (560 мс на слово, stagger 28 мс до множителя speed).

## Входные данные

`BlurOutUpProps` (все необязательны): `text?: string | string[]` (по умолчанию
3 фразы-примера), `enter?`, `exit?: Partial<TextAnimationPhaseSpec>` (сливаются
с базой), `speed?` (0.72), `holdMs?` (550), `gapMs?` (320), `yTravel?` (0.58),
`className?`. Спека: `target: "per-word"`; enter 560 мс / stagger 28 /
`cubic-bezier(0.22,1,0.36,1)`, from `{opacity 0, yPx 10, blurPx 6}`; exit 480 /
24, to `{opacity 0, yPx −14, blurPx 8}`; swap `sequential`, `microDelayMs 35`.

## Анимации

Stagger по словам: opacity + translateY + blur на входе и выходе; цикл
enter → hold → exit → gap → следующая фраза.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/blur-out-up.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — общий WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/blur-out-up.mdx` — документация
- `templates/react-libriry/animata/animata/text/blur-out-up.stories.tsx` — пример

## Зависимости

`react`, внутренние `@/animata/text/text-animator` (+ `text-animator.css`,
`text-animator-demo`), `@/lib/utils` (`cn`).

## Совместимость и адаптация

Runtime `TextAnimator` строит DOM императивно, анимирует через WAAPI
(`element.animate`) и `setTimeout`, старт сдвинут на `Math.random()*400` мс —
покадрово не детерминирован. Спека — чистые данные, поэтому общий рецепт из
`compatibility/animata-text-graphs-cards.md` («TextAnimator → кадр»): разбить
текст по словам в React и считать стиль каждого слова из `frame`.

## Паттерны

`transformation`, `sequence-steps`, `key-point-emphasis`
