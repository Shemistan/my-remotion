# VariableProximity — `react-bits/variable-proximity`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `raf`, `dom`, `user-events`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Строка текста на вариативном шрифте (Roboto Flex), буквы которой
«набухают» по осям `font-variation-settings` (вес, оптический размер),
меняют цвет, растут и приподнимаются рядом с курсором. Опционально —
волна жирности, бегущая по строке, пока курсора нет (`idleWave`).

## Когда использовать

В видео — только режим `idleWave`: бегущая волна жирности по заголовку
как «живой» акцент на ключевой фразе. Сам смысл компонента — близость
курсора; без него нужен перенос формулы волны на кадр. Для простого
появления текста лучше `split-text`/`blur-text`.

## Фразы из озвучки

- «главное слово здесь — гибкость»
- «текст буквально дышит»
- «посмотрите, как меняется акцент»

## Визуальный стиль

Типографический, редакционный: плавная пульсация толщины букв без
смещения строки; цвета через `color-mix(in oklab)`.

## Входные данные

`label=''`, `fromFontVariationSettings="'wght' 400, 'opsz' 9"`,
`toFontVariationSettings="'wght' 1000, 'opsz' 40"`, `containerRef`,
`radius=50`, `falloff='linear'` (`linear|exponential|gaussian`),
`smoothing=0.2`, `fromColor?`, `toColor?`, `scale=1`, `lift=0`,
`idleWave=false`, `fontSize?`, `className=''`, `onClick?`, `style?`.

## Анимации

rAF-цикл `tick`: уровень каждой буквы 0…1 = сила по расстоянию до курсора
либо `waveAt(index, time)` (период `WAVE_PERIOD = 3.2` c, пик 0.7) при
простое; уровень интерполирует оси шрифта, цвет и `translateY/scale`.
Сглаживание экспонентой по `delta` — зависит от реального времени.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/VariableProximity/VariableProximity.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/VariableProximity/VariableProximity.css` — шрифт Roboto Flex через Google Fonts `@import`
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/VariableProximity/VariableProximity.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/VariableProximityDemo.jsx` — демо
- https://reactbits.dev/text-animations/variable-proximity

## Зависимости

`react`; вариативный шрифт с осями `wght`/`opsz` (CSS грузит Roboto Flex
с fonts.googleapis.com).

## Совместимость и адаптация

`complex`: всё движение в rAF, `getBoundingClientRect` каждой буквы,
глобальные `mousemove/scroll/resize`, `IntersectionObserver`. Для видео:
выбросить обработчики курсора, уровень буквы считать как
`waveAt(index, frame / fps)` (якоря — измерить один раз в
`useLayoutEffect`), писать `fontVariationSettings` в style при рендере;
шрифт загрузить через `@remotion/google-fonts` + `delayRender`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
