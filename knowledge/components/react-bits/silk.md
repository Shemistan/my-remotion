# Silk — `react-bits/silk`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Струящаяся шёлковая ткань: складки с рельефом, бликом (`sheen`), мягким
свечением (bloom через mip-уровни) и зерном. Один базовый цвет.

## Когда использовать

Дорогой спокойный фон для бренда, премиум-продукта, цитаты. Не брать для
«технологичных» тем — лучше сетки, линии, частицы.

## Фразы из озвучки

- «мягко, как шёлк»
- «премиальное качество в каждой детали»
- «плавный переход к новой коллекции»

## Визуальный стиль

Монохромная ткань (дефолт `#7B7481`), глянцевые гребни, тёмные впадины;
есть `lightMode`. Медленный поток.

## Входные данные

`speed = 5`, `scale = 1`, `color = '#7B7481'`, `sheenColor = '#ffffff'`,
`noiseIntensity = 1.5`, `rotation = 0`, `sheen = 0.5`, `depth = 0.5`,
`glow = 0.3`, `ripple = 1`, `wave = 1`, `variation = 0`,
`mouseInteraction = true`, `interactionStrength = 1`, `clickRipple = true`,
`intro = true`, `fade = 0`, `lightMode = false`, `paused = false`, `dpr`,
`className`, `style`.

## Анимации

Два прохода WebGL2 (поле в framebuffer для bloom + композит). Время
`state.flow += dt * 0.1 * speed` в rAF; интро 2.2 с «раскрывает» складки;
курсор тянет ткань, клик пускает кольцевую волну.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Silk/Silk.jsx` (+ `Silk.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Silk/Silk.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/SilkDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: prop `time` нет — время живёт в `state.flow`. Рецепт R1:
вынести `flow = frame / fps * 0.1 * speed` в prop/ref и вызывать `render()`
из эффекта на каждый кадр; `intro={false}`, `mouseInteraction={false}`,
`clickRipple={false}`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
