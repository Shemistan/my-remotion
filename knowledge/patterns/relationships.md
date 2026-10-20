# Взаимосвязи

«Связано с», «зависит от», «влияет на», «сеть контактов», «потоки между».
Главное — связи как объекты: линии, стрелки, потоки, их направление и
вес.

## Визуальные приёмы

1. **Граф узлов и рёбер** — сеть; связи подсвечиваются по очереди.
2. **Sankey / chord** — потоки между группами с толщиной по величине.
3. **Анимированный луч между элементами** — «данные идут из А в Б».
4. **Орбиты** — элементы вращаются вокруг центра (экосистема, партнёры).
5. **Матрица/heatmap** — сила связи каждого с каждым.

## Как выбирать

- Немного узлов (≤12) и важны стрелки → React Flow / mermaid flowchart /
  самодельные SVG-пути + `animated-beam`-подобные лучи.
- Потоки с величинами → sankey (recharts, nivo, echarts, mermaid).
- Сеть большая → nivo network / echarts graph (complex, force layout
  недетерминирован — фиксировать позиции).
- Экосистема вокруг центра → orbiting-circles.

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 8

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/community-chat` | free-remotion-templates | Окно командного мессенджера (рейл воркспейсов, каналы, лента, поле ввода); сообщения с аватаром и реакциями по очереди всплывают, окно на… | [карточка](../components/free-remotion-templates/community-chat.md) |
| `free-remotion-templates/logo-split-reveal` | free-remotion-templates | Левая и правая половины текстового логотипа съезжаются к центру, вспышка-шов в момент стыка, разрядка оседает; логотип держится до конца. | [карточка](../components/free-remotion-templates/logo-split-reveal.md) |
| `free-remotion-templates/loop-grid-wave` | free-remotion-templates | Сетка 18×12 SVG-точек, по которой бежит диагональная волна: точки растут и светлеют, на гребне — акцентный цвет. Бесшовная петля. | [карточка](../components/free-remotion-templates/loop-grid-wave.md) |
| `remotion-bits/bit-chat-conversation` | remotion-bits | Переписка в стиле мессенджера: шесть пузырей (свои справа, чужие слева, с аватарами-инициалами) появляются по одному. | [карточка](../components/remotion-bits/bit-chat-conversation.md) |
| `remotion-bits/bit-transform3d-showcase` | remotion-bits | Облёт из шести слайдов с карточками кода про Transform3D: квадрат по цепочке матриц, куб с тремя орбитальными спутниками, вложенные враща… | [карточка](../components/remotion-bits/bit-transform3d-showcase.md) |
| `remotion-bits/element-3d` | remotion-bits | Произвольный HTML-контент, размещённый в 3D-пространстве Scene3D вне шагов (декорации, плавающие карточки); с fixed — приклеен к камере к… | [карточка](../components/remotion-bits/element-3d.md) |
| `remotion-skills/maps-maptiler` | remotion-skills | Не рисует; документ о картах-объяснялках на MapTiler SDK: векторные слои MapTiler Planet или свой GeoJSON, прорисовка рек и границ, залив… | [карточка](../components/remotion-skills/maps-maptiler.md) |
| `remotion-skills/river-reveal` | remotion-skills | Карта-объяснялка: «электрическая» река прорисовывается с белой светящейся головой, по мере её прохода у каждой страны прорисовывается гра… | [карточка](../components/remotion-skills/river-reveal.md) |

### Адаптируется без переписывания (`adaptable`) — 47

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/avatar-list` | animata | Ряд круглых аватаров внахлёст; при наведении аватар увеличивается, появляется тултип с именем и должностью. | [карточка](../components/animata/avatar-list.md) |
| `animata/bento-eleven` | animata | Каркас bento из 11 плашек на сетке 5×5 для health-приложения: Grocery List, Meal Planner, Hydration Reminder, Travel Journal, Fitness Tra… | [карточка](../components/animata/bento-eleven.md) |
| `animata/bento-nine` | animata | Каркас bento из 9 плашек на сетке 4×3: две широкие, одна высокая, остальные одиночные. | [карточка](../components/animata/bento-nine.md) |
| `animata/card-comment` | animata | Абстрактная карточка-комментарий «{commenter} commented» с пульсирующими полосками-заглушками; по hover блок уезжает вверх и появляется з… | [карточка](../components/animata/card-comment.md) |
| `animata/collab-card` | animata | Карточка 3:2 в стиле Figma-мультиплеера: тёмный холст с бликами, «Live · 4 editing» с пульсирующей точкой и аватарами +2, крупное hello!… | [карточка](../components/animata/collab-card.md) |
| `animata/integration-pills` | animata | Облако таблеток-названий сервисов (Shopify, RSS, Zapier, Slack, Webflow …) в рамке; по hover обычные уменьшаются и сереют, а три выделенн… | [карточка](../components/animata/integration-pills.md) |
| `animata/marquee` | animata | Бесконечная горизонтальная или вертикальная бегущая лента из повторённых children с градиентной маской по краям. | [карточка](../components/animata/marquee.md) |
| `animata/orbiting-items` | animata | Тёмно-синий радиальный фон, две концентрические орбиты и иконки в кружках по большой орбите; система медленно вращается, иконки остаются… | [карточка](../components/animata/orbiting-items.md) |
| `animata/webhooks-card` | animata | Два блока-узла с подписями, соединённые пунктиром; по hover линия становится сплошной лаймовой, рамки загораются, шарик перекатывается от… | [карточка](../components/animata/webhooks-card.md) |
| `magicui/animated-beam` | magicui | Линия-связь (прямая или дуга) между двумя элементами схемы, по которой бежит светящийся градиентный импульс — данные текут от A к B. | [карточка](../components/magicui/animated-beam.md) |
| `magicui/avatar-circles` | magicui | Ряд перекрывающихся круглых аватаров с белой обводкой и кружком «+N». | [карточка](../components/magicui/avatar-circles.md) |
| `magicui/client-tweet-card` | magicui | Та же карточка поста X/Twitter, что tweet-card, но данные грузятся на клиенте хуком useTweet; до загрузки — скелетон. | [карточка](../components/magicui/client-tweet-card.md) |
| `magicui/dot-pattern` | magicui | Фон из ровной сетки точек; в режиме glow точки мягко пульсируют яркостью и размером в случайном ритме. | [карточка](../components/magicui/dot-pattern.md) |
| `magicui/hexagon-pattern` | magicui | Фоновые соты из шестиугольников (flat-top или pointy-top) с зазором и выборочно залитыми ячейками. | [карточка](../components/magicui/hexagon-pattern.md) |
| `magicui/marquee` | magicui | Бесконечная бегущая лента из любых элементов (логотипы, отзывы, карточки, текст) по горизонтали или вертикали. | [карточка](../components/magicui/marquee.md) |
| `magicui/marquee-3d` | magicui | Наклонённая в перспективе стена из четырёх вертикальных колонок карточек-отзывов, бегущих попеременно вверх и вниз; края гаснут. | [карточка](../components/magicui/marquee-3d.md) |
| `magicui/orbiting-circles` | magicui | Иконки, равномерно расставленные по круговой орбите и вращающиеся вокруг центра, с тонкой окружностью-траекторией; несколько экземпляров… | [карточка](../components/magicui/orbiting-circles.md) |
| `magicui/tweet-card` | magicui | Карточка поста X/Twitter: аватар, имя с галочкой, @handle, иконка X, текст с подсветкой ссылок, фото или видео. | [карточка](../components/magicui/tweet-card.md) |
| `motion-primitives-website/chat-bubble` | motion-primitives-website | Пузырь сообщения: пользователь — фиолетовый справа, ассистент — серый слева, системное — по центру курсивом; аватар и время; пружинное по… | [карточка](../components/motion-primitives-website/chat-bubble.md) |
| `motion-primitives-website/chat-container` | motion-primitives-website | Тёмное окно чата со скруглением и колонкой сообщений; при добавлении сообщений само прокручивается вниз. | [карточка](../components/motion-primitives-website/chat-container.md) |
| `motion-primitives-website/marquee` | motion-primitives-website | Бесконечная бегущая лента (горизонтальная или вертикальная): контент повторён repeat раз и бесшовно сдвигается; MarqueeItem — полупрозрач… | [карточка](../components/motion-primitives-website/marquee.md) |
| `motion-primitives-website/orbit-system` | motion-primitives-website | Солнечная система из иконок: центр с контентом, внутреннее кольцо вращается по часовой, внешнее — против; элементы равномерно распределены. | [карточка](../components/motion-primitives-website/orbit-system.md) |
| `motion-primitives-website/orbiting-circles` | motion-primitives-website | Элемент (иконка, логотип), вращающийся по круговой орбите вокруг центра, оставаясь вертикальным; пунктирная траектория. | [карточка](../components/motion-primitives-website/orbiting-circles.md) |
| `motion-primitives-website/svg-gooey-blob` | motion-primitives-website | Цветные круги, слипающиеся в жидкие капли (metaball через feGaussianBlur + feColorMatrix), медленно плавают туда-обратно. | [карточка](../components/motion-primitives-website/svg-gooey-blob.md) |
| `motion-primitives-website/svg-gradient-flow` | motion-primitives-website | SVG-фигуры или текст, по которым непрерывно течёт многоцветный линейный градиент. | [карточка](../components/motion-primitives-website/svg-gradient-flow.md) |
| `motion-primitives-website/svg-path-draw` | motion-primitives-website | SVG-обёртка, где все фигуры (path, line, polyline, polygon, circle, ellipse, rect) по очереди прорисовываются штрихом. | [карточка](../components/motion-primitives-website/svg-path-draw.md) |
| `nivo/chord` | nivo | Хордовая диаграмма (d3-chord): группы — дуги по окружности, взаимные потоки — полупрозрачные ленты, ширина пропорциональна величине. | [карточка](../components/nivo/chord.md) |
| `nivo/heatmap` | nivo | Матрица ячеек «строка × столбец»: цвет по значению (непрерывная шкала), опционально размер ячейки, форма rect/circle, подписи, оси, цвето… | [карточка](../components/nivo/heatmap.md) |
| `nivo/parallel-coordinates` | nivo | Параллельные координаты: несколько осей со своими шкалами, каждый объект — ломаная через все оси; группировка с раскраской; Canvas-вариант. | [карточка](../components/nivo/parallel-coordinates.md) |
| `nivo/sankey` | nivo | Диаграмма Санкея (d3-sankey): узлы по слоям и изогнутые ленты потоков между ними, толщина — величина; градиенты лент, подписи внутри/снар… | [карточка](../components/nivo/sankey.md) |
| `nivo/scatterplot` | nivo | Точечная диаграмма: серии точек x/y, опционально размер по третьему полю, шкалы linear/time/log, оси, маркеры, аннотации; ScatterPlotCanv… | [карточка](../components/nivo/scatterplot.md) |
| `nivo/tree` | nivo | Дерево/дендрограмма (d3-hierarchy): узлы-круги, связи кривыми bump/linear/step, четыре направления раскладки, подписи, подсветка предков… | [карточка](../components/nivo/tree.md) |
| `react-bits/grid-motion` | react-bits | Наклонённая стена из рядов плиток (картинки, текст, JSX), ряды едут в противоположные стороны, края растушёваны; опционально 3D-наклон и… | [карточка](../components/react-bits/grid-motion.md) |
| `react-bits/logo-loop` | react-bits | Бесконечная бегущая строка логотипов (иконки или картинки): горизонтально/вертикально, дуга-орбита с увеличением в центре, пошаговый режи… | [карточка](../components/react-bits/logo-loop.md) |
| `react-bits/orbit-images` | react-bits | Картинки, плывущие по орбите-контуру (эллипс, круг, квадрат, треугольник, звезда, сердце, бесконечность, волна) с эффектом глубины; в цен… | [карточка](../components/react-bits/orbit-images.md) |
| `recharts/sankey` | recharts | Диаграмма потоков: узлы-прямоугольники по колонкам глубины и ленты-связи (кубические кривые), толщина ленты пропорциональна величине потока. | [карточка](../components/recharts/sankey.md) |
| `recharts/scatter-chart` | recharts | Точечная диаграмма по двум числовым осям, размер по третьей (ZAxis), символы circle/diamond/star…, опционально соединяющая линия или регр… | [карточка](../components/recharts/scatter-chart.md) |
| `xyflow/edge-label-renderer` | xyflow | HTML-подписи на рёбрах: портал в слой поверх SVG-рёбер в координатах холста — плашки, бейджи, цифры, иконки посреди связи. | [карточка](../components/xyflow/edge-label-renderer.md) |
| `xyflow/edge-path-utils` | xyflow | Собственной картинки нет: чистые функции возвращают SVG-путь d между двумя точками и центр для подписи — рёбра React Flow в любом своём S… | [карточка](../components/xyflow/edge-path-utils.md) |
| `xyflow/edge-types` | xyflow | SVG-связи между узлами: плавная кривая, упрощённая кривая, прямая, ортогональная ломаная и ломаная со скруглёнными углами; стрелки на кон… | [карточка](../components/xyflow/edge-types.md) |
| `xyflow/example-custom-node` | xyflow | Тёмный холст #1A192B: input-узел слева, в центре свой узел с одним входом и двумя выходами a/b, справа два output-узла; три белых анимиро… | [карточка](../components/xyflow/example-custom-node.md) |
| `xyflow/example-edge-types` | xyflow | Сетка из 80 пар Source → Target: 5 типов рёбер × 2 ориентации ручек × 8 направлений расположения цели; узлы 80px в бирюзовой и синей пали… | [карточка](../components/xyflow/example-edge-types.md) |
| `xyflow/example-edges` | xyflow | Граф на 17 узлов, где каждое ребро — приём оформления: подписи всех типов, ребро «только подпись», анимированное красное, подпись на жёлт… | [карточка](../components/xyflow/example-edges.md) |
| `xyflow/example-floating-edges` | xyflow | Радиальная схема: узел Target в центре и 8 узлов Source по кругу радиусом 250px; плавающие bezier-рёбра выходят из точки пересечения лини… | [карточка](../components/xyflow/example-floating-edges.md) |
| `xyflow/example-subflow` | xyflow | Узлы-контейнеры с дочерними узлами (parentId): полупрозрачный красный блок 500×300, внутри синий 300×200 со своими детьми; рёбра между ур… | [карточка](../components/xyflow/example-subflow.md) |
| `xyflow/handle` | xyflow | Точка подключения на краю узла (кружок 6px), откуда выходит или куда входит ребро; несколько ручек с id — несколько выходов из одного узла. | [карточка](../components/xyflow/handle.md) |
| `xyflow/react-flow` | xyflow | Холст схемы: HTML-узлы и SVG-рёбра между ручками (bezier, step, straight), подписи и стрелки на рёбрах, общий viewport с панорамой и зумо… | [карточка](../components/xyflow/react-flow.md) |

### Требует существенной переработки (`complex`) — 40

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/boids-ecosystem` | animata | Стая из треугольников или точек на тёмном canvas: выравнивание, сцепление, расталкивание, шлейф; курсор распугивает, аттракторы притягивают. | [карточка](../components/animata/boids-ecosystem.md) |
| `animata/orbiting-items-3-d` | animata | Светящийся логотип в центре парит, 6 цветных иконок в стеклянных кружках летают по наклонённому эллипсу; ближние крупнее и поверх логотип… | [карточка](../components/animata/orbiting-items-3-d.md) |
| `echarts/chord` | echarts | Хордовая диаграмма: узлы — дуги по кругу, связи — ленты-хорды между дугами, толщина по величине потока. | [карточка](../components/echarts/chord.md) |
| `echarts/graph` | echarts | Граф узлов и связей: ручная раскладка по x/y, круговая или силовая (force); категории цветом, размеры узлов, стрелки, подписи рёбер. | [карточка](../components/echarts/graph.md) |
| `echarts/lines` | echarts | Набор отрезков и кривых между точками (обычно на карте): маршруты, перелёты, потоки, с бегущей точкой-кометой и следом. | [карточка](../components/echarts/lines.md) |
| `echarts/parallel` | echarts | Параллельные координаты: каждая запись — ломаная через ряд вертикальных осей-показателей, полупрозрачные линии образуют «пучки». | [карточка](../components/echarts/parallel.md) |
| `echarts/sankey` | echarts | Диаграмма потоков: узлы-столбики по уровням и ленты, толщина ленты — величина потока; горизонтально или вертикально. | [карточка](../components/echarts/sankey.md) |
| `echarts/scatter` | echarts | Точечная/пузырьковая диаграмма в декартовых, полярных, гео-, календарных и single-координатах; размер и цвет точки от данных, режим large… | [карточка](../components/echarts/scatter.md) |
| `echarts/tree` | echarts | Дерево узлов со связями: ортогональная раскладка LR/TB/RL/BT или радиальная, кривые или ломаные рёбра, подписи у узлов, сворачивание веток. | [карточка](../components/echarts/tree.md) |
| `magicui/icon-cloud` | magicui | Сфера из иконок или картинок (раскладка Фибоначчи), вращающаяся; дальние мельче и прозрачнее; клик поворачивает иконку к зрителю. | [карточка](../components/magicui/icon-cloud.md) |
| `mermaid/architecture` | mermaid | Схема облачной/CI-архитектуры: сервисы с иконками (database, disk, server, cloud, internet), группы-контейнеры, рёбра между сторонами L/R… | [карточка](../components/mermaid/architecture.md) |
| `mermaid/c4` | mermaid | C4-модель: люди и системы как карточки с названием и описанием, границы (Enterprise/System Boundary), связи Rel/BiRel с подписями; уровни… | [карточка](../components/mermaid/c4.md) |
| `mermaid/class-diagram` | mermaid | UML-диаграмма классов: прямоугольники с именем, полями и методами, связи наследования, композиции, агрегации, ассоциации; заметки. | [карточка](../components/mermaid/class-diagram.md) |
| `mermaid/er-diagram` | mermaid | ER-диаграмма: сущности-таблицы с атрибутами, связи с нотацией «вороньих лапок» (один-ко-многим и т.п.) и подписями. | [карточка](../components/mermaid/er-diagram.md) |
| `mermaid/requirement-diagram` | mermaid | SysML-диаграмма требований: карточки требований (id, текст, риск, метод проверки) и элементов, связи satisfies/traces/contains/verifies и… | [карточка](../components/mermaid/requirement-diagram.md) |
| `mermaid/sequence-diagram` | mermaid | Диаграмма последовательности: участники сверху, вертикальные линии жизни, горизонтальные стрелки сообщений с подписями сверху вниз по вре… | [карточка](../components/mermaid/sequence-diagram.md) |
| `mermaid/swimlanes` | mermaid | Кросс-функциональная блок-схема: горизонтальные или вертикальные дорожки (по subgraph) с шагами внутри и стрелками передачи работы между… | [карточка](../components/mermaid/swimlanes.md) |
| `mermaid/usecase` | mermaid | UML-диаграмма вариантов использования: актёры-человечки, овалы вариантов внутри рамки системы, связи; раскладка ELK. | [карточка](../components/mermaid/usecase.md) |
| `mermaid/venn` | mermaid | Диаграмма Венна: перекрывающиеся круги-множества с подписями, подписанные пересечения (union) двух и трёх множеств. | [карточка](../components/mermaid/venn.md) |
| `mermaid/zenuml` | mermaid | Диаграмма последовательности в нотации ZenUML: участники, сообщения, вложенные вызовы и блоки, похожие на код. | [карточка](../components/mermaid/zenuml.md) |
| `motion-primitives/infinite-slider` | motion-primitives | Бесконечная лента-маркиза: логотипы, карточки или отзывы непрерывно едут по горизонтали или вертикали, контент продублирован для бесшовно… | [карточка](../components/motion-primitives/infinite-slider.md) |
| `motion-primitives-website/animated-beam` | motion-primitives-website | Светящаяся линия-связь между двумя элементами (квадратичная кривая): по бледному пути бегут штрихи градиента от A к B; BeamCircle — узел-… | [карточка](../components/motion-primitives-website/animated-beam.md) |
| `motion-primitives-website/globe` | motion-primitives-website | Вращающийся 3D-глобус: wireframe — каркасная сфера с двумя кольцами-орбитами; dotted — сфера из 200 точек со светящимися дугами-связями. | [карточка](../components/motion-primitives-website/globe.md) |
| `motion-primitives-website/neural-network` | motion-primitives-website | 3D-нейросеть: ~96 светящихся нейронов в 7 слоях-кольцах с изогнутыми синапсами; нейроны вспыхивают, импульсы бегут по связям и зажигают с… | [карточка](../components/motion-primitives-website/neural-network.md) |
| `motion-primitives-website/organic-blob-background` | motion-primitives-website | Пять мягких светящихся пятен, кружащих вокруг центра по меняющимся орбитам и сливающихся на тёмном фоне. | [карточка](../components/motion-primitives-website/organic-blob-background.md) |
| `motion-primitives-website/particles` | motion-primitives-website | Полноэкранный canvas с дрейфующими точками; с connected близкие точки соединяются тонкими линиями (сеть/созвездие). | [карточка](../components/motion-primitives-website/particles.md) |
| `motion-primitives-website/svg-circuit-board` | motion-primitives-website | Сгенерированная печатная плата: узлы на сетке соединены ломаными дорожками; дорожки прорисовываются, узлы выпрыгивают и пульсируют, по до… | [карточка](../components/motion-primitives-website/svg-circuit-board.md) |
| `nivo/network` | nivo | Силовой граф: узлы-круги и связи-линии, раскладка d3-force (linkDistance, repulsivity, centeringStrength), размер/цвет/толщина из данных;… | [карточка](../components/nivo/network.md) |
| `react-bits/antigravity` | react-bits | Поле частиц (капсулы, сферы, кубики, тетраэдры), стягивающихся в кольцо вокруг точки-магнита; капсулы вытягиваются в штрихи к центру; с a… | [карточка](../components/react-bits/antigravity.md) |
| `react-bits/ferrofluid` | react-bits | Поверхность магнитной жидкости в наклонной перспективе: шипы растут над движущимися невидимыми магнитами; курсор — дополнительный магнит. | [карточка](../components/react-bits/ferrofluid.md) |
| `react-bits/floating-lines` | react-bits | Три группы плавающих светящихся линий (верх, середина, низ), изогнутых волнами с градиентом; клик закручивает. | [карточка](../components/react-bits/floating-lines.md) |
| `react-bits/ghost-fibers` | react-bits | Закрученные ленты из светящихся волокон (точки, штрихи, линии) в 3D-перспективе с bloom и глубиной резкости. | [карточка](../components/react-bits/ghost-fibers.md) |
| `react-bits/glass-icons` | react-bits | Сетка иконок-приложений из жидкого стекла: прозрачная плашка с преломлением и бликом по краю над цветной градиентной подложкой (наклонённ… | [карточка](../components/react-bits/glass-icons.md) |
| `react-bits/liquid-ether` | react-bits | Симуляция жидкости/дыма: цветные струи, закручивающиеся в вихри за курсором; при autoDemo виртуальный курсор водит сам. | [карточка](../components/react-bits/liquid-ether.md) |
| `react-bits/magnet-lines` | react-bits | Сетка коротких штрихов (линии, стрелки, стрелки компаса), поворачивающихся к точке-магниту, как опилки в магнитном поле; режимы orbit/att… | [карточка](../components/react-bits/magnet-lines.md) |
| `react-bits/meta-balls` | react-bits | Лава-лампа: шарики, сливающиеся в липкие капли (сплошные, контуром, изолиниями), орбитально движутся сами; дополнительный шар следует за… | [карточка](../components/react-bits/meta-balls.md) |
| `react-bits/particles` | react-bits | 3D-облако частиц (круги, квадраты, кольца, искры), дрейфующих с мерцанием и свечением; опционально соединения линиями. | [карточка](../components/react-bits/particles.md) |
| `react-bits/plasma-wave` | react-bits | Две изгибающиеся светящиеся плазменные волны-ленты с ярким ядром и свечением, переход между двумя цветами. | [карточка](../components/react-bits/plasma-wave.md) |
| `react-bits/threads` | react-bits | Пучок десятков тонких светящихся нитей, волнообразно колышущихся под углом, с расщеплением и бахромой. | [карточка](../components/react-bits/threads.md) |
| `react-bits/web-threads` | react-bits | Несколько светящихся нитей-паутинок с белым ядром, расходящихся и колышущихся в пространстве. | [карточка](../components/react-bits/web-threads.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`system-structure`, `cause-effect`, `spatial`
