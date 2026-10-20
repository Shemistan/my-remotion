# nivo — совместимость с Remotion

Репозиторий `templates/infografika/nivo` (монорепо `@nivo/*`, версия пакетов
0.99.0). Лицензия MIT: `LICENSE.md` в корне и `"license": "MIT"` в
`package.json` каждого пакета. Ограничений нет, при копировании кода нужно
сохранить копирайт Raphaël Benitte.

## Стек

- React-компоненты, по одному пакету на тип графика
  (`packages/<chart>/src`). Почти у каждого типа есть SVG-версия (`Bar`) и
  обёртка `Responsive*`. У многих есть ещё `*Canvas`, у части — `*Html`
  (`CirclePackingHtml`, `IcicleHtml`, `TreeMapHtml`, `WaffleHtml`).
- Расчёт геометрии на d3: `d3-scale`, `d3-shape`, `d3-hierarchy`,
  `d3-chord`, `d3-sankey`, `d3-geo`, `d3-delaunay`, `d3-force`. Сам d3 ничего
  не анимирует: он только считает координаты.
- **Анимация — `@react-spring/web`** (`9.4.5 || ^9.7.2 || ^10.0`).
  `packages/core/src/motion/context.js`: `MotionConfigProvider` кладёт в
  контекст `{animate, config}` (`animate` по умолчанию `true`, пресет
  `config` — по имени из `@react-spring/web`). `useMotionConfig()`
  (`motion/hooks.js`) читают компоненты пакетов. Дальше:
  - `useTransition` для коллекций (бары, ячейки, узлы):
    `immediate: !animate`, в `Bar.tsx` ещё `initial: animate ? undefined : null`;
  - `useSpring` для цвета, прозрачности, толщины;
  - `useAnimatedPath` (`core/src/hooks/useAnimatedPath.js`):
    `interpolateString(previousPath, path)` из `d3-interpolate`, пружина 0→1
    с `reset: true` и `immediate: !animate`; так морфятся линии, области,
    формы радара и воронки.
  Цикл react-spring крутится на `requestAnimationFrame` внутри самой
  библиотеки, отсюда флаг `raf`.
- Без react-spring, то есть вообще без анимации: `calendar` (в
  `package.json` нет `@react-spring/web`, в типах нет `MotionProps`), `geo`
  (JS-пакет, типы в `index.d.ts`), `voronoi`.
- `Responsive*` → `core/src/components/ResponsiveWrapper.js`. Внутри
  `react-virtualized-auto-sizer` (измеряет DOM-родителя) и `use-debounce`
  (`setTimeout`). Отсюда флаг `dom`, а у `Responsive*` фактически ещё и
  `timers`.
- `Container` (`core/src/components/Container.js`) при `isInteractive`
  рендерит `<Tooltip/>` и обёртку `div` с ref. Hover-обработчики висят на
  элементах.

## Класс: `adaptable` почти для всех

Результат — детерминированный SVG, а встроенная анимация отключается одним
пропом. Это видно по `@nivo/static` (`packages/static/src/renderer.ts`): он
рендерит графики через `renderToStaticMarkup` с `animate: false,
isInteractive: false, renderWrapper: false`, и уже первый синхронный рендер
даёт итоговую картинку.

Исключение — `network`, класс `complex`. Раскладка d3-force (`d3-force
^2.0.1`) считается в `useEffect`, поэтому первый рендер пустой. Все узлы
стартуют из `(0,0)`, и d3-force v2 разводит совпавшие точки через
`Math.random()` (`jiggle`). Раскладка недетерминирована и в каждом
воркере/вкладке рендера Remotion получится своя.

## Общий рецепт адаптации

1. **Нет `Responsive*`.** Брать SVG-компонент (`Bar`, `Line`, `Pie`…) с
   явными `width`/`height` (например, из `useVideoConfig()`). Иначе AutoSizer
   измерит DOM, а debounce через таймер сдвинет первый корректный кадр.
2. **`animate={false}`** — выключает react-spring (`immediate`, `initial:
   null`). **`isInteractive={false}`** — без тултипа, mesh и hover-логики.
   `animateOnMount` (bar, icicle) оставить `false`.
3. **Анимировать данные по кадру**, а не через встроенную пружину:
   ```tsx
   const p = interpolate(frame, [0, 45], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
   <Bar width={1920} height={1080} animate={false} isInteractive={false}
        data={rows.map(r => ({ ...r, value: r.value * p }))} keys={['value']} indexBy="label" />
   ```
   Типовые приёмы: значения × `progress` (бары, radial-bar, waffle, bullet);
   срез массива по кадру (line, stream, bump, calendar — показывать точки
   до текущей даты); `endAngle`/`startAngle` по кадру (pie, radial-bar,
   polar-bar); `projectionRotation`/`projectionScale` по кадру (geo:
   вращение глобуса в `orthographic`); `defaultActiveSerieIds`/`activeId`
   по кадру для подсветки серии или сектора (bump, pie); stagger — у
   каждого элемента своя задержка в формуле прогресса.
4. **Фиксировать шкалы**, иначе при росте значений «прыгают» оси: задавать
   `valueScale: {type:'linear', min, max}` / `maxValue` / `yScale.max`
   по конечным данным.
5. **Обёртка вместо данных**, когда менять геометрию нельзя (sankey, chord,
   tree, treemap): `clip-path`/`opacity`/`scale` на контейнере по кадру или
   custom layer (`layers: [..., MyLayer]` — он получает вычисленные узлы и
   генераторы) с собственной покадровой отрисовкой (`stroke-dashoffset` для
   «рисования» линий/связей).
6. **Headless-хуки** для полной свободы: `useBar`, `useLine`,
   `usePieFromBox`, `useFunnel`, `useTree`, `useSankey`, `useNetwork`
   и др. возвращают геометрию — рисовать свой SVG с `interpolate(frame)`.
7. **Подстраховка от react-spring**: при `immediate` обновление значения при
   смене данных проходит через frameloop библиотеки (rAF). Если на рендере
   кадр «отстаёт», варианты: `Globals.assign({ skipAnimation: true })` из
   `@react-spring/web` один раз при импорте или `key={frame}` на графике
   (каждый кадр — новый mount, а mount с `animate={false}` синхронен; дороже
   по CPU). Это гипотеза — рендером не проверено.
8. **Шрифты** темы (`theme.text.fontFamily`) подгружать до рендера
   (`@remotion/google-fonts`), иначе метки поменяют ширину.
9. **Canvas-варианты** (`*Canvas`) рисуют в `useEffect`, анимации у них нет.
   Брать только для больших наборов, с `pixelRatio` и `delayRender`.

## `@nivo/static` — польза для Remotion

`renderChart({type, props}, override)` → строка `<?xml…><svg…>`, типы:
bar, circle_packing, calendar, chord, heatmap, icicle, line, pie, radar,
sankey, sunburst, treemap (`static/src/mappings/index.ts`). Где пригодится:
сгенерировать SVG заранее в Node (`calculateMetadata`, скрипт сборки), а
потом показать через `<Img src={staticFile(...)}>`/`dangerouslySetInnerHTML`
и анимировать обёрткой. Для анимации по данным проще рендерить сам
компонент. `samples` в пакете — готовые демо-данные. Отдельная запись:
`nivo/static`.

## Что пропущено и почему

- Служебные пакеты `core, colors, scales, axes, legends, annotations, text,
  theming, tooltip, canvas, express, generators, arcs, rects, grid,
  polar-axes` — не типы графиков. Их возможности (оси, легенды, аннотации,
  цветовые схемы) описаны внутри карточек графиков.
- `express` и `api` — HTTP-сервер вокруг `static`, для видео не нужен.
- `AreaBump` (пакет `bump`), `GeoMap` (пакет `geo`), `TimeRange` (пакет
  `calendar`) и все `*Canvas`/`*Html` варианты упомянуты в записи своего
  пакета, отдельных записей нет (одна запись на пакет).
- Интерактив (zoom по клику в circle-packing/icicle/sunburst drill-down,
  тултипы, crosshair, mesh, keyboard navigation в icicle) — в видео
  выключить. Zoom можно воспроизвести переключением `zoomedId` по кадру,
  но плавность тогда придётся считать самим.

## Чего не удалось выяснить

- Рендер в Remotion не делался (`verification: static-review` у всех).
- Bash в сессии ограничен worktree: `ls/find/grep` по исходникам были
  недоступны. Пути проверены чтением каждого файла (Read). Grep по
  `setTimeout/requestAnimationFrame/ResizeObserver` во всех пакетах не
  выполнялся. Флаги поставлены по прочитанным файлам core и пакетов.
- Синхронно ли применяет react-spring `immediate`-обновления при смене
  props без rAF — не проверено (см. п. 7 рецепта).
- Списки значений `tile` (treemap), `offsetType`/`order` (stream), `curve`
  (`LineCurveFactoryId`, `ClosedCurveFactoryId`), `RectTransitionMode`,
  `ArcTransitionMode` — типы в служебных пакетах, не выписаны.
- Значения по умолчанию прочитаны не для всех пакетов (в карточках указаны
  только найденные в `defaults.ts`/`props.ts`).
