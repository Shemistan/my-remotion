# GlitchBackground — `motion-primitives-website/glitch-background`

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

Тёмный градиентный фон со сканлайнами, лёгким шумом и редкими
горизонтальными срывами строк с хроматической аберрацией — «сломанный
монитор».

## Когда использовать

Киберпанк, хакерская тема, «сбой системы», ретро-CRT; фон под
`text-scramble` или `neon-text`.

## Фразы из озвучки

- «система взломана»
- «сигнал теряется»
- «добро пожаловать в матрицу»

## Визуальный стиль

`#0a0a0a → #1a1a2e`; сканлайны `sin(uv.y*400)*0.04`, шум 0.05; срыв —
2 % строк, 10 раз в секунду.

## Входные данные

`GlitchBackgroundProps`: `color1?` (`'#0a0a0a'`); `color2?`
(`'#1a1a2e'`); `intensity?` (0.5); `className?`.

## Анимации

`uTime` из часов R3F; псевдослучайность в шейдере
(`fract(sin(dot(...)))`) от `floor(time*10)` и `floor(time*20)` —
детерминирована при одинаковом `uTime`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/backgrounds/shader-backgrounds.tsx` — компонент

## Зависимости

`@react-three/fiber`, `three`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: `ThreeCanvas` из `@remotion/three` + `uTime = frame/fps`; шум
в шейдере от времени, поэтому кадры воспроизводимы.

## Паттерны

`cause-effect`, `abstract-concepts`
