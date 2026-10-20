# Mermaid — совместимость с Remotion

Репозиторий `templates/infografika/mermaid` (монорепо; главный пакет
`packages/mermaid`, версия 12.2.0). Лицензия MIT: `LICENSE` в корне
(«Copyright (c) 2014 - 2022 Knut Sveidqvist») и `license` в
`packages/mermaid-zenuml/package.json`. Ограничений нет, нужна только
атрибуция по MIT. Внешний `@zenuml/core` (зависимость плагина zenuml) в клон
не входит, его лицензию здесь не проверяли.

## Что это и как рендерит

Mermaid превращает **текстовый DSL** в **статичный SVG**. Точка входа —
`mermaid.render(id, text, container?)` из `packages/mermaid/src/mermaid.ts`.
Это обёртка над `render` → `renderDiagram` из `src/mermaidAPI.ts`:

- вход: `id` (станет id у `<svg>`), `text` (DSL, можно с YAML-front-matter
  `---\nconfig: …\n---`), необязательный `container: Element`;
- выход: `Promise<RenderResult>` = `{ diagramType, svg: string,
  bindFunctions? }`. `svg` — готовая строка `<svg …>`: при `securityLevel`
  не `loose` она прошла через DOMPurify, при `sandbox` завёрнута в
  `<iframe>` (для Remotion `sandbox` не использовать);
- вызовы `render`/`parse` ставятся в общую очередь (`executionQueue`) и
  выполняются строго по одному;
- `mermaid.initialize({ startOnLoad, theme, themeVariables, fontFamily,
  look, layout, securityLevel, … })` задаёт конфиг. Тот же конфиг можно
  передать по диаграмме через front-matter `config:`.

**DOM нужен обязательно.** `renderDiagram` делает `select(document.body)`
(d3), добавляет временный `<div id="d{id}"><svg id="{id}">`, вставляет
`<style>`, вызывает `diag.renderer.draw()`, который рисует d3 прямо в живой
документ, затем читает `innerHTML` и удаляет временный div. Размеры текста
и узлов берутся из браузера: `getBBox()` в `rendering-util/createGraph.ts`
(`insertMeasuredNode`), `getBoundingClientRect()` в `pieRenderer.ts` (ширина
легенды), `utils.calculateTextDimensions` в `sequenceRenderer.ts`. Без
настоящего DOM (Node без браузера) рендер не работает. В Remotion проблемы
нет, кадры рендерит headless Chrome. `fastdom` в `rendering-util/fastdom.ts`
переведён на `queueMicrotask`, rAF не используется.

Раскладка: unified-рендерер (`rendering-util/render.ts`) обслуживает
flowchart, class, state, er, requirement, mindmap, usecase, agentflow и
swimlanes. Алгоритмы: `dagre` (по умолчанию), `swimlane`, а в полной сборке
ещё `cose-bilkent` (mindmap) и ELK (`elk` и `ELK_ALGORITHMS`, общий
ленивый `import`). Для agentflow и usecase по умолчанию стоит ELK.
architecture раскладывается через cytoscape `fcose` с
`withSeededRandom` (`architectureSeed.ts`), sankey — через `d3-sankey`,
остальные типы считают геометрию сами на d3. В «tiny»-сборке
(`injected.includeLargeFeatures = false`) mindmap, architecture,
flowchart-elk, ELK и cose-bilkent не регистрируются
(`diagram-api/diagram-orchestration.ts`). Нужен полный пакет `mermaid`.

Внешний вид задают `look: classic | handDrawn | neo` и `theme`. venn,
swimlanes, agentflow и usecase по умолчанию берут тему `redux-color` и look
`neo` (так написано в их `docs/syntax/*.md`). `handDrawn` рисует через
roughjs, и для повторяемости нужен `handDrawnSeed`.

## Есть ли анимация

Нет, результат — статичный SVG. Единственное исключение — анимированные
рёбра flowchart: `e1@{ animate: true }` или `animation: fast|slow`. Они
дают классы `.edge-animation-fast` / `.edge-animation-slow` с
`@keyframes dash` (20 s / 50 s, `infinite`) из общего `src/styles.ts`.
`compileCSS` в `mermaidAPI.ts` специально пропускает `@keyframes` «for
Mermaid's animation feature». swimlanes использует парсер flowchart
(`createFlowDiagram`), так что умеет то же самое. agentflow рисует рёбра тем
же `edges.js`, но поддерживает ли его парсер `animate`, не проверено. В
Remotion такие рёбра надо
выключить и анимировать по кадру (рецепт ниже). Остальное статично: hover
у pie (`highlightSlice: 'hover'`), `click`/`href`/`bindFunctions`, tooltip.

## Класс совместимости: `complex` для всех типов

Причины: асинхронный render, обязательный DOM и измерение текста, d3 рисует
в живой документ, раскладку делают внешние движки (dagre/ELK/cytoscape).
При этом результат — детерминированный SVG, если шрифт загружен, `look` не
`handDrawn` (или задан seed) и вход тот же. Поэтому рецепт один для всех
типов, а в `adaptations` каждой записи описана только специфика.

## Рецепт адаптации (общий для всех записей)

1. **Рендер в строку один раз.**
   ```tsx
   const [svg, setSvg] = useState<string | null>(null);
   const [handle] = useState(() => delayRender('mermaid'));
   useEffect(() => {
     mermaid.initialize({ startOnLoad: false, theme: 'base', fontFamily, securityLevel: 'loose' });
     mermaid.render(`m-${id}`, text).then((r) => { setSvg(r.svg); continueRender(handle); });
   }, [text]);
   ```
   Вставка — через `dangerouslySetInnerHTML` в `<AbsoluteFill>`. Шрифт
   загрузить до render (`@remotion/google-fonts` + `delayRender`), иначе
   `getBBox` измерит запасной шрифт и раскладка уедет. id делать уникальным
   на композицию: CSS из `createUserStyles` привязан к `#id`.
2. **Размер.** У большинства типов `<svg>` получает `width="100%"` и
   `max-width` (через `useMaxWidth`) плюс `viewBox`. Масштабировать обёрткой
   под 1920×1080 или выставить `useMaxWidth: false` в конфиге типа.
3. **Появление по кадру** — стилями поверх готового SVG. По
   `useCurrentFrame()` считаем, какие элементы видны, и пишем в `<style>`,
   привязанный к `#m-${id}`, правила `opacity` / `transform` /
   `clip-path` / `stroke-dashoffset`. Альтернатива: один раз распарсить
   строку `DOMParser`-ом, собрать список элементов, а потом менять только
   атрибуты по кадру.
   - Unified-рендерер (`rendering-util/createGraph.ts`): `g.root` →
     `g.clusters`, `g.edges.edgePaths`, `g.edgeLabels`, `g.nodes`. Узел —
     `g.node` с id `<svgId>-<domId>` (`render.ts` добавляет префикс id
     диаграммы). Подграфы вкладываются как новые `g.root` внутри `g.nodes`.
   - Порядок элементов в SVG обычно совпадает с порядком в DSL (у
     unified-рендерера — с порядком добавления узлов и рёбер в DB), поэтому
     «показывать по одному» = `:nth-child(n)` или срез по индексу.
   - Классы конкретных типов перечислены в `adaptations` их записей. Где
     они не проверены по коду, это сказано прямо: сверить по готовому SVG.
4. **Рёбра «рисуются»**: `stroke-dasharray: L; stroke-dashoffset: L*(1-p)`,
   где `L` = `getTotalLength()`. Измерить один раз после вставки (в
   `useEffect` под тем же `delayRender`). Встроенные `animate`/`animation`
   у рёбер не включать.
5. **Изменение данных** (pie, xychart, sankey, gantt, radar, treemap). Каждый
   render асинхронный и дорогой, поэтому покадровый перерендер не подходит.
   Лучше заранее отрендерить N ключевых состояний в `useEffect` и
   переключать их по кадру, либо анимировать готовые элементы (бары —
   `scaleY` от базовой линии, сектора — маска).
6. **Детерминизм.** Без `handDrawn` или с `handDrawnSeed`; architecture
   седирован; детерминизм cose-bilkent (mindmap) не проверялся. В gantt
   отключить `todayMarker` (`todayMarker off`), иначе линия «сегодня»
   зависит от даты рендера. В sankey id узлов и градиентов берутся из
   глобального счётчика `Uid.next` и меняются от рендера к рендеру, поэтому
   выбирать элементы надо по индексу и классу, а не по id.

## Экспериментальные / beta типы

Суффикс `-beta` обязателен по регулярке детектора: agentflow
(`agentflow-beta`), swimlanes (`swimlane-beta`), radar, treeView, venn,
wardley, cynefin, usecase, railroad (`railroad-beta`, `railroad-ebnf-beta`,
`railroad-abnf-beta`, `railroad-peg-beta`). Необязателен: xychart, packet,
sankey, block, ishikawa. architecture и treemap детектор принимает без
суффикса, но в доках пишут `architecture-beta` / `treemap-beta`. Доки
называют экспериментальными mindmap и timeline (только иконки), c4 и
sankey; «new diagram type, syntax may evolve» — treemap, venn, ishikawa,
swimlanes. zenuml живёт в отдельном пакете `packages/mermaid-zenuml`
(`@zenuml/core`) и подключается через `mermaid.registerExternalDiagrams`.

## Что пропущено и почему

- `diagrams/info` (выводит версию), `diagrams/error` (рисует ошибку
  парсинга), `diagrams/common` (общие утилиты) — это не визуальные типы.
- Пакеты `mermaid-example-diagram`, `mermaid-layout-elk`,
  `mermaid-layout-tidy-tree`, `parser`, `tiny` и т.п. — инфраструктура,
  а не типы диаграмм (содержимое не открывалось).
- Интерактив (`click`, `href`, `bindFunctions`, popup-меню актёров в
  sequence, tooltip, hover у pie) в видео не нужен, его игнорировать.
- Демо `demos/dev/`, тесты `cypress/`, `e2e` не нужны.

## Чего не удалось выяснить

- Рендер в Remotion не делался, у всех записей `static-review`.
- Bash за пределами worktree и листинг каталогов были заблокированы
  (режим dontAsk). Список типов взят из реестра
  `diagram-api/diagram-orchestration.ts` и брифа. Каждый путь проверен
  чтением файла, но непрочитанные файлы внутри `diagrams/<type>/` могут
  существовать.
- Классы SVG-элементов проверены по коду для unified-рендерера, pie,
  xychart (группы из `groupTexts`), sankey, gantt и sequence. Для остальных
  типов их надо сверить по готовому SVG.
- Есть ли CSS-анимация рёбер у usecase (у него свой рендерер поверх
  `render.ts`), не проверено.
- Как zenuml (`renderToSvg` из `@zenuml/core`) меряет текст, неизвестно:
  пакет внешний.
- `python3 tools/kb.py check --repo mermaid` не запускался: вызов отклонён
  (режим dontAsk). Поля сверены вручную по схеме из `knowledge/README.md`,
  все пути `source_files`/`docs` проверены чтением файлов. Сборный
  `knowledge/capabilities.jsonl` и таблицы в `patterns/*.md` не
  пересобирались (`kb.py build` / `kb.py patterns`).
