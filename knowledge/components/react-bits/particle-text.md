# ParticleText — `react-bits/particle-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `async-data`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Надпись, собранная из тысяч частиц (точки, квадраты или штрихи), которые
слетаются на место: из облака (`gather`), дождём сверху (`rain`), по спирали
или за сканирующей линией (`scan`). Движущиеся частицы подсвечиваются
акцентным цветом и свечением; потом слегка дрейфуют.

## Когда использовать

Интро бренда, «из хаоса рождается порядок», данные складываются в смысл,
AI/тех-заставки. Для текста без частиц — `react-bits/split-text`.

## Фразы из озвучки

- «Из тысяч сигналов складывается одна картина»
- «Данные превращаются в решение»
- «Встречайте — новый бренд»

## Визуальный стиль

Цвет частиц `currentColor`, акцент `#ff5a36`, мягкий glow; размер 2px,
шаг выборки 4px; сборка 1,6 с со stagger 0,42 с — эффектно и «технологично».

## Входные данные

`text='React Bits'`, `particleSize=2`, `density=4`, `color='currentColor'`,
`highlightColor='#ff5a36'`, `highlightMode='motion'` (`motion|gradient`),
`shape='circle'` (`circle|square|line`), `intro='gather'`
(`gather|rain|spiral|scan`), `scatter=180`, `gatherDuration=1600`, `stagger=420`,
`clickBurst=true`, `burstStrength=1`, `pointerRepel=40`, `repelRadius=120`,
`idleDrift=0.7`, `trigger='mount'` (`mount|hover|click`),
`fontSize='clamp(3rem, 12vw, 8rem)'`, `fontWeight=800`, `fontFamily='inherit'`,
`glow=true`, `className`, `style`.

## Анимации

Текст растеризуется в offscreen-canvas, непрозрачные пиксели → цели частиц
(до ~5200). Положение-«цель» на интро — чистая функция времени
(`delay = seed*stagger`, easeOutCubic / spiral / rain), но фактическая позиция
догоняет цель экспоненциальным сглаживанием (`follow`), взрыв по клику —
пружинная интеграция скоростей. Рисование батчами по тонам в 2D-canvas.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/ParticleText/ParticleText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/ParticleText/ParticleText.css` — контейнер
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/ParticleText/ParticleText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ParticleTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/particle-text

## Зависимости

Нет внешних пакетов (Canvas 2D).

## Совместимость и адаптация

`complex`: canvas-цикл с накапливаемым состоянием, асинхронная растеризация
(`document.fonts.load`). Путь: в `useEffect` по кадру вызывать отрисовку с
`now = frame/fps*1000`, принудительно `follow = 1` (позиция = цель — интро
становится чистой функцией кадра), выключить `idleDrift`-ветку от
`performance.now`, burst и repel; выборку текста делать под `delayRender` /
`continueRender`. Сиды частиц уже детерминированы (без `Math.random`).

## Паттерны

`transformation`, `abstract-concepts`, `key-point-emphasis`
