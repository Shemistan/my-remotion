# Правила оценки совместимости с Remotion

Remotion рендерит кадр за кадром: компонент получает номер кадра через
`useCurrentFrame()` и должен быть **чистой функцией от кадра**. Всё, что
живёт во времени браузера (CSS-анимации, таймеры, rAF, физика, движки),
в headless-рендере либо не двигается, либо даёт разный результат на разных
кадрах.

## Классификация

| Класс | Критерий | Что делать |
|---|---|---|
| `native` | использует `useCurrentFrame`/`interpolate`/`spring`/`Sequence` из `remotion` | брать как есть |
| `adaptable` | React + SVG/CSS-стили без собственного таймера; анимация через `motion`/CSS-transition **только на входе** | заменить анимацию на `interpolate(frame, …)`; стили, разметка и данные остаются |
| `complex` | анимация внутри Canvas/WebGL, через rAF/таймеры, физику, DOM-измерения или сложный движок (GSAP timelines, three.js loops) | переписать цикл обновления на кадр; для three.js — `@remotion/three`; иногда проще воспроизвести эффект с нуля |
| `unsuitable` | смысл компонента — интеракция (hover, drag, scroll, click), сетевые данные в рантайме, либо лицензия запрещает | не использовать; максимум — статичный скриншот |
| `unknown` | исходники недоступны/не прочитаны | указать, чего не хватает |

## Типовые адаптации

- **CSS `@keyframes`** → либо `interpolate(frame)` в inline-style, либо
  оставить keyframes и задать `animationDelay: -frame/fps + 's'` с
  `animationPlayState: 'paused'` — детерминированный способ «проиграть»
  CSS-анимацию в нужную точку.
- **`motion`/framer-motion** (`animate`, `whileInView`, `variants`) →
  заменить на вычисление стиля из кадра; `useInView`/`whileHover` убрать.
- **GSAP** → переписать timeline на `interpolate`; для сложных timeline
  можно `gsap.timeline({paused:true}).progress(frame/total)` внутри
  `useEffect` + `delayRender`, но это хрупко.
- **rAF/`setInterval`** → удалить; состояние вычислять из кадра.
- **Canvas** → рисовать в `useEffect` на каждый кадр, обернуть в
  `delayRender`/`continueRender`; детерминированный `random()` из remotion
  вместо `Math.random`.
- **three.js / R3F** → `@remotion/three` (`ThreeCanvas`), кадр → ротация.
- **Асинхронные данные/шрифты/картинки** → `delayRender` + `staticFile`,
  `@remotion/google-fonts`.
- **`Math.random`** → `random(seed)` из remotion, иначе кадры не сходятся.
- **Chart-библиотеки с встроенной анимацией** (Recharts `isAnimationActive`,
  ECharts `animation`, nivo `animate`) → выключить встроенную анимацию и
  анимировать **данные** (срез массива, умножение значений на прогресс)
  или обёртку (clip-path, scaleX) по кадру.

## Как фиксировать проверку

Файл `results.jsonl`, одна строка на проверку:

```json
{"id":"remotion-bits/animated-counter","date":"2026-10-20","remotion":"4.0.x","result":"ok|fail","how":"кратко: что собрали и отрендерили","notes":"что сломалось / что пришлось менять"}
```

После записи — поднять `verification` у соответствующей записи в
`components/<repo>/capabilities.jsonl` и пересобрать каталог.
