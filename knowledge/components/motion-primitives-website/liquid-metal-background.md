# LiquidMetalBackground — `motion-primitives-website/liquid-metal-background`

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

Тёмная «жидкая ртуть»: волнистая поверхность с бликами (specular) и
френелевским свечением по краям волн, медленно переливается.

## Когда использовать

Премиальный/хай-тек фон: металл, производство, «сплав технологий»,
люкс-продукт, тёмная тема.

## Фразы из озвучки

- «прочность и надёжность»
- «сплав технологий и дизайна»
- «премиальное качество»

## Визуальный стиль

Базовый цвет `#1a1a2e`, отражения белые, френель голубоватый
`(0.8, 0.9, 1.0)`; время ×0.3.

## Входные данные

`LiquidMetalBackgroundProps`: `color?` (`'#1a1a2e'`); `reflectivity?`
(0.8); `className?`.

## Анимации

`uTime` из `clock.getElapsedTime()`; в шейдере `snoise` → псевдонормали →
specular (`pow(…, 32)`) и fresnel.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/shader-backgrounds.tsx` — компонент

## Зависимости

`@react-three/fiber`, `three`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: как у `noise-gradient-background` — `ThreeCanvas` из
`@remotion/three`, `uTime = frame/fps` из `useCurrentFrame` вместо
`useFrame`/`clock`.

## Паттерны

`abstract-concepts`
