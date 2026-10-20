# ModelViewer — `react-bits/model-viewer`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl`, `raf`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Продуктовый 3D-просмотр модели (GLB/GLTF, FBX, OBJ): модель сама
кадрируется по габаритам, парит над мягкой контактной тенью, медленно
вращается; при появлении «поднимается» или «докручивается».

## Когда использовать

Показ физического продукта, гаджета, 3D-логотипа, упаковки: «вот так он
выглядит со всех сторон». Нужен файл модели.

## Фразы из озвучки

- «Посмотрите на устройство со всех сторон»
- «Вот наш новый продукт вживую»
- «Компактный корпус и продуманный дизайн»

## Визуальный стиль

Студийный свет (drei `Environment` preset `studio`), нейтральный tone mapping,
FOV 30, тень с прозрачностью 0.45, лёгкое покачивание (`float=0.3`).

## Входные данные

`url` (модель), `width=400`, `height=400`, `environment='studio'`,
`environmentIntensity=1`, `exposure=1`, `autoRotate=true`,
`autoRotateSpeed=0.4`, `autoRotateDelay=2`, `dragRotate=true`,
`turntable=false`, `zoom=true`, `minZoom=0.7`, `maxZoom=2`, `hoverTilt=0.15`,
`float=0.3`, `shadow=true`, `shadowOpacity=0.45`, `intro='rise'`
(`rise|spin|none`), `startAngle=-30`, `tilt=10`, `offsetX=0`, `offsetY=0`,
`fit=0.8`, `resetOnDoubleClick=true`, `className`, `style`,
`onModelLoaded`, `ref` (`capture()` → dataURL).

## Анимации

`useFrame` из R3F: intro 1,3 с с кубическим easing (`rise` — подъём и
масштаб, `spin` — докрутка), автоповорот с плавным разгоном после
`autoRotateDelay`, покачивание `sin(clock*1.3)*float*0.06`, инерция drag,
pinch/ctrl+wheel-зум; рендер по запросу (`invalidate`).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/ModelViewer/ModelViewer.jsx` — компонент
- `templates/react-libriry/react-bits/src/ts-default/Components/ModelViewer/ModelViewer.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/ModelViewerDemo.jsx` — демо
- https://reactbits.dev/components/model-viewer

## Зависимости

`three`, `@react-three/fiber`, `@react-three/drei` (`Environment`,
`ContactShadows`, `useGLTF`, `useFBX`), `OBJLoader`.

## Совместимость и адаптация

`complex`, но хорошо ложится на `@remotion/three`: заменить `<Canvas>` на
`ThreeCanvas`, а тело `useFrame` — расчётом от кадра: `intro = min(1, frame/(1.3*fps))`,
`yaw = startAngle + autoRotateSpeed * max(0, t - autoRotateDelay)` (без
разгона или с `interpolate`), `bob = sin(t*1.3)*float*0.06`. Загрузку модели
(`useGLTF`) и HDR-окружения drei (`Environment preset` тянет файл с CDN)
ждать через `delayRender`; модель и HDR положить в `public/` (`staticFile`).
Pointer-события убрать.

## Паттерны

`spatial`, `key-point-emphasis`
