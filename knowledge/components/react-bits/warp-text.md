# WarpText — `react-bits/warp-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `canvas`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Крупный заголовок, нарисованный в WebGL-текстуру и «плывущий»: шумовое
искажение (fbm), линза под курсором (bulge/pinch/swirl) с рябью, ударная
волна по клику, хроматическое расслоение; интро — текст проявляется из
сильного искажения.

## Когда использовать

Абстрактные, «жидкие» темы: время, сознание, искажение реальности,
креативный тизер. Если нужен только мягкий вход без шейдера — `react-bits/blur-text`.

## Фразы из озвучки

- «Реальность начинает плыть»
- «Время будто искривляется»
- «Посмотрим на привычное под другим углом»

## Визуальный стиль

Жирный (800) плотный кегль `clamp(3rem, 10vw, 9rem)`, трекинг -0.06em;
медленное органичное колыхание; цвет `currentColor`, тёмная/светлая подложка
выбирается по яркости.

## Входные данные

`text='Bend the moment'`, `color='currentColor'`, `warpStrength=0.08`,
`warpScale=1.7`, `speed=0.55`, `pointerInfluence=0.42`, `pointerStrength=0.38`,
`refraction=0.018`, `chromatic=0`, `ripple=true`, `clickRipple=true`,
`idleDrift=0.2`, `lens='bulge'` (`bulge|pinch|swirl`), `intro=true`,
`fontSize='clamp(3rem, 10vw, 9rem)'`, `fontWeight=800`, `fontFamily='inherit'`,
`letterSpacing='-0.06em'`, `lineHeight=0.9`, `className`, `style`.

## Анимации

Фрагментный шейдер (`ogl`: `Renderer`, `Program`, `Triangle`, `Texture`) с
uniform-ами `uTime`, `uIntro`, `uReveal`, `uPointer`, `uClicks[4]`; текст
растеризуется в 2D-canvas после `document.fonts.ready`; rAF-цикл продвигает
время, интро (1,6 с) и сглаживает указатель; при уходе курсора линза может
бродить сама (`idleDrift`).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/WarpText/WarpText.jsx` — компонент и шейдер
- `templates/react-libriry/react-bits/src/content/TextAnimations/WarpText/WarpText.css` — контейнер
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/WarpText/WarpText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/WarpTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/warp-text

## Зависимости

`ogl` (WebGL2).

## Совместимость и адаптация

`complex`: WebGL-цикл. Путь: оставить шейдер, но каждый кадр выставлять
`uTime = frame/fps`, `uIntro/uReveal` из `interpolate(frame, [0, 1.6*fps], …)`,
`uPointerActive = 0` (или вести «линзу» по заданной траектории), затем
`renderer.render` синхронно в `useEffect` по `frame`; растеризацию текста —
под `delayRender`. Нужен `gl` с WebGL2 в рендере Remotion (`--gl=angle`).

## Паттерны

`abstract-concepts`, `transformation`
