# Waves — `react-bits/waves`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Частокол тонких параллельных линий, изгибаемых полем Perlin-шума, — как
рельеф или звуковая волна; курсор раздвигает линии, клик пускает рябь.

## Когда использовать

Минималистичный фон: звук, сигнал, ритм, «волна изменений». Хорош под
крупный текст.

## Фразы из озвучки

- «слышите этот ритм?»
- «волна интереса прокатилась по рынку»
- «сигнал усиливается»

## Визуальный стиль

Белые линии на тёмном (`lineColor = '#ffffff'`), сплошные или пунктир
(`STYLES = solid|dashed`), плавный дрейф.

## Входные данные

Из usage: `lineColor = '#ffffff'`, `spacing = 10`, `amplitude = 32`,
`twist = 1`, `speed = 1`, `mouseRadius = 175`, `mouseStrength = 1`.
Остальные (стиль линий, интро) — PropTable демо.

## Анимации

Сырой WebGL2: вершинный шейдер с Perlin (`uDrift`, `uFrequency`, `uSeed`),
поле ряби в текстуре `uField`, интро 2.2 с (`uReveal`), rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Waves/Waves.jsx` (+ `Waves.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Waves/Waves.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/WavesDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; рябь от клика — накопительное поле, без указателя
не нужна (`mouseStrength = 0`).

## Паттерны

`abstract-concepts`, `growth-decline`
