# FaultyTerminal — `react-bits/faulty-terminal`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Экран неисправного ЭЛТ-терминала: поле пиксельных глифов (блоки, точки,
символы из встроенного 5×5 шрифта), мерцание, послесвечение, кривизна
экрана, виньетка; клик — глитч или «размагничивание».

## Когда использовать

Ретро-хакер, сбой, legacy-системы, «старый мир», киберпанк.

## Фразы из озвучки

- «старая система больше не справляется»
- «в коде что-то пошло не так»
- «добро пожаловать в восьмидесятые»

## Визуальный стиль

Зелёный фосфор (`tint = '#A7EF9E'`), scanline-эстетика, кривизна 0.1.

## Входные данные

Из usage: `tint = '#A7EF9E'`, `glyphs = 'blocks'` (`blocks|dots|characters`),
`scale = 1.5`, `digitSize = 1.2`, `timeScale = 0.5`, `brightness = 0.75`,
`glow = 0.5`, `persistence = 0.5`, `mouseStrength = 0.5`, `mouseGlow = 0.6`,
`curvature = 0.1`, `vignette = 0.25`, `clickEffect = 'glitch'`
(`none|glitch|degauss`).

## Анимации

Сырой WebGL2: паттерн `noise(p)` по времени, интро 2 с, эффекты клика
0.7/1.6 с; послесвечение `persistence` (накопление между кадрами).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/FaultyTerminal/FaultyTerminal.jsx` (+ `FaultyTerminal.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/FaultyTerminal/FaultyTerminal.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/FaultyTerminalDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; `persistence = 0` (иначе результат зависит от
предыдущих кадров), `clickEffect = 'none'`, `mouseStrength = 0`.

## Паттерны

`abstract-concepts`, `transformation`
