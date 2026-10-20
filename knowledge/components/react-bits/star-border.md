# StarBorder — `react-bits/star-border`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Кнопка/плашка (по умолчанию `<button>`), по контуру которой бежит
светящаяся «звезда» со шлейфом (1–6 звёзд), с опциональными искрами.

## Когда использовать

Подсветить CTA, тариф, ключевую карточку: «нажмите здесь», «главное
предложение». Не брать как фон.

## Фразы из озвучки

- «начните прямо сейчас»
- «обратите внимание на этот вариант»
- «одна кнопка — и всё готово»

## Визуальный стиль

Тёмная плашка `#0c0c0f` (или светлая тема), белая звезда, радиус 12.

## Входные данные

`as = 'button'`, `children`, `className`, `style`, `color`, `trailColor`,
`duration = 4` (с на круг), `thickness = 1`, `radius = 12`,
`trailLength = 0.3`, `stars = 1` (1–6), `glow = 0.6`, `sparkle = false`,
`direction = 'clockwise'`, `hover = 'lap'` (`lap|brighten|reveal|none`),
`clickPulse = true`, `theme = 'dark'`, `backgroundColor`, `textColor`,
`borderColor`.

## Анимации

Canvas 2D поверх контура (`BLEED = 48`), фаза звезды растёт в rAF
(`duration` на круг), hover ускоряет круг (`LAP`), клик — пульс.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/StarBorder/StarBorder.jsx` (+ `StarBorder.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/StarBorder/StarBorder.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/StarBorderDemo.jsx`

## Зависимости

`react`; Canvas 2D.

## Совместимость и адаптация

`complex` (canvas + rAF), но просто: рецепт R3 — `phase = frame / (fps *
duration)`, рисовать в эффекте на кадр; `hover = 'none'`,
`clickPulse = false`. Искры (`sparkle`) — проверить на `Math.random`.

## Паттерны

`key-point-emphasis`
