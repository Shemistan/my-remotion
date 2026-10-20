# Пространственные отношения

«Находится внутри», «рядом», «над/под», «регионы», «на карте», «слои»,
«расстояние». Нужна геометрия: расположение объектов относительно друг
друга или на карте.

## Визуальные приёмы

1. **Карта с точками/регионами** — геоданные (choropleth, маркеры).
2. **Глобус** — международный масштаб.
3. **3D-сцена с камерой** — объекты в пространстве, облёт.
4. **Вложенные области** — circle packing, treemap, диаграмма Венна.
5. **Схема помещений/устройств** — блоки на плоскости со стрелками.
6. **Параллакс-слои** — глубина через разную скорость слоёв.

## Как выбирать

- География → nivo geo / echarts map (нужен GeoJSON; async-data) или
  статичный SVG карты + маркеры по кадру.
- «Внутри/часть» → venn, circle-packing, вложенные контейнеры.
- Нужна глубина и движение камеры → `3d-camera` (Scene3D, карусели,
  кубы).
- Планы/схемы → React Flow / mermaid block.

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 25

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `claude-code-plugin/remotion-maps` | claude-code-plugin | Не рисует; документ о картах в Remotion: развилка по техникам static map, Mapbox, MapLibre, MapTiler, CesiumJS и их TECHNIQUE.md/references. | [карточка](../components/claude-code-plugin/remotion-maps.md) |
| `free-remotion-templates/parallax-pan` | free-remotion-templates | Векторный пейзаж из слоёв (небо, солнце, горы, холмы, земля, ёлки), едущих влево с разной скоростью; поверх неподвижный заголовок и подза… | [карточка](../components/free-remotion-templates/parallax-pan.md) |
| `free-remotion-templates/starfield` | free-remotion-templates | Варп-полёт: звёзды разлетаются радиально от центра, к краям растут, ярчеют и вытягиваются в светящиеся шлейфы; по центру надпись. | [карточка](../components/free-remotion-templates/starfield.md) |
| `remotion-bits/bit-3d-basic` | remotion-bits | Три слова, расставленные в глубину сцены; камера по очереди пролетает к каждому, слово проявляется на входе и гаснет на выходе. | [карточка](../components/remotion-bits/bit-3d-basic.md) |
| `remotion-bits/bit-3d-elements` | remotion-bits | Камера летит по фразе из пяти слов, каждый шаг повёрнут на −30°; вокруг в глубине рассыпаны 20 полупрозрачных цветных кругов, треугольник… | [карточка](../components/remotion-bits/bit-3d-elements.md) |
| `remotion-bits/bit-carousel-3d` | remotion-bits | Кольцо из 8 квадратных карточек с номерами, вращающееся вокруг вертикальной оси; камера отъезжает назад с поворотом на 180° и возвращается. | [карточка](../components/remotion-bits/bit-carousel-3d.md) |
| `remotion-bits/bit-cursor-flyover` | remotion-bits | Скриншот приложения в 3D: камера показывает его целиком, затем приближается к четырём углам, SVG-курсор перелетает туда же и пульсирует,… | [карточка](../components/remotion-bits/bit-cursor-flyover.md) |
| `remotion-bits/bit-flying-through-words` | remotion-bits | Туннель из слов: названия ИИ-моделей рождаются в глубине по всему кадру и летят на зрителя, проявляясь и затухая. | [карточка](../components/remotion-bits/bit-flying-through-words.md) |
| `remotion-bits/bit-scene-3d-cube-nav` | remotion-bits | Куб из шести подписанных граней: камера стартует с изометрии, облетает каждую грань фронтально и возвращается в изометрию. | [карточка](../components/remotion-bits/bit-scene-3d-cube-nav.md) |
| `remotion-bits/bit-scrolling-columns` | remotion-bits | Четыре колонки цветных карточек с цифрами плывут вниз с разной скоростью на разной глубине, камера медленно панорамирует в перспективе —… | [карточка](../components/remotion-bits/bit-scrolling-columns.md) |
| `remotion-bits/bit-terminal-3d` | remotion-bits | Три окна терминала в стиле macOS в 3D (git status, логи сервера, сборка): печатается вывод, окна покачиваются, камера перелетает между ними. | [карточка](../components/remotion-bits/bit-terminal-3d.md) |
| `remotion-bits/bit-transform3d-showcase` | remotion-bits | Облёт из шести слайдов с карточками кода про Transform3D: квадрат по цепочке матриц, куб с тремя орбитальными спутниками, вложенные враща… | [карточка](../components/remotion-bits/bit-transform3d-showcase.md) |
| `remotion-bits/element-3d` | remotion-bits | Произвольный HTML-контент, размещённый в 3D-пространстве Scene3D вне шагов (декорации, плавающие карточки); с fixed — приклеен к камере к… | [карточка](../components/remotion-bits/element-3d.md) |
| `remotion-bits/scene-3d` | remotion-bits | CSS-3D мир в духе impress.js: шаги со своей позицией/поворотом/масштабом, камера перелетает между ними с easing; контент шагов входит и у… | [карточка](../components/remotion-bits/scene-3d.md) |
| `remotion-skills/3d` | remotion-skills | Не рисует; документ о 3D в Remotion: ThreeCanvas с width/height и светом, анимация только от useCurrentFrame(), запрет useFrame() из R3F,… | [карточка](../components/remotion-skills/3d.md) |
| `remotion-skills/cesium-flythrough` | remotion-skills | Полноэкранный 3D-пролёт камеры над реальной местностью (рельеф + спутник) или фотореалистичным городом по заданному маршруту, с креном в… | [карточка](../components/remotion-skills/cesium-flythrough.md) |
| `remotion-skills/country-label` | remotion-skills | Подпись-маркер: цветная светящаяся черта, вырастающая из центра, и под ней название капсом с разрядкой; поднимается снизу и проявляется. | [карточка](../components/remotion-skills/country-label.md) |
| `remotion-skills/maps-cesium` | remotion-skills | Не рисует; документ о 3D-пролётах в стиле авиасимулятора на CesiumJS: режимы landscape (рельеф и спутник MapTiler) и city (Google Photore… | [карточка](../components/remotion-skills/maps-cesium.md) |
| `remotion-skills/maps-mapbox` | remotion-skills | Не рисует; документ о детерминированных 2D-анимациях карт Mapbox GL JS + Turf: маршрут по большой окружности с прорисовкой (lineSliceAlon… | [карточка](../components/remotion-skills/maps-mapbox.md) |
| `remotion-skills/maps-maplibre` | remotion-skills | Не рисует; документ о детерминированных 2D-анимациях карт MapLibre GL JS + Turf (без API-ключа): маршруты, маркеры, подписи слоями, камер… | [карточка](../components/remotion-skills/maps-maplibre.md) |
| `remotion-skills/maps-maptiler` | remotion-skills | Не рисует; документ о картах-объяснялках на MapTiler SDK: векторные слои MapTiler Planet или свой GeoJSON, прорисовка рек и границ, залив… | [карточка](../components/remotion-skills/maps-maptiler.md) |
| `remotion-skills/maps-static` | remotion-skills | Не рисует; документ о статичной карте-локаторе: экспорт изображения карты в нужном соотношении, public/ + CanvasImage + staticFile, непод… | [карточка](../components/remotion-skills/maps-static.md) |
| `remotion-skills/remotion-maps` | remotion-skills | Не рисует; документ-развилка по картам: выбрать одну технику (static map, Mapbox, MapLibre, MapTiler, CesiumJS) по задуманному кадру и за… | [карточка](../components/remotion-skills/remotion-maps.md) |
| `remotion-skills/river-reveal` | remotion-skills | Карта-объяснялка: «электрическая» река прорисовывается с белой светящейся головой, по мере её прохода у каждой страны прорисовывается гра… | [карточка](../components/remotion-skills/river-reveal.md) |
| `remotion-video-templates/safe-area-layout` | remotion-video-templates | Своей картинки нет: доли безопасной зоны для 16:9 и 9:16 и обёртки Center/SafeArea над AbsoluteFill. | [карточка](../components/remotion-video-templates/safe-area-layout.md) |

### Адаптируется без переписывания (`adaptable`) — 37

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/case-study-card` | animata | Карточка-книжка 208×240: обложка с фото, категорией, заголовком и логотипом; по hover обложка приоткрывается (rotateY −30°), сзади выезжа… | [карточка](../components/animata/case-study-card.md) |
| `animata/dot` | animata | Статичный фон из регулярной сетки точек на белом. | [карточка](../components/animata/dot.md) |
| `animata/flight-widget` | animata | Посадочный талон: корешок с названием авиакомпании и логотипом, маршрут TOR → NYC, гейт A50, рейс AC951, место 1A, дата и время, вырезы-п… | [карточка](../components/animata/flight-widget.md) |
| `animata/grid` | animata | Статичный фон-клетка (миллиметровка) из линий 1px. | [карточка](../components/animata/grid.md) |
| `animata/shared-axis-z` | animata | Переход по оси глубины: новая строка выходит из глубины (scale 0.9 → 1, blur 2 → 0), старая уходит на зрителя (scale 1.06). | [карточка](../components/animata/shared-axis-z.md) |
| `animata/weather-card` | animata | Виджет погоды: город, иконка солнца с дождём, температура 19°, «Feels like 21°», плашка максимум/минимум. | [карточка](../components/animata/weather-card.md) |
| `magicui/android` | magicui | SVG-рамка Android-смартфона (корпус, кнопки, камера), в экран вставляется скриншот или видео. | [карточка](../components/magicui/android.md) |
| `magicui/dock` | magicui | Док в стиле macOS: стеклянная панель с круглыми иконками, которые под курсором пружинисто увеличиваются. | [карточка](../components/magicui/dock.md) |
| `magicui/dotted-map` | magicui | Карта мира из точек (SVG) с цветными маркерами по lat/lng, опционально пульсирующими, и своими подписями. | [карточка](../components/magicui/dotted-map.md) |
| `magicui/file-tree` | magicui | Дерево файлов проекта как в IDE: папки открыта/закрыта, файлы, направляющие вложенности, подсвеченный выбранный элемент. | [карточка](../components/magicui/file-tree.md) |
| `magicui/grid-pattern` | magicui | Фоновая клеточная сетка (сплошная или пунктирная) на SVG pattern с выборочно залитыми клетками. | [карточка](../components/magicui/grid-pattern.md) |
| `magicui/interactive-grid-pattern` | magicui | Сетка квадратов-rect, клетка под курсором подсвечивается и плавно гаснет — шлейф подсветки. | [карточка](../components/magicui/interactive-grid-pattern.md) |
| `magicui/iphone` | magicui | Рамка iPhone с Dynamic Island (SVG поверх), экран — HTML-слой со скриншотом или видео, обрезанный по скруглению. | [карточка](../components/magicui/iphone.md) |
| `magicui/marquee-3d` | magicui | Наклонённая в перспективе стена из четырёх вертикальных колонок карточек-отзывов, бегущих попеременно вверх и вниз; края гаснут. | [карточка](../components/magicui/marquee-3d.md) |
| `magicui/progressive-blur` | magicui | Полоса у края, где содержимое под ней размывается всё сильнее (8 ступеней backdrop-filter с масками) — мягкий край вместо обрезки. | [карточка](../components/magicui/progressive-blur.md) |
| `magicui/safari` | magicui | Окно браузера Safari: «светофоры», адресная строка с замком и URL, кнопки навигации; в окне — скриншот или видео сайта. | [карточка](../components/magicui/safari.md) |
| `magicui/striped-pattern` | magicui | Фон из тонких диагональных полос с наклоном влево или вправо, цвет currentColor. | [карточка](../components/magicui/striped-pattern.md) |
| `magicui/video-text` | magicui | Огромные буквы, внутри которых играет видео — видно только сквозь маску текста. | [карточка](../components/magicui/video-text.md) |
| `magicui/warp-background` | magicui | Блок с контентом внутри 3D-туннеля: четыре стены из клеточной сетки уходят в перспективу, по ним летят цветные лучи-кометы. | [карточка](../components/magicui/warp-background.md) |
| `motion-primitives/progressive-blur` | motion-primitives | Плавно нарастающее размытие к краю (сверху, снизу, слева, справа) поверх картинки или контента — матовое стекло у кромки. | [карточка](../components/motion-primitives/progressive-blur.md) |
| `motion-primitives-website/dot-pattern` | motion-primitives-website | Сетка точек (SVG pattern) с радиальным затуханием к краям; дети поверх. | [карточка](../components/motion-primitives-website/dot-pattern.md) |
| `motion-primitives-website/grid-background` | motion-primitives-website | Чёрный фон с тонкой сеткой или точками и затуханием сверху/снизу. | [карточка](../components/motion-primitives-website/grid-background.md) |
| `motion-primitives-website/grid-pattern` | motion-primitives-website | Сетка тонких линий в стиле Vercel (SVG pattern) с радиальным затуханием к краям; дети поверх. | [карточка](../components/motion-primitives-website/grid-pattern.md) |
| `motion-primitives-website/meteors` | motion-primitives-website | Метеоры — точки с хвостом 50 px, падающие по диагонали (215°) и гаснущие; случайные позиции, задержки и скорости. | [карточка](../components/motion-primitives-website/meteors.md) |
| `motion-primitives-website/perspective-grid` | motion-primitives-website | Сетка-пол, уходящая в перспективу (rotateX 75°) и гаснущая к горизонту — ретро-синтвейв плоскость. | [карточка](../components/motion-primitives-website/perspective-grid.md) |
| `nivo/choropleth` | nivo | Карта-хороплет: регионы из GeoJSON закрашены по значению, проекции d3-geo (mercator, orthographic-глобус и др.), сетка меридианов, легенд… | [карточка](../components/nivo/choropleth.md) |
| `nivo/voronoi` | nivo | Диаграмма Вороного и триангуляция Делоне (d3-delaunay) по точкам: ячейки, рёбра, точки, граница (experimental). | [карточка](../components/nivo/voronoi.md) |
| `react-bits/circular-carousel` | react-bits | 3D-кольцо изображений на CSS-трансформах: цилиндр с изогнутыми карточками, орбита с карточками лицом к зрителю, вертикальное колесо или п… | [карточка](../components/react-bits/circular-carousel.md) |
| `react-bits/depth-carousel` | react-bits | Карусель карточек-изображений, уходящих в глубину по 3D-рельсу: активная спереди, следующие сдвинуты вбок, отодвинуты по Z, повёрнуты и з… | [карточка](../components/react-bits/depth-carousel.md) |
| `react-bits/depth-text` | react-bits | Объёмная выдавленная надпись из десятков CSS-3D слоёв, медленно покачивающаяся по орбите (или за курсором); интро — глубина вырастает из… | [карточка](../components/react-bits/depth-text.md) |
| `react-bits/dome-gallery` | react-bits | Иммерсивный купол из фото: плитки по внутренней поверхности сферы (CSS 3D), зритель внутри; затемнение по краям, по клику фото раскрывается. | [карточка](../components/react-bits/dome-gallery.md) |
| `react-bits/gradual-blur` | react-bits | Плавно нарастающее размытие у края блока: стопка слоёв backdrop-filter с градиентными масками и тоном. | [карточка](../components/react-bits/gradual-blur.md) |
| `react-bits/masked-heading` | react-bits | Крупный заголовок, буквы которого — окна в картинку или видео (SVG clipPath из глифов): медиа дрейфует внутри букв, текст появляется по с… | [карточка](../components/react-bits/masked-heading.md) |
| `react-bits/tilted-card` | react-bits | 3D-карточка с изображением, наклоняющаяся в перспективе, с бликом, тенью на полу, параллакс-слоями и оборотной стороной (переворот 180°);… | [карточка](../components/react-bits/tilted-card.md) |
| `recharts/scatter-chart` | recharts | Точечная диаграмма по двум числовым осям, размер по третьей (ZAxis), символы circle/diamond/star…, опционально соединяющая линия или регр… | [карточка](../components/recharts/scatter-chart.md) |
| `xyflow/background` | xyflow | Бесконечная SVG-сетка за схемой: точки, клетка или крестики, привязанные к viewport — при панораме и зуме сетка двигается и масштабируетс… | [карточка](../components/xyflow/background.md) |
| `xyflow/example-subflow` | xyflow | Узлы-контейнеры с дочерними узлами (parentId): полупрозрачный красный блок 500×300, внутри синий 300×200 со своими детьми; рёбра между ур… | [карточка](../components/xyflow/example-subflow.md) |

### Требует существенной переработки (`complex`) — 27

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/direction-card` | animata | Чёрный виджет навигатора: дистанция до манёвра, большая стрелка поворота, улица; справа колонка предыдущий/текущий/следующий манёвр и зел… | [карточка](../components/animata/direction-card.md) |
| `animata/orbiting-items-3-d` | animata | Светящийся логотип в центре парит, 6 цветных иконок в стеклянных кружках летают по наклонённому эллипсу; ближние крупнее и поверх логотип… | [карточка](../components/animata/orbiting-items-3-d.md) |
| `echarts/effect-scatter` | echarts | Точки с расходящимися кольцами-«волнами» (ripple): маркеры городов, активные события, горячие точки на карте или графике. | [карточка](../components/echarts/effect-scatter.md) |
| `echarts/lines` | echarts | Набор отрезков и кривых между точками (обычно на карте): маршруты, перелёты, потоки, с бегущей точкой-кометой и следом. | [карточка](../components/echarts/lines.md) |
| `echarts/map` | echarts | Картограмма: регионы из GeoJSON или SVG, окрашенные по значению (через visualMap), подписи регионов, несколько рядов на одной карте. | [карточка](../components/echarts/map.md) |
| `echarts/scatter` | echarts | Точечная/пузырьковая диаграмма в декартовых, полярных, гео-, календарных и single-координатах; размер и цвет точки от данных, режим large… | [карточка](../components/echarts/scatter.md) |
| `magicui/floating-3d-particles` | magicui | Объёмное облако частиц, вращающееся вокруг вертикальной оси с перспективой; частицы медленно всплывают. | [карточка](../components/magicui/floating-3d-particles.md) |
| `magicui/globe` | magicui | Точечный 3D-глобус на WebGL, медленно вращающийся, с оранжевыми маркерами городов и свечением; тянется мышью. | [карточка](../components/magicui/globe.md) |
| `magicui/icon-cloud` | magicui | Сфера из иконок или картинок (раскладка Фибоначчи), вращающаяся; дальние мельче и прозрачнее; клик поворачивает иконку к зрителю. | [карточка](../components/magicui/icon-cloud.md) |
| `magicui/retro-grid` | magicui | Синтвейв-пол: сетка уходит в перспективу к горизонту и бесконечно едет на зрителя, сверху растворяется в фон. | [карточка](../components/magicui/retro-grid.md) |
| `mermaid/block` | mermaid | Блок-диаграмма с ручной сеткой: блоки по колонкам, вложенные блоки, пробелы space, стрелки-блоки и связи; автор сам задаёт расположение. | [карточка](../components/mermaid/block.md) |
| `mermaid/cynefin` | mermaid | Фреймворк Кеневин: пять доменов (Clear, Complicated, Complex, Chaotic, Confusion) с волнистой границей и «обрывом», элементы-метки внутри… | [карточка](../components/mermaid/cynefin.md) |
| `mermaid/quadrant-chart` | mermaid | Матрица 2×2: четыре цветных квадранта с подписями, оси с подписями краёв, точки-объекты по координатам 0…1 с метками. | [карточка](../components/mermaid/quadrant-chart.md) |
| `mermaid/wardley` | mermaid | Карта Уордли: компоненты цепочки ценности на осях «видимость» и «эволюция» (genesis → commodity), связи зависимостей, стрелки эволюции, з… | [карточка](../components/mermaid/wardley.md) |
| `motion-primitives-website/floating-shapes` | motion-primitives-website | 3D-фон: металлические фигуры (искажающаяся сфера, тор, каркасный икосаэдр) парят и вращаются в облаке частиц, освещённые HDR-окружением. | [карточка](../components/motion-primitives-website/floating-shapes.md) |
| `motion-primitives-website/globe` | motion-primitives-website | Вращающийся 3D-глобус: wireframe — каркасная сфера с двумя кольцами-орбитами; dotted — сфера из 200 точек со светящимися дугами-связями. | [карточка](../components/motion-primitives-website/globe.md) |
| `react-bits/circular-gallery` | react-bits | Горизонтальная лента карточек-изображений, изогнутая дугой, с лёгкой волной поверхности, подписями, тенями и затуханием краёв; карточку м… | [карточка](../components/react-bits/circular-gallery.md) |
| `react-bits/flying-posters` | react-bits | Бесконечная колонка (или несколько) 3D-постеров, которые при движении закручиваются и переворачиваются с изгибом плоскости; соседние коло… | [карточка](../components/react-bits/flying-posters.md) |
| `react-bits/galaxy` | react-bits | Многослойное звёздное поле с бликами-флерами и свечением, медленный полёт; курсор отталкивает звёзды, клик — варп. | [карточка](../components/react-bits/galaxy.md) |
| `react-bits/grid-scan` | react-bits | 3D-коридор из линий сетки, уходящий вглубь, по которому периодически проходит светящаяся полоса сканирования; клик — пинг. | [карточка](../components/react-bits/grid-scan.md) |
| `react-bits/lanyard` | react-bits | 3D-бейдж на тканом ремешке с металлическим карабином: раскачивается на ветру, при intro влетает и повисает; отделка glossy/matte/holograp… | [карточка](../components/react-bits/lanyard.md) |
| `react-bits/light-tunnel` | react-bits | Тоннель из десятков кабелей, по которым бегут световые импульсы внутрь или наружу; клик — всплеск. | [карточка](../components/react-bits/light-tunnel.md) |
| `react-bits/magnet-lines` | react-bits | Сетка коротких штрихов (линии, стрелки, стрелки компаса), поворачивающихся к точке-магниту, как опилки в магнитном поле; режимы orbit/att… | [карточка](../components/react-bits/magnet-lines.md) |
| `react-bits/model-viewer` | react-bits | Продуктовый 3D-просмотр модели GLB/GLTF/FBX/OBJ: автокадрирование, парение над контактной тенью, медленный автоповорот, intro с подъёмом… | [карточка](../components/react-bits/model-viewer.md) |
| `react-bits/radar` | react-bits | Экран радара: кольца, спицы, вращающийся луч развёртки со шлейфом, вспыхивающие цели и помехи. | [карточка](../components/react-bits/radar.md) |
| `react-bits/shape-grid` | react-bits | Бесконечная сетка фигур (квадраты, плитки, шестиугольники, треугольники, ромбы, круги, кресты, точки), сдвигающаяся в заданном направлени… | [карточка](../components/react-bits/shape-grid.md) |
| `react-bits/topography` | react-bits | Рельеф местности из светящихся контурных линий в наклонной 3D-перспективе с туманом и DOF; ландшафт плывёт вперёд. | [карточка](../components/react-bits/topography.md) |

### Не подходит (`unsuitable`) — 2

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `xyflow/controls` | xyflow | Колонка или строка кнопок в углу холста: zoom in, zoom out, fit view, замок интерактивности. | [карточка](../components/xyflow/controls.md) |
| `xyflow/mini-map` | xyflow | Миниатюра всего графа в углу холста: прямоугольники узлов в SVG и маска, выделяющая видимую область viewport. | [карточка](../components/xyflow/mini-map.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`system-structure`, `relationships`, `abstract-concepts`
