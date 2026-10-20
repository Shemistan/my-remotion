# PlasmaBackground — `motion-primitives-website/plasma-background`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Классическая демосценовая «плазма»: яркие перетекающие цветовые
разводы из суммы четырёх синусов, по кругу трёх цветов.

## Когда использовать

Энергичный яркий фон: музыка, вечеринка, ретро-демо, «энергия»,
«креатив»; короткие вставки — плазма быстро утомляет глаз.

## Фразы из озвучки

- «энергия бьёт ключом»
- «добро пожаловать на вечеринку»
- «креатив без границ»

## Визуальный стиль

`#ff006e → #8338ec → #3a86ff` (розовый, фиолетовый, синий), насыщенно;
время ×0.5.

## Входные данные

`PlasmaBackgroundProps`: `color1?` (`'#ff006e'`); `color2?`
(`'#8338ec'`); `color3?` (`'#3a86ff'`); `className?`.

## Анимации

`uTime` из часов R3F; `plasma = (v1+v2+v3+v4)/4`, кусочный mix трёх
цветов.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/shader-backgrounds.tsx` — компонент

## Зависимости

`@react-three/fiber`, `three`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: `ThreeCanvas` из `@remotion/three` + `uTime = frame/fps`
вместо `useFrame`/`clock`.

## Паттерны

`abstract-concepts`
