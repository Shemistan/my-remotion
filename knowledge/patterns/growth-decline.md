# Рост и падение

Озвучка говорит о динамике одного показателя: «выросло», «упало»,
«удвоилось», «обвал», «восстановление». Зрителю нужно увидеть направление и
масштаб изменения, а не точные значения.

## Визуальные приёмы

1. **Счётчик** — число докручивается от старого значения к новому; самый
   дешёвый и самый читаемый способ, если величина одна.
2. **Линия/площадь во времени** — рисуется слева направо; подчёркивает
   тренд, работает при 5+ точках.
3. **Бар, растущий по кадру** — один или несколько столбцов, `scaleX`/
   `scaleY` от 0 до значения.
4. **Стрелка/индикатор** — зелёная вверх, красная вниз, с процентом.
5. **Кольцо прогресса** — для доли от целого (0–100 %).

## Как выбирать

- Одно число → `numbers-counters` (`remotion-bits/animated-counter`).
- Ряд во времени → линия (`charts-data`, chart-type line/area) с
  анимацией «рисования» по кадру.
- Несколько категорий, каждая растёт → столбцы со stagger.
- Падение показывать тем же приёмом в обратную сторону и цветом.

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 14

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/bar-chart-anim` | free-remotion-templates | Вертикальная столбчатая диаграмма: заголовок и подзаголовок, скруглённые столбцы своих цветов растут от базовой линии по очереди, под ним… | [карточка](../components/free-remotion-templates/bar-chart-anim.md) |
| `free-remotion-templates/fireworks-burst` | free-remotion-templates | Три SVG-салюта (кадры 0, 20, 35): взлётный след, 12 цветных лучей с точками и искры расходятся и гаснут; внизу крупное слово и подпись. | [карточка](../components/free-remotion-templates/fireworks-burst.md) |
| `free-remotion-templates/kpi-counter` | free-remotion-templates | Дашборд карточек KPI: заголовок, линия-разделитель, карточки въезжают по очереди; в каждой значок, подпись и число, докручивающееся одоме… | [карточка](../components/free-remotion-templates/kpi-counter.md) |
| `free-remotion-templates/line-chart-anim` | free-remotion-templates | Линейный график: заголовок, 4 линии сетки, ломаная дорисовывается слева направо, точки выпрыгивают по ходу линии, проявляются подписи оси… | [карточка](../components/free-remotion-templates/line-chart-anim.md) |
| `free-remotion-templates/pixel-candlestick-ohlc` | free-remotion-templates | 8-битный свечной OHLC-график: свечи выпрыгивают по одной слева направо, бычьи зелёные и медвежьи красные переливаются; в шапке тикер, цен… | [карточка](../components/free-remotion-templates/pixel-candlestick-ohlc.md) |
| `free-remotion-templates/pourover-drip-fill-gauge` | free-remotion-templates | Пиксель-арт пуровер: вода капает в конус, графин наполняется полосатой жидкостью с мениском; пиксельный счётчик NN% с подписью VOLUME и ш… | [карточка](../components/free-remotion-templates/pourover-drip-fill-gauge.md) |
| `free-remotion-templates/racing-chart` | free-remotion-templates | Гонка горизонтальных баров: серии с подписями и значениями внутри бара, значения плавно меняются между шагами, бары тянутся относительно… | [карточка](../components/free-remotion-templates/racing-chart.md) |
| `remotion-bits/animated-counter` | remotion-bits | Число, плавно докручивающееся от одного значения к другому (или по цепочке ключевых значений) с префиксом/постфиксом и фиксированным числ… | [карточка](../components/remotion-bits/animated-counter.md) |
| `remotion-bits/bit-bar-chart` | remotion-bits | Горизонтальная столбчатая диаграмма: заголовок, подписи, бары растут слева направо со stagger, справа докручиваются значения. | [карточка](../components/remotion-bits/bit-bar-chart.md) |
| `remotion-bits/bit-basic-counter` | remotion-bits | Строка «width: N px», где число проходит цепочку 0 → 10 → 10 → 50 → 10 за 120 кадров: рост, пауза, скачок и откат. | [карточка](../components/remotion-bits/bit-basic-counter.md) |
| `remotion-bits/bit-counter-confetti` | remotion-bits | Крупное светящееся число по центру докручивается 0 → 1000 с масштабным перелётом; на финише с краёв и снизу вылетает разноцветное конфетт… | [карточка](../components/remotion-bits/bit-counter-confetti.md) |
| `remotion-bits/bit-particles-fountain` | remotion-bits | Фонтан светящихся шариков бьёт из-под нижнего края вверх, частицы расходятся веером и падают под гравитацией. | [карточка](../components/remotion-bits/bit-particles-fountain.md) |
| `remotion-video-templates/bar-chart-race` | remotion-video-templates | Гонка горизонтальных баров: серии меняют значения по шагам времени, бары растут и плавно меняются местами по рангу; справа число, в углу… | [карточка](../components/remotion-video-templates/bar-chart-race.md) |
| `remotion-video-templates/line-chart-draw` | remotion-video-templates | SVG-график нескольких серий: сетка с подписями Y, метки шагов X, легенда; линии рисуются слева направо с бегущей точкой, затем проявляетс… | [карточка](../components/remotion-video-templates/line-chart-draw.md) |

### Адаптируется без переписывания (`adaptable`) — 41

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/bar-chart` | animata | Компактная вертикальная мини-диаграмма: ряд столбцов с зазором 2px, высота каждого — процент от высоты контейнера; при появлении все выра… | [карточка](../components/animata/bar-chart.md) |
| `animata/battery` | animata | Голубой градиентный виджет: маленькое белое кольцо заряда с иконкой батареи и крупное число процента. | [карточка](../components/animata/battery.md) |
| `animata/bottom-up-letters` | animata | Короткое слово собирается лесенкой: буквы по одной поднимаются снизу на 46px с заметной задержкой. | [карточка](../components/animata/bottom-up-letters.md) |
| `animata/calorie-counter` | animata | Высокий фитнес-виджет: дата и аватар, большое кольцо калорий с «Today N Cal», плашка «Your goal N Cal». | [карточка](../components/animata/calorie-counter.md) |
| `animata/counter` | animata | Крупное число пружинисто докручивается от 0 до цели (или от цели до 0) с форматированием разрядов или валюты. | [карточка](../components/animata/counter.md) |
| `animata/cycling` | animata | Тёмный фитнес-виджет «Cycling 2h 30m»: иконка велосипеда, стопка цветных полосок и розовая карточка «Goal 15km» с сегментным прогресс-бар… | [карточка](../components/animata/cycling.md) |
| `animata/delivery-card` | animata | Тёмный виджет отслеживания заказа в виде багажной бирки: «Arrives today 09:26», статус Processing / In transit / Delivered, линия пути с… | [карточка](../components/animata/delivery-card.md) |
| `animata/donut-chart` | animata | Кольцевой индикатор одной доли: дорожка и цветная дуга, заполненная на progress % по часовой стрелке от 12 часов; в центр — children. | [карточка](../components/animata/donut-chart.md) |
| `animata/expense-tracker` | animata | Виджет недельных трат: месяц и год, 7 капсул-столбиков по дням с синей заливкой по доле дня, итог «THIS WEEK SPENDING $3,740». | [карточка](../components/animata/expense-tracker.md) |
| `animata/fibonacci-lines` | animata | Стопка из 10 горизонтальных линий, расстояние между которыми растёт по Фибоначчи, а прозрачность — от 0.1 до 1: эффект перспективы/горизо… | [карточка](../components/animata/fibonacci-lines.md) |
| `animata/fund-widget` | animata | Белая карточка-стопка: крупное значение актива «2.7Cr», изменение «12% ↑» зелёным или «−8% ↓» красным, подпись Stocks/Funds/Deposits и ве… | [карточка](../components/animata/fund-widget.md) |
| `animata/gauge-chart` | animata | Спидометр: кольцо с разрывом внизу (gap px длины дуги), цветная дуга заполняет его на progress %, в центре опционально крупное значение. | [карточка](../components/animata/gauge-chart.md) |
| `animata/per-character-rise` | animata | Буквы быстро поднимаются на место с 32px снизу со stagger 24 мс, без blur — чёткая tvOS-подача. | [карточка](../components/animata/per-character-rise.md) |
| `animata/progress` | animata | Сегментированный прогресс-бар из палочек 2px через 2px высотой 12px: заполненные светлые, остальные тёмные; заполнение бежит слева направ… | [карточка](../components/animata/progress.md) |
| `animata/storage-widget` | animata | Тёмный виджет «5.31 / 16 GB, 28%» с сеткой 15×7 квадратиков по категориям (как GitHub-контрибуции) и легендой 5.90 \| 2.15 \| 2.59 GB. | [карточка](../components/animata/storage-widget.md) |
| `animata/ticker` | animata | Число-барабан: каждая цифра — лента 0–9, пружинисто прокручивается до нужной цифры; нецифровые символы стоят на месте. | [карточка](../components/animata/ticker.md) |
| `animata/top-down-letters` | animata | Слово падает сверху: буквы по одной спускаются с −46px лесенкой; уход вниз на 14px. | [карточка](../components/animata/top-down-letters.md) |
| `animata/water-tracker` | animata | Виджет «Water»: «750 ml of 2,000 ml today», кнопка «+250 ml» и вертикальная колба с голубой заливкой на долю от цели. | [карточка](../components/animata/water-tracker.md) |
| `magicui/animated-circular-progress-bar` | magicui | Круговой гейдж: дуга основного цвета на процент, остаток второстепенным цветом с зазорами, число процентов в центре. | [карточка](../components/magicui/animated-circular-progress-bar.md) |
| `magicui/number-ticker` | magicui | Число пружинисто докручивается от startValue до value (или обратно) с разделителями тысяч и фиксированными знаками. | [карточка](../components/magicui/number-ticker.md) |
| `motion-primitives/animated-number` | motion-primitives | Число, пружинно докручивающееся до нового значения; целое, с разделителями разрядов (toLocaleString), табличные цифры. | [карточка](../components/motion-primitives/animated-number.md) |
| `motion-primitives/sliding-number` | motion-primitives | Число-барабан: каждая цифра — колонка 0–9, вертикально прокручивающаяся к значению по кратчайшему пути (одометр, табло); минус и дробная… | [карточка](../components/motion-primitives/sliding-number.md) |
| `motion-primitives-website/blocks-preloader` | motion-primitives-website | Полноэкранная сетка блоков (4×6), которые по порядку загораются по мере роста прогресса. | [карточка](../components/motion-primitives-website/blocks-preloader.md) |
| `motion-primitives-website/circular-progress` | motion-primitives-website | Кольцо прогресса (SVG): дуга пружинно дорастает до процента, в центре — процент или свой контент. | [карточка](../components/motion-primitives-website/circular-progress.md) |
| `motion-primitives-website/number-ticker` | motion-primitives-website | Счётчик, пружинно отсчитывающий от 0 до значения (или обратно) с префиксом, суффиксом и фиксированным числом знаков (формат en-US). | [карточка](../components/motion-primitives-website/number-ticker.md) |
| `motion-primitives-website/progress-bar` | motion-primitives-website | Горизонтальная полоса прогресса, пружинно заполняющаяся до значения; опционально подпись с процентом, свечение и бегущие диагональные пол… | [карточка](../components/motion-primitives-website/progress-bar.md) |
| `motion-primitives-website/split-color-text` | motion-primitives-website | Текст, разрезанный по вертикали на два цвета; граница — splitPosition %. | [карточка](../components/motion-primitives-website/split-color-text.md) |
| `motion-primitives-website/spring-counter` | motion-primitives-website | Пружинный счётчик от 0 до значения с форматами: число, валюта, процент, compact (12.8K, 1.2M), с префиксом и суффиксом. | [карточка](../components/motion-primitives-website/spring-counter.md) |
| `motion-primitives-website/stat-card` | motion-primitives-website | KPI-карточка: подпись и иконка, крупное пружинное число и бейдж тренда — зелёная стрелка вверх или красная вниз с процентом. | [карточка](../components/motion-primitives-website/stat-card.md) |
| `nivo/bar` | nivo | Столбчатая диаграмма: вертикальные или горизонтальные бары, stacked/grouped, отрицательные значения, подписи, суммы стопок, оси, сетка, л… | [карточка](../components/nivo/bar.md) |
| `nivo/bump` | nivo | Bump chart: позиции серий в рейтинге во времени — сглаженные линии меняются местами, подписи на концах, точки в узлах; в пакете также Are… | [карточка](../components/nivo/bump.md) |
| `nivo/funnel` | nivo | Воронка: этапы друг за другом, ширина части пропорциональна значению, сглаженные переходы между частями, разделители и подписи (experimen… | [карточка](../components/nivo/funnel.md) |
| `nivo/line` | nivo | Линейный график: серии, точки, области (в т.ч. стопкой), кривые d3, шкалы point/linear/time/log, маркеры, легенды, разрывы на null; LineC… | [карточка](../components/nivo/line.md) |
| `nivo/stream` | nivo | Streamgraph: сглаженные слои-потоки стопкой во времени со смещённой базовой линией (offsetType), точки и срезы. | [карточка](../components/nivo/stream.md) |
| `react-bits/count-up` | react-bits | Число, отсчитывающееся от from до to: обычный пересчёт текста или одометр (mode='roll') с прокручивающимися разрядами, motion-blur, разде… | [карточка](../components/react-bits/count-up.md) |
| `react-bits/counter` | react-bits | Число-одометр: каждый разряд — лента цифр 0–9, докручивающаяся до нового значения с пружиной, motion-blur и затуханием по краям; новые ра… | [карточка](../components/react-bits/counter.md) |
| `react-bits/pulse-heart` | react-bits | Кнопка-лайк в виде пилюли: иконка (сердце, звезда, палец) с пульсом и разлётом точек и счётчик с прокруткой числа. | [карточка](../components/react-bits/pulse-heart.md) |
| `recharts/area-chart` | recharts | График с заливкой под кривой: одиночные, накопленные (stackId, stackOffset expand) и диапазонные области с контуром, осями и сеткой. | [карточка](../components/recharts/area-chart.md) |
| `recharts/bar-chart` | recharts | Столбчатая диаграмма в SVG: вертикальные или горизонтальные столбцы, группы и стеки, скругления, фон столбца, подписи значений, оси и сетка. | [карточка](../components/recharts/bar-chart.md) |
| `recharts/composed-chart` | recharts | Комбинированный декартов график: столбцы, линии, области и точки в одной системе координат, при необходимости на двух осях Y. | [карточка](../components/recharts/composed-chart.md) |
| `recharts/line-chart` | recharts | Линейный график: одна или несколько кривых по точкам данных, точки, подписи, интерполяция кривой (linear, monotone, step…), пунктир, оси… | [карточка](../components/recharts/line-chart.md) |

### Требует существенной переработки (`complex`) — 13

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/transition-list` | animata | Окно со списком строк-подписок (иконка-буква, название, категория, сумма): каждые 2.5 с верхняя строка схлопывается, остальные поднимаются. | [карточка](../components/animata/transition-list.md) |
| `echarts/bar` | echarts | Столбчатая диаграмма на декартовой или полярной сетке: вертикальные/горизонтальные столбцы, группы и стеки, фон-дорожка, скругления, подп… | [карточка](../components/echarts/bar.md) |
| `echarts/candlestick` | echarts | Японские свечи (OHLC): тело open–close и тени lowest–highest, рост красным, падение зелёным (по умолчанию), режим large для длинных рядов. | [карточка](../components/echarts/candlestick.md) |
| `echarts/line` | echarts | Линейный график и область под кривой: несколько рядов, сглаживание, ступеньки, стеки, маркеры точек, подпись у конца линии (endLabel). | [карточка](../components/echarts/line.md) |
| `echarts/theme-river` | echarts | «Река тем»: симметричные плавные потоки вокруг оси времени, толщина потока — величина темы в момент времени. | [карточка](../components/echarts/theme-river.md) |
| `mermaid/xychart` | mermaid | Столбчатый и/или линейный график по осям X/Y: категории или числовая шкала по X, диапазон по Y, несколько серий bar и line, вертикальная… | [карточка](../components/mermaid/xychart.md) |
| `react-bits/gradient-waves` | react-bits | Океан градиентных волн с рельефом и светлыми гребнями до горизонта, освещённый под углом; клик поднимает волну. | [карточка](../components/react-bits/gradient-waves.md) |
| `react-bits/hyperspeed` | react-bits | Полёт по ночной трассе: световые следы фар и стоп-сигналов, столбы, пыль, отражения; трасса петляет; удержание — ускорение с ростом FOV. | [карточка](../components/react-bits/hyperspeed.md) |
| `react-bits/light-pillar` | react-bits | Вертикальный столб света с градиентом от верхнего к нижнему цвету, медленно вращающийся, с bloom; клик — пульс. | [карточка](../components/react-bits/light-pillar.md) |
| `react-bits/line-waves` | react-bits | Десятки тонких линий под углом, искривлённых волнами с подсветкой гребней (до трёх цветов). | [карточка](../components/react-bits/line-waves.md) |
| `react-bits/prismatic-burst` | react-bits | Взрыв призматических лучей из центра: радиальные пучки света, вращающиеся в 3D, с закруткой и вспышкой. | [карточка](../components/react-bits/prismatic-burst.md) |
| `react-bits/topography` | react-bits | Рельеф местности из светящихся контурных линий в наклонной 3D-перспективе с туманом и DOF; ландшафт плывёт вперёд. | [карточка](../components/react-bits/topography.md) |
| `react-bits/waves` | react-bits | Частокол тонких параллельных линий, изгибаемых полем Perlin-шума, как рельеф или звуковая волна; курсор раздвигает линии, клик пускает рябь. | [карточка](../components/react-bits/waves.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`quantities`, `timeline`, `comparison`
