# LetterGlitch — `react-bits/letter-glitch`

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

Стена моноширинных символов (буквы, цифры, знаки), которые «глитчат»:
меняются и вспыхивают цветами палитры, по полю идёт шумовой поток
яркости; клик «рвёт» сетку (`clickEffect = 'tear'`).

## Когда использовать

Хакерская/кибер-эстетика: взлом, данные, шифрование, «матрица», баги.

## Фразы из озвучки

- «система взломана»
- «за этим потоком данных скрывается закономерность»
- «код, который пишет сам себя»

## Визуальный стиль

Белые и зелёные (`#ffffff`, `#61dca3`) вспышки на тёмном, моноширинный
шрифт (`ui-monospace, 'SF Mono', …`); в светлой теме `#18181b`/`#0f9f6e`.

## Входные данные

Из usage: `glitchColors = ['#ffffff', '#61dca3']`, `glitchAmount = 0.5`,
`speed = 1`, `flow = 0.5`, `clickEffect = 'tear'`. Набор символов по
умолчанию `DEFAULT_CHARACTERS` (A–Z, цифры, знаки). Остальное — PropTable
демо.

## Анимации

WebGL2: атлас глифов + текстура состояния ячеек `uState` (глиф, яркость,
«нагрев», цвет), обновляемая на CPU в rAF; мерцание `sin(uTime·…)`, поток
`noise(p + uTime·…)`, интро 1.4 с, курсор подсвечивает область.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/LetterGlitch/LetterGlitch.jsx` (+ `LetterGlitch.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/LetterGlitch/LetterGlitch.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LetterGlitchDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1 + R3 — состояние ячеек накапливается на CPU; смену
глифов сделать детерминированной функцией (`random(seed + cell + step)`,
`step = floor(frame / k)`), клики выключить. Нужен шрифт до рендера
(`delayRender` на `document.fonts.ready`).

## Паттерны

`abstract-concepts`, `transformation`
