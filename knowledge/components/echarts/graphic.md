# ECharts graphic — `echarts/graphic`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | component |
| Категория | `icons-shapes` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Слой произвольной графики поверх/под графиком: группы, прямоугольники,
круги, кольца, сектора, пути, ломаные, текст, картинки с
позиционированием `left/right/top/bottom`.

## Когда использовать

Логотип, выноска, стрелка-аннотация, маска для «прорисовки» внутри
холста ECharts — особенно в SSR-строке. Вне ECharts проще React-SVG.

## Фразы из озвучки

- «обратите внимание на эту область»
- «вот здесь начинается рост»
- «наш логотип в углу»

## Визуальный стиль

Любые zrender-фигуры со `style` (fill, stroke, opacity, тени), `z2`,
`clipPath`.

## Входные данные

`graphic.elements` (`GraphicComponentElementOption` = group | ZRPath |
image | text): `type` (`'group'`, `'image'`, `'text'` или имя
zrender-фигуры: rect, circle, sector, polygon, polyline, line, path… —
полный список в типах не перечислен), `id`, `$action`
(`'merge'`|`'replace'`|`'remove'`), `left/right/top/bottom`, `x`, `y`,
`rotation`, `scaleX/Y`, `shape`, `style`, `z2`, `bounding`
(`'all'`|`'raw'`), `clipPath`, `textContent`, `children`, `transition`,
`enterFrom`, `keyframeAnimation` ({loop, keyframes, duration}),
`enterAnimation`/`updateAnimation`/`leaveAnimation`, `draggable`, `silent`.

## Анимации

`transition`/`enterFrom` по свойствам, `keyframeAnimation` с `loop` —
часы zrender.

## Исходники и документация

- `templates/infografika/echarts/src/component/graphic/GraphicModel.ts` — типы
- `templates/infografika/echarts/src/component/graphic/GraphicView.ts`
- `templates/infografika/echarts/src/animation/customGraphicKeyframeAnimation.ts`
- `templates/infografika/echarts/test/graphic-animation.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Общий рецепт `knowledge/compatibility/echarts.md`. При `animation:
false` keyframe-анимация не применяется (`applyKeyframeAnimation`
проверяет `isAnimationEnabled`) — свойства (`x`, `shape.width`,
`style.opacity`) задавать из кадра в option с теми же `id` и `$action:
'merge'`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
