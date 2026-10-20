# ECharts SSR: renderToSVGString — `echarts/ssr-svg-string`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Сам не рисует: получает любой график ECharts как SVG-строку без DOM.

## Когда использовать

Основной путь вставки ECharts в Remotion: синхронно в рендере, без
`delayRender`, без rAF, одинаково во всех вкладках рендера. Не годится,
если нужен встроенный `universalTransition`.

## Фразы из озвучки

- «покажем этот график прямо в ролике»
- «данные растут кадр за кадром»

## Визуальный стиль

Не применимо: результат — SVG того графика, что описан в option.

## Входные данные

`echarts.init(null, theme?, {ssr: true, renderer: 'svg', width, height,
locale})` → `chart.setOption(option)` → `chart.renderToSVGString({useViewBox?})`
→ `chart.dispose()`. Для веба — `ssr/client` `hydrate(dom, {on:
{mouseover, mouseout, click}})` (события по атрибутам `ecmeta_*`).

```ts
const c = echarts.init(null, null, {renderer: 'svg', ssr: true, width, height});
c.setOption({animation: false, ...optionAt(frame)});
const svg = c.renderToSVGString();
```

## Анимации

При `ssr: true` анимация не отключается (`Series.isAnimationEnabled`
гасит её только в Node **без** ssr): zrender вшивает в строку
CSS-анимацию SVG, pie в SSR входит через `scale` (`PieView.ts`).

## Исходники и документация

- `templates/infografika/echarts/src/core/echarts.ts` — `init`, `renderToSVGString`, `EChartsInitOpts`
- `templates/infografika/echarts/src/model/Series.ts` — `isAnimationEnabled`
- `templates/infografika/echarts/ssr/client/src/index.ts` — `hydrate`
- `templates/infografika/echarts/test/ssr.html` — пример

## Зависимости

`echarts`, `zrender` (SVG-painter `renderToString`).

## Совместимость и адаптация

`complex` как и весь движок, но это и есть адаптация. `option.animation:
false` обязателен. Вставка: `<div dangerouslySetInnerHTML={{__html:
svg}} />`; instance можно держать в `useRef` и вызывать `setOption` на
каждый кадр. В SSR `setOption` не делает `flush` — брать строку только
через `renderToSVGString`. Шрифты загрузить до кадра (замер текста —
zrender, не проверен). След `lines.effect` в SVG не поддержан.
Полный рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

нет (утилита)
