# Lanyard — `react-bits/lanyard`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl`, `canvas`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

3D-бейдж (пропуск/ID-карта) на тканом ремешке с металлическим карабином,
который раскачивается на ветру, а при intro влетает и повисает; отделка
глянцевая, матовая, голографическая или металлик; лицевая и оборотная
стороны — ваши картинки.

## Когда использовать

Конференция, онбординг сотрудника, «ваш пропуск в продукт», бейдж участника,
персональная карточка спикера. Если нужна плоская карточка — `react-bits/profile-card`.

## Фразы из озвучки

- «Добро пожаловать в команду»
- «Это ваш пропуск на конференцию»
- «Регистрируйтесь и получайте бейдж участника»

## Визуальный стиль

Фотореалистичный 3D: студийное окружение (PMREM), clear-coat, голо-фольга
шейдером, тёмный ремешок `#111111`, белая карта; лёгкий бриз.

## Входные данные

`frontImage`, `backImage`, `imageFit='cover'` (`cover|contain`),
`cardColor='#ffffff'`, `orientation='portrait'` (`portrait|landscape`),
`finish='glossy'` (`glossy|matte|holographic|metallic`), `cornerRadius=0.3`,
`size=0.6`, `anchor='center'` (`left|center|right`), `strapLength=0.5`,
`strapImage`, `strapColor='#111111'`, `strapWidth=0.65`, `metal='silver'`
(`silver|gold|graphite`), `gravity=1`, `damping=0.5`, `elasticity=0.5`,
`breeze=0.5`, `interactive=true`, `intro=true`, `className`, `style`.

## Анимации

Собственная позиционная физика (verlet-подобная цепочка из 4 звеньев +
твёрдое тело карты, подшаги до 1/960 с), ветер — сумма синусов от времени;
drag/бросок/переворот кликом; рендер `THREE.WebGLRenderer` в цикле.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/Lanyard/Lanyard.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/Lanyard/Lanyard.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/Lanyard/Lanyard.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/LanyardDemo.jsx` — демо
- https://reactbits.dev/components/lanyard

## Зависимости

`three`.

## Совместимость и адаптация

`complex`: накопительная физика + императивный three-рендерер. Варианты:
(1) детерминированно прогонять симуляцию фиксированным шагом
`stepSimulation(sim, 1/fps, physics, frame/fps)` от кадра 0 до текущего
(дорого, но воспроизводимо) и рисовать в `useEffect` + `delayRender`;
(2) перенести сцену в `@remotion/three` и заменить физику на
`sin`-раскачку угла от кадра. Картинки грузятся `Image()` — ждать через
`delayRender`. Файл прочитан частично (физика, props, начало эффекта).

## Паттерны

`key-point-emphasis`, `spatial`
