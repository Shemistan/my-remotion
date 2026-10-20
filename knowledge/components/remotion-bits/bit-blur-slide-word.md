# Blur In (bit) — `remotion-bits/bit-blur-slide-word`

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

Фраза появляется по словам: каждое слово выплывает снизу на 40 px,
проявляется из прозрачности и одновременно теряет размытие (blur 10 → 0).

## Когда использовать

Заголовок сцены, слоган, главный тезис, который должен прозвучать мягко и
дорого. Если нужно резче, по буквам, бери `bit-char-by-char`; если
поспокойнее — `bit-word-by-word`.

## Фразы из озвучки

- «представляем новое поколение»
- «просто. быстро. красиво»
- «добро пожаловать в будущее»

## Визуальный стиль

Жирный шрифт, премиальный «кинематографичный» вход с размытием. Цвет и
размер приходят от родителя. 90 кадров, 1920×1080.

## Входные данные

Props нет. Текст «Text Transition». В `AnimatedText.transition`: `y [40,0]`,
`blur [10,0]`, `opacity [0,1]`, `split "word"`, `splitStagger 1`,
`easing "easeOutCubic"`. Длительность не задана, поэтому равна `fps`.

## Анимации

Вход по словам со stagger 1 кадр (пробелы тоже считаются фрагментами);
меняются translateY, opacity и `filter: blur`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/BlurSlideWord.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/blur-slide-word.mdx` — документация
- карточка компонента: `components/remotion-bits/animated-text.md`

## Зависимости

`remotion-bits` (`AnimatedText`); registry: `animated-text`.

## Совместимость и адаптация

`native`. Текст, шрифт и цвет вынести в props. Размытие (`blur`) на
длинных фразах в 4K замедляет рендер.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
