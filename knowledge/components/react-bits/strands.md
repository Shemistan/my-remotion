# Strands — `react-bits/strands`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

«Голос» ассистента: переплетённые светящиеся нити (до 8 цветов) в
стеклянной сфере/без неё, которые оживают при `listening` и реагируют на
громкость `level`.

## Когда использовать

AI-ассистент слушает/говорит, голосовой интерфейс, подкаст, «вас
слышат». `level` можно кормить амплитудой озвучки.

## Фразы из озвучки

- «просто скажите, что нужно»
- «ассистент уже слушает»
- «голос — новый интерфейс»

## Визуальный стиль

Стеклянный пузырь (`glass`), переливающиеся нити; без стекла — плоско.

## Входные данные

Из usage: без props (дефолты), `listening`, `level` (например уровень
микрофона), `glass = false`, `energy = 0.6`. Полный список — PropTable демо.

## Анимации

WebGL2-шейдер (`VERT`, до 8 цветов, 7 «ролей» нитей), движение по
времени в rAF, амплитуда от `level`/`listening`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/Strands/Strands.jsx` (+ `Strands.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/Strands/Strands.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/StrandsDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; `level` вычислять по кадру из аудио
(`useAudioData` + `visualizeAudio` из `@remotion/media-utils`). Если
`level` сглаживается внутри — сглаживание накопительное (R3).

## Паттерны

`abstract-concepts`, `key-point-emphasis`
