# TextPressure — `react-bits/text-pressure`

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

Крупное слово капсом во всю ширину контейнера на Roboto Flex: буквы
раздуваются по ширине, весу и наклону («давление») рядом с курсором,
по клику расходится кольцевая волна. Есть режимы простоя `idle='wave'`
(бегущая волна давления) и `idle='pulse'` (дыхание всего слова).

## Когда использовать

Заставка/титр с одним сильным словом, которое «пульсирует» — в видео
через режим `wave` или `pulse`. Не для длинных фраз: размер шрифта
подбирается как ширина / (длина / 2). Курсорную часть в ролике не
воспроизвести.

## Фразы из озвучки

- «давление растёт»
- «одно слово, которое всё объясняет»
- «рынок сжимается и разжимается»

## Визуальный стиль

Плакатный, кинетическая типографика; всё в одном цвете
`textColor`, опционально подкраска `pressureColor` и обводка `stroke`.

## Входные данные

`text='Compressa'`, `fontFamily='Roboto Flex'`, `fontUrl` (Google Fonts),
`width=true`, `weight=true`, `italic=true`, `alpha=false`, `flex=true`,
`stroke=false`, `scale=false`, `radius=0.5`, `smoothing=0.5`,
`idle='none'` (`none|wave|pulse`), `idleSpeed=1`, `clickRipple=true`,
`textColor='currentColor'`, `pressureColor=''`, `strokeColor='#FF0000'`,
`strokeWidth=3`, `className=''`, `minFontSize=24`.

## Анимации

rAF-цикл: давление 0…1 на букву = близость курсора, смешанная с
`getIdlePressure(mode, position, clock, spread)` (период волны 3.2 с,
пульса 2.8 с) и кольцами клика; давление → `'wght' 100–1000`,
`'wdth' 5–205`, `'ital' 0–1`, opacity, color-mix.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/TextPressure/TextPressure.jsx` — компонент (стили инлайн, `<style>` с `@import` шрифта)
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/TextPressure/TextPressure.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/TextPressureDemo.jsx` — демо
- https://reactbits.dev/text-animations/text-pressure

## Зависимости

`react`; вариативный шрифт с осями `wght`, `wdth`, `ital` (по умолчанию
Roboto Flex с fonts.googleapis.com).

## Совместимость и адаптация

`complex`: rAF, `getBoundingClientRect` букв каждый кадр,
`ResizeObserver`, `IntersectionObserver`, события окна. Рецепт для видео:
оставить разметку и `getIdlePressure`, `clock = frame / fps * idleSpeed`,
позицию буквы взять из индекса (`i / (n-1)`) вместо измерения, вычислять
`fontVariationSettings` прямо в рендере; курсор и ripple удалить; шрифт
через `@remotion/google-fonts` + `delayRender`.

## Паттерны

`key-point-emphasis`, `transformation`
