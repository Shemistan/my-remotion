# NoiseGradientBackground — `motion-primitives-website/noise-gradient-background`

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

Полноэкранный «живой» градиент из трёх цветов, перетекающих по
трёхслойному simplex-шуму (GLSL-шейдер на плоскости).

## Когда использовать

Премиальный абстрактный фон для интро, заголовков, продуктовых сцен —
мягкое движение цвета без конкретных форм.

## Фразы из озвучки

- «новая эра продукта»
- «плавно и естественно»
- «технологии, которые чувствуют»

## Визуальный стиль

Цвета по умолчанию `#4f46e5 → #7c3aed → #ec4899`; `noiseScale` 3,
`speed` 0.3 — медленный перелив.

## Входные данные

`NoiseGradientBackgroundProps`: `color1?`, `color2?`, `color3?`;
`noiseScale?` (3); `speed?` (0.3); `className?`.

## Анимации

R3F `useFrame(({clock}) => uTime = clock.getElapsedTime())`; во фрагментном
шейдере `snoise(uv*scale + time*0.5)` + 2 октавы, маппинг в 3 цвета.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/shader-backgrounds.tsx` — компонент (6 шейдерных фонов в одном файле)

## Зависимости

`@react-three/fiber` (`Canvas`, `useFrame`, `useThree`), `three`,
`@/lib/utils`.

## Совместимость и адаптация

`complex`: время берётся из часов WebGL-контекста. Рецепт (общий для
всех шейдерных фонов файла): `Canvas` → `ThreeCanvas` из
`@remotion/three` (с `width/height` из `useVideoConfig`), в меше вместо
`useFrame` — `const frame = useCurrentFrame(); material.uniforms.uTime.value = frame/fps`
(или передать `uTime` через `uniforms` в рендере). Шейдер — чистая
функция от `uTime`, детерминирован.

## Паттерны

`abstract-concepts`, `transformation`
