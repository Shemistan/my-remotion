# Aurora — `react-bits/aurora`

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

Полярное сияние: светящаяся «занавесь» из 1–3 слоёв, свисающая сверху (или
поднимающаяся снизу), с волнистым краем на simplex-шуме и плавным
градиентом из 2–5 цветов (смешивание в OKLCH).

## Когда использовать

Атмосферный фон под заголовок, интро, «вдохновляющий» кадр, смену темы.
Не брать, когда фон должен нести данные или когда нужна чёткая структура —
тогда сетки/линии (`react-bits/shape-grid`, `react-bits/waves`).

## Фразы из озвучки

- «представьте, что вы смотрите на северное небо»
- «новая эпоха начинается тихо»
- «всё меняется плавно, без резких скачков»

## Визуальный стиль

Мягкий, «премиальный», тёмный фон с неоновыми переливами; есть `lightMode`
(пастель для белого фона). Темп медленный.

## Входные данные

`colorStops = ['#5227FF','#7cff67','#5227FF']`, `amplitude = 1`,
`blend = 0.5`, `speed = 1`, `time` (без дефолта — внешние часы),
`height = 0.45`, `scale = 1`, `glow = 0.6`, `brightness = 1`, `layers = 1`
(1–3), `direction = 'top' | 'bottom'`, `mouseInteraction = true`,
`intro = true`, `opacity = 1`, `lightMode = false`, `paused = false`,
`dpr`, `className`, `style`.

## Анимации

Фрагментный шейдер WebGL2 (полноэкранный треугольник), `uTime` растёт в
rAF-цикле; если передан `time`, то `uTime = time * speed * 0.1`. Интро
(`uReveal`) — 2.4 с от монтирования; курсор слегка «притягивает» край.

```js
gl.uniform1f(u.uTime, s.time !== undefined ? s.time * s.speed * 0.1 : state.clock);
```

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Aurora/Aurora.jsx` (+ `Aurora.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Aurora/Aurora.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/AuroraDemo.jsx` — демо и PropTable

## Зависимости

`react`; сырой WebGL2 без библиотек.

## Совместимость и адаптация

`complex`, но один из самых простых случаев: есть prop `time`. Передать
`time={frame / fps}`, `paused`, `intro={false}`, `mouseInteraction={false}`
— после каждого рендера эффект без зависимостей вызывает `render()`.
Остальное — рецепт R1 в `compatibility/react-bits.md` (delayRender на
инициализацию контекста, `--gl=angle`).

## Паттерны

`abstract-concepts`, `transformation`
