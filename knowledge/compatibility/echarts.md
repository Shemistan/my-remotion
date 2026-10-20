# Apache ECharts — совместимость с Remotion

Репозиторий `templates/infografika/echarts`, версия `6.1.0`
(`package.json`, `src/core/echarts.ts → version`), `license: Apache-2.0`.
Единственная runtime-зависимость кроме `tslib` — `zrender` `6.1.0`
(исходников zrender в репозитории нет, `node_modules` не установлен).

## Лицензия и атрибуция

- Apache-2.0 (`LICENSE`, `package.json`). При распространении кода или
  бандла с ECharts: приложить текст `LICENSE`, сохранить `NOTICE`
  («Apache ECharts / Copyright 2017-2026 The Apache Software Foundation /
  This product includes software developed at The Apache Software
  Foundation (https://www.apache.org/).»), отметить изменённые файлы,
  не использовать товарные знаки ASF для одобрения своего продукта.
- Подкомпоненты под BSD 3-Clause (d3.js, `licenses/LICENSE-d3`,
  «Copyright 2010-2016 Mike Bostock»): `src/chart/treemap/treemapLayout.ts`,
  `src/chart/tree/layoutHelper.ts`, `src/chart/graph/forceHelper.ts`,
  `src/util/number.ts` — при распространении сохранить их уведомление.
- Требования касаются распространения кода; про отрендеренное видео в
  лицензии ничего отдельного нет.

## Как рендерит

Императивный API, не React: `echarts.init(dom, theme?, opts)` →
`chart.setOption(option)` → zrender рисует в `<canvas>` (по умолчанию,
`defaultRenderer = 'canvas'`) или `<svg>` (`opts.renderer: 'svg'`).
`EChartsInitOpts`: `locale`, `renderer`, `devicePixelRatio`, `useDirtyRect`,
`useCoarsePointer`, `pointerSize`, `ssr`, `width`, `height`. Без
`width/height` размер берётся из `dom.clientWidth/clientHeight` (при нуле —
предупреждение). Модули подключаются через `echarts/core` + `use([...])`
(`src/export/charts.ts`, `components.ts`, `renderers.ts` — `SVGRenderer`,
`CanvasRenderer`).

`setOption(option, {notMerge, lazyUpdate, silent, replaceMerge, transition})`
без `lazyUpdate` выполняет весь цикл синхронно и в конце вызывает
`zr.flush()` (кроме SSR) — картинка готова сразу после вызова.

## Анимация и таймер

- Часы — `zr.animation` (zrender): каждый кадр браузера шаг анимации →
  событие `frame` (`ECharts._onframe`) → flush. По сути rAF-цикл.
- Глобальные умолчания (`src/model/globalDefault.ts`): `animation: 'auto'`
  (truthy — включено), `animationDuration: 1000`, `animationDurationUpdate:
  500`, `animationEasing/EasingUpdate: 'cubicInOut'`, `animationThreshold:
  2000` (больше точек — без анимации), `progressive: 400`,
  `progressiveThreshold: 3000`, `stateAnimation 300 мс`. У рядов свои
  переопределения (line `animationEasing: 'linear'`, boxplot 800 мс,
  candlestick 300 мс, treemap `animationDurationUpdate: 900`).
- `Series.isAnimationEnabled()`: в Node без `ssr` анимация выключается;
  **в SSR-режиме `renderToString` вшивает в SVG CSS-анимацию**; иначе
  `option.animation` и порог `animationThreshold`.
- `src/animation/basicTransition.ts` — enter/update/leave через
  `animationDuration/Easing/Delay` (+`*Update`), задержка может быть
  функцией от `dataIndex`.
- `universalTransition` (`src/animation/universalTransition.ts`) — морфинг
  фигур между рядами/типами при смене option (bar ↔ pie, разбиение на
  куски), до 10 000 элементов. Живёт только на часах zrender.
- Бесконечные петли, не зависящие от `animation`: ripple у
  `effectScatter` (`EffectSymbol.ts`, `period` в секундах ×1000, петля
  `animate('', true)`), `effect` у `lines` (бегущая точка, след —
  `motionBlur` слоя, только Canvas), `keyframeAnimation` с `loop` у
  `graphic`/`custom`.
- Прогрессивный рендер (`scheduler.unfinished`) и force-layout графа
  (`layoutAnimation`) дорисовываются в следующих кадрах zrender.

Итог: встроенная анимация во времени браузера, в Remotion кадры не
детерминированы. Класс всех типов — `complex`.

## Общий рецепт

1. `renderer: 'svg'` (чёткие векторы, детерминированный DOM; Canvas тоже
   работает, но нужен `devicePixelRatio`), `width`/`height` числами.
2. В корне option `animation: false` — ряды рисуются сразу в конечном
   состоянии; плюс `progressive: 0` у больших рядов (или ждать событие
   `finished` перед `continueRender`).
3. Анимировать **данные от кадра**: `p = interpolate(frame, …)`; на
   каждый кадр `setOption` с новыми данными. Оси фиксировать
   (`yAxis.min/max`), иначе масштаб «дышит».
4. DOM-путь: `div` с `ref`; `echarts.init(ref.current, null,
   {renderer:'svg', width, height})` один раз в `useEffect`
   (`delayRender` до первой отрисовки, `continueRender` после первого
   `setOption`); покадровый `setOption` — в `useLayoutEffect` по `frame`
   (синхронный flush). `dispose()` при размонтировании.
5. **SSR-путь (сильный вариант):** без DOM, синхронно в рендере.

```tsx
const svg = useMemo(() => {
  const c = echarts.init(null, null, {renderer: 'svg', ssr: true, width, height});
  c.setOption({animation: false, ...optionAt(frame)});
  const s = c.renderToSVGString(); c.dispose(); return s;
}, [frame]);
return <div dangerouslySetInnerHTML={{__html: svg}} />;
```

   `init(null, …, {ssr:true})` пропускает проверки DOM, `setOption` в SSR
   не делает flush, `renderToSVGString({useViewBox})` отдаёт строку от
   SVG-painter (`ssr/client` — только гидратация событий `hydrate(dom,
   {on})` для веба, в видео не нужна). `animation: false` обязателен:
   иначе в строке окажется CSS-анимация (pie в SSR — `scale`-вход).
   Нет `delayRender`, нет rAF, кадры в разных вкладках рендера совпадают.
   Instance можно держать в `useRef` и не пересоздавать.
6. Шрифты загрузить до первого кадра: размеры подписей считает zrender
   (исходники zrender не читались — механизм замера не проверен).
7. Убрать интерактив: `tooltip`, `dataZoom`, `brush`, `toolbox`,
   `roam`, `nodeClick`, `breadcrumb` treemap.

## Типовые адаптации по типам

- bar/pictorialBar/radar/boxplot/candlestick — значения × `p`, stagger по
  индексу; ось с фиксированным max.
- line/themeRiver/parallel — срез данных или `null`-хвост; прорисовка
  кривой своими силами (custom/graphic) — встроенный clip-path
  (`createGridClipPath`) идёт только при анимации.
- pie/sunburst/chord/gauge — `endAngle`/значения от кадра; gauge — `data[0].value`.
- tree/treemap/sunburst — проявление по уровням через данные
  (`collapsed`, `initialTreeDepth`, прозрачность в `itemStyle`).
- graph — `layout: 'none'` с `x/y` или `circular`; force без `x/y`
  ставит узлы `Math.random()` (`forceHelper.ts`) — разные вкладки рендера
  дадут разную раскладку.
- effectScatter — `showEffectOn: 'emphasis'` (петля выключена), пульс
  рисовать `symbolSize` от кадра; lines — `effect.show: false`, бегущую
  точку — отдельным scatter по интерполированным координатам.
- map — карта регистрируется `echarts.registerMap(name, geoJSON)` до
  `setOption`; GeoJSON грузить заранее (`staticFile` + `delayRender`).

## Пропущено

- Интерактивные компоненты: `tooltip`, `axisPointer`, `dataZoom`
  (inside/slider/select), `brush`, `toolbox`, `timeline` (плеер с
  кнопками), `legendScroll`-пагинация, `aria` — смысл в
  указателе/клавиатуре.
- Координатные системы и оси (`grid`, `polar`, `singleAxis`, `geo`,
  `parallel`-оси, `radar`-индикаторы, `matrix`, `thumbnail`) — упомянуты в
  карточках типов, отдельного визуального смысла нет.
- `dataset`/`transform`, `extension-src/` (bmap — внешний сервис карт),
  темы, i18n, `test/ut`, сборка — не исследовались.
- Встроенный `universalTransition` и keyframe-анимации — не
  воспроизводятся покадрово без управления часами zrender.

## Неясно

- Можно ли детерминированно «прокрутить» `zr.animation` к времени кадра
  (это сохранило бы universalTransition, ripple, effect): исходников
  zrender нет, не проверено.
- Хватает ли синхронного `setOption` в `useLayoutEffect` без
  покадрового `delayRender` — рендером не проверено.
- Лицензия zrender (внешний пакет) — в репозитории не зафиксирована.
- Commit исходного репозитория — git в нём запрещён, не определён.
