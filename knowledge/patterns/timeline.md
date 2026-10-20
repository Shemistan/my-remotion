# Таймлайн

«В 2019… затем в 2021…», «история», «дорожная карта», «этапы проекта»,
«релизы». Ось времени и события на ней; движение камеры/прокрутки вдоль
оси синхронно с озвучкой.

## Визуальные приёмы

1. **Горизонтальная ось с вехами** — точки появляются слева направо,
   подписи выезжают.
2. **Вертикальная лента** — для мобильных форматов (9:16).
3. **Gantt** — параллельные полосы с длительностями.
4. **Git-граф** — ветки и коммиты (технические истории).
5. **Карусель дат** — одна веха на экране, переходы между ними.
6. **Линия тренда с подписанными событиями** — таймлайн + метрика.

## Как выбирать

- 3–8 вех без длительностей → ось с точками (`icons-shapes` + stagger)
  или готовый arc-timeline / timeline-компонент.
- Пересекающиеся периоды → gantt (mermaid, echarts custom).
- Много событий → карусель/`Scene3D` с шагами (камера едет по оси).
- Текстовое описание есть → mermaid timeline (статичный SVG + появление).

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 23

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/chapter-title` | free-remotion-templates | Карточка раздела: метка «Chapter 1» влетает с крупного масштаба, прочерчивается золотая линия, снизу всплывают название главы и подзаголо… | [карточка](../components/free-remotion-templates/chapter-title.md) |
| `free-remotion-templates/flip-page-transition` | free-remotion-templates | Перелистывание книги: страница приподнимается у корешка, поворачивается на левом краю на 90° с затенением и открывает следующую, на котор… | [карточка](../components/free-remotion-templates/flip-page-transition.md) |
| `free-remotion-templates/line-chart-anim` | free-remotion-templates | Линейный график: заголовок, 4 линии сетки, ломаная дорисовывается слева направо, точки выпрыгивают по ходу линии, проявляются подписи оси… | [карточка](../components/free-remotion-templates/line-chart-anim.md) |
| `free-remotion-templates/parallax-pan` | free-remotion-templates | Векторный пейзаж из слоёв (небо, солнце, горы, холмы, земля, ёлки), едущих влево с разной скоростью; поверх неподвижный заголовок и подза… | [карточка](../components/free-remotion-templates/parallax-pan.md) |
| `free-remotion-templates/pixel-candlestick-ohlc` | free-remotion-templates | 8-битный свечной OHLC-график: свечи выпрыгивают по одной слева направо, бычьи зелёные и медвежьи красные переливаются; в шапке тикер, цен… | [карточка](../components/free-remotion-templates/pixel-candlestick-ohlc.md) |
| `free-remotion-templates/pixel-waterfall-cycle` | free-remotion-templates | Пиксель-арт водопад: полосатое небо, скалы, вода течёт ротацией палитры (color cycling), брызги и туман, поверх CRT-скин. Петля, вертикал… | [карточка](../components/free-remotion-templates/pixel-waterfall-cycle.md) |
| `free-remotion-templates/racing-chart` | free-remotion-templates | Гонка горизонтальных баров: серии с подписями и значениями внутри бара, значения плавно меняются между шагами, бары тянутся относительно… | [карточка](../components/free-remotion-templates/racing-chart.md) |
| `remotion-bits/bit-3d-step-timing-context` | remotion-bits | Четыре слайда в глубину с подзаголовками и анимированным текстом; камера переходит между ними; анимации внутри Step стартуют от входа в ш… | [карточка](../components/remotion-bits/bit-3d-step-timing-context.md) |
| `remotion-bits/bit-chat-conversation` | remotion-bits | Переписка в стиле мессенджера: шесть пузырей (свои справа, чужие слева, с аватарами-инициалами) появляются по одному. | [карточка](../components/remotion-bits/bit-chat-conversation.md) |
| `remotion-bits/bit-conic-gradient` | remotion-bits | Полноэкранный конический градиент чёрный → зелёный, равномерно проворачивающийся на полный круг, как луч радара. | [карточка](../components/remotion-bits/bit-conic-gradient.md) |
| `remotion-bits/bit-ken-burns` | remotion-bits | Слайд-шоу из трёх фото на весь кадр: медленный наезд/отъезд со смещением, смена слайдов через cross-fade. | [карточка](../components/remotion-bits/bit-ken-burns.md) |
| `remotion-bits/bit-particles-snow` | remotion-bits | Снегопад на тёмно-синем ночном фоне: снежинки трёх размеров падают, покачиваются и сносятся ветром вправо; кадр заполнен с первого кадра. | [карточка](../components/remotion-bits/bit-particles-snow.md) |
| `remotion-bits/bit-radial-gradient` | remotion-bits | Круглое световое пятно перемещается из левого верхнего угла в правый нижний и меняет цвет с солнечно-жёлтого на голубом на закатно-розовы… | [карточка](../components/remotion-bits/bit-radial-gradient.md) |
| `remotion-bits/scene-3d` | remotion-bits | CSS-3D мир в духе impress.js: шаги со своей позицией/поворотом/масштабом, камера перелетает между ними с easing; контент шагов входит и у… | [карточка](../components/remotion-bits/scene-3d.md) |
| `remotion-skills/cesium-flythrough` | remotion-skills | Полноэкранный 3D-пролёт камеры над реальной местностью (рельеф + спутник) или фотореалистичным городом по заданному маршруту, с креном в… | [карточка](../components/remotion-skills/cesium-flythrough.md) |
| `remotion-skills/multi-scene-video` | remotion-skills | Не рисует; документ о структуре ролика из нескольких сцен: компонент на сцену, Track с явными from/durationInFrames или TransitionSeries… | [карточка](../components/remotion-skills/multi-scene-video.md) |
| `remotion-skills/sequencing` | remotion-skills | Не рисует; документ о выборе границы тайминга: timing-props прямо на компоненте, общий Sequence для группы слоёв, Track для непересекающи… | [карточка](../components/remotion-skills/sequencing.md) |
| `remotion-skills/timeline-structure` | remotion-skills | Не рисует; документ о структуре таймлайна: единицы редактирования, Track для независимых элементов, TransitionSeries для смежных, общий S… | [карточка](../components/remotion-skills/timeline-structure.md) |
| `remotion-skills/timing-props` | remotion-skills | Не рисует; документ о пропсах тайминга встроенных компонентов и порядке их применения (from → trimBefore → durationInFrames → playbackRat… | [карточка](../components/remotion-skills/timing-props.md) |
| `remotion-skills/video-editing` | remotion-skills | Не рисует; документ о монтаже клипов: Track для независимых клипов, TransitionSeries для смежных, общий тайминг-контейнер для видео и его… | [карточка](../components/remotion-skills/video-editing.md) |
| `remotion-video-templates/bar-chart-race` | remotion-video-templates | Гонка горизонтальных баров: серии меняют значения по шагам времени, бары растут и плавно меняются местами по рангу; справа число, в углу… | [карточка](../components/remotion-video-templates/bar-chart-race.md) |
| `remotion-video-templates/chart-data-schema` | remotion-video-templates | Своей картинки нет: общая zod-схема временного ряда для bar-chart-race и line-chart-draw, пример данных и функции покадровой интерполяции. | [карточка](../components/remotion-video-templates/chart-data-schema.md) |
| `remotion-video-templates/line-chart-draw` | remotion-video-templates | SVG-график нескольких серий: сетка с подписями Y, метки шагов X, легенда; линии рисуются слева направо с бегущей точкой, затем проявляетс… | [карточка](../components/remotion-video-templates/line-chart-draw.md) |

### Адаптируется без переписывания (`adaptable`) — 32

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/alarm-clock` | animata | Квадратный виджет Alarms в стиле iOS: до двух будильников (время крупно, расписание мелко) с тумблерами; выключенные бледнее. | [карточка](../components/animata/alarm-clock.md) |
| `animata/animated-timeline` | animata | Вертикальный таймлайн: точки на линии и заголовок, описание, дата; при активации пункта N точки 0…N заливаются и увеличиваются, линия нал… | [карточка](../components/animata/animated-timeline.md) |
| `animata/calendar-event` | animata | Виджет календаря: день недели и число, до двух событий цветными плашками с точкой и строка «+N more» со временем следующего. | [карточка](../components/animata/calendar-event.md) |
| `animata/clock-with-photo` | animata | Фото-виджет в духе iOS Depth Effect: пейзаж, вырезанная фигура прыгающего человека поверх и огромные белые цифры часов ЧЧ/ММ за ней. | [карточка](../components/animata/clock-with-photo.md) |
| `animata/commit-graph` | animata | Тепловая карта активности в стиле GitHub: сетка 53 недели × 7 дней, квадратики четырёх оттенков по числу коммитов 0–3. | [карточка](../components/animata/commit-graph.md) |
| `animata/delivery-card` | animata | Тёмный виджет отслеживания заказа в виде багажной бирки: «Arrives today 09:26», статус Processing / In transit / Delivered, линия пути с… | [карточка](../components/animata/delivery-card.md) |
| `animata/flight-widget` | animata | Посадочный талон: корешок с названием авиакомпании и логотипом, маршрут TOR → NYC, гейт A50, рейс AC951, место 1A, дата и время, вырезы-п… | [карточка](../components/animata/flight-widget.md) |
| `animata/sleep-tracker` | animata | Виджет «Sleep Tracker»: точка-индикатор, фото-полоса, мини-гистограмма фаз сна из 16 синих столбиков, «Activity 32m ago». | [карточка](../components/animata/sleep-tracker.md) |
| `animata/study-timer` | animata | Тёмный виджет учебных сессий: иконка в пульсирующем кольце, бейдж числа сессий, суммарное время 01:47, легенда минут и полоса цветных сег… | [карточка](../components/animata/study-timer.md) |
| `animata/weekly-progress` | animata | Виджет прогресса чтения: автор и название книги, бейдж с иконкой книги «30%», семь маленьких колец по дням недели, которые заполняются ян… | [карточка](../components/animata/weekly-progress.md) |
| `magicui/animated-list` | magicui | Лента уведомлений: новые карточки по одной выпрыгивают сверху с пружинным увеличением, старые сдвигаются вниз. | [карточка](../components/magicui/animated-list.md) |
| `magicui/terminal` | magicui | Окно терминала: команда печатается посимвольно, затем строки вывода появляются одна за другой после предыдущей. | [карточка](../components/magicui/terminal.md) |
| `motion-primitives/sliding-number` | motion-primitives | Число-барабан: каждая цифра — колонка 0–9, вертикально прокручивающаяся к значению по кратчайшему пути (одометр, табло); минус и дробная… | [карточка](../components/motion-primitives/sliding-number.md) |
| `motion-primitives-website/circular-preloader` | motion-primitives-website | Полноэкранный экран загрузки: кольцо прогресса с числом в центре; на выходе кольцо увеличивается вдвое и гаснет. | [карточка](../components/motion-primitives-website/circular-preloader.md) |
| `motion-primitives-website/counter-preloader` | motion-primitives-website | Полноэкранный счётчик загрузки 000 → 100 гигантскими цифрами; по окончании экран уезжает вверх шторкой (clip-path), открывая следующую сц… | [карточка](../components/motion-primitives-website/counter-preloader.md) |
| `motion-primitives-website/perspective-grid` | motion-primitives-website | Сетка-пол, уходящая в перспективу (rotateX 75°) и гаснущая к горизонту — ретро-синтвейв плоскость. | [карточка](../components/motion-primitives-website/perspective-grid.md) |
| `motion-primitives-website/step-indicator` | motion-primitives-website | Индикатор шагов: кружки (точки или номера с галочкой у пройденных), соединённые линиями, заполняющимися до текущего шага; вариант «таблет… | [карточка](../components/motion-primitives-website/step-indicator.md) |
| `motion-primitives-website/svg-path-draw` | motion-primitives-website | SVG-обёртка, где все фигуры (path, line, polyline, polygon, circle, ellipse, rect) по очереди прорисовываются штрихом. | [карточка](../components/motion-primitives-website/svg-path-draw.md) |
| `motion-primitives-website/svg-text-path-scroll` | motion-primitives-website | Жирный текст, повторённый через « • », бегущий по волнистой кривой (textPath); сдвиг привязан к прокрутке. | [карточка](../components/motion-primitives-website/svg-text-path-scroll.md) |
| `nivo/bump` | nivo | Bump chart: позиции серий в рейтинге во времени — сглаженные линии меняются местами, подписи на концах, точки в узлах; в пакете также Are… | [карточка](../components/nivo/bump.md) |
| `nivo/calendar` | nivo | Календарная тепловая карта: квадрат на каждый день года по неделям, месяцы обведены, цвет — по значению (как граф активности GitHub); в п… | [карточка](../components/nivo/calendar.md) |
| `nivo/line` | nivo | Линейный график: серии, точки, области (в т.ч. стопкой), кривые d3, шкалы point/linear/time/log, маркеры, легенды, разрывы на null; LineC… | [карточка](../components/nivo/line.md) |
| `nivo/polar-bar` | nivo | Полярная столбчатая диаграмма (роза): равные угловые сектора на категорию, столбцы растут от центра по радиусу, серии стопкой, полярная с… | [карточка](../components/nivo/polar-bar.md) |
| `nivo/stream` | nivo | Streamgraph: сглаженные слои-потоки стопкой во времени со смещённой базовой линией (offsetType), точки и срезы. | [карточка](../components/nivo/stream.md) |
| `react-bits/animated-list` | react-bits | Список строк (иконка или картинка, заголовок, описание, мета) в стеклянной рамке: строки по очереди выпрыгивают с пружиной, выделенную по… | [карточка](../components/react-bits/animated-list.md) |
| `react-bits/infinite-spiral` | react-bits | Бесконечная 3D-спираль из карточек-изображений: карточки поднимаются по винтовой линии, центральные крупнее, к краям гаснут и размываются. | [карточка](../components/react-bits/infinite-spiral.md) |
| `react-bits/lattice-loader` | react-bits | Индикатор работы AI: сетка 3×3/4×4 клеток с бегущим узором, подпись «Thinking» и таймер; при done/error клетки складываются в галочку или… | [карточка](../components/react-bits/lattice-loader.md) |
| `react-bits/status-mark` | react-bits | Значок статуса задачи с подписью: пунктирное кольцо, вращающаяся дуга или кольцо прогресса, морф в галочку или крест, зачёркивание подписи. | [карточка](../components/react-bits/status-mark.md) |
| `react-bits/thought-line` | react-bits | Строка «Thinking…» как у AI-чатов: дышащая искра, переливающийся текст, лента шагов рассуждения, затем схлопывание в «Thought for 4.2s». | [карточка](../components/react-bits/thought-line.md) |
| `recharts/area-chart` | recharts | График с заливкой под кривой: одиночные, накопленные (stackId, stackOffset expand) и диапазонные области с контуром, осями и сеткой. | [карточка](../components/recharts/area-chart.md) |
| `recharts/line-chart` | recharts | Линейный график: одна или несколько кривых по точкам данных, точки, подписи, интерполяция кривой (linear, monotone, step…), пунктир, оси… | [карточка](../components/recharts/line-chart.md) |
| `recharts/reference-area` | recharts | Подсвеченный прямоугольник между x1…x2 и/или y1…y2 в координатах данных: период, коридор нормы, зона риска. | [карточка](../components/recharts/reference-area.md) |

### Требует существенной переработки (`complex`) — 18

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `echarts/calendar` | echarts | Календарная сетка дней (как вклад GitHub): недели × дни за год, месяц или диапазон, подписи дней, месяцев и года; основа для heatmap/scat… | [карточка](../components/echarts/calendar.md) |
| `echarts/candlestick` | echarts | Японские свечи (OHLC): тело open–close и тени lowest–highest, рост красным, падение зелёным (по умолчанию), режим large для длинных рядов. | [карточка](../components/echarts/candlestick.md) |
| `echarts/custom` | echarts | Произвольный ряд: функция renderItem рисует для каждой точки данных свою группу фигур (rect, path, text, image…) в координатах любой сист… | [карточка](../components/echarts/custom.md) |
| `echarts/heatmap` | echarts | Тепловая карта: сетка ячеек с цветом по значению (декартова, календарь, matrix) или размытые пятна плотности на географии. | [карточка](../components/echarts/heatmap.md) |
| `echarts/line` | echarts | Линейный график и область под кривой: несколько рядов, сглаживание, ступеньки, стеки, маркеры точек, подпись у конца линии (endLabel). | [карточка](../components/echarts/line.md) |
| `echarts/mark-area` | echarts | Подсвеченная полоса или прямоугольник на графике между двумя значениями осей: период, коридор нормы, зона риска. | [карточка](../components/echarts/mark-area.md) |
| `echarts/theme-river` | echarts | «Река тем»: симметричные плавные потоки вокруг оси времени, толщина потока — величина темы в момент времени. | [карточка](../components/echarts/theme-river.md) |
| `magicui/retro-grid` | magicui | Синтвейв-пол: сетка уходит в перспективу к горизонту и бесконечно едет на зрителя, сверху растворяется в фон. | [карточка](../components/magicui/retro-grid.md) |
| `mermaid/eventmodeling` | mermaid | Диаграмма Event Modeling: таймлайн тайм-фреймов по дорожкам (UI/процессоры, команды, read-модели, события), связи между ними выводятся ав… | [карточка](../components/mermaid/eventmodeling.md) |
| `mermaid/gantt` | mermaid | Диаграмма Ганта: горизонтальные полосы задач по шкале времени, секции, зависимости after, вехи (milestone), критические и выполненные зад… | [карточка](../components/mermaid/gantt.md) |
| `mermaid/gitgraph` | mermaid | Граф git-истории: коммиты-кружки на цветных линиях веток, ответвления, слияния, cherry-pick, теги. | [карточка](../components/mermaid/gitgraph.md) |
| `mermaid/timeline` | mermaid | Хронология: горизонтальная (LR) или вертикальная (TD) ось с периодами, под каждым — одна или несколько карточек событий; секции окрашены… | [карточка](../components/mermaid/timeline.md) |
| `motion-primitives-website/film-grain` | motion-primitives-website | Оверлей киноплёночного зерна: монохромный шум на canvas в половинном разрешении, обновляемый с заданной частотой, в режиме overlay. | [карточка](../components/motion-primitives-website/film-grain.md) |
| `motion-primitives-website/wave-distortion-background` | motion-primitives-website | Вертикальный двухцветный градиент, граница которого колышется тремя синусоидальными волнами, с тонкими светлыми бликами. | [карточка](../components/motion-primitives-website/wave-distortion-background.md) |
| `react-bits/flying-posters` | react-bits | Бесконечная колонка (или несколько) 3D-постеров, которые при движении закручиваются и переворачиваются с изгибом плоскости; соседние коло… | [карточка](../components/react-bits/flying-posters.md) |
| `react-bits/lightfall` | react-bits | Падающие световые штрихи (метеоры, световой дождь) со светящимися головами, мерцанием и bloom; удержание — варп. | [карточка](../components/react-bits/lightfall.md) |
| `react-bits/noise` | react-bits | Оверлей киноплёнки: зерно (моно или цвет), пыль, царапины, строки развёртки, мерцание, с режимом смешивания поверх фото/видео. | [карточка](../components/react-bits/noise.md) |
| `react-bits/pixel-snow` | react-bits | Пиксельный снегопад: снежинки-спрайты падают с ветром и свечением; курсор их расталкивает. | [карточка](../components/react-bits/pixel-snow.md) |

### Не подходит (`unsuitable`) — 1

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `react-bits/scroll-stack` | react-bits | Вертикальная лента карточек, которые при прокрутке прилипают к верху и складываются в стопку: нижние уменьшаются, затемняются, опциональн… | [карточка](../components/react-bits/scroll-stack.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`sequence-steps`, `growth-decline`, `transformation`
