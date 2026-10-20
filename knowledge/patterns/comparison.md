# Сравнение

«А против Б», «до и после», «в три раза больше», «лидер и отстающие»,
плюсы/минусы. Важно показать два (или несколько) объекта в одном кадре с
одинаковой шкалой.

## Визуальные приёмы

1. **Горизонтальные бары** — несколько категорий, одна метрика; порядок по
   величине подчёркивает лидера.
2. **Сплит-экран / две карточки** — два объекта рядом, свойства построчно.
3. **До/после** — слайдер или wipe между двумя изображениями.
4. **Два счётчика рядом** — когда сравниваются два числа.
5. **Таблица с подсветкой** — для 3+ критериев.
6. **Радар** — профиль нескольких характеристик у 2–3 объектов.

## Как выбирать

- 2 числа → два счётчика или две карточки со stagger.
- 3–7 категорий → бар-чарт.
- Визуальные объекты (скриншоты, кадры) → image-comparison / wipe.
- Много критериев → таблица или радар (не более 6 осей).

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 20

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/bar-chart-anim` | free-remotion-templates | Вертикальная столбчатая диаграмма: заголовок и подзаголовок, скруглённые столбцы своих цветов растут от базовой линии по очереди, под ним… | [карточка](../components/free-remotion-templates/bar-chart-anim.md) |
| `free-remotion-templates/card-flip-transition` | free-remotion-templates | Весь кадр как карточка переворачивается на 180° по оси Y: спереди сцена до, на обороте сцена после; под карточкой подсвеченная сцена и ко… | [карточка](../components/free-remotion-templates/card-flip-transition.md) |
| `free-remotion-templates/pixel-mosaic-transition` | free-remotion-templates | 8-битный стингер: процедурная пиксельная сцена день укрупняется в мозаику, на пике со вспышкой меняется на ночь (луна, звёзды) и снова ст… | [карточка](../components/free-remotion-templates/pixel-mosaic-transition.md) |
| `free-remotion-templates/racing-chart` | free-remotion-templates | Гонка горизонтальных баров: серии с подписями и значениями внутри бара, значения плавно меняются между шагами, бары тянутся относительно… | [карточка](../components/free-remotion-templates/racing-chart.md) |
| `free-remotion-templates/slide-wipe` | free-remotion-templates | Горизонтальный пуш: сцена до уезжает влево, сцена после въезжает справа, края страниц стыкуются. | [карточка](../components/free-remotion-templates/slide-wipe.md) |
| `free-remotion-templates/split-screen` | free-remotion-templates | Кадр делится на две контрастные панели: каждая раскрывается clip-path-вайпом, по центру выстреливает разделитель, затем поднимаются загол… | [карточка](../components/free-remotion-templates/split-screen.md) |
| `remotion-bits/bit-bar-chart` | remotion-bits | Горизонтальная столбчатая диаграмма: заголовок, подписи, бары растут слева направо со stagger, справа докручиваются значения. | [карточка](../components/remotion-bits/bit-bar-chart.md) |
| `remotion-bits/bit-card-stack` | remotion-bits | Восемь пронумерованных карточек влетают снизу по очереди и ложатся веером с поворотом, сдвигом по X и глубиной по Z. | [карточка](../components/remotion-bits/bit-card-stack.md) |
| `remotion-bits/bit-carousel-3d` | remotion-bits | Кольцо из 8 квадратных карточек с номерами, вращающееся вокруг вертикальной оси; камера отъезжает назад с поворотом на 180° и возвращается. | [карточка](../components/remotion-bits/bit-carousel-3d.md) |
| `remotion-bits/bit-easings-visualizer` | remotion-bits | Девять дорожек с подписями (linear, easeInQuad … spring, steps(5)); синий квадрат на каждой должен проезжать слева направо за 60 кадров с… | [карточка](../components/remotion-bits/bit-easings-visualizer.md) |
| `remotion-bits/bit-mosaic-reframe` | remotion-bits | Двенадцать фото-плиток: сетка 4×3 → мозаика с крупным главным кадром → диагональный каскад повёрнутых квадратов с глубиной; плитки меняют… | [карточка](../components/remotion-bits/bit-mosaic-reframe.md) |
| `remotion-bits/bit-staggered-fade-in` | remotion-bits | Пять цветных квадратов в ряд по очереди поднимаются снизу и проявляются. | [карточка](../components/remotion-bits/bit-staggered-fade-in.md) |
| `remotion-bits/bit-stat-rings` | remotion-bits | Три круговых прогресс-кольца в ряд: появляются с пружинкой, дуга заполняется до процента, в центре синхронно докручивается число, под кол… | [карточка](../components/remotion-bits/bit-stat-rings.md) |
| `remotion-bits/multitext-typewriter` | remotion-bits | Три фразы печатаются по очереди: набор, пауза, посимвольное стирание, следующая фраза; затем цикл заново. | [карточка](../components/remotion-bits/multitext-typewriter.md) |
| `remotion-bits/scrolling-images` | remotion-bits | Несколько вертикальных колонок картинок, бесконечно прокручивающихся вверх или вниз с разной скоростью — «стена» скриншотов/работ. | [карточка](../components/remotion-bits/scrolling-images.md) |
| `remotion-bits/staggered-motion` | remotion-bits | Группа дочерних элементов, входящих одной анимацией (сдвиг, масштаб, поворот, opacity, blur, цвет) с задержкой между соседями. | [карточка](../components/remotion-bits/staggered-motion.md) |
| `remotion-skills/text-highlights` | remotion-skills | Не рисует; документ о рисованных аннотациях текста: маркер-выделение, обводка кругом, подчёркивание, зачёркивание, перечёркивание крестом… | [карточка](../components/remotion-skills/text-highlights.md) |
| `remotion-video-templates/bar-chart-race` | remotion-video-templates | Гонка горизонтальных баров: серии меняют значения по шагам времени, бары растут и плавно меняются местами по рангу; справа число, в углу… | [карточка](../components/remotion-video-templates/bar-chart-race.md) |
| `remotion-video-templates/color-utils` | remotion-video-templates | Своей картинки нет: светлая палитра zinc + синий акцент, категориальные цвета графиков, функции withAlpha и mix для hex. | [карточка](../components/remotion-video-templates/color-utils.md) |
| `remotion-video-templates/line-chart-draw` | remotion-video-templates | SVG-график нескольких серий: сетка с подписями Y, метки шагов X, легенда; линии рисуются слева направо с бегущей точкой, затем проявляетс… | [карточка](../components/remotion-video-templates/line-chart-draw.md) |

### Адаптируется без переписывания (`adaptable`) — 87

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/bar-chart` | animata | Компактная вертикальная мини-диаграмма: ряд столбцов с зазором 2px, высота каждого — процент от высоты контейнера; при появлении все выра… | [карточка](../components/animata/bar-chart.md) |
| `animata/battery-level` | animata | Виджет батарей устройств: сетка 2×2 кольцевых индикаторов с иконками Apple/телефон/ноутбук/часы и уровнями 100/40/80/20%. | [карточка](../components/animata/battery-level.md) |
| `animata/bento-four` | animata | Каркас bento из 4 цветных плашек-заглушек на сетке 3×3: широкая синяя, зелёная, высокая серая и большая красная 2×2. | [карточка](../components/animata/bento-four.md) |
| `animata/bento-gradient` | animata | Bento-сетка 3 колонки на тёмном фоне: четыре карточки с иконкой, заголовком, описанием и мягким градиентом (Gradient, Linear, Radial, Con… | [карточка](../components/animata/bento-gradient.md) |
| `animata/bento-three` | animata | Финансовая bento-панель 2×2: недельные траты столбиками (ExpenseTracker) на две строки, «Total income $7,000» и «Top categories» с суммами. | [карточка](../components/animata/bento-three.md) |
| `animata/expense-tracker` | animata | Виджет недельных трат: месяц и год, 7 капсул-столбиков по дням с синей заливкой по доле дня, итог «THIS WEEK SPENDING $3,740». | [карточка](../components/animata/expense-tracker.md) |
| `animata/fade-through` | animata | Material fade through: строка целиком гаснет, следующая проявляется с 6px снизу, лёгким blur и масштабом 0.99. | [карточка](../components/animata/fade-through.md) |
| `animata/flip-card` | animata | Карточка 224×288 с двумя гранями: по hover переворачивается на 180° по Y (или X) и показывает обратную сторону; содержимое граней — любые… | [карточка](../components/animata/flip-card.md) |
| `animata/flipping-cards` | animata | Сетка из 3 колонок карточек 192×240, каждая при наведении переворачивается по оси Y и показывает обратную сторону. | [карточка](../components/animata/flipping-cards.md) |
| `animata/fund-widget` | animata | Белая карточка-стопка: крупное значение актива «2.7Cr», изменение «12% ↑» зелёным или «−8% ↓» красным, подпись Stocks/Funds/Deposits и ве… | [карточка](../components/animata/fund-widget.md) |
| `animata/image-carousel` | animata | Рамка 600×500 с тремя карточками веером: центральная увеличена и резкая, боковые повёрнуты на ∓20° и размыты; стрелки листают. | [карточка](../components/animata/image-carousel.md) |
| `animata/live-score` | animata | Спортивное табло: флаги и коды команд, четыре перекидные цифры счёта, нижняя полоса с раундом, ромбом баз и счётом побед. | [карточка](../components/animata/live-score.md) |
| `animata/mobile-detail` | animata | Тёмный виджет состояния телефона: 2×2 плитки Battery 25%, Volume 50%, Ram 75%, Storage 90%, каждая залита снизу на свой процент. | [карточка](../components/animata/mobile-detail.md) |
| `animata/photo-booth` | animata | Светло-серая панель с сеткой квадратных фото 110×110 (2 или 4 колонки), при наведении фото увеличивается до 125%. | [карточка](../components/animata/photo-booth.md) |
| `animata/pricing` | animata | Карточка выбора тарифа: переключатель Monthly/Yearly с ездящей подложкой, список планов с ценой, бейджем Popular и радио-кружком, выбранн… | [карточка](../components/animata/pricing.md) |
| `animata/product-features` | animata | Промо-секция: заголовок и подзаголовок всплывают снизу, CTA, затем три фото-карточки товаров веером — центральная поднимается, боковые пр… | [карточка](../components/animata/product-features.md) |
| `animata/reminder` | animata | Виджет «Today»: две цветные плашки-корзины с числом задач (Work 2, Home 3) и строка «→ Meeting in 30 min». | [карточка](../components/animata/reminder.md) |
| `animata/reveal-image` | animata | Список услуг огромным текстом (Branding, Web design, Illustration); при наведении слово бледнеет и рядом выпрыгивают две маленькие фотогр… | [карточка](../components/animata/reveal-image.md) |
| `animata/ring-chart` | animata | Концентрические кольца активности в стиле Apple Watch на тёмной плашке: каждое кольцо — доля 0–100 % своим цветом и полупрозрачной дорожкой. | [карточка](../components/animata/ring-chart.md) |
| `animata/score-board` | animata | Виджет «Status Good»: мини бар-чарт из 9 столбиков (зелёные и один красный) и «Overall progress 80% (score, progress)». | [карточка](../components/animata/score-board.md) |
| `animata/split-text` | animata | Огромное слово, каждая буква разрезана по горизонтали; под курсором половинки расходятся вверх/вниз на 20px, у соседей на 12 и 4px. | [карточка](../components/animata/split-text.md) |
| `animata/storage-status` | animata | Высокая чёрная колонка — стек диска 512 GB: сегменты Free, System 50, Audio 80, Video 150 GB с высотой по доле и выносками-ярлыками «N GB… | [карточка](../components/animata/storage-status.md) |
| `animata/study-timer` | animata | Тёмный виджет учебных сессий: иконка в пульсирующем кольце, бейдж числа сессий, суммарное время 01:47, легенда минут и полоса цветных сег… | [карточка](../components/animata/study-timer.md) |
| `animata/swap-text` | animata | Две надписи в окне: начальная уезжает вверх, снизу поднимается финальная (1000 мс, ease-slow). | [карточка](../components/animata/swap-text.md) |
| `animata/swap-text-card` | animata | Светло-серая карточка с надзаголовком ANIMATA и крупной фразой; по hover фраза уезжает вверх и гаснет, на её место поднимается поясняющий… | [карточка](../components/animata/swap-text-card.md) |
| `magicui/android` | magicui | SVG-рамка Android-смартфона (корпус, кнопки, камера), в экран вставляется скриншот или видео. | [карточка](../components/magicui/android.md) |
| `magicui/animated-circular-progress-bar` | magicui | Круговой гейдж: дуга основного цвета на процент, остаток второстепенным цветом с зазорами, число процентов в центре. | [карточка](../components/magicui/animated-circular-progress-bar.md) |
| `magicui/bento-grid` | magicui | Сетка «бенто» из карточек разного размера: фон-иллюстрация, иконка, заголовок, описание и CTA. | [карточка](../components/magicui/bento-grid.md) |
| `magicui/code-comparison` | magicui | Две панели кода before/after с подсветкой Shiki, бейджем VS, подсветкой строк, diff (+/−) и фокусом (остальные строки размыты). | [карточка](../components/magicui/code-comparison.md) |
| `magicui/dotted-map` | magicui | Карта мира из точек (SVG) с цветными маркерами по lat/lng, опционально пульсирующими, и своими подписями. | [карточка](../components/magicui/dotted-map.md) |
| `magicui/iphone` | magicui | Рамка iPhone с Dynamic Island (SVG поверх), экран — HTML-слой со скриншотом или видео, обрезанный по скруглению. | [карточка](../components/magicui/iphone.md) |
| `magicui/magic-card` | magicui | Карточка с прожектором под курсором: радиальное пятно подсвечивает рамку градиентом и фон; режим orb — размытый цветной шар за курсором. | [карточка](../components/magicui/magic-card.md) |
| `magicui/striped-pattern` | magicui | Фон из тонких диагональных полос с наклоном влево или вправо, цвет currentColor. | [карточка](../components/magicui/striped-pattern.md) |
| `magicui/word-rotate` | magicui | Слово в одной позиции по таймеру сменяется следующим: старое уезжает вниз и гаснет, новое въезжает сверху. | [карточка](../components/magicui/word-rotate.md) |
| `motion-primitives/animated-group` | motion-primitives | Дети контейнера появляются по очереди (stagger 0.1 с) одним из 10 пресетов: fade, slide, scale, blur, blur-slide, zoom, flip, bounce, rot… | [карточка](../components/motion-primitives/animated-group.md) |
| `motion-primitives/border-trail` | motion-primitives | Светящийся огонёк, бегущий по рамке карточки или поля по кругу; виден только в пределах бордера (маска). | [карточка](../components/motion-primitives/border-trail.md) |
| `motion-primitives/image-comparison` | motion-primitives | Два изображения друг над другом и вертикальный разделитель: слева одно, справа другое — «до / после». | [карточка](../components/motion-primitives/image-comparison.md) |
| `motion-primitives/text-loop` | motion-primitives | Слот в строке, где по кругу сменяются слова/фразы: текущее уезжает вверх и гаснет, следующее въезжает снизу. | [карточка](../components/motion-primitives/text-loop.md) |
| `motion-primitives-website/border-beam` | motion-primitives-website | Размытый градиентный луч, бегущий по периметру карточки внутри её рамки. | [карточка](../components/motion-primitives-website/border-beam.md) |
| `motion-primitives-website/chat-bubble` | motion-primitives-website | Пузырь сообщения: пользователь — фиолетовый справа, ассистент — серый слева, системное — по центру курсивом; аватар и время; пружинное по… | [карточка](../components/motion-primitives-website/chat-bubble.md) |
| `motion-primitives-website/circular-progress` | motion-primitives-website | Кольцо прогресса (SVG): дуга пружинно дорастает до процента, в центре — процент или свой контент. | [карточка](../components/motion-primitives-website/circular-progress.md) |
| `motion-primitives-website/flip-words` | motion-primitives-website | Слово в строке сменяется по таймеру: новое въезжает снизу, старое уходит вверх с затуханием. | [карточка](../components/motion-primitives-website/flip-words.md) |
| `motion-primitives-website/grid-beams` | motion-primitives-website | Чёрный фон с еле заметной сеткой и тремя вертикальными светящимися лучами (cyan, violet, fuchsia), пульсирующими со сдвигом. | [карточка](../components/motion-primitives-website/grid-beams.md) |
| `motion-primitives-website/page-stagger` | motion-primitives-website | Контейнер, дочерние PageStaggerChild которого въезжают по очереди (сдвиг 40 px + проявление) на mount. | [карточка](../components/motion-primitives-website/page-stagger.md) |
| `motion-primitives-website/progress-bar` | motion-primitives-website | Горизонтальная полоса прогресса, пружинно заполняющаяся до значения; опционально подпись с процентом, свечение и бегущие диагональные пол… | [карточка](../components/motion-primitives-website/progress-bar.md) |
| `motion-primitives-website/split-color-text` | motion-primitives-website | Текст, разрезанный по вертикали на два цвета; граница — splitPosition %. | [карточка](../components/motion-primitives-website/split-color-text.md) |
| `motion-primitives-website/stat-card` | motion-primitives-website | KPI-карточка: подпись и иконка, крупное пружинное число и бейдж тренда — зелёная стрелка вверх или красная вниз с процентом. | [карточка](../components/motion-primitives-website/stat-card.md) |
| `motion-primitives-website/word-rotate` | motion-primitives-website | Слово, сменяющееся по таймеру: новое падает сверху (y −30 → 0), старое уходит вниз с затуханием. | [карточка](../components/motion-primitives-website/word-rotate.md) |
| `nivo/bar` | nivo | Столбчатая диаграмма: вертикальные или горизонтальные бары, stacked/grouped, отрицательные значения, подписи, суммы стопок, оси, сетка, л… | [карточка](../components/nivo/bar.md) |
| `nivo/boxplot` | nivo | Ящик с усами по сырым наблюдениям: межквартильный ящик, медиана, усы до крайних квантилей; группы и подгруппы рядом. | [карточка](../components/nivo/boxplot.md) |
| `nivo/bullet` | nivo | Bullet chart: полосы диапазонов (плохо/норма/хорошо), бар фактического значения (measure) и риски целей (markers); несколько показателей… | [карточка](../components/nivo/bullet.md) |
| `nivo/bump` | nivo | Bump chart: позиции серий в рейтинге во времени — сглаженные линии меняются местами, подписи на концах, точки в узлах; в пакете также Are… | [карточка](../components/nivo/bump.md) |
| `nivo/choropleth` | nivo | Карта-хороплет: регионы из GeoJSON закрашены по значению, проекции d3-geo (mercator, orthographic-глобус и др.), сетка меридианов, легенд… | [карточка](../components/nivo/choropleth.md) |
| `nivo/circle-packing` | nivo | Вложенные круги (d3 pack): узел дерева — круг, площадь пропорциональна значению, дети внутри родителя; зум на узел (zoomedId). Варианты C… | [карточка](../components/nivo/circle-packing.md) |
| `nivo/heatmap` | nivo | Матрица ячеек «строка × столбец»: цвет по значению (непрерывная шкала), опционально размер ячейки, форма rect/circle, подписи, оси, цвето… | [карточка](../components/nivo/heatmap.md) |
| `nivo/line` | nivo | Линейный график: серии, точки, области (в т.ч. стопкой), кривые d3, шкалы point/linear/time/log, маркеры, легенды, разрывы на null; LineC… | [карточка](../components/nivo/line.md) |
| `nivo/marimekko` | nivo | Mosaic-диаграмма: столбцы переменной ширины (размер сегмента), внутри — стопка долей; offset expand/diverging/none/silouhette/wiggle. | [карточка](../components/nivo/marimekko.md) |
| `nivo/parallel-coordinates` | nivo | Параллельные координаты: несколько осей со своими шкалами, каждый объект — ломаная через все оси; группировка с раскраской; Canvas-вариант. | [карточка](../components/nivo/parallel-coordinates.md) |
| `nivo/pie` | nivo | Круговая диаграмма или пончик (innerRadius): сектора с подписями внутри и выносками, диапазон углов, отступы, скругления, метрика в центр… | [карточка](../components/nivo/pie.md) |
| `nivo/polar-bar` | nivo | Полярная столбчатая диаграмма (роза): равные угловые сектора на категорию, столбцы растут от центра по радиусу, серии стопкой, полярная с… | [карточка](../components/nivo/polar-bar.md) |
| `nivo/radar` | nivo | Радар-«паутина»: оси по кругу на каждую метрику, серии — замкнутые полупрозрачные фигуры, круглая или многоугольная сетка, точки и подписи. | [карточка](../components/nivo/radar.md) |
| `nivo/radial-bar` | nivo | Радиальные бары: концентрические кольца по сериям, дуги категорий, длина дуги — значение; фоновые треки делают кольца похожими на прогрес… | [карточка](../components/nivo/radial-bar.md) |
| `nivo/scatterplot` | nivo | Точечная диаграмма: серии точек x/y, опционально размер по третьему полю, шкалы linear/time/log, оси, маркеры, аннотации; ScatterPlotCanv… | [карточка](../components/nivo/scatterplot.md) |
| `nivo/stream` | nivo | Streamgraph: сглаженные слои-потоки стопкой во времени со смещённой базовой линией (offsetType), точки и срезы. | [карточка](../components/nivo/stream.md) |
| `nivo/swarmplot` | nivo | Swarm/beeswarm: каждая запись — кружок на оси значения по группам, без перекрытий (коллизии d3-force), размер по третьему полю. | [карточка](../components/nivo/swarmplot.md) |
| `nivo/treemap` | nivo | Treemap (d3-hierarchy): вложенные прямоугольники, площадь пропорциональна значению, полосы подписей родителей; варианты TreeMapHtml, Tree… | [карточка](../components/nivo/treemap.md) |
| `nivo/waffle` | nivo | Вафельная диаграмма: сетка rows × columns, доли закрашены цветами категорий в порядке fillDirection, остаток emptyColor, слой areas обвод… | [карточка](../components/nivo/waffle.md) |
| `react-bits/accordion-gallery` | react-bits | Ряд или колонка узких панелей-фотографий; активная раскрывается на большую часть ширины, становится цветной и показывает подпись с акцент… | [карточка](../components/react-bits/accordion-gallery.md) |
| `react-bits/bounce-cards` | react-bits | Веер фото-карточек в белой рамке, которые по очереди выпрыгивают из нуля с упругим отскоком и раскладываются с наклонами; при наведении с… | [карточка](../components/react-bits/bounce-cards.md) |
| `react-bits/card-swap` | react-bits | Стопка карточек в перспективе, уходящая вглубь по диагонали со skew: по таймеру передняя улетает вниз и встаёт в конец колоды, остальные… | [карточка](../components/react-bits/card-swap.md) |
| `react-bits/carousel` | react-bits | Карусель карточек (текст с иконкой или фото) в стеклянной рамке с переходами tilt/slide/scale/fade/cube и индикатором — точки, полоски-та… | [карточка](../components/react-bits/carousel.md) |
| `react-bits/chroma-grid` | react-bits | Сетка фото-карточек в оттенках серого; круглый прожектор возвращает снимкам цвет и подсвечивает рамки акцентным цветом; подписи под фото. | [карточка](../components/react-bits/chroma-grid.md) |
| `react-bits/magic-bento` | react-bits | Bento-сетка карточек фич (1×1 и 2×2) с живыми мини-иллюстрациями: рисующийся график, дашборд, совместная работа, пайплайн автоматизации,… | [карточка](../components/react-bits/magic-bento.md) |
| `react-bits/stack` | react-bits | Стопка карточек (фото или контент) в раскладке веер, каскад, колода или россыпь; верхняя карточка улетает и подкладывается вниз, остальны… | [карточка](../components/react-bits/stack.md) |
| `recharts/bar-chart` | recharts | Столбчатая диаграмма в SVG: вертикальные или горизонтальные столбцы, группы и стеки, скругления, фон столбца, подписи значений, оси и сетка. | [карточка](../components/recharts/bar-chart.md) |
| `recharts/composed-chart` | recharts | Комбинированный декартов график: столбцы, линии, области и точки в одной системе координат, при необходимости на двух осях Y. | [карточка](../components/recharts/composed-chart.md) |
| `recharts/label-list` | recharts | Подписи значений у каждого элемента ряда: над столбцами, внутри секторов, у точек линии, у этапов воронки. | [карточка](../components/recharts/label-list.md) |
| `recharts/legend` | recharts | Легенда рядов: иконка типа ряда и название, горизонтально или вертикально, снизу/сверху/сбоку графика. | [карточка](../components/recharts/legend.md) |
| `recharts/line-chart` | recharts | Линейный график: одна или несколько кривых по точкам данных, точки, подписи, интерполяция кривой (linear, monotone, step…), пунктир, оси… | [карточка](../components/recharts/line-chart.md) |
| `recharts/pie-chart` | recharts | Круговая и кольцевая (donut) диаграммы, полукруг, вложенные кольца, выносные подписи с линиями, отступы между секторами. | [карточка](../components/recharts/pie-chart.md) |
| `recharts/radar-chart` | recharts | Лепестковая диаграмма: многоугольник значений по 4–10 осям-критериям поверх паутины PolarGrid, несколько полупрозрачных профилей для срав… | [карточка](../components/recharts/radar-chart.md) |
| `recharts/radial-bar-chart` | recharts | Радиальные столбцы: концентрические дуги, длина дуги — значение, фон-дорожка и скруглённые концы; одна дуга — прогресс-кольцо/gauge. | [карточка](../components/recharts/radial-bar-chart.md) |
| `recharts/reference-line` | recharts | Опорная линия поверх декартова графика: горизонтальная (y), вертикальная (x) или отрезок (segment) в координатах данных, с подписью. | [карточка](../components/recharts/reference-line.md) |
| `recharts/scatter-chart` | recharts | Точечная диаграмма по двум числовым осям, размер по третьей (ZAxis), символы circle/diamond/star…, опционально соединяющая линия или регр… | [карточка](../components/recharts/scatter-chart.md) |
| `recharts/treemap` | recharts | Дерево-карта: прямоугольники с площадью пропорционально значению (squarify, aspectRatio), вложенные уровни, отступы, подписи внутри плиток. | [карточка](../components/recharts/treemap.md) |
| `xyflow/example-custom-node` | xyflow | Тёмный холст #1A192B: input-узел слева, в центре свой узел с одним входом и двумя выходами a/b, справа два output-узла; три белых анимиро… | [карточка](../components/xyflow/example-custom-node.md) |
| `xyflow/example-edge-types` | xyflow | Сетка из 80 пар Source → Target: 5 типов рёбер × 2 ориентации ручек × 8 направлений расположения цели; узлы 80px в бирюзовой и синей пали… | [карточка](../components/xyflow/example-edge-types.md) |

### Требует существенной переработки (`complex`) — 32

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/card-stack` | animata | Стопка карточек (3 видимых слоя со смещением, масштабом 0.84/0.72 и поворотами ±1°): верхнюю выбрасывает со случайным сдвигом, следующая… | [карточка](../components/animata/card-stack.md) |
| `animata/expandable` | animata | Горизонтальная гармошка из фото-полос: активная расширяется и становится резкой, остальные узкие и размытые; на активной волной проявляет… | [карточка](../components/animata/expandable.md) |
| `animata/hero-section` | animata | Hero-страница Animata: логотип и ANIMATA волной, описание с тремя подчёркнутыми словами и кнопки; справа стопка из трёх повёрнутых карточ… | [карточка](../components/animata/hero-section.md) |
| `echarts/bar` | echarts | Столбчатая диаграмма на декартовой или полярной сетке: вертикальные/горизонтальные столбцы, группы и стеки, фон-дорожка, скругления, подп… | [карточка](../components/echarts/bar.md) |
| `echarts/boxplot` | echarts | Ящики с усами: min, Q1, медиана, Q3, max по каждой категории, горизонтально или вертикально. | [карточка](../components/echarts/boxplot.md) |
| `echarts/heatmap` | echarts | Тепловая карта: сетка ячеек с цветом по значению (декартова, календарь, matrix) или размытые пятна плотности на географии. | [карточка](../components/echarts/heatmap.md) |
| `echarts/legend` | echarts | Легенда рядов: иконка формы ряда и название, горизонтально или вертикально; неактивные пункты серые; кнопки «все/инверсия». | [карточка](../components/echarts/legend.md) |
| `echarts/line` | echarts | Линейный график и область под кривой: несколько рядов, сглаживание, ступеньки, стеки, маркеры точек, подпись у конца линии (endLabel). | [карточка](../components/echarts/line.md) |
| `echarts/map` | echarts | Картограмма: регионы из GeoJSON или SVG, окрашенные по значению (через visualMap), подписи регионов, несколько рядов на одной карте. | [карточка](../components/echarts/map.md) |
| `echarts/mark-line` | echarts | Опорная линия на ряду: среднее/max/min, горизонталь или вертикаль по значению оси, или отрезок между двумя точками, со стрелкой и подписью. | [карточка](../components/echarts/mark-line.md) |
| `echarts/parallel` | echarts | Параллельные координаты: каждая запись — ломаная через ряд вертикальных осей-показателей, полупрозрачные линии образуют «пучки». | [карточка](../components/echarts/parallel.md) |
| `echarts/pictorial-bar` | echarts | Пиктографические столбцы: столбец из повторяющихся иконок (человечки, бутылки) или одна фигура-маска, обрезанная по значению. | [карточка](../components/echarts/pictorial-bar.md) |
| `echarts/pie` | echarts | Круговая, кольцевая и роза-диаграмма (roseType): сектора с выносными подписями и линиями, отступы между секторами, пустой круг при нулево… | [карточка](../components/echarts/pie.md) |
| `echarts/radar` | echarts | Лепестковая диаграмма: многоугольники значений по осям-индикаторам компонента radar, заливка areaStyle, несколько профилей. | [карточка](../components/echarts/radar.md) |
| `echarts/scatter` | echarts | Точечная/пузырьковая диаграмма в декартовых, полярных, гео-, календарных и single-координатах; размер и цвет точки от данных, режим large… | [карточка](../components/echarts/scatter.md) |
| `echarts/theme-river` | echarts | «Река тем»: симметричные плавные потоки вокруг оси времени, толщина потока — величина темы в момент времени. | [карточка](../components/echarts/theme-river.md) |
| `echarts/treemap` | echarts | Дерево-карта: прямоугольники с площадью по значению (squarify, золотое сечение), вложенные уровни с заголовками upperLabel, градации цвет… | [карточка](../components/echarts/treemap.md) |
| `magicui/highlighter` | magicui | Фрагмент текста выделяется «от руки»: маркер, подчёркивание, рамка, круг, зачёркивание, скобки — неровный SVG-штрих прорисовывается. | [карточка](../components/magicui/highlighter.md) |
| `mermaid/gantt` | mermaid | Диаграмма Ганта: горизонтальные полосы задач по шкале времени, секции, зависимости after, вехи (milestone), критические и выполненные зад… | [карточка](../components/mermaid/gantt.md) |
| `mermaid/kanban` | mermaid | Канбан-доска: колонки-стадии с заголовками и карточки задач в них, у карточек опциональные метаданные (assigned, ticket, priority). | [карточка](../components/mermaid/kanban.md) |
| `mermaid/pie` | mermaid | Круговая (или кольцевая при donutHole) диаграмма с процентами на секторах, заголовком и легендой. | [карточка](../components/mermaid/pie.md) |
| `mermaid/quadrant-chart` | mermaid | Матрица 2×2: четыре цветных квадранта с подписями, оси с подписями краёв, точки-объекты по координатам 0…1 с метками. | [карточка](../components/mermaid/quadrant-chart.md) |
| `mermaid/radar` | mermaid | Радар (паутинная диаграмма): оси-лучи из центра, концентрическая сетка, замкнутые полупрозрачные кривые для каждого объекта, легенда. | [карточка](../components/mermaid/radar.md) |
| `mermaid/venn` | mermaid | Диаграмма Венна: перекрывающиеся круги-множества с подписями, подписанные пересечения (union) двух и трёх множеств. | [карточка](../components/mermaid/venn.md) |
| `mermaid/xychart` | mermaid | Столбчатый и/или линейный график по осям X/Y: категории или числовая шкала по X, диапазон по Y, несколько серий bar и line, вертикальная… | [карточка](../components/mermaid/xychart.md) |
| `motion-primitives/text-morph` | motion-primitives | Переход одной строки в другую: совпадающие буквы переезжают на новые позиции, лишние гаснут, новые проявляются (spring). | [карточка](../components/motion-primitives/text-morph.md) |
| `react-bits/dither-veil` | react-bits | Фото в дизеринге (Bayer, blue noise, Atkinson, Floyd–Steinberg, линии; дуотон или RGB), под которым в круге проявляется оригинал. | [карточка](../components/react-bits/dither-veil.md) |
| `react-bits/halftone-reveal` | react-bits | Фото в газетном полутоне (точки, линии, эллипсы; моно, дуотон, цвет), под которым в круге проявляется оригинал; wander водит круг сам. | [карточка](../components/react-bits/halftone-reveal.md) |
| `react-bits/morph-slider` | react-bits | Полноэкранный слайдер изображений, где смена кадра — шейдерный переход: картинка плавится (melt), идёт рябью (ripple), сдвигается срезами… | [карточка](../components/react-bits/morph-slider.md) |
| `react-bits/pixel-swap` | react-bits | Смена одного содержимого другим волной пикселей: блоки вырастают с отскоком, поворотом и скруглением в заданном порядке (random, center,… | [карточка](../components/react-bits/pixel-swap.md) |
| `react-bits/pixel-transition` | react-bits | Карточка, где первое содержимое закрывается пикселями и открывается второе: случайно, по Bayer-дизеру, рябью или wipe; формы square/round… | [карточка](../components/react-bits/pixel-transition.md) |
| `react-bits/sliced-waves` | react-bits | Несколько волнистых лент-срезов (персик, розовый, синий) в перспективе, размытые и светящиеся, в нижней части кадра. | [карточка](../components/react-bits/sliced-waves.md) |

### Данных недостаточно (`unknown`) — 1

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `awesome-claude-video-skills/e2e-test-results` | awesome-claude-video-skills | Не рисует; раздел README с результатами прогона 16 video-skills на одном брифе (15-секундное промо, 5 строк текста, 1920×1080, 30 fps, бе… | [карточка](../components/awesome-claude-video-skills/e2e-test-results.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`quantities`, `growth-decline`, `transformation`
