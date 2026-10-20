# MagicRings — `react-bits/magic-rings`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Концентрические светящиеся кольца-«портал», которые пульсируют по очереди,
расходятся от центра или дышат; цвет переходит от внутреннего к внешнему.

## Когда использовать

Центр притяжения: портал, сигнал, «волна распространяется», радар,
фокус на логотипе в центре кадра.

## Фразы из озвучки

- «сигнал расходится во все стороны»
- «открываем портал в новый мир»
- «эффект распространяется кругами»

## Визуальный стиль

Неоновые фиолетово-индиговые кольца (`#A855F7` → `#6366F1`), glow.

## Входные данные

`color = '#A855F7'`, `colorTwo = '#6366F1'`, `ringCount = 6` (1–12),
`motion = 'pulse'` (`pulse|ripple|breathe`), `speed = 1` (0 замораживает),
`lineThickness = 2`, `glow = 1`, `baseRadius = 0.35`, `radiusStep = 0.1`,
`expansion = 0.1`; в демо также `opacity`, `followMouse`, `mouseInfluence`,
`hoverScale`, `hoverIntensity`, `parallax`, `clickBurst`, `intro`.

## Анимации

Сырой WebGL2 (кольца по 128 сегментов, до 3 «вспышек» от клика), rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/MagicRings/MagicRings.jsx` (+ `MagicRings.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/MagicRings/MagicRings.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/MagicRingsDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; `followMouse={false}`, `clickBurst={false}`,
`parallax = 0`. Эффект простой — при необходимости проще повторить на SVG
с `interpolate` (кольца + `filter: blur`).

## Паттерны

`cause-effect`, `key-point-emphasis`
