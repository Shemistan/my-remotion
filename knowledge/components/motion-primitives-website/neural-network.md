# NeuralNetwork — `motion-primitives-website/neural-network`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl`, `timers`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

3D-нейросеть: ~96 светящихся нейронов в 7 слоях-кольцах, изогнутые
синапсы между слоями; случайные нейроны «вспыхивают», импульсы бегут по
связям и зажигают следующие, расходятся кольца-волны, вокруг — облако
частиц и каркасная сфера-поле.

## Когда использовать

ИИ, машинное обучение, «как думает модель», мозг, сигналы в системе;
эффектная 3D-сцена для объяснения нейросетей.

## Фразы из озвучки

- «так работает нейронная сеть»
- «сигнал проходит через слои модели»
- «модель учится на данных»

## Визуальный стиль

Пресеты `mind` (фиолетовый/розовый/бирюзовый на `#0F0F1A`), `synapse`,
`dream`, `electric`, `void`; туман, `AdditiveBlending`, emissive-сферы.

## Входные данные

`NeuralNetworkProps`: `preset?: 'mind'|'synapse'|'dream'|'electric'|'void'`
(`'mind'`); `onActivity?: (level: number) => void`; `className?`.

## Анимации

Состояние-симуляция: `setInterval(800 мс)` активирует случайный нейрон;
`useFrame(delta)` гасит активации, двигает импульсы, волны, эхо;
клики/hover по нейронам; `Float`, `OrbitControls autoRotate`;
позиции и связи — `Math.random`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/three/neural-network.tsx` — компонент

## Зависимости

`@react-three/fiber`, `@react-three/drei` (`OrbitControls`, `Float`,
`Line`), `three`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: стохастическая симуляция с накопленным состоянием, таймер,
интерактив. Переработка: генерацию сети на `random(seed)`; заранее
(вне рендера) просчитать расписание вспышек и импульсов по кадрам
(детерминированная симуляция с фиксированным шагом `1/fps` от кадра 0)
и в рендере брать состояние для `useCurrentFrame()`; `ThreeCanvas`
(`@remotion/three`), камеру вращать формулой от кадра вместо
`OrbitControls`, `Float` — синусоидой.

## Паттерны

`system-structure`, `relationships`, `cause-effect`
