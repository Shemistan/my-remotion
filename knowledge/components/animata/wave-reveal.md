# WaveReveal — `animata/wave-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст проявляется «волной» по буквам или словам: каждый элемент выезжает
сверху или снизу (80 % высоты) из размытия (WWDC-стиль), задержка 50 мс
на шаг.

## Когда использовать

Заголовки разделов, названия, титры «одной волной». Используется внутри
`animata/slack-intro` и `animata/hero-section`.

## Фразы из озвучки

- «встречайте — …»
- «новая эра»
- «поговорим о главном»

## Визуальный стиль

`text-4xl md:text-7xl font-medium`, центрирование, `flex-wrap`; blur по
умолчанию включён.

## Входные данные

`WaveRevealProps`: `text: string`, `direction?: "up" | "down"` (`"down"`),
`mode?: "letter" | "word"` (`"letter"`), `duration?: string` (`"2000ms"`),
`delay?: number` (0, мс), `blur?: boolean` (true), `letterClassName?`,
`className?`.

## Анимации

Tailwind `animate-[reveal-down]` / `animate-[reveal-up]` (+ `content-blur`)
с `fill-mode-forwards`; `animationDelay = delay + (index+offset)*50 ms`;
keyframes `reveal-up/down` (`opacity 0, translateY(±80%) → 0`) и
`content-blur` (`blur(0.3rem) → 0`) в `styles/globals.css`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/wave-reveal.tsx` — компонент
- `templates/react-libriry/animata/styles/globals.css` — keyframes `reveal-up`, `reveal-down`, `content-blur`
- `templates/react-libriry/animata/content/docs/text/wave-reveal.mdx` — документация
- `templates/react-libriry/animata/animata/text/wave-reveal.stories.tsx` — пример

## Зависимости

Tailwind v4 + `tw-animate-css` (`fill-mode-forwards`), `@/lib/utils`.

## Совместимость и адаптация

Для элемента k: `t = clamp((frameMs − delay − k*50)/durationMs)` →
`opacity = t`, `translateY = (1−t)·(±80%)`, `blur = 0.3rem·(1−t)` inline; либо
оставить keyframes, задать `animationDelay` отрицательным от кадра и
`animationPlayState: paused`.

## Паттерны

`key-point-emphasis`, `sequence-steps`
