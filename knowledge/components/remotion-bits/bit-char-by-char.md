# Character by Character (bit) — `remotion-bits/bit-char-by-char`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Текст появляется по буквам: каждая буква вырастает из 0.7, поднимается на
15 px и проявляется; соседние буквы стартуют с разницей в 1 кадр, так что
по строке пробегает волна.

## Когда использовать

Короткие названия, имена, бренды, одно-два слова, которые нужно подать с
энергией. Длинную фразу лучше выводить по словам (`bit-word-by-word`), а
печать с курсором делать через `basic-typewriter`.

## Фразы из озвучки

- «встречайте — Remotion Bits»
- «его зовут Алекс»
- «одно слово: инновации»

## Визуальный стиль

Быстрый упругий вход по буквам, без размытия. Шрифт и цвет приходят от
родителя. 120 кадров, 1920×1080.

## Входные данные

Props нет. Текст «Character Animation». В `transition`: `opacity [0,1]`,
`scale [0.7,1]`, `y [15,0]`, `duration 10`, `split "character"`,
`splitStagger 1`, `easing "easeOutCubic"`.

## Анимации

Каждая буква анимируется 10 кадров со сдвигом старта на индекс буквы.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/CharByChar.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/char-by-char.mdx` — документация
- карточка компонента: `components/remotion-bits/animated-text.md`

## Зависимости

`remotion-bits` (`AnimatedText`).

## Совместимость и адаптация

`native`. Текст и стили вынести в props. Каждая буква рендерится отдельным
span, поэтому на очень длинном тексте узлов становится много.

## Паттерны

`key-point-emphasis`
