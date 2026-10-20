# Hyperspeed — `react-bits/hyperspeed`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Полёт по ночной трассе: световые следы фар и стоп-сигналов машин, столбы,
пыль, отражения на дороге; трасса может петлять (`curve`). Удержание
указателя — «ускорение» (рост `fov` до `boostFov`).

## Когда использовать

Скорость, рост, «разгоняемся», переход к следующему этапу, интро продукта.
Не брать для спокойных тем.

## Фразы из озвучки

- «мы набираем скорость»
- «в десять раз быстрее, чем раньше»
- «дорога к цели уже открыта»

## Визуальный стиль

Неоновые розово-фиолетовые хвосты (`#d856bf`, `#6750a2`, `#c247ac`) и
голубые фары (`#03b3c3`, `#0e5ea5`, `#324555`), тёмная дорога, синтвейв.

## Входные данные

Из usage: `curve = 'winding'` (`straight|gentle|winding|hills|racing|deep`),
`curvature = 1`, `speed = 1`, `boost = 3`, `fov = 90`, `boostFov = 130`,
`lanes = 3`, `roadWidth = 10`, `medianWidth = 2`, `density = 40`,
`trailLength = 1`, `lightSize = 1`, `poles = 20`, `dust = 100`, `glow = 0.6`,
`reflections = 0.5`, `roadOpacity = 0.1`, `steer = 0.35`, `tailColors`,
`headColors`, `poleColors`, `interactive`. Остальное — PropTable демо.

## Анимации

three.js (императивно, `import * as THREE`), до 160 машин, 80 столбов,
1500 пылинок; движение по `TRAVEL = 400` в цикле рендера.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Hyperspeed/Hyperspeed.jsx` (+ `Hyperspeed.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Hyperspeed/Hyperspeed.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/HyperspeedDemo.jsx`

## Зависимости

`three`

## Совместимость и адаптация

`complex`: рецепт R2 — либо перенести сцену в `ThreeCanvas` из
`@remotion/three`, либо оставить императивный рендерер и вызывать
`renderer.render` из эффекта с временем `frame/fps`; «ускорение» задавать
по кадру вместо удержания указателя.

## Паттерны

`growth-decline`, `transformation`
