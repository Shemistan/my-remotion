# LightPillar — `react-bits/light-pillar`

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

Вертикальный столб света с градиентом от верхнего к нижнему цвету,
медленно вращающийся, с bloom; клик — пульс.

## Когда использовать

Маяк, «точка опоры», телепорт, вертикальный рост, фокус на одном объекте.

## Фразы из озвучки

- «наш ориентир — клиент»
- «опора, на которой всё держится»
- «луч надежды»

## Визуальный стиль

Фиолетово-розовый столб (`#5227FF` → `#FF9FFC`), `mixBlendMode = 'screen'`.

## Входные данные

Из usage: `topColor = '#5227FF'`, `bottomColor = '#FF9FFC'`,
`intensity = 1`, `glowAmount = 0.002`, `bloom = 0.5`, `pillarWidth = 3`,
`pillarHeight = 0.4`, `pillarRotation = 25`, `rotationSpeed = 0.3`,
`interactive`, `clickPulse`, `intro`, `quality = 'high'`,
`mixBlendMode = 'screen'`.

## Анимации

WebGL2 (без библиотек), вращение по времени (rAF), интро, пульс от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/LightPillar/LightPillar.jsx` (+ `LightPillar.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/LightPillar/LightPillar.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LightPillarDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `interactive={false}`; `mixBlendMode` в Remotion
работает как обычный CSS.

## Паттерны

`key-point-emphasis`, `growth-decline`
