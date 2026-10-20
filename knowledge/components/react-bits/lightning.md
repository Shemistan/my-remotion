# Lightning — `react-bits/lightning`

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

Мерцающая молния (1–4 разряда) с ветвлением и свечением; клик вызывает
отдельный удар (до 4 одновременно, жизнь 1.3 с).

## Когда использовать

Озарение, мощь, внезапность, «молниеносно», энергия, шторм на рынке.

## Фразы из озвучки

- «и тут нас осенило»
- «молниеносная скорость»
- «мощность, которую невозможно игнорировать»

## Визуальный стиль

Электрический синий (`#4d6bff`) на тёмном, яркий glow, мерцание.

## Входные данные

`color = '#4d6bff'`, `bolts = 1`, `spread = 0.6`, `branches = 0.5`,
`xOffset = 0`, `angle = 0`, `size = 1`, `thickness = 1`, `glow = 1`,
`intensity = 1`, `speed = 1`, `flicker = 0.6`, `mouseInteraction = true`,
`mouseStrength = 1`, `clickStrike = true`, `intro = true`, `fade = 0`,
`opacity = 1`, `lightMode = false` (по usage-примеру).

## Анимации

Сырой WebGL2: форма разряда и мерцание от времени (rAF), лидер удара
`LEADER = 0.11`, жизнь удара `LIFE = 1.3`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Lightning/Lightning.jsx` (+ `Lightning.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Lightning/Lightning.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LightningDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; `clickStrike={false}`, удар под ключевую фразу —
программно по кадру (хранить время удара в props).

## Паттерны

`key-point-emphasis`, `cause-effect`
