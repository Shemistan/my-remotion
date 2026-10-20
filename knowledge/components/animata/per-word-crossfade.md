# PerWordCrossfade — `animata/per-word-crossfade`

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

Слова проявляются одно за другим с коротким дрейфом 8px вверх; фразы
спокойно сменяют друг друга.

## Когда использовать

Субтитро-подобная подача фразы под темп речи, спокойный рассказ. Для
акцентного входа — `animata/spring-scale-in`.

## Фразы из озвучки

- «давайте по порядку»
- «одна мысль за другой»
- «спокойно и последовательно»

## Визуальный стиль

Мягкий, повествовательный; 700 мс на слово, stagger 70.

## Входные данные

`text?: string | string[]`, `enter?`, `exit?`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Спека: `per-word`; enter 700 / 70 /
`cubic-bezier(0.16,1,0.3,1)`, from `{opacity 0, yPx 8}`; exit 500 / 40, to
`{opacity 0, yPx −6}`; `microDelayMs 70`.

## Анимации

Stagger по словам: opacity + translateY.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/per-word-crossfade.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — WAAPI-runtime
- `templates/react-libriry/animata/content/docs/text/per-word-crossfade.mdx` — документация
- `templates/react-libriry/animata/animata/text/per-word-crossfade.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

Рецепт «TextAnimator → кадр» в `compatibility/animata-text-graphs-cards.md`;
stagger удобно выровнять по таймкодам слов озвучки.

## Паттерны

`sequence-steps`, `key-point-emphasis`
