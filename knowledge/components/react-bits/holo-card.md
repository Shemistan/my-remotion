# HoloCard — `react-bits/holo-card`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `canvas`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Коллекционная карточка (63×88) с голографической фольгой поверх
изображения: восемь узоров фольги, блёстки по рамке, блик; карточка
наклоняется в 3D, при простое плавно «дышит», по клику переворачивается
на оборот.

## Когда использовать

Редкий предмет, награда, «легендарная» фича, коллекция, NFT-подобная
витрина, карточка игрока. Для профиля человека — `react-bits/profile-card`.

## Фразы из озвучки

- «Вам выпала редкая карта»
- «Это наша лимитированная коллекция»
- «Лучший игрок сезона»

## Визуальный стиль

Яркий, игровой; радужная фольга (`bursts|stars|shards|cosmos|rainbow|swirl|glitter|gold`),
серебристый цвет фольги `#e2e6ec`, ширина 320 px, радиус 14, мягкая тень.

## Входные данные

`image`, `backImage`, `alt=''`, `preset='bursts'`, `intensity=0.85`,
`scale=1`, `edgeSparkle=0.8`, `frame=4`, `glare=0.5`, `foilColor='#e2e6ec'`,
`width=320`, `radius=14`, `tiltMax=14`, `hoverScale=1.04`, `idle=true`,
`shadow=true`, `className`, `style`.

## Анимации

WebGL2-фрагментный шейдер рисует фольгу от uniform-ов `uTilt`/`uLight`;
rAF ведёт пружины наклона/света/подъёма/переворота; в режиме `idle` цели —
синусы от внутренних часов (`clock` стартует с `Math.random()*40`);
поворот DOM-ротора — `transform: perspective rotateX/rotateY`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/HoloCard/HoloCard.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/HoloCard/HoloCard.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/HoloCard/HoloCard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/HoloCardDemo.jsx` — демо
- https://reactbits.dev/components/holo-card

## Зависимости

Нет внешних пакетов (сырой WebGL2).

## Совместимость и адаптация

`complex` (WebGL). Рецепт idle-режима: `t = frame/fps + seed`,
`tiltX = sin(t*0.7)*tiltMax*0.28`, `tiltY = sin(t*0.53+1.2)*tiltMax*0.4`,
`light = (0.5+sin(t*0.41)*0.42, 0.38+sin(t*0.33+0.6)*0.3)` — напрямую, без
пружин; в `useEffect` на каждый кадр выставить uniform-ы и вызвать `draw()`,
текстуру изображения загрузить под `delayRender`. Ротор — тот же transform
в рендере. Pointer-события и флип по клику убрать (флип можно анимировать
`turn = interpolate(...)` 0→180).

## Паттерны

`key-point-emphasis`
