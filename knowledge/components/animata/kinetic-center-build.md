# KineticCenterBuild — `animata/kinetic-center-build`

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

Фраза строится по одному слову: каждое новое слово въезжает справа (88px)
и «расталкивает» строку, пока фраза не встанет по центру; затем слова уходят
вверх с blur.

## Когда использовать

Кинетическая типографика под ритм озвучки: «быстро. просто. надёжно.»,
слоган из 2–4 слов. Вертикальный вариант — `animata/short-slide-down`.

## Фразы из озвучки

- «быстро, просто, надёжно»
- «три слова о продукте»
- «шаг за шагом складывается картина»

## Визуальный стиль

Кинетичный, моушн-дизайн; строка `h-[72px] w-[min(92%,270px)]` из
`text-animator.css` — для видео размеры менять.

## Входные данные

`KineticCenterBuildProps`: `phrases?: string[][]` (по умолчанию
`[["Each","word","arrives"],["Center","holds","still"],["Builds","one","line"]]`),
`build?: Partial<TextAnimationBuildSpec>`, `speed?` (0.72), `holdMs?`, `gapMs?`,
`yTravel?`, `className?`. Базовый `build`: `firstWordDurationMs 340`,
`pushDurationMs 430`, `entryOffsetPx 88`, `wordGapPx 10`, `firstWordYPx 6`,
`entryScale 0.992`, `entryBlurPx 3.5`, `reflowBlurPx 0.8`, `exitYPx −6`,
`exitBlurPx 2.5`, easing `cubic-bezier(0.2,0.8,0.2,1)`; hold в runtime
`build.holdMs ?? 980`, между фразами 220 (оба × speed).

## Анимации

Для каждого нового слова: сдвиг всех предыдущих к новым центрам (с
лёгким reflow-blur) + въезд нового справа; выход — вверх с blur.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/kinetic-center-build.tsx` — пресет
- `templates/react-libriry/animata/animata/text/text-animator.tsx` — `runKineticCenterBuildLoop`
- `templates/react-libriry/animata/content/docs/text/kinetic-center-build.mdx` — документация
- `templates/react-libriry/animata/animata/text/kinetic-center-build.stories.tsx` — пример

## Зависимости

`react`, `@/animata/text/text-animator` (+ `text-animator.css`), `@/lib/utils`.

## Совместимость и адаптация

`complex`: позиции слов считаются из `offsetWidth` каждого слова в живом DOM
после вставки, анимация — цепочка WAAPI + `await` + `setTimeout`. Для кадра:
измерить ширины один раз (`useLayoutEffect` + `delayRender`, либо
`measureText` из `@remotion/layout-utils`), затем позиции и фазы
(firstWord/push/hold/exit) вычислять из `frame`.

## Паттерны

`sequence-steps`, `key-point-emphasis`
