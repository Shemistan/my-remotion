# Количественные показатели

«37 %», «2,4 миллиона», «каждый третий», «доля рынка», «распределение».
Числа и их структура: величина, доля, распределение, ранг.

## Визуальные приёмы

1. **Большое число + подпись** — KPI-карточка со счётчиком.
2. **Кольцо/гейдж** — доля от 100 %.
3. **Пирог/donut** — несколько долей (≤5 сегментов).
4. **Waffle / пиктограммы** — «каждый третий» (иконки людей).
5. **Бары** — ранжирование категорий.
6. **Heatmap / календарь** — распределение по двум измерениям.
7. **Scatter** — зависимость двух величин.

## Как выбирать

- 1–3 числа → счётчики/KPI-карточки (`numbers-counters`).
- Доля одного → ring/gauge; долей несколько → donut (`charts-data`).
- Категории → bar; время → line/area; распределение → histogram/heatmap.
- Чартовые библиотеки (recharts, nivo, echarts) — выключать встроенную
  анимацию и анимировать данные по кадру (см. правила в compatibility/rules.md).

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 25

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/bar-chart-anim` | free-remotion-templates | Вертикальная столбчатая диаграмма: заголовок и подзаголовок, скруглённые столбцы своих цветов растут от базовой линии по очереди, под ним… | [карточка](../components/free-remotion-templates/bar-chart-anim.md) |
| `free-remotion-templates/kpi-counter` | free-remotion-templates | Дашборд карточек KPI: заголовок, линия-разделитель, карточки въезжают по очереди; в каждой значок, подпись и число, докручивающееся одоме… | [карточка](../components/free-remotion-templates/kpi-counter.md) |
| `free-remotion-templates/line-chart-anim` | free-remotion-templates | Линейный график: заголовок, 4 линии сетки, ломаная дорисовывается слева направо, точки выпрыгивают по ходу линии, проявляются подписи оси… | [карточка](../components/free-remotion-templates/line-chart-anim.md) |
| `free-remotion-templates/pixel-candlestick-ohlc` | free-remotion-templates | 8-битный свечной OHLC-график: свечи выпрыгивают по одной слева направо, бычьи зелёные и медвежьи красные переливаются; в шапке тикер, цен… | [карточка](../components/free-remotion-templates/pixel-candlestick-ohlc.md) |
| `free-remotion-templates/pourover-drip-fill-gauge` | free-remotion-templates | Пиксель-арт пуровер: вода капает в конус, графин наполняется полосатой жидкостью с мениском; пиксельный счётчик NN% с подписью VOLUME и ш… | [карточка](../components/free-remotion-templates/pourover-drip-fill-gauge.md) |
| `remotion-bits/animated-counter` | remotion-bits | Анимированный счётчик (числовой счётчик, бегущие цифры): число, плавно докручивающееся от одного значения к другому (или по цепочке ключе… | [карточка](../components/remotion-bits/animated-counter.md) |
| `remotion-bits/bit-bar-chart` | remotion-bits | Горизонтальная столбчатая диаграмма: заголовок, подписи, бары растут слева направо со stagger, справа докручиваются значения. | [карточка](../components/remotion-bits/bit-bar-chart.md) |
| `remotion-bits/bit-basic-counter` | remotion-bits | Строка «width: N px», где число проходит цепочку 0 → 10 → 10 → 50 → 10 за 120 кадров: рост, пауза, скачок и откат. | [карточка](../components/remotion-bits/bit-basic-counter.md) |
| `remotion-bits/bit-card-stack` | remotion-bits | Восемь пронумерованных карточек влетают снизу по очереди и ложатся веером с поворотом, сдвигом по X и глубиной по Z. | [карточка](../components/remotion-bits/bit-card-stack.md) |
| `remotion-bits/bit-carousel-3d` | remotion-bits | Кольцо из 8 квадратных карточек с номерами, вращающееся вокруг вертикальной оси; камера отъезжает назад с поворотом на 180° и возвращается. | [карточка](../components/remotion-bits/bit-carousel-3d.md) |
| `remotion-bits/bit-counter-confetti` | remotion-bits | Крупное светящееся число по центру докручивается 0 → 1000 с масштабным перелётом; на финише с краёв и снизу вылетает разноцветное конфетт… | [карточка](../components/remotion-bits/bit-counter-confetti.md) |
| `remotion-bits/bit-flying-through-words` | remotion-bits | Туннель из слов: названия ИИ-моделей рождаются в глубине по всему кадру и летят на зрителя, проявляясь и затухая. | [карточка](../components/remotion-bits/bit-flying-through-words.md) |
| `remotion-bits/bit-grid-stagger` | remotion-bits | Сетка 4×4 пронумерованных скруглённых квадратов, вырастающих (scale 0→1 и fade) волной от центра. | [карточка](../components/remotion-bits/bit-grid-stagger.md) |
| `remotion-bits/bit-scrolling-columns` | remotion-bits | Четыре колонки цветных карточек с цифрами плывут вниз с разной скоростью на разной глубине, камера медленно панорамирует в перспективе —… | [карточка](../components/remotion-bits/bit-scrolling-columns.md) |
| `remotion-bits/bit-staggered-fade-in` | remotion-bits | Пять цветных квадратов в ряд по очереди поднимаются снизу и проявляются. | [карточка](../components/remotion-bits/bit-staggered-fade-in.md) |
| `remotion-bits/bit-stat-rings` | remotion-bits | Три круговых прогресс-кольца в ряд: появляются с пружинкой, дуга заполняется до процента, в центре синхронно докручивается число, под кол… | [карточка](../components/remotion-bits/bit-stat-rings.md) |
| `remotion-bits/matrix-rain` | remotion-bits | Цифровой дождь «Матрицы»: колонки символов падают вниз, голова белая со свечением, хвост затухает, символы меняются каждые 4 кадра; на ве… | [карточка](../components/remotion-bits/matrix-rain.md) |
| `remotion-bits/particle-system` | remotion-bits | Частицы из произвольных React-элементов (точки, эмодзи, конфетти, слова), рождающиеся из точки/области и летящие под гравитацией, сопроти… | [карточка](../components/remotion-bits/particle-system.md) |
| `remotion-bits/scrolling-images` | remotion-bits | Несколько вертикальных колонок картинок, бесконечно прокручивающихся вверх или вниз с разной скоростью — «стена» скриншотов/работ. | [карточка](../components/remotion-bits/scrolling-images.md) |
| `remotion-motion-graphics-skill/patterns` | remotion-motion-graphics-skill | Не рисует; документ с рабочими шаблонами Remotion-кода: скелет композиции (zod-схема, defaultProps, регистрация), enter/hold/exit, spring… | [карточка](../components/remotion-motion-graphics-skill/patterns.md) |
| `remotion-motion-graphics-skill/traps` | remotion-motion-graphics-skill | Не рисует; документ-список тихих ошибок Remotion, при которых код выглядит верно и ничего не падает: interpolate без clamp искажает число… | [карточка](../components/remotion-motion-graphics-skill/traps.md) |
| `remotion-skills/audio-visualization` | remotion-skills | Не рисует; документ о визуализации звука: спектр-бары (visualizeAudio), осциллограмма (visualizeAudioWaveform + createSmoothSvgPath), реа… | [карточка](../components/remotion-skills/audio-visualization.md) |
| `remotion-video-templates/bar-chart-race` | remotion-video-templates | Гонка горизонтальных баров: серии меняют значения по шагам времени, бары растут и плавно меняются местами по рангу; справа число, в углу… | [карточка](../components/remotion-video-templates/bar-chart-race.md) |
| `remotion-video-templates/chart-data-schema` | remotion-video-templates | Своей картинки нет: общая zod-схема временного ряда для bar-chart-race и line-chart-draw, пример данных и функции покадровой интерполяции. | [карточка](../components/remotion-video-templates/chart-data-schema.md) |
| `remotion-video-templates/line-chart-draw` | remotion-video-templates | SVG-график нескольких серий: сетка с подписями Y, метки шагов X, легенда; линии рисуются слева направо с бегущей точкой, затем проявляетс… | [карточка](../components/remotion-video-templates/line-chart-draw.md) |

### Адаптируется без переписывания (`adaptable`) — 92

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/avatar-list` | animata | Ряд круглых аватаров внахлёст; при наведении аватар увеличивается, появляется тултип с именем и должностью. | [карточка](../components/animata/avatar-list.md) |
| `animata/bar-chart` | animata | Компактная вертикальная мини-диаграмма: ряд столбцов с зазором 2px, высота каждого — процент от высоты контейнера; при появлении все выра… | [карточка](../components/animata/bar-chart.md) |
| `animata/battery` | animata | Голубой градиентный виджет: маленькое белое кольцо заряда с иконкой батареи и крупное число процента. | [карточка](../components/animata/battery.md) |
| `animata/battery-level` | animata | Виджет батарей устройств: сетка 2×2 кольцевых индикаторов с иконками Apple/телефон/ноутбук/часы и уровнями 100/40/80/20%. | [карточка](../components/animata/battery-level.md) |
| `animata/bento-three` | animata | Финансовая bento-панель 2×2: недельные траты столбиками (ExpenseTracker) на две строки, «Total income $7,000» и «Top categories» с суммами. | [карточка](../components/animata/bento-three.md) |
| `animata/calorie-counter` | animata | Высокий фитнес-виджет: дата и аватар, большое кольцо калорий с «Today N Cal», плашка «Your goal N Cal». | [карточка](../components/animata/calorie-counter.md) |
| `animata/commit-graph` | animata | Тепловая карта активности в стиле GitHub: сетка 53 недели × 7 дней, квадратики четырёх оттенков по числу коммитов 0–3. | [карточка](../components/animata/commit-graph.md) |
| `animata/counter` | animata | Крупное число пружинисто докручивается от 0 до цели (или от цели до 0) с форматированием разрядов или валюты. | [карточка](../components/animata/counter.md) |
| `animata/cycling` | animata | Тёмный фитнес-виджет «Cycling 2h 30m»: иконка велосипеда, стопка цветных полосок и розовая карточка «Goal 15km» с сегментным прогресс-бар… | [карточка](../components/animata/cycling.md) |
| `animata/donut-chart` | animata | Кольцевой индикатор одной доли: дорожка и цветная дуга, заполненная на progress % по часовой стрелке от 12 часов; в центр — children. | [карточка](../components/animata/donut-chart.md) |
| `animata/expense-tracker` | animata | Виджет недельных трат: месяц и год, 7 капсул-столбиков по дням с синей заливкой по доле дня, итог «THIS WEEK SPENDING $3,740». | [карточка](../components/animata/expense-tracker.md) |
| `animata/fund-widget` | animata | Белая карточка-стопка: крупное значение актива «2.7Cr», изменение «12% ↑» зелёным или «−8% ↓» красным, подпись Stocks/Funds/Deposits и ве… | [карточка](../components/animata/fund-widget.md) |
| `animata/gauge-chart` | animata | Спидометр: кольцо с разрывом внизу (gap px длины дуги), цветная дуга заполняет его на progress %, в центре опционально крупное значение. | [карточка](../components/animata/gauge-chart.md) |
| `animata/github-card-skew` | animata | Карточка-статистика: огромное 55%, подпись Developer preference for GitHub Copilot и источник Stack Overflow 2023 Survey; наклоняется в 3… | [карточка](../components/animata/github-card-skew.md) |
| `animata/led-board` | animata | Светодиодное табло: SVG-матрица точек на тёмной панели, слово выложено горящими точками; часть точек случайно вспыхивает фиолетовым, по h… | [карточка](../components/animata/led-board.md) |
| `animata/live-score` | animata | Спортивное табло: флаги и коды команд, четыре перекидные цифры счёта, нижняя полоса с раундом, ромбом баз и счётом побед. | [карточка](../components/animata/live-score.md) |
| `animata/marquee` | animata | Бесконечная горизонтальная или вертикальная бегущая лента из повторённых children с градиентной маской по краям. | [карточка](../components/animata/marquee.md) |
| `animata/mobile-detail` | animata | Тёмный виджет состояния телефона: 2×2 плитки Battery 25%, Volume 50%, Ram 75%, Storage 90%, каждая залита снизу на свой процент. | [карточка](../components/animata/mobile-detail.md) |
| `animata/pricing` | animata | Карточка выбора тарифа: переключатель Monthly/Yearly с ездящей подложкой, список планов с ценой, бейджем Popular и радио-кружком, выбранн… | [карточка](../components/animata/pricing.md) |
| `animata/progress` | animata | Сегментированный прогресс-бар из палочек 2px через 2px высотой 12px: заполненные светлые, остальные тёмные; заполнение бежит слева направ… | [карточка](../components/animata/progress.md) |
| `animata/reminder` | animata | Виджет «Today»: две цветные плашки-корзины с числом задач (Work 2, Home 3) и строка «→ Meeting in 30 min». | [карточка](../components/animata/reminder.md) |
| `animata/ring-chart` | animata | Концентрические кольца активности в стиле Apple Watch на тёмной плашке: каждое кольцо — доля 0–100 % своим цветом и полупрозрачной дорожкой. | [карточка](../components/animata/ring-chart.md) |
| `animata/score-board` | animata | Виджет «Status Good»: мини бар-чарт из 9 столбиков (зелёные и один красный) и «Overall progress 80% (score, progress)». | [карточка](../components/animata/score-board.md) |
| `animata/sleep-tracker` | animata | Виджет «Sleep Tracker»: точка-индикатор, фото-полоса, мини-гистограмма фаз сна из 16 синих столбиков, «Activity 32m ago». | [карточка](../components/animata/sleep-tracker.md) |
| `animata/storage-status` | animata | Высокая чёрная колонка — стек диска 512 GB: сегменты Free, System 50, Audio 80, Video 150 GB с высотой по доле и выносками-ярлыками «N GB… | [карточка](../components/animata/storage-status.md) |
| `animata/storage-widget` | animata | Тёмный виджет «5.31 / 16 GB, 28%» с сеткой 15×7 квадратиков по категориям (как GitHub-контрибуции) и легендой 5.90 \| 2.15 \| 2.59 GB. | [карточка](../components/animata/storage-widget.md) |
| `animata/study-timer` | animata | Тёмный виджет учебных сессий: иконка в пульсирующем кольце, бейдж числа сессий, суммарное время 01:47, легенда минут и полоса цветных сег… | [карточка](../components/animata/study-timer.md) |
| `animata/ticker` | animata | Число-барабан: каждая цифра — лента 0–9, пружинисто прокручивается до нужной цифры; нецифровые символы стоят на месте. | [карточка](../components/animata/ticker.md) |
| `animata/transaction-list` | animata | Белая карточка Transactions банковского приложения: строки с иконкой, названием, типом и суммой; по клику строка морфится в детальный вид… | [карточка](../components/animata/transaction-list.md) |
| `animata/water-tracker` | animata | Виджет «Water»: «750 ml of 2,000 ml today», кнопка «+250 ml» и вертикальная колба с голубой заливкой на долю от цели. | [карточка](../components/animata/water-tracker.md) |
| `animata/weather-card` | animata | Виджет погоды: город, иконка солнца с дождём, температура 19°, «Feels like 21°», плашка максимум/минимум. | [карточка](../components/animata/weather-card.md) |
| `animata/weekly-progress` | animata | Виджет прогресса чтения: автор и название книги, бейдж с иконкой книги «30%», семь маленьких колец по дням недели, которые заполняются ян… | [карточка](../components/animata/weekly-progress.md) |
| `magicui/animated-circular-progress-bar` | magicui | Круговой гейдж: дуга основного цвета на процент, остаток второстепенным цветом с зазорами, число процентов в центре. | [карточка](../components/magicui/animated-circular-progress-bar.md) |
| `magicui/animated-list` | magicui | Лента уведомлений: новые карточки по одной выпрыгивают сверху с пружинным увеличением, старые сдвигаются вниз. | [карточка](../components/magicui/animated-list.md) |
| `magicui/avatar-circles` | magicui | Ряд перекрывающихся круглых аватаров с белой обводкой и кружком «+N». | [карточка](../components/magicui/avatar-circles.md) |
| `magicui/dotted-map` | magicui | Карта мира из точек (SVG) с цветными маркерами по lat/lng, опционально пульсирующими, и своими подписями. | [карточка](../components/magicui/dotted-map.md) |
| `magicui/marquee` | magicui | Бесконечная бегущая лента из любых элементов (логотипы, отзывы, карточки, текст) по горизонтали или вертикали. | [карточка](../components/magicui/marquee.md) |
| `magicui/marquee-3d` | magicui | Наклонённая в перспективе стена из четырёх вертикальных колонок карточек-отзывов, бегущих попеременно вверх и вниз; края гаснут. | [карточка](../components/magicui/marquee-3d.md) |
| `magicui/number-ticker` | magicui | Число пружинисто докручивается от startValue до value (или обратно) с разделителями тысяч и фиксированными знаками. | [карточка](../components/magicui/number-ticker.md) |
| `motion-primitives/animated-number` | motion-primitives | Число, пружинно докручивающееся до нового значения; целое, с разделителями разрядов (toLocaleString), табличные цифры. | [карточка](../components/motion-primitives/animated-number.md) |
| `motion-primitives/sliding-number` | motion-primitives | Число-барабан: каждая цифра — колонка 0–9, вертикально прокручивающаяся к значению по кратчайшему пути (одометр, табло); минус и дробная… | [карточка](../components/motion-primitives/sliding-number.md) |
| `motion-primitives-website/animated-counter` | motion-primitives-website | Число как слот-машина: каждая цифра — колонка 0–9, прокручивающаяся до своей цифры; разряды стартуют с задержкой 0.1 с. | [карточка](../components/motion-primitives-website/animated-counter.md) |
| `motion-primitives-website/animated-grid-pattern` | motion-primitives-website | Сетка тонких линий, в которой случайные клетки по очереди мягко загораются цветом и гаснут — живая матрица. | [карточка](../components/motion-primitives-website/animated-grid-pattern.md) |
| `motion-primitives-website/blocks-preloader` | motion-primitives-website | Полноэкранная сетка блоков (4×6), которые по порядку загораются по мере роста прогресса. | [карточка](../components/motion-primitives-website/blocks-preloader.md) |
| `motion-primitives-website/circular-preloader` | motion-primitives-website | Полноэкранный экран загрузки: кольцо прогресса с числом в центре; на выходе кольцо увеличивается вдвое и гаснет. | [карточка](../components/motion-primitives-website/circular-preloader.md) |
| `motion-primitives-website/circular-progress` | motion-primitives-website | Кольцо прогресса (SVG): дуга пружинно дорастает до процента, в центре — процент или свой контент. | [карточка](../components/motion-primitives-website/circular-progress.md) |
| `motion-primitives-website/counter-preloader` | motion-primitives-website | Полноэкранный счётчик загрузки 000 → 100 гигантскими цифрами; по окончании экран уезжает вверх шторкой (clip-path), открывая следующую сц… | [карточка](../components/motion-primitives-website/counter-preloader.md) |
| `motion-primitives-website/gradient-text` | motion-primitives-website | Текст, залитый градиентом (фиолетовый → розовый → красный); с animate градиент медленно переливается туда-обратно. | [карточка](../components/motion-primitives-website/gradient-text.md) |
| `motion-primitives-website/marquee` | motion-primitives-website | Бесконечная бегущая лента (горизонтальная или вертикальная): контент повторён repeat раз и бесшовно сдвигается; MarqueeItem — полупрозрач… | [карточка](../components/motion-primitives-website/marquee.md) |
| `motion-primitives-website/number-ticker` | motion-primitives-website | Счётчик, пружинно отсчитывающий от 0 до значения (или обратно) с префиксом, суффиксом и фиксированным числом знаков (формат en-US). | [карточка](../components/motion-primitives-website/number-ticker.md) |
| `motion-primitives-website/progress-bar` | motion-primitives-website | Горизонтальная полоса прогресса, пружинно заполняющаяся до значения; опционально подпись с процентом, свечение и бегущие диагональные пол… | [карточка](../components/motion-primitives-website/progress-bar.md) |
| `motion-primitives-website/spring-counter` | motion-primitives-website | Пружинный счётчик от 0 до значения с форматами: число, валюта, процент, compact (12.8K, 1.2M), с префиксом и суффиксом. | [карточка](../components/motion-primitives-website/spring-counter.md) |
| `motion-primitives-website/stat-card` | motion-primitives-website | KPI-карточка: подпись и иконка, крупное пружинное число и бейдж тренда — зелёная стрелка вверх или красная вниз с процентом. | [карточка](../components/motion-primitives-website/stat-card.md) |
| `nivo/bar` | nivo | Столбчатая диаграмма: вертикальные или горизонтальные бары, stacked/grouped, отрицательные значения, подписи, суммы стопок, оси, сетка, л… | [карточка](../components/nivo/bar.md) |
| `nivo/boxplot` | nivo | Ящик с усами по сырым наблюдениям: межквартильный ящик, медиана, усы до крайних квантилей; группы и подгруппы рядом. | [карточка](../components/nivo/boxplot.md) |
| `nivo/bullet` | nivo | Bullet chart: полосы диапазонов (плохо/норма/хорошо), бар фактического значения (measure) и риски целей (markers); несколько показателей… | [карточка](../components/nivo/bullet.md) |
| `nivo/calendar` | nivo | Календарная тепловая карта: квадрат на каждый день года по неделям, месяцы обведены, цвет — по значению (как граф активности GitHub); в п… | [карточка](../components/nivo/calendar.md) |
| `nivo/choropleth` | nivo | Карта-хороплет: регионы из GeoJSON закрашены по значению, проекции d3-geo (mercator, orthographic-глобус и др.), сетка меридианов, легенд… | [карточка](../components/nivo/choropleth.md) |
| `nivo/circle-packing` | nivo | Вложенные круги (d3 pack): узел дерева — круг, площадь пропорциональна значению, дети внутри родителя; зум на узел (zoomedId). Варианты C… | [карточка](../components/nivo/circle-packing.md) |
| `nivo/funnel` | nivo | Воронка: этапы друг за другом, ширина части пропорциональна значению, сглаженные переходы между частями, разделители и подписи (experimen… | [карточка](../components/nivo/funnel.md) |
| `nivo/heatmap` | nivo | Матрица ячеек «строка × столбец»: цвет по значению (непрерывная шкала), опционально размер ячейки, форма rect/circle, подписи, оси, цвето… | [карточка](../components/nivo/heatmap.md) |
| `nivo/icicle` | nivo | Icicle-диаграмма: иерархия прямоугольниками по уровням, ширина пропорциональна значению; orientation bottom даёт flame chart; IcicleHtml… | [карточка](../components/nivo/icicle.md) |
| `nivo/marimekko` | nivo | Mosaic-диаграмма: столбцы переменной ширины (размер сегмента), внутри — стопка долей; offset expand/diverging/none/silouhette/wiggle. | [карточка](../components/nivo/marimekko.md) |
| `nivo/pie` | nivo | Круговая диаграмма или пончик (innerRadius): сектора с подписями внутри и выносками, диапазон углов, отступы, скругления, метрика в центр… | [карточка](../components/nivo/pie.md) |
| `nivo/polar-bar` | nivo | Полярная столбчатая диаграмма (роза): равные угловые сектора на категорию, столбцы растут от центра по радиусу, серии стопкой, полярная с… | [карточка](../components/nivo/polar-bar.md) |
| `nivo/radar` | nivo | Радар-«паутина»: оси по кругу на каждую метрику, серии — замкнутые полупрозрачные фигуры, круглая или многоугольная сетка, точки и подписи. | [карточка](../components/nivo/radar.md) |
| `nivo/radial-bar` | nivo | Радиальные бары: концентрические кольца по сериям, дуги категорий, длина дуги — значение; фоновые треки делают кольца похожими на прогрес… | [карточка](../components/nivo/radial-bar.md) |
| `nivo/scatterplot` | nivo | Точечная диаграмма: серии точек x/y, опционально размер по третьему полю, шкалы linear/time/log, оси, маркеры, аннотации; ScatterPlotCanv… | [карточка](../components/nivo/scatterplot.md) |
| `nivo/sunburst` | nivo | Радиальная иерархия: центр — корень, кольца — уровни глубже, угол дуги пропорционален значению, подписи на дугах. | [карточка](../components/nivo/sunburst.md) |
| `nivo/swarmplot` | nivo | Swarm/beeswarm: каждая запись — кружок на оси значения по группам, без перекрытий (коллизии d3-force), размер по третьему полю. | [карточка](../components/nivo/swarmplot.md) |
| `nivo/treemap` | nivo | Treemap (d3-hierarchy): вложенные прямоугольники, площадь пропорциональна значению, полосы подписей родителей; варианты TreeMapHtml, Tree… | [карточка](../components/nivo/treemap.md) |
| `nivo/waffle` | nivo | Вафельная диаграмма: сетка rows × columns, доли закрашены цветами категорий в порядке fillDirection, остаток emptyColor, слой areas обвод… | [карточка](../components/nivo/waffle.md) |
| `react-bits/count-up` | react-bits | Число, отсчитывающееся от from до to: обычный пересчёт текста или одометр (mode='roll') с прокручивающимися разрядами, motion-blur, разде… | [карточка](../components/react-bits/count-up.md) |
| `react-bits/counter` | react-bits | Число-одометр: каждый разряд — лента цифр 0–9, докручивающаяся до нового значения с пружиной, motion-blur и затуханием по краям; новые ра… | [карточка](../components/react-bits/counter.md) |
| `react-bits/dome-gallery` | react-bits | Иммерсивный купол из фото: плитки по внутренней поверхности сферы (CSS 3D), зритель внутри; затемнение по краям, по клику фото раскрывается. | [карточка](../components/react-bits/dome-gallery.md) |
| `react-bits/drift-wall` | react-bits | Бесконечная стена плиток-изображений в перспективе: колонки плывут вверх и вниз навстречу друг другу с разной скоростью, края растворяютс… | [карточка](../components/react-bits/drift-wall.md) |
| `react-bits/grid-motion` | react-bits | Наклонённая стена из рядов плиток (картинки, текст, JSX), ряды едут в противоположные стороны, края растушёваны; опционально 3D-наклон и… | [карточка](../components/react-bits/grid-motion.md) |
| `react-bits/logo-loop` | react-bits | Бесконечная бегущая строка логотипов (иконки или картинки): горизонтально/вертикально, дуга-орбита с увеличением в центре, пошаговый режи… | [карточка](../components/react-bits/logo-loop.md) |
| `react-bits/masonry` | react-bits | Masonry-галерея (Pinterest-сетка): плитки разной высоты по колонкам пружинисто влетают со stagger и проявляются из размытия; подписи, hov… | [карточка](../components/react-bits/masonry.md) |
| `react-bits/pulse-heart` | react-bits | Кнопка-лайк в виде пилюли: иконка (сердце, звезда, палец) с пульсом и разлётом точек и счётчик с прокруткой числа. | [карточка](../components/react-bits/pulse-heart.md) |
| `react-bits/scroll-velocity` | react-bits | Одна или несколько бегущих лент крупного текста, соседние строки едут в разные стороны; на сайте скорость, наклон и растяжение зависят от… | [карточка](../components/react-bits/scroll-velocity.md) |
| `recharts/area-chart` | recharts | График с заливкой под кривой: одиночные, накопленные (stackId, stackOffset expand) и диапазонные области с контуром, осями и сеткой. | [карточка](../components/recharts/area-chart.md) |
| `recharts/bar-chart` | recharts | Столбчатая диаграмма в SVG: вертикальные или горизонтальные столбцы, группы и стеки, скругления, фон столбца, подписи значений, оси и сетка. | [карточка](../components/recharts/bar-chart.md) |
| `recharts/cartesian-grid` | recharts | Координатная сетка за декартовым графиком: горизонтальные/вертикальные линии по тикам или заданным точкам, полосы фона. | [карточка](../components/recharts/cartesian-grid.md) |
| `recharts/funnel-chart` | recharts | Воронка: стопка трапеций сверху вниз, ширина пропорциональна значению этапа; последний этап — треугольник или прямоугольник. | [карточка](../components/recharts/funnel-chart.md) |
| `recharts/label` | recharts | Одиночная SVG-подпись, привязанная к оси, опорной линии, сектору или центру donut: позиции top/inside*/center/insideStart/insideEnd/end,… | [карточка](../components/recharts/label.md) |
| `recharts/label-list` | recharts | Подписи значений у каждого элемента ряда: над столбцами, внутри секторов, у точек линии, у этапов воронки. | [карточка](../components/recharts/label-list.md) |
| `recharts/pie-chart` | recharts | Круговая и кольцевая (donut) диаграммы, полукруг, вложенные кольца, выносные подписи с линиями, отступы между секторами. | [карточка](../components/recharts/pie-chart.md) |
| `recharts/radial-bar-chart` | recharts | Радиальные столбцы: концентрические дуги, длина дуги — значение, фон-дорожка и скруглённые концы; одна дуга — прогресс-кольцо/gauge. | [карточка](../components/recharts/radial-bar-chart.md) |
| `recharts/sunburst-chart` | recharts | Иерархия вложенными кольцами секторов: центр — корень, каждое кольцо — уровень глубже, угол — доля значения; подписи на секторах. | [карточка](../components/recharts/sunburst-chart.md) |
| `recharts/treemap` | recharts | Дерево-карта: прямоугольники с площадью пропорционально значению (squarify, aspectRatio), вложенные уровни, отступы, подписи внутри плиток. | [карточка](../components/recharts/treemap.md) |
| `xyflow/edge-label-renderer` | xyflow | HTML-подписи на рёбрах: портал в слой поверх SVG-рёбер в координатах холста — плашки, бейджи, цифры, иконки посреди связи. | [карточка](../components/xyflow/edge-label-renderer.md) |

### Требует существенной переработки (`complex`) — 27

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/bento-eight` | animata | Яркая bento-сетка 4×3 из 8 карточек EdTech-продукта: рейтинг 4.8★, «179k+ students» с аватарами, AI-чат с печатью ответа, отчёт-скелетон,… | [карточка](../components/animata/bento-eight.md) |
| `echarts/bar` | echarts | Столбчатая диаграмма на декартовой или полярной сетке: вертикальные/горизонтальные столбцы, группы и стеки, фон-дорожка, скругления, подп… | [карточка](../components/echarts/bar.md) |
| `echarts/boxplot` | echarts | Ящики с усами: min, Q1, медиана, Q3, max по каждой категории, горизонтально или вертикально. | [карточка](../components/echarts/boxplot.md) |
| `echarts/calendar` | echarts | Календарная сетка дней (как вклад GitHub): недели × дни за год, месяц или диапазон, подписи дней, месяцев и года; основа для heatmap/scat… | [карточка](../components/echarts/calendar.md) |
| `echarts/funnel` | echarts | Воронка из трапеций: ширина этапа пропорциональна значению, сортировка по убыванию, подписи снаружи с линиями или внутри. | [карточка](../components/echarts/funnel.md) |
| `echarts/gauge` | echarts | Спидометр/шкала: дуга 225°…−45° с делениями и подписями, стрелка, полоса прогресса, центральная цифра detail и заголовок. | [карточка](../components/echarts/gauge.md) |
| `echarts/heatmap` | echarts | Тепловая карта: сетка ячеек с цветом по значению (декартова, календарь, matrix) или размытые пятна плотности на географии. | [карточка](../components/echarts/heatmap.md) |
| `echarts/map` | echarts | Картограмма: регионы из GeoJSON или SVG, окрашенные по значению (через visualMap), подписи регионов, несколько рядов на одной карте. | [карточка](../components/echarts/map.md) |
| `echarts/pictorial-bar` | echarts | Пиктографические столбцы: столбец из повторяющихся иконок (человечки, бутылки) или одна фигура-маска, обрезанная по значению. | [карточка](../components/echarts/pictorial-bar.md) |
| `echarts/pie` | echarts | Круговая, кольцевая и роза-диаграмма (roseType): сектора с выносными подписями и линиями, отступы между секторами, пустой круг при нулево… | [карточка](../components/echarts/pie.md) |
| `echarts/sunburst` | echarts | Иерархия концентрическими кольцами секторов: центр — корень, кольца — уровни, угол — доля; радиальные подписи, уровни levels со своим рад… | [карточка](../components/echarts/sunburst.md) |
| `echarts/treemap` | echarts | Дерево-карта: прямоугольники с площадью по значению (squarify, золотое сечение), вложенные уровни с заголовками upperLabel, градации цвет… | [карточка](../components/echarts/treemap.md) |
| `echarts/visual-map` | echarts | Шкала соответствия значения цвету/размеру/прозрачности: непрерывный градиентный ползунок или кусочная легенда диапазонов; красит ряды hea… | [карточка](../components/echarts/visual-map.md) |
| `magicui/flickering-grid` | magicui | Поле мелких квадратиков, случайно вспыхивающих и гаснущих — мерцающая матрица, как светодиодное табло. | [карточка](../components/magicui/flickering-grid.md) |
| `magicui/globe` | magicui | Точечный 3D-глобус на WebGL, медленно вращающийся, с оранжевыми маркерами городов и свечением; тянется мышью. | [карточка](../components/magicui/globe.md) |
| `mermaid/packet` | mermaid | Структура сетевого пакета/битового формата: ряды по 32 бита, поля-прямоугольники с подписью и диапазоном битов. | [карточка](../components/mermaid/packet.md) |
| `mermaid/pie` | mermaid | Круговая (или кольцевая при donutHole) диаграмма с процентами на секторах, заголовком и легендой. | [карточка](../components/mermaid/pie.md) |
| `mermaid/radar` | mermaid | Радар (паутинная диаграмма): оси-лучи из центра, концентрическая сетка, замкнутые полупрозрачные кривые для каждого объекта, легенда. | [карточка](../components/mermaid/radar.md) |
| `mermaid/sankey` | mermaid | Диаграмма Санкея: прямоугольники-узлы по слоям и полупрозрачные ленты потоков, толщина ленты пропорциональна значению; подписи и значения… | [карточка](../components/mermaid/sankey.md) |
| `mermaid/treemap` | mermaid | Тримэп: вложенные прямоугольники, площадь пропорциональна значению; секции-родители с заголовками и листья со значениями. | [карточка](../components/mermaid/treemap.md) |
| `mermaid/user-journey` | mermaid | Карта пути пользователя: шаги-карточки по секциям слева направо, у каждого — оценка 1–5 со смайликом и участники. | [карточка](../components/mermaid/user-journey.md) |
| `mermaid/xychart` | mermaid | Столбчатый и/или линейный график по осям X/Y: категории или числовая шкала по X, диапазон по Y, несколько серий bar и line, вертикальная… | [карточка](../components/mermaid/xychart.md) |
| `motion-primitives/infinite-slider` | motion-primitives | Бесконечная лента-маркиза: логотипы, карточки или отзывы непрерывно едут по горизонтали или вертикали, контент продублирован для бесшовно… | [карточка](../components/motion-primitives/infinite-slider.md) |
| `motion-primitives-website/globe` | motion-primitives-website | Вращающийся 3D-глобус: wireframe — каркасная сфера с двумя кольцами-орбитами; dotted — сфера из 200 точек со светящимися дугами-связями. | [карточка](../components/motion-primitives-website/globe.md) |
| `react-bits/ballpit` | react-bits | Бассейн из сотен 3D-шаров с PBR-материалом (satin, matte, gloss, frosted, metal): сталкиваются, падают или парят; курсор расталкивает и х… | [карточка](../components/react-bits/ballpit.md) |
| `react-bits/particles` | react-bits | 3D-облако частиц (круги, квадраты, кольца, искры), дрейфующих с мерцанием и свечением; опционально соединения линиями. | [карточка](../components/react-bits/particles.md) |
| `react-bits/pattern-waves` | react-bits | Движущаяся поверхность, напечатанная растром: точки, квадраты, плюсы, контурные линии или ASCII-символы следуют волне (silk/swell/ripple). | [карточка](../components/react-bits/pattern-waves.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`growth-decline`, `comparison`, `key-point-emphasis`
