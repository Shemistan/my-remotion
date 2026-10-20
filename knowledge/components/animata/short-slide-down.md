# ShortSlideDown — `animata/short-slide-down`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `timers`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Вертикальная кинетика: каждое новое слово падает сверху (−28px) и
сталкивает стопку, пока три строки не встанут по центру; уход — вниз с blur.

## Когда использовать

Слоган/перечень из 2–4 слов столбиком, «сверху вниз». Горизонтальный
аналог — `animata/kinetic-center-build`.

## Фразы из озвучки

- «складываем по кирпичику»
- «три шага: собрать, проверить, запустить»
- «список растёт»

## Визуальный стиль

Кинетичный; стопка `h-[132px] w-[min(92%,270px)]` из `text-animator.css`.

## Входные данные

`ShortSlideDownProps`: `phrases?: string[][]` (по умолчанию
`[["Lands","top","first"],["Stacks","into","place"],["Drops","line","gently"]]`),
`build?: Partial<TextAnimationBuildSpec>`, `speed?`, `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Базовый `build`: `firstWordDurationMs 360`,
`pushDurationMs 500`, `exitDurationMs 320`, `holdMs 1100`, `betweenPhrasesMs
180`, `entryOffsetYPx −28`, `lineGapPx 12`, `firstWordYPx −14`, `entryBlurPx
2.4`, `reflowBlurPx 0.7`, `exitYPx 10`, `exitBlurPx 1.2`.

## Анимации

Push-цепочка по вертикали: старые слова смещаются к новым центрам, новое
входит сверху; выход вниз с blur.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/short-slide-down.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — `runKineticTopBuildLoop`
- `templates/react-libriry/animata/content/docs/text/short-slide-down.mdx` — документация
- `templates/react-libriry/animata/animata/text/short-slide-down.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: высоты слов из `offsetHeight` в живом DOM, цепочка WAAPI + таймеры.
Как у `kinetic-center-build`: измерить один раз, фазы и позиции считать из
`frame`.

## Паттерны

`sequence-steps`, `key-point-emphasis`
