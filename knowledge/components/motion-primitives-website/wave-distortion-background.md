# WaveDistortionBackground — `motion-primitives-website/wave-distortion-background`

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

Вертикальный двухцветный градиент, граница которого колышется тремя
синусоидальными волнами, с тонкими светлыми полосами-бликами.

## Когда использовать

Спокойный тёмный фон «волны», «поток», «океан данных», звук и музыка;
подложка под титры.

## Фразы из озвучки

- «на волне перемен»
- «поток идей не прекращается»
- «звук, который чувствуешь»

## Визуальный стиль

`#0f0f23 → #2d1b69` (тёмно-синий → фиолетовый); `waveFrequency` 10,
`waveAmplitude` 0.1; время ×0.5.

## Входные данные

`WaveDistortionBackgroundProps`: `color1?` (`'#0f0f23'`); `color2?`
(`'#2d1b69'`); `waveFrequency?` (10); `waveAmplitude?` (0.1); `className?`.

## Анимации

`uTime` из часов R3F; `gradient = uv.y + mean(sin(...))`, блики
`pow(|sin(gradient*10 + time)|, 8)*0.1`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/shader-backgrounds.tsx` — компонент

## Зависимости

`@react-three/fiber`, `three`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: `ThreeCanvas` + `uTime = frame/fps`. Шейдер настолько прост,
что его можно повторить и без WebGL — CSS-градиент/SVG с волной по
кадру, если не нужны блики.

## Паттерны

`abstract-concepts`, `timeline`
