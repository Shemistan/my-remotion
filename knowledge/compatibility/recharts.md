# Recharts — совместимость с Remotion

Репозиторий `templates/infografika/recharts`, версия `3.11.0-canary.6`,
`license: MIT` в `package.json` и `LICENSE` («Copyright (c) 2015-present
recharts»). Ограничений нет, атрибуция по MIT. Peer: `react`, `react-dom`,
`react-is` (16.8–19). Зависимости: `@reduxjs/toolkit`, `react-redux`,
`reselect`, `immer`, `victory-vendor` (d3-scale/d3-shape), `es-toolkit`,
`clsx`, `decimal.js-light`, `eventemitter3`.

## Как рендерит

Чистый React → SVG. Каждый чарт (`src/chart/*.tsx`) — тонкая обёртка над
`CartesianChart`/`PolarChart` → `CategoricalChart` → `RechartsWrapper`
(div) + `RootSurface` (svg). Состояние (оси, ряды, легенда, тултип) живёт
в своём redux-store на каждый чарт; дети сообщают о себе через
`useEffect`/`useLayoutEffect`-диспатчи, так что полная картинка
собирается за несколько синхронных коммитов после монтирования.
`Sankey`, `Treemap`, `SunburstChart` — самостоятельные компоненты со своей
раскладкой, но с тем же `RechartsWrapper`.

## Анимация и таймер

- `isAnimationActive` у рядов (`Bar`, `Line`, `Area`, `Scatter`, `Funnel`,
  `Pie`, `Radar`, `RadialBar`) по умолчанию `'auto'`: выключается только
  при SSR (`Global.isSsr`) или `prefers-reduced-motion`. В headless Chrome
  Remotion анимация **включена**.
- Ряды анимируются через `AnimatedItems` → `JavascriptAnimate`
  (`src/animation/`). Прогресс 0→1 считает state-машина
  `JavascriptAnimation` (`AnimationHandle.ts`: init → pending
  `animationBegin` мс → active `animationDuration` мс → completed), часы —
  `RequestAnimationFrameTimeoutController`: `requestAnimationFrame` +
  `performance.now()`. Каждое значение кладётся в `useState` → новый
  рендер. Время — реальные миллисекунды, не кадры.
- `Treemap` использует `CSSTransitionAnimate`: React ставит конечное
  значение, плавность — CSS `transition`, конец ждёт rAF-таймер.
  `Tooltip` двигается CSS `transition: transform`.
- `Sankey`, `SunburstChart`, `Reference*`, `CartesianGrid`, `Label*`,
  `Legend` собственной анимации не имеют.
- Анимация запускается при монтировании и при каждой смене props/данных
  (`useAnimationId(props)`): если менять `data` каждый кадр при включённой
  анимации, каждый кадр стартует новый rAF-переход — недетерминированно.

Итог: в Remotion встроенная анимация либо не успеет, либо даст разные кадры
при разных скоростях рендера. Класс всех графиков — `adaptable`.

## Общий рецепт

1. На каждом ряду `isAnimationActive={false}` (у `Treemap` ещё
   `isUpdateAnimationActive={false}`). Тогда `JavascriptAnimate` сразу
   отдаёт прогресс 1, а подписи `LabelList` видны сразу.
2. `width`/`height` чарта — **числами** (из `useVideoConfig()` или
   констант). `ResponsiveContainer` и `responsive` опираются на
   `ResizeObserver`/`getBoundingClientRect`, стартуют с размера -1 и
   ничего не рисуют до первого измерения — не использовать.
3. Прогресс считать из кадра: `const p = interpolate(frame, [a, b], [0, 1],
   {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing})`.
4. Анимировать данные или обёртку:
   - столбцы/радар/радиальные бары — `data.map(d => ({...d, v: d.v * p}))`,
     stagger: `p_i` от `frame - i*delay`;
   - линия/область — оставить все категории, значения после текущего
     индекса = `null` (последнюю точку интерполировать к следующей), либо
     свой `shape`: `<Curve {...props} pathLength={1}
     strokeDasharray={\`${p} 1\`}/>` (без `getTotalLength`), либо
     `clip-path` по ширине области графика;
   - пирог — `endAngle={startAngle + 360 * p}` на `<Pie>`; sunburst —
     `endAngle` чарта;
   - точки/воронка/treemap/sankey — `shape`/`content`/`node`/`link`-функции,
     которые сами считают `opacity`/`scale`/`strokeDasharray` от кадра.
5. **Фиксировать домены осей** (`YAxis domain={[0, max]}`, `XAxis
   type="number" domain`, `PolarRadiusAxis domain`, `PolarAngleAxis
   type="number" domain={[0,100]}`) — иначе масштаб «дышит» вместе с
   анимированными данными.
6. Шрифты загрузить до первого кадра (`@remotion/google-fonts` или
   `delayRender` + `document.fonts.ready`): ширину текста (тики, подписи,
   Treemap) Recharts меряет скрытым `<span>` + `getBoundingClientRect`
   (`src/util/DOMUtils.ts`) и **кэширует** в LRU — неверный первый замер
   останется на все кадры.
7. Убрать `Tooltip`, `Brush`, обработчики мыши; `Legend` по возможности
   заменить прямыми подписями.

Набросок:

```tsx
const p = interpolate(frame, [0, 45], [0, 1], { extrapolateRight: 'clamp' });
<BarChart width={1600} height={800} data={rows.map(r => ({ ...r, v: r.v * p }))}>
  <YAxis domain={[0, maxV]} /><XAxis dataKey="name" />
  <Bar dataKey="v" isAnimationActive={false} />
</BarChart>
```

## Экспериментальный путь: свой AnimationController

С 3.9 экспортируются `AnimationControllerProvider`, типы
`AnimationController`, `TimeoutController`, `AnimationHandle`
(`src/animation/useAnimationController.tsx`). Контроллер получает
`(timeoutController, animationHandle, listener)` и сам решает, когда
вызвать `animationHandle.tick(now)` и `listener(getInterpolated())`.
Теоретически можно подставить контроллер, который вычисляет `now` из
кадра, и сохранить встроенные эффекты (прорисовку линии, перетекание
данных). Ограничения: контроллер вызывается из `useEffect` только при
смене зависимостей (кадр туда не входит — нужен новый контроллер на
каждый кадр), значение приходит через `setState` → лишний коммит;
`LineDrawShape` всё равно меряет `getTotalLength()`. Не проверено
рендером — использовать только после эксперимента.

## Прочие DOM-зависимости

- `RechartsWrapper` → `useReportScale`: `getBoundingClientRect().width /
  offsetWidth` (масштаб для координат мыши) — на картинку не влияет.
- `Legend`/`Tooltip` — HTML через `createPortal` в wrapper, размеры из
  `useElementOffset`.
- `Line` — `getTotalLength()` пути для входной анимации.

## Пропущено

- `Brush` — интерактивный ползунок выбора диапазона (drag).
- `Tooltip` — записан как `unsuitable` (`recharts/tooltip`).
- `Customized`, `ErrorBar`, `ZAxis`, оси `XAxis`/`YAxis`/`Polar*Axis`,
  `Cell`, фигуры `src/shape/*` — вспомогательные, без самостоятельного
  визуального смысла; упомянуты в карточках графиков.
- Хуки (`useXAxisScale`, `usePlotArea`…), темы (`darkTheme`,
  `RechartsThemeProvider`), `createHorizontalChart` и т.п. — утилиты.
- `www/` (сайт документации), тесты, `test-vr` — не исследовались.

## Неясно

- Успевает ли Remotion снять кадр после всех синхронных
  effect-диспатчей redux-store (оси/ряды регистрируются в эффектах). По
  коду коммиты синхронные, но рендером не проверено; при пустом первом
  кадре — `delayRender` до следующего rAF.
- Поведение подписей `SunburstChart` и `Pie` при частичном `endAngle`.
- Точные значения по умолчанию `startAngle`/`endAngle`/радиусов у самого
  `<Pie>` (у чарта — 0/360/0/'80%'); `animationDuration` у `Scatter` и
  `RadialBar` в прочитанных фрагментах не встретились.
- `<Tooltip active defaultIndex>` как статичная выноска — не проверено.
