# ThoughtLine — `react-bits/thought-line`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `css-animation`, `timers`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Строка «Thinking…» как у AI-чатов: дышащая иконка-искра, переливающийся
текст, лента шагов рассуждения (`steps`), затем схлопывание в «Thought
for 4.2s» с галочкой.

## Когда использовать

Демо AI-ассистента/агента: «модель рассуждает», цепочка шагов, время
ответа. Хорошо в связке с `react-bits/status-mark`.

## Фразы из озвучки

- «ассистент сначала думает»
- «читает вопрос, ищет в заметках, пишет ответ»
- «на ответ ушло всего несколько секунд»

## Визуальный стиль

Нейтральный текст 16 px, shimmer по надписи, иконки hugeicons.

## Входные данные

`label = 'Thinking…'`, `doneLabel = ''`, `renderLabel`, `glyph = 'sparkle'`,
`steps = []`, `collapsible = true`, `collapseOnSettle = true`,
`color = 'currentColor'`, `glyphColor = ''`, `fontSize = 16`,
`breathPeriod = 1.6`, `breathDepth = 0.45`, `shimmer = true`,
`shimmerDuration = 1.8`, `settleDuration = 350`, `settleBlur = 2`,
`working = true`, `settleAfter = 0`, `elapsed`, `showTimer = true`,
`onSettle`, `className`, `style`.

## Анимации

`motion/react` `animate` для дыхания/схлопывания (ease
`[0.23, 1, 0.32, 1]`), shimmer — CSS (`shimmerDuration`), таймер; точные
механизмы таймера и смены шагов построчно не сверены.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Micro/ThoughtLine/ThoughtLine.jsx` (+ `ThoughtLine.css`)
- `templates/react-libriry/react-bits/src/ts-default/Micro/ThoughtLine/ThoughtLine.tsx`
- `templates/react-libriry/react-bits/src/demo/Micro/ThoughtLineDemo.jsx`

## Зависимости

`motion`, `@hugeicons/react`, `@hugeicons/core-free-icons`

## Совместимость и адаптация

`adaptable`: `working` и `elapsed` задавать по кадру; дыхание —
`opacity = 1 - depth * (0.5 - 0.5*cos(2π t / breathPeriod))`; shimmer —
рецепт R4; `motion` — R5.

## Паттерны

`sequence-steps`, `timeline`
