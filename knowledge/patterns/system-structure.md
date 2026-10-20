# Структура системы

«Система состоит из…», «архитектура», «модули», «слои», «компоненты и как
они связаны». Нужно показать части целого и их расположение, обычно
статично, с поэтапным раскрытием.

## Визуальные приёмы

1. **Блок-схема архитектуры** — прямоугольники и связи; блоки появляются
   группами (клиент → сервер → база).
2. **Слои** — горизонтальные полосы снизу вверх (инфраструктура → данные →
   логика → интерфейс).
3. **Bento-grid / карточки** — модули как плитки разного размера.
4. **Дерево** — иерархия (оргструктура, дерево каталогов).
5. **Вложенные контейнеры** — treemap, circle packing для «часть целого».
6. **3D-сцена с камерой** — облёт модулей, когда нужен wow-эффект.

## Как выбирать

- Есть описание в тексте → mermaid (architecture, flowchart, C4) или React
  Flow: статичный SVG, появление по узлам.
- Нужна красивая плитка без связей → bento/grid (`lists-grids-stagger`).
- Иерархия → mermaid mindmap / tree, echarts tree, nivo tree.
- Доли и размеры → treemap/sunburst (`charts-data`).

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 17

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/loop-grid-wave` | free-remotion-templates | Сетка 18×12 SVG-точек, по которой бежит диагональная волна: точки растут и светлеют, на гребне — акцентный цвет. Бесшовная петля. | [карточка](../components/free-remotion-templates/loop-grid-wave.md) |
| `free-remotion-templates/shatter-reveal` | free-remotion-templates | Разлетевшиеся повёрнутые осколки собираются в цельную градиентную плитку с крупным заголовком; снизу вытягивается полоса и проявляется по… | [карточка](../components/free-remotion-templates/shatter-reveal.md) |
| `remotion-bits/bit-basic-code-block` | remotion-bits | Четыре строки TypeScript (функция hello) с подсветкой синтаксиса и номерами строк, проявляющиеся сверху вниз со сдвигом на 10 px. | [карточка](../components/remotion-bits/bit-basic-code-block.md) |
| `remotion-bits/bit-fracture-reassemble` | remotion-bits | Сетка 5×5 фото-плиток собирается из осколков, разбросанных в 3D, держится ~60 кадров и снова разлетается; в центральном ряду поверх фото… | [карточка](../components/remotion-bits/bit-fracture-reassemble.md) |
| `remotion-bits/bit-grid-stagger` | remotion-bits | Сетка 4×4 пронумерованных скруглённых квадратов, вырастающих (scale 0→1 и fade) волной от центра. | [карточка](../components/remotion-bits/bit-grid-stagger.md) |
| `remotion-bits/bit-list-reveal` | remotion-bits | Вертикальный список из шести пунктов меню (эмодзи, название, точка) всплывает построчно с fade и масштабом, весь список при этом медленно… | [карточка](../components/remotion-bits/bit-list-reveal.md) |
| `remotion-bits/bit-particles-grid` | remotion-bits | В центральной области появляются полупрозрачные белые квадраты, круги и ромбы, привязанные к сетке 5% ширины — пиксельная мозаика. | [карточка](../components/remotion-bits/bit-particles-grid.md) |
| `remotion-bits/bit-remotion-bits-promo` | remotion-bits | Промо-ролик библиотеки (1140 кадров): камера Scene3D пролетает intro → сетка карточек «Elements» (частицы, текст, счётчик, TypeWriter, Co… | [карточка](../components/remotion-bits/bit-remotion-bits-promo.md) |
| `remotion-bits/bit-scene-3d-cube-nav` | remotion-bits | Куб из шести подписанных граней: камера стартует с изометрии, облетает каждую грань фронтально и возвращается в изометрию. | [карточка](../components/remotion-bits/bit-scene-3d-cube-nav.md) |
| `remotion-bits/bit-terminal-3d` | remotion-bits | Три окна терминала в стиле macOS в 3D (git status, логи сервера, сборка): печатается вывод, окна покачиваются, камера перелетает между ними. | [карточка](../components/remotion-bits/bit-terminal-3d.md) |
| `remotion-bits/bit-transform3d-showcase` | remotion-bits | Облёт из шести слайдов с карточками кода про Transform3D: квадрат по цепочке матриц, куб с тремя орбитальными спутниками, вложенные враща… | [карточка](../components/remotion-bits/bit-transform3d-showcase.md) |
| `remotion-bits/code-block` | remotion-bits | Блок кода с подсветкой синтаксиса (prism), строки появляются по очереди; подсветка диапазонов строк фоном и приглушение строк вне фокуса. | [карточка](../components/remotion-bits/code-block.md) |
| `remotion-bits/element-3d` | remotion-bits | Произвольный HTML-контент, размещённый в 3D-пространстве Scene3D вне шагов (декорации, плавающие карточки); с fixed — приклеен к камере к… | [карточка](../components/remotion-bits/element-3d.md) |
| `remotion-bits/scene-3d` | remotion-bits | CSS-3D мир в духе impress.js: шаги со своей позицией/поворотом/масштабом, камера перелетает между ними с easing; контент шагов входит и у… | [карточка](../components/remotion-bits/scene-3d.md) |
| `remotion-boilerplate/only-logo` | remotion-boilerplate | Логотип-атом: три эллиптические орбиты с градиентной обводкой прорисовываются и разворачиваются, в центре вырастает градиентное ядро; зна… | [карточка](../components/remotion-boilerplate/only-logo.md) |
| `remotion-skills/connected-compositions` | remotion-skills | Не рисует; документ о связанных композициях: сцена или карточка, экспортированная через Interactive.create() и зарегистрированная в Compo… | [карточка](../components/remotion-skills/connected-compositions.md) |
| `remotion-skills/timeline-structure` | remotion-skills | Не рисует; документ о структуре таймлайна: единицы редактирования, Track для независимых элементов, TransitionSeries для смежных, общий S… | [карточка](../components/remotion-skills/timeline-structure.md) |

### Адаптируется без переписывания (`adaptable`) — 52

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/bento-eleven` | animata | Каркас bento из 11 плашек на сетке 5×5 для health-приложения: Grocery List, Meal Planner, Hydration Reminder, Travel Journal, Fitness Tra… | [карточка](../components/animata/bento-eleven.md) |
| `animata/bento-five` | animata | Каркас bento из 5 плашек на сетке 3×3: широкая жёлтая сверху, зелёная колонка справа на все строки, красная на две строки, фиолетовая и с… | [карточка](../components/animata/bento-five.md) |
| `animata/bento-four` | animata | Каркас bento из 4 цветных плашек-заглушек на сетке 3×3: широкая синяя, зелёная, высокая серая и большая красная 2×2. | [карточка](../components/animata/bento-four.md) |
| `animata/bento-nine` | animata | Каркас bento из 9 плашек на сетке 4×3: две широкие, одна высокая, остальные одиночные. | [карточка](../components/animata/bento-nine.md) |
| `animata/bento-seven` | animata | Каркас bento из 7 плашек на сетке 4×3 с широкими (2 и 3 колонки) и одиночными ячейками. | [карточка](../components/animata/bento-seven.md) |
| `animata/bento-six` | animata | Каркас bento из 6 плашек на сетке 4×3: верх — широкая + две одиночные, середина — полоса на всю ширину, низ — две половины. | [карточка](../components/animata/bento-six.md) |
| `animata/bento-ten` | animata | Каркас bento из 10 плашек на сетке 4×3: большая ячейка 2×2, высокая, две широкие и одиночные. | [карточка](../components/animata/bento-ten.md) |
| `animata/collab-card` | animata | Карточка 3:2 в стиле Figma-мультиплеера: тёмный холст с бликами, «Live · 4 editing» с пульсирующей точкой и аватарами +2, крупное hello!… | [карточка](../components/animata/collab-card.md) |
| `animata/github-card-shiny` | animata | Карточка GitHub Actions: cmake.yml, on: push и шаги с зелёными галочками и временем (Install dependencies, Build, Test); за курсором плыв… | [карточка](../components/animata/github-card-shiny.md) |
| `animata/grid` | animata | Статичный фон-клетка (миллиметровка) из линий 1px. | [карточка](../components/animata/grid.md) |
| `animata/integration-pills` | animata | Облако таблеток-названий сервисов (Shopify, RSS, Zapier, Slack, Webflow …) в рамке; по hover обычные уменьшаются и сереют, а три выделенн… | [карточка](../components/animata/integration-pills.md) |
| `animata/orbiting-items` | animata | Тёмно-синий радиальный фон, две концентрические орбиты и иконки в кружках по большой орбите; система медленно вращается, иконки остаются… | [карточка](../components/animata/orbiting-items.md) |
| `animata/storage-status` | animata | Высокая чёрная колонка — стек диска 512 GB: сегменты Free, System 50, Audio 80, Video 150 GB с высотой по доле и выносками-ярлыками «N GB… | [карточка](../components/animata/storage-status.md) |
| `animata/webhooks-card` | animata | Два блока-узла с подписями, соединённые пунктиром; по hover линия становится сплошной лаймовой, рамки загораются, шарик перекатывается от… | [карточка](../components/animata/webhooks-card.md) |
| `magicui/animated-beam` | magicui | Линия-связь (прямая или дуга) между двумя элементами схемы, по которой бежит светящийся градиентный импульс — данные текут от A к B. | [карточка](../components/magicui/animated-beam.md) |
| `magicui/animated-grid-pattern` | magicui | Клеточная сетка, где случайные клетки плавно заливаются и гаснут, затем вспыхивают в другом месте — дышащая сетка. | [карточка](../components/magicui/animated-grid-pattern.md) |
| `magicui/bento-grid` | magicui | Сетка «бенто» из карточек разного размера: фон-иллюстрация, иконка, заголовок, описание и CTA. | [карточка](../components/magicui/bento-grid.md) |
| `magicui/file-tree` | magicui | Дерево файлов проекта как в IDE: папки открыта/закрыта, файлы, направляющие вложенности, подсвеченный выбранный элемент. | [карточка](../components/magicui/file-tree.md) |
| `magicui/grid-pattern` | magicui | Фоновая клеточная сетка (сплошная или пунктирная) на SVG pattern с выборочно залитыми клетками. | [карточка](../components/magicui/grid-pattern.md) |
| `magicui/hexagon-pattern` | magicui | Фоновые соты из шестиугольников (flat-top или pointy-top) с зазором и выборочно залитыми ячейками. | [карточка](../components/magicui/hexagon-pattern.md) |
| `magicui/orbiting-circles` | magicui | Иконки, равномерно расставленные по круговой орбите и вращающиеся вокруг центра, с тонкой окружностью-траекторией; несколько экземпляров… | [карточка](../components/magicui/orbiting-circles.md) |
| `motion-primitives-website/animated-grid-pattern` | motion-primitives-website | Сетка тонких линий, в которой случайные клетки по очереди мягко загораются цветом и гаснут — живая матрица. | [карточка](../components/motion-primitives-website/animated-grid-pattern.md) |
| `motion-primitives-website/dot-pattern` | motion-primitives-website | Сетка точек (SVG pattern) с радиальным затуханием к краям; дети поверх. | [карточка](../components/motion-primitives-website/dot-pattern.md) |
| `motion-primitives-website/grid-background` | motion-primitives-website | Чёрный фон с тонкой сеткой или точками и затуханием сверху/снизу. | [карточка](../components/motion-primitives-website/grid-background.md) |
| `motion-primitives-website/grid-beams` | motion-primitives-website | Чёрный фон с еле заметной сеткой и тремя вертикальными светящимися лучами (cyan, violet, fuchsia), пульсирующими со сдвигом. | [карточка](../components/motion-primitives-website/grid-beams.md) |
| `motion-primitives-website/grid-pattern` | motion-primitives-website | Сетка тонких линий в стиле Vercel (SVG pattern) с радиальным затуханием к краям; дети поверх. | [карточка](../components/motion-primitives-website/grid-pattern.md) |
| `motion-primitives-website/orbit-system` | motion-primitives-website | Солнечная система из иконок: центр с контентом, внутреннее кольцо вращается по часовой, внешнее — против; элементы равномерно распределены. | [карточка](../components/motion-primitives-website/orbit-system.md) |
| `motion-primitives-website/orbiting-circles` | motion-primitives-website | Элемент (иконка, логотип), вращающийся по круговой орбите вокруг центра, оставаясь вертикальным; пунктирная траектория. | [карточка](../components/motion-primitives-website/orbiting-circles.md) |
| `motion-primitives-website/svg-line-orchestra` | motion-primitives-website | Все path внутри SVG прорисовываются строго по очереди с шагом 0.3 с — хореография линий. | [карточка](../components/motion-primitives-website/svg-line-orchestra.md) |
| `motion-primitives-website/svg-particle-explosion` | motion-primitives-website | Элементы SVG-иллюстрации разлетаются с поворотом и уменьшением, затем упруго собираются обратно (inView — стартуют разбросанными и собира… | [карточка](../components/motion-primitives-website/svg-particle-explosion.md) |
| `nivo/chord` | nivo | Хордовая диаграмма (d3-chord): группы — дуги по окружности, взаимные потоки — полупрозрачные ленты, ширина пропорциональна величине. | [карточка](../components/nivo/chord.md) |
| `nivo/circle-packing` | nivo | Вложенные круги (d3 pack): узел дерева — круг, площадь пропорциональна значению, дети внутри родителя; зум на узел (zoomedId). Варианты C… | [карточка](../components/nivo/circle-packing.md) |
| `nivo/icicle` | nivo | Icicle-диаграмма: иерархия прямоугольниками по уровням, ширина пропорциональна значению; orientation bottom даёт flame chart; IcicleHtml… | [карточка](../components/nivo/icicle.md) |
| `nivo/sunburst` | nivo | Радиальная иерархия: центр — корень, кольца — уровни глубже, угол дуги пропорционален значению, подписи на дугах. | [карточка](../components/nivo/sunburst.md) |
| `nivo/tree` | nivo | Дерево/дендрограмма (d3-hierarchy): узлы-круги, связи кривыми bump/linear/step, четыре направления раскладки, подписи, подсветка предков… | [карточка](../components/nivo/tree.md) |
| `nivo/treemap` | nivo | Treemap (d3-hierarchy): вложенные прямоугольники, площадь пропорциональна значению, полосы подписей родителей; варианты TreeMapHtml, Tree… | [карточка](../components/nivo/treemap.md) |
| `react-bits/magic-bento` | react-bits | Bento-сетка карточек фич (1×1 и 2×2) с живыми мини-иллюстрациями: рисующийся график, дашборд, совместная работа, пайплайн автоматизации,… | [карточка](../components/react-bits/magic-bento.md) |
| `react-bits/orbit-images` | react-bits | Картинки, плывущие по орбите-контуру (эллипс, круг, квадрат, треугольник, звезда, сердце, бесконечность, волна) с эффектом глубины; в цен… | [карточка](../components/react-bits/orbit-images.md) |
| `recharts/pie-chart` | recharts | Круговая и кольцевая (donut) диаграммы, полукруг, вложенные кольца, выносные подписи с линиями, отступы между секторами. | [карточка](../components/recharts/pie-chart.md) |
| `recharts/sankey` | recharts | Диаграмма потоков: узлы-прямоугольники по колонкам глубины и ленты-связи (кубические кривые), толщина ленты пропорциональна величине потока. | [карточка](../components/recharts/sankey.md) |
| `recharts/sunburst-chart` | recharts | Иерархия вложенными кольцами секторов: центр — корень, каждое кольцо — уровень глубже, угол — доля значения; подписи на секторах. | [карточка](../components/recharts/sunburst-chart.md) |
| `recharts/treemap` | recharts | Дерево-карта: прямоугольники с площадью пропорционально значению (squarify, aspectRatio), вложенные уровни, отступы, подписи внутри плиток. | [карточка](../components/recharts/treemap.md) |
| `xyflow/background` | xyflow | Бесконечная SVG-сетка за схемой: точки, клетка или крестики, привязанные к viewport — при панораме и зуме сетка двигается и масштабируетс… | [карточка](../components/xyflow/background.md) |
| `xyflow/default-nodes` | xyflow | Прямоугольные узлы-карточки с подписью и точками-ручками: default (вход сверху, выход снизу), input (только выход), output (только вход),… | [карточка](../components/xyflow/default-nodes.md) |
| `xyflow/edge-types` | xyflow | SVG-связи между узлами: плавная кривая, упрощённая кривая, прямая, ортогональная ломаная и ломаная со скруглёнными углами; стрелки на кон… | [карточка](../components/xyflow/edge-types.md) |
| `xyflow/example-floating-edges` | xyflow | Радиальная схема: узел Target в центре и 8 узлов Source по кругу радиусом 250px; плавающие bezier-рёбра выходят из точки пересечения лини… | [карточка](../components/xyflow/example-floating-edges.md) |
| `xyflow/example-layouting` | xyflow | Автораскладка графа библиотекой dagre по уровням сверху вниз (TB) или слева направо (LR) с переставленными ручками и стрелками на рёбрах. | [карточка](../components/xyflow/example-layouting.md) |
| `xyflow/example-overview` | xyflow | Схема на 7 узлов сверху вниз: input-узел, default-узлы (один с фоном #D6D5E6), два output; рёбра bezier с подписью, анимированное пунктир… | [карточка](../components/xyflow/example-overview.md) |
| `xyflow/example-subflow` | xyflow | Узлы-контейнеры с дочерними узлами (parentId): полупрозрачный красный блок 500×300, внутри синий 300×200 со своими детьми; рёбра между ур… | [карточка](../components/xyflow/example-subflow.md) |
| `xyflow/handle` | xyflow | Точка подключения на краю узла (кружок 6px), откуда выходит или куда входит ребро; несколько ручек с id — несколько выходов из одного узла. | [карточка](../components/xyflow/handle.md) |
| `xyflow/panel` | xyflow | Неподвижный блок поверх холста в одном из шести мест (top/bottom × left/center/right) с отступом 15px: заголовок схемы, легенда, подпись… | [карточка](../components/xyflow/panel.md) |
| `xyflow/react-flow` | xyflow | Холст схемы: HTML-узлы и SVG-рёбра между ручками (bezier, step, straight), подписи и стрелки на рёбрах, общий viewport с панорамой и зумо… | [карточка](../components/xyflow/react-flow.md) |

### Требует существенной переработки (`complex`) — 38

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/animated-dock` | animata | Док в стиле macOS: стеклянная полоса с круглыми иконками, которые увеличиваются рядом с курсором (40→80px), с подписью над наведённой; на… | [карточка](../components/animata/animated-dock.md) |
| `animata/boids-ecosystem` | animata | Стая из треугольников или точек на тёмном canvas: выравнивание, сцепление, расталкивание, шлейф; курсор распугивает, аттракторы притягивают. | [карточка](../components/animata/boids-ecosystem.md) |
| `animata/orbiting-items-3-d` | animata | Светящийся логотип в центре парит, 6 цветных иконок в стеклянных кружках летают по наклонённому эллипсу; ближние крупнее и поверх логотип… | [карточка](../components/animata/orbiting-items-3-d.md) |
| `echarts/chord` | echarts | Хордовая диаграмма: узлы — дуги по кругу, связи — ленты-хорды между дугами, толщина по величине потока. | [карточка](../components/echarts/chord.md) |
| `echarts/graph` | echarts | Граф узлов и связей: ручная раскладка по x/y, круговая или силовая (force); категории цветом, размеры узлов, стрелки, подписи рёбер. | [карточка](../components/echarts/graph.md) |
| `echarts/pie` | echarts | Круговая, кольцевая и роза-диаграмма (roseType): сектора с выносными подписями и линиями, отступы между секторами, пустой круг при нулево… | [карточка](../components/echarts/pie.md) |
| `echarts/sankey` | echarts | Диаграмма потоков: узлы-столбики по уровням и ленты, толщина ленты — величина потока; горизонтально или вертикально. | [карточка](../components/echarts/sankey.md) |
| `echarts/sunburst` | echarts | Иерархия концентрическими кольцами секторов: центр — корень, кольца — уровни, угол — доля; радиальные подписи, уровни levels со своим рад… | [карточка](../components/echarts/sunburst.md) |
| `echarts/tree` | echarts | Дерево узлов со связями: ортогональная раскладка LR/TB/RL/BT или радиальная, кривые или ломаные рёбра, подписи у узлов, сворачивание веток. | [карточка](../components/echarts/tree.md) |
| `echarts/treemap` | echarts | Дерево-карта: прямоугольники с площадью по значению (squarify, золотое сечение), вложенные уровни с заголовками upperLabel, градации цвет… | [карточка](../components/echarts/treemap.md) |
| `magicui/icon-cloud` | magicui | Сфера из иконок или картинок (раскладка Фибоначчи), вращающаяся; дальние мельче и прозрачнее; клик поворачивает иконку к зрителю. | [карточка](../components/magicui/icon-cloud.md) |
| `mermaid/agentflow` | mermaid | Схема агентного workflow: контейнеры flow с агентами, внутри — задачи, инструменты, решения, входы разных форм; рёбра последовательности,… | [карточка](../components/mermaid/agentflow.md) |
| `mermaid/architecture` | mermaid | Схема облачной/CI-архитектуры: сервисы с иконками (database, disk, server, cloud, internet), группы-контейнеры, рёбра между сторонами L/R… | [карточка](../components/mermaid/architecture.md) |
| `mermaid/block` | mermaid | Блок-диаграмма с ручной сеткой: блоки по колонкам, вложенные блоки, пробелы space, стрелки-блоки и связи; автор сам задаёт расположение. | [карточка](../components/mermaid/block.md) |
| `mermaid/c4` | mermaid | C4-модель: люди и системы как карточки с названием и описанием, границы (Enterprise/System Boundary), связи Rel/BiRel с подписями; уровни… | [карточка](../components/mermaid/c4.md) |
| `mermaid/class-diagram` | mermaid | UML-диаграмма классов: прямоугольники с именем, полями и методами, связи наследования, композиции, агрегации, ассоциации; заметки. | [карточка](../components/mermaid/class-diagram.md) |
| `mermaid/er-diagram` | mermaid | ER-диаграмма: сущности-таблицы с атрибутами, связи с нотацией «вороньих лапок» (один-ко-многим и т.п.) и подписями. | [карточка](../components/mermaid/er-diagram.md) |
| `mermaid/flowchart` | mermaid | Блок-схема: узлы разных форм (прямоугольник, ромб, круг, десятки форм через @{ shape }) соединены стрелками с подписями, подграфы-контейн… | [карточка](../components/mermaid/flowchart.md) |
| `mermaid/mindmap` | mermaid | Карта мыслей: центральная идея и расходящиеся ветви с узлами разных форм (круг, облако, взрыв, шестиугольник), цвет по ветке, опциональны… | [карточка](../components/mermaid/mindmap.md) |
| `mermaid/packet` | mermaid | Структура сетевого пакета/битового формата: ряды по 32 бита, поля-прямоугольники с подписью и диапазоном битов. | [карточка](../components/mermaid/packet.md) |
| `mermaid/railroad` | mermaid | Синтаксическая диаграмма грамматики: «рельсы» с терминалами в скруглённых рамках и нетерминалами в прямоугольниках, развилки альтернатив,… | [карточка](../components/mermaid/railroad.md) |
| `mermaid/requirement-diagram` | mermaid | SysML-диаграмма требований: карточки требований (id, текст, риск, метод проверки) и элементов, связи satisfies/traces/contains/verifies и… | [карточка](../components/mermaid/requirement-diagram.md) |
| `mermaid/tree-view` | mermaid | Дерево каталогов как в файловом менеджере: узлы с отступами, линии-коннекторы, папки жирным, опциональные иконки файлов/папок и аннотации. | [карточка](../components/mermaid/tree-view.md) |
| `mermaid/treemap` | mermaid | Тримэп: вложенные прямоугольники, площадь пропорциональна значению; секции-родители с заголовками и листья со значениями. | [карточка](../components/mermaid/treemap.md) |
| `mermaid/usecase` | mermaid | UML-диаграмма вариантов использования: актёры-человечки, овалы вариантов внутри рамки системы, связи; раскладка ELK. | [карточка](../components/mermaid/usecase.md) |
| `motion-primitives-website/animated-beam` | motion-primitives-website | Светящаяся линия-связь между двумя элементами (квадратичная кривая): по бледному пути бегут штрихи градиента от A к B; BeamCircle — узел-… | [карточка](../components/motion-primitives-website/animated-beam.md) |
| `motion-primitives-website/neural-network` | motion-primitives-website | 3D-нейросеть: ~96 светящихся нейронов в 7 слоях-кольцах с изогнутыми синапсами; нейроны вспыхивают, импульсы бегут по связям и зажигают с… | [карточка](../components/motion-primitives-website/neural-network.md) |
| `motion-primitives-website/particles` | motion-primitives-website | Полноэкранный canvas с дрейфующими точками; с connected близкие точки соединяются тонкими линиями (сеть/созвездие). | [карточка](../components/motion-primitives-website/particles.md) |
| `motion-primitives-website/svg-circuit-board` | motion-primitives-website | Сгенерированная печатная плата: узлы на сетке соединены ломаными дорожками; дорожки прорисовываются, узлы выпрыгивают и пульсируют, по до… | [карточка](../components/motion-primitives-website/svg-circuit-board.md) |
| `nivo/network` | nivo | Силовой граф: узлы-круги и связи-линии, раскладка d3-force (linkDistance, repulsivity, centeringStrength), размер/цвет/толщина из данных;… | [карточка](../components/nivo/network.md) |
| `react-bits/acid-squares` | react-bits | Повёрнутое поле скруглённых плиток, по которым бегут волны и пульсы кислотных цветов с раздельным освещением и зерном. | [карточка](../components/react-bits/acid-squares.md) |
| `react-bits/cubes` | react-bits | Сетка 3D-кубиков, поворачивающихся волной вокруг кисти; при autoAnimate кисть движется сама, клик пускает рябь. | [карточка](../components/react-bits/cubes.md) |
| `react-bits/glass-icons` | react-bits | Сетка иконок-приложений из жидкого стекла: прозрачная плашка с преломлением и бликом по краю над цветной градиентной подложкой (наклонённ… | [карточка](../components/react-bits/glass-icons.md) |
| `react-bits/light-tunnel` | react-bits | Тоннель из десятков кабелей, по которым бегут световые импульсы внутрь или наружу; клик — всплеск. | [карточка](../components/react-bits/light-tunnel.md) |
| `react-bits/ripple-grid` | react-bits | Сетка (линии, точки или кресты), по которой расходятся кольцевые волны — автоматически из центра или от кликов. | [карточка](../components/react-bits/ripple-grid.md) |
| `react-bits/shape-grid` | react-bits | Бесконечная сетка фигур (квадраты, плитки, шестиугольники, треугольники, ромбы, круги, кресты, точки), сдвигающаяся в заданном направлени… | [карточка](../components/react-bits/shape-grid.md) |
| `react-bits/tech-text` | react-bits | Вордмарк на canvas, буквы которого под линзой становятся пунктирными векторными контурами; рамка выделения с маркерами, бегущими точками… | [карточка](../components/react-bits/tech-text.md) |
| `react-bits/web-threads` | react-bits | Несколько светящихся нитей-паутинок с белым ядром, расходящихся и колышущихся в пространстве. | [карточка](../components/react-bits/web-threads.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`relationships`, `spatial`, `sequence-steps`
