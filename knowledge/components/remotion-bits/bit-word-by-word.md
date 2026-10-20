# Word by Word (bit) — `remotion-bits/bit-word-by-word`

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

Фраза появляется по словам: каждое слово поднимается на 20 px и
проявляется, соседние стартуют с разницей в 3 кадра.

## Когда использовать

Подача фразы в темпе речи диктора: субтитр-акцент, тезис, вопрос к
зрителю. Если нужен премиальный вход с размытием, бери
`bit-blur-slide-word`.

## Фразы из озвучки

- «давайте разберёмся, как это работает»
- «всё начинается с одного вопроса»
- «это изменит то, как вы работаете»

## Визуальный стиль

Спокойный читаемый вход без размытия. Шрифт и цвет приходят от родителя.
120 кадров, 1920×1080.

## Входные данные

Props нет. Текст «This appears word by word». В `transition`: `y [20,0]`,
`opacity [0,1]`, `split "word"`, `splitStagger 3`, `easing "easeOutQuad"`.
Длительность каждого слова равна `fps`.

## Анимации

Stagger по фрагментам (слова и пробелы), 3 кадра между соседними
фрагментами.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/animated-text/WordByWord.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/word-by-word.mdx` — документация
- карточка компонента: `components/remotion-bits/animated-text.md`

## Зависимости

`remotion-bits` (`AnimatedText`).

## Совместимость и адаптация

`native`. Текст вынести в props. Шаг между словами считается с пробелами
и фактически равен 6 кадрам; чтобы попасть в темп речи, подобрать
`splitStagger`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
