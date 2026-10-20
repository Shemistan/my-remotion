# Абстрактные концепции

«Идея», «инновация», «доверие», «хаос и порядок», «энергия», «сеть»,
«интеллект». Нет данных и нет объекта — нужен настроенческий визуал:
фон, частицы, свет, абстрактная геометрия, метафора.

## Визуальные приёмы

1. **Генеративный фон** — aurora, волны, шум, сетка, лучи света.
2. **Частицы** — рой, поток, созвездие; плотность и скорость = «энергия».
3. **Абстрактная геометрия** — орбиты, кольца, metaballs, ленты.
4. **Крупный текст-метафора** — одно слово с эффектом (glitch, shimmer,
   decrypt).
5. **Иконка + свечение** — символ концепции по центру.
6. **Matrix rain, ASCII, terminal** — «технологии», «данные».

## Как выбирать

- Фон под текст → `backgrounds-gradients` (предпочитать CSS/SVG-фоны:
  они `adaptable`; WebGL-фоны `complex`, нужен uTime от кадра).
- Акцент на слове → `text-animation`.
- «Данные/ИИ/код» → matrix rain, code block, typewriter.
- Движение без смысла — лишнее: эффект должен поддерживать слово из
  озвучки.

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 35

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/bokeh-circles` | free-remotion-templates | Фон из мягких расфокусированных кругов-огней (радиальный градиент, blur, blend screen), которые плавают и дышат; опционально надпись по ц… | [карточка](../components/free-remotion-templates/bokeh-circles.md) |
| `free-remotion-templates/brush-stroke-reveal` | free-remotion-templates | Крупный заголовок прорисовывается несколькими горизонтальными мазками кисти (scaleX-вайп по полосам), затем появляются акцентная точка и… | [карточка](../components/free-remotion-templates/brush-stroke-reveal.md) |
| `free-remotion-templates/character-jumping` | free-remotion-templates | Простой SVG-персонаж прыгает несколько раз со squash-and-stretch, тень сжимается, в верхней точке кружат искры; внизу подпись. | [карточка](../components/free-remotion-templates/character-jumping.md) |
| `free-remotion-templates/eye-reveal` | free-remotion-templates | SVG-глаз: веки раскрываются, радужка с лучами и зрачком вырастает, глаз моргает, под ним появляется слово и подпись (вложенной сцены в ко… | [карточка](../components/free-remotion-templates/eye-reveal.md) |
| `free-remotion-templates/glitch-text` | free-remotion-templates | Слово с RGB-расслоением: красный и голубой слои дёргаются, строку режут горизонтальные полосы разрыва; глитч затихает до остаточного уров… | [карточка](../components/free-remotion-templates/glitch-text.md) |
| `free-remotion-templates/ink-spread-transition` | free-remotion-templates | Чернильный переход: 7 капель и 10 брызг цвета второй сцены растекаются и сливаются в пятно с рваным краем (SVG gooey-фильтры), затем проя… | [карточка](../components/free-remotion-templates/ink-spread-transition.md) |
| `free-remotion-templates/loop-grid-wave` | free-remotion-templates | Сетка 18×12 SVG-точек, по которой бежит диагональная волна: точки растут и светлеют, на гребне — акцентный цвет. Бесшовная петля. | [карточка](../components/free-remotion-templates/loop-grid-wave.md) |
| `free-remotion-templates/particle-snow` | free-remotion-templates | Снегопад в три слоя глубины с покачиванием, мерцающие звёзды и градиент неба; внизу заголовок со свечением и подпись. | [карточка](../components/free-remotion-templates/particle-snow.md) |
| `free-remotion-templates/pixel-kit` | free-remotion-templates | Собственной картинки нет: общий модуль pixel-art шаблонов — рендер в низком разрешении с чётким апскейлом, ротация палитр, детерминирован… | [карточка](../components/free-remotion-templates/pixel-kit.md) |
| `free-remotion-templates/pixel-waterfall-cycle` | free-remotion-templates | Пиксель-арт водопад: полосатое небо, скалы, вода течёт ротацией палитры (color cycling), брызги и туман, поверх CRT-скин. Петля, вертикал… | [карточка](../components/free-remotion-templates/pixel-waterfall-cycle.md) |
| `free-remotion-templates/pourover-drip-fill-gauge` | free-remotion-templates | Пиксель-арт пуровер: вода капает в конус, графин наполняется полосатой жидкостью с мениском; пиксельный счётчик NN% с подписью VOLUME и ш… | [карточка](../components/free-remotion-templates/pourover-drip-fill-gauge.md) |
| `free-remotion-templates/starfield` | free-remotion-templates | Варп-полёт: звёзды разлетаются радиально от центра, к краям растут, ярчеют и вытягиваются в светящиеся шлейфы; по центру надпись. | [карточка](../components/free-remotion-templates/starfield.md) |
| `free-remotion-templates/thinking-bubble` | free-remotion-templates | SVG-персонаж в задумчивой позе; к облаку мысли цепочкой вырастают пузырьки, в облаке мигают три точки, ниже — курсивная подпись. | [карточка](../components/free-remotion-templates/thinking-bubble.md) |
| `free-remotion-templates/typewriter` | free-remotion-templates | Плоская SVG-иллюстрация пишущей машинки: каретка едет, клавиши подсвечиваются, на листе появляются полоски строк; затем под машинкой проя… | [карточка](../components/free-remotion-templates/typewriter.md) |
| `free-remotion-templates/wave-text` | free-remotion-templates | Буквы слова непрерывно колышутся по синусоиде со сдвигом фазы (волна), слово проявляется; снизу всплывает подзаголовок; фон — вертикальны… | [карточка](../components/free-remotion-templates/wave-text.md) |
| `remotion-bits/animated-text` | remotion-bits | Текст, появляющийся целиком, по словам, буквам, строкам или по разделителю: фрагменты сдвигаются, масштабируются, вращаются, проявляются… | [карточка](../components/remotion-bits/animated-text.md) |
| `remotion-bits/bit-3d-elements` | remotion-bits | Камера летит по фразе из пяти слов, каждый шаг повёрнут на −30°; вокруг в глубине рассыпаны 20 полупрозрачных цветных кругов, треугольник… | [карточка](../components/remotion-bits/bit-3d-elements.md) |
| `remotion-bits/bit-blur-slide-word` | remotion-bits | Фраза появляется по словам: каждое слово выплывает снизу на 40 px, проявляется и теряет размытие blur 10 → 0. | [карточка](../components/remotion-bits/bit-blur-slide-word.md) |
| `remotion-bits/bit-conic-gradient` | remotion-bits | Полноэкранный конический градиент чёрный → зелёный, равномерно проворачивающийся на полный круг, как луч радара. | [карточка](../components/remotion-bits/bit-conic-gradient.md) |
| `remotion-bits/bit-easings-visualizer` | remotion-bits | Девять дорожек с подписями (linear, easeInQuad … spring, steps(5)); синий квадрат на каждой должен проезжать слева направо за 60 кадров с… | [карточка](../components/remotion-bits/bit-easings-visualizer.md) |
| `remotion-bits/bit-fireflies` | remotion-bits | Светлячки: по всему кадру рождаются салатовые светящиеся точки, загораются, хаотично блуждают и гаснут. | [карточка](../components/remotion-bits/bit-fireflies.md) |
| `remotion-bits/bit-flying-through-words` | remotion-bits | Туннель из слов: названия ИИ-моделей рождаются в глубине по всему кадру и летят на зрителя, проявляясь и затухая. | [карточка](../components/remotion-bits/bit-flying-through-words.md) |
| `remotion-bits/bit-fracture-reassemble` | remotion-bits | Сетка 5×5 фото-плиток собирается из осколков, разбросанных в 3D, держится ~60 кадров и снова разлетается; в центральном ряду поверх фото… | [карточка](../components/remotion-bits/bit-fracture-reassemble.md) |
| `remotion-bits/bit-glitch-cycle` | remotion-bits | Моноширинная надпись сменяет фразы каждые 60 кадров (INITIALIZING → LOADING ASSETS → SYSTEM ONLINE → WELCOME USER), на стыках символы пре… | [карточка](../components/remotion-bits/bit-glitch-cycle.md) |
| `remotion-bits/bit-linear-gradient` | remotion-bits | Полноэкранный линейный градиент, перетекающий из тёмно-сине-фиолетового (0°) в светло-голубой (180°): ночь сменяется днём. | [карточка](../components/remotion-bits/bit-linear-gradient.md) |
| `remotion-bits/bit-matrix-rain` | remotion-bits | Полноэкранный цифровой дождь: зелёные символы #00FF41 размером 30 px падают колонками, хвост 15 символов, белая светящаяся голова. | [карточка](../components/remotion-bits/bit-matrix-rain.md) |
| `remotion-bits/bit-particles-fountain` | remotion-bits | Фонтан светящихся шариков бьёт из-под нижнего края вверх, частицы расходятся веером и падают под гравитацией. | [карточка](../components/remotion-bits/bit-particles-fountain.md) |
| `remotion-bits/bit-particles-grid` | remotion-bits | В центральной области появляются полупрозрачные белые квадраты, круги и ромбы, привязанные к сетке 5% ширины — пиксельная мозаика. | [карточка](../components/remotion-bits/bit-particles-grid.md) |
| `remotion-bits/bit-particles-snow` | remotion-bits | Снегопад на тёмно-синем ночном фоне: снежинки трёх размеров падают, покачиваются и сносятся ветром вправо; кадр заполнен с первого кадра. | [карточка](../components/remotion-bits/bit-particles-snow.md) |
| `remotion-bits/bit-radial-gradient` | remotion-bits | Круглое световое пятно перемещается из левого верхнего угла в правый нижний и меняет цвет с солнечно-жёлтого на голубом на закатно-розовы… | [карточка](../components/remotion-bits/bit-radial-gradient.md) |
| `remotion-bits/gradient-transition` | remotion-bits | Полноэкранный CSS-градиент (linear/radial/conic), плавно перетекающий через цепочку градиентов: цвета в oklch, угол по кратчайшему пути,… | [карточка](../components/remotion-bits/gradient-transition.md) |
| `remotion-bits/matrix-rain` | remotion-bits | Цифровой дождь «Матрицы»: колонки символов падают вниз, голова белая со свечением, хвост затухает, символы меняются каждые 4 кадра; на ве… | [карточка](../components/remotion-bits/matrix-rain.md) |
| `remotion-bits/particle-system` | remotion-bits | Частицы из произвольных React-элементов (точки, эмодзи, конфетти, слова), рождающиеся из точки/области и летящие под гравитацией, сопроти… | [карточка](../components/remotion-bits/particle-system.md) |
| `remotion-boilerplate/only-logo` | remotion-boilerplate | Логотип-атом: три эллиптические орбиты с градиентной обводкой прорисовываются и разворачиваются, в центре вырастает градиентное ядро; зна… | [карточка](../components/remotion-boilerplate/only-logo.md) |
| `remotion-video-templates/logo-intro` | remotion-video-templates | Логотип из public/ выпрыгивает с перелётом масштаба и открывается маской слева направо; за ним радиальное свечение бренда и взрыв круглых… | [карточка](../components/remotion-video-templates/logo-intro.md) |

### Адаптируется без переписывания (`adaptable`) — 69

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/animated-beam` | animata | Тёмно-индиго фон с сеткой наклонных линий через 40px, по ~30% линий пролетают светлые метеорные штрихи разной длины и скорости; поверх —… | [карточка](../components/animata/animated-beam.md) |
| `animata/blurry-blob` | animata | Два крупных размытых цветных пятна (blur-3xl, mix-blend-multiply), которые пульсируют масштабом. | [карточка](../components/animata/blurry-blob.md) |
| `animata/circular-text` | animata | Текст по окружности (каждый символ повёрнут на свой угол), весь круг бесконечно медленно вращается — печать, бейдж. | [карточка](../components/animata/circular-text.md) |
| `animata/diagonal-lines` | animata | Статичный фон из тонких диагональных линий-штриховки 45° поверх bg-background. | [карточка](../components/animata/diagonal-lines.md) |
| `animata/dot` | animata | Статичный фон из регулярной сетки точек на белом. | [карточка](../components/animata/dot.md) |
| `animata/fibonacci-lines` | animata | Стопка из 10 горизонтальных линий, расстояние между которыми растёт по Фибоначчи, а прозрачность — от 0.1 до 1: эффект перспективы/горизо… | [карточка](../components/animata/fibonacci-lines.md) |
| `animata/focus-blur-resolve` | animata | Строка наводится на резкость: из blur 14px и сдвига 14px снизу проявляется в чёткий текст, затем мягко расфокусируется вверх. | [карточка](../components/animata/focus-blur-resolve.md) |
| `animata/gibberish-text` | animata | Расшифровка: каждая буква перебирает случайные заглавные A–Z и через 5–14 шагов встаёт на место. | [карточка](../components/animata/gibberish-text.md) |
| `animata/glitch-text` | animata | RGB-глитч: под чётким текстом два призрака (пурпурный и циан, mix-blend screen) коротко дёргаются в конце каждого цикла. | [карточка](../components/animata/glitch-text.md) |
| `animata/hero-section-text-hover` | animata | Hero «Embark on Uncharted Adventures and Feel Alive» с иконкой карты и кнопкой: при наведении фраза окрашивается и вокруг неё выпрыгивают… | [карточка](../components/animata/hero-section-text-hover.md) |
| `animata/jitter-text` | animata | Строка мелко дрожит: смещения x/y на 1–1.5px и поворот ±1.5° по ключевым кадрам, туда-обратно с паузой 0.5 с. | [карточка](../components/animata/jitter-text.md) |
| `animata/mirror-text` | animata | Слово повторено четырьмя срезами по 12px высотой как эхо; по hover срезы со сдвигом по задержке смещаются в выбранную сторону. | [карточка](../components/animata/mirror-text.md) |
| `animata/moving-gradient` | animata | Белый контейнер с полупрозрачным переливающимся градиентом yellow→pink, который медленно ездит туда-обратно. | [карточка](../components/animata/moving-gradient.md) |
| `animata/shape-shifter` | animata | Строка «Shape [окно] Shifter»: окно между словами бесконечно меняет форму (40×20 → 240×128 → 80×80 → 128×240), внутри бежит лента фотогра… | [карточка](../components/animata/shape-shifter.md) |
| `animata/soft-blur-in` | animata | Эппловский вход заголовка: каждая буква проявляется из blur 12px с дрейфом 16px вверх, stagger 25 мс. | [карточка](../components/animata/soft-blur-in.md) |
| `animata/zigzag` | animata | Статичный фон-узор зигзаг из четырёх наложенных linear-gradient. | [карточка](../components/animata/zigzag.md) |
| `magicui/animated-grid-pattern` | magicui | Клеточная сетка, где случайные клетки плавно заливаются и гаснут, затем вспыхивают в другом месте — дышащая сетка. | [карточка](../components/magicui/animated-grid-pattern.md) |
| `magicui/aurora-text` | magicui | Слово с переливающимся многоцветным градиентом «северное сияние», слегка покачивающееся и пульсирующее масштабом. | [карточка](../components/magicui/aurora-text.md) |
| `magicui/dot-pattern` | magicui | Фон из ровной сетки точек; в режиме glow точки мягко пульсируют яркостью и размером в случайном ритме. | [карточка](../components/magicui/dot-pattern.md) |
| `magicui/kinetic-text` | magicui | Тонкий заголовок, где буква под курсором набухает до weight 900 с обводкой, соседние — до 600/400: волна насыщенности шрифта. | [карточка](../components/magicui/kinetic-text.md) |
| `magicui/light-rays` | magicui | Мягкие размытые лучи света, падающие сверху веером и медленно покачивающиеся, с радиальными засветками в углах. | [карточка](../components/magicui/light-rays.md) |
| `magicui/line-shadow-text` | magicui | Крупный заголовок со штрихованной диагональной тенью, сдвинутой на 0.04em; полоски тени медленно ползут. | [карточка](../components/magicui/line-shadow-text.md) |
| `magicui/meteors` | magicui | Метеоритный дождь: маленькие светящиеся точки с хвостами пролетают по диагонали и гаснут. | [карточка](../components/magicui/meteors.md) |
| `magicui/morphing-text` | magicui | Крупное слово «перетекает» в следующее: буквы размываются и слипаются, как капли, затем проявляется новое слово. | [карточка](../components/magicui/morphing-text.md) |
| `magicui/noise-texture` | magicui | Слой мелкого зернистого шума (fractal noise, обесцвеченный и приглушённый) поверх фона — плёночная фактура. | [карточка](../components/magicui/noise-texture.md) |
| `magicui/spinning-text` | magicui | Текст по кругу, как надпись на печати или бейдже, медленно вращается вокруг центра. | [карточка](../components/magicui/spinning-text.md) |
| `magicui/warp-background` | magicui | Блок с контентом внутри 3D-туннеля: четыре стены из клеточной сетки уходят в перспективу, по ним летят цветные лучи-кометы. | [карточка](../components/magicui/warp-background.md) |
| `motion-primitives/glow-effect` | motion-primitives | Размытое цветное свечение под карточкой или кнопкой: вращающийся conic-градиент, пульсация, дыхание, смена цвета, горизонтальный перелив… | [карточка](../components/motion-primitives/glow-effect.md) |
| `motion-primitives/spinning-text` | motion-primitives | Текст по окружности (буквы повёрнуты к центру), непрерывно вращающийся — бейдж-печать. | [карточка](../components/motion-primitives/spinning-text.md) |
| `motion-primitives/text-effect` | motion-primitives | Строка текста, проявляющаяся по словам, символам или строкам со stagger (fade, blur, fade-in-blur, scale, slide) с обратным exit. | [карточка](../components/motion-primitives/text-effect.md) |
| `motion-primitives/text-loop` | motion-primitives | Слот в строке, где по кругу сменяются слова/фразы: текущее уезжает вверх и гаснет, следующее въезжает снизу. | [карточка](../components/motion-primitives/text-loop.md) |
| `motion-primitives/text-scramble` | motion-primitives | «Расшифровка»: строка из случайных символов, которые слева направо фиксируются в правильные буквы. | [карточка](../components/motion-primitives/text-scramble.md) |
| `motion-primitives/text-shimmer` | motion-primitives | Серый текст, по которому бесконечно пробегает светлый блик (градиент, обрезанный по буквам через bg-clip-text). | [карточка](../components/motion-primitives/text-shimmer.md) |
| `motion-primitives/text-shimmer-wave` | motion-primitives | По буквам бежит волна: каждая буква по очереди выдвигается в 3D (translateZ, scale, rotateY, смещение) и подсвечивается, затем возвращается. | [карточка](../components/motion-primitives/text-shimmer-wave.md) |
| `motion-primitives-website/animated-grid-pattern` | motion-primitives-website | Сетка тонких линий, в которой случайные клетки по очереди мягко загораются цветом и гаснут — живая матрица. | [карточка](../components/motion-primitives-website/animated-grid-pattern.md) |
| `motion-primitives-website/aurora-background` | motion-primitives-website | Тёмный фон с размытыми сине-фиолетовыми полосами северного сияния, медленно дрейфующими; радиальная маска из правого верхнего угла. | [карточка](../components/motion-primitives-website/aurora-background.md) |
| `motion-primitives-website/flip-words` | motion-primitives-website | Слово в строке сменяется по таймеру: новое въезжает снизу, старое уходит вверх с затуханием. | [карточка](../components/motion-primitives-website/flip-words.md) |
| `motion-primitives-website/gradient-background` | motion-primitives-website | Чёрный полноэкранный фон с тремя крупными размытыми цветными пятнами в разных углах; пять цветовых пресетов. | [карточка](../components/motion-primitives-website/gradient-background.md) |
| `motion-primitives-website/gradient-blob` | motion-primitives-website | Крупное сильно размытое цветное пятно (градиент 135°), медленно вращающееся и «дышащее» по размеру и форме. | [карточка](../components/motion-primitives-website/gradient-blob.md) |
| `motion-primitives-website/lamp` | motion-primitives-website | Хиро-сцена «лампа»: два конических луча расходятся сверху, светящаяся линия и ореол раскрываются в ширину, под ними — заголовок. | [карточка](../components/motion-primitives-website/lamp.md) |
| `motion-primitives-website/meteors` | motion-primitives-website | Метеоры — точки с хвостом 50 px, падающие по диагонали (215°) и гаснущие; случайные позиции, задержки и скорости. | [карточка](../components/motion-primitives-website/meteors.md) |
| `motion-primitives-website/morphing-text` | motion-primitives-website | Фразы по кругу сменяются через размытие: старая уходит вверх с blur 8px, новая выплывает снизу и фокусируется (только CSS blur, без SVG-ф… | [карточка](../components/motion-primitives-website/morphing-text.md) |
| `motion-primitives-website/neon-text` | motion-primitives-website | Жирный текст с неоновым свечением (двойной drop-shadow 10 и 30 px) одного из пяти цветов. | [карточка](../components/motion-primitives-website/neon-text.md) |
| `motion-primitives-website/perspective-grid` | motion-primitives-website | Сетка-пол, уходящая в перспективу (rotateX 75°) и гаснущая к горизонту — ретро-синтвейв плоскость. | [карточка](../components/motion-primitives-website/perspective-grid.md) |
| `motion-primitives-website/shooting-stars` | motion-primitives-website | Одиночная падающая звезда — штрих с градиентным хвостом, пролетающий под 45° из верхней трети экрана; появляется раз в 1.2–4.2 с. | [карточка](../components/motion-primitives-website/shooting-stars.md) |
| `motion-primitives-website/spotlight` | motion-primitives-website | Мягкий диагональный луч прожектора (размытый эллипс в SVG), который один раз включается: выплывает из угла с увеличением и проявлением; в… | [карточка](../components/motion-primitives-website/spotlight.md) |
| `motion-primitives-website/streaming-text` | motion-primitives-website | Текст стримится по словам или символам, как ответ LLM: новые токены появляются с fade, blur или сдвигом; мигает курсор до конца потока. | [карточка](../components/motion-primitives-website/streaming-text.md) |
| `motion-primitives-website/svg-gooey-blob` | motion-primitives-website | Цветные круги, слипающиеся в жидкие капли (metaball через feGaussianBlur + feColorMatrix), медленно плавают туда-обратно. | [карточка](../components/motion-primitives-website/svg-gooey-blob.md) |
| `motion-primitives-website/svg-liquid-morph` | motion-primitives-website | Органическая амёба: замкнутая кривая, непрерывно меняющая форму (синусоидальный шум по 8 точкам), опционально вторая капля. | [карточка](../components/motion-primitives-website/svg-liquid-morph.md) |
| `motion-primitives-website/svg-morph` | motion-primitives-website | Одна SVG-фигура, плавно перетекающая в следующую из списка по таймеру, hover, клику или скроллу. | [карточка](../components/motion-primitives-website/svg-morph.md) |
| `motion-primitives-website/svg-text-path-scroll` | motion-primitives-website | Жирный текст, повторённый через « • », бегущий по волнистой кривой (textPath); сдвиг привязан к прокрутке. | [карточка](../components/motion-primitives-website/svg-text-path-scroll.md) |
| `motion-primitives-website/svg-wave-distortion` | motion-primitives-website | Обёртка, через которую содержимое колышется, как сквозь воду или горячий воздух (feTurbulence turbulence + смещение). | [карточка](../components/motion-primitives-website/svg-wave-distortion.md) |
| `motion-primitives-website/text-generate-effect` | motion-primitives-website | Абзац, слова которого по очереди проступают из размытия (blur 10px → 0, opacity 0 → 1) — эффект «текст генерируется». | [карточка](../components/motion-primitives-website/text-generate-effect.md) |
| `motion-primitives-website/text-scramble` | motion-primitives-website | Расшифровка в моноширинном шрифте: случайные символы (латиница, цифры, !@#$%&*) слева направо превращаются в целевой текст. | [карточка](../components/motion-primitives-website/text-scramble.md) |
| `motion-primitives-website/typewriter-effect` | motion-primitives-website | Печатная машинка: слово набирается по букве, держится 2 с, стирается и сменяется следующим; справа мигающий курсор. | [карточка](../components/motion-primitives-website/typewriter-effect.md) |
| `motion-primitives-website/typing-indicator` | motion-primitives-website | Пузырь с тремя подпрыгивающими точками «печатает…», опционально с подписью. | [карточка](../components/motion-primitives-website/typing-indicator.md) |
| `motion-primitives-website/typing-text` | motion-primitives-website | Печать фраз из массива по буквам, пауза, стирание и переход к следующей; мигающий курсор 3 px. | [карточка](../components/motion-primitives-website/typing-text.md) |
| `motion-primitives-website/variable-font-text` | motion-primitives-website | Кинетическая типографика: вес (wght) и ширина (wdth) каждой буквы волной «дышат» по синусоиде. | [карточка](../components/motion-primitives-website/variable-font-text.md) |
| `motion-primitives-website/wavy-background` | motion-primitives-website | Несколько размытых полупрозрачных цветных волн (SVG-пути), плавно меняющих форму туда-обратно за контентом. | [карточка](../components/motion-primitives-website/wavy-background.md) |
| `motion-primitives-website/word-rotate` | motion-primitives-website | Слово, сменяющееся по таймеру: новое падает сверху (y −30 → 0), старое уходит вниз с затуханием. | [карточка](../components/motion-primitives-website/word-rotate.md) |
| `nivo/voronoi` | nivo | Диаграмма Вороного и триангуляция Делоне (d3-delaunay) по точкам: ячейки, рёбра, точки, граница (experimental). | [карточка](../components/nivo/voronoi.md) |
| `react-bits/blur-text` | react-bits | Фраза, слова или буквы которой проявляются из размытия со сдвигом; варианты zoom, 3D-наклон, наводка фокуса, дрейф со skew. | [карточка](../components/react-bits/blur-text.md) |
| `react-bits/circular-carousel` | react-bits | 3D-кольцо изображений на CSS-трансформах: цилиндр с изогнутыми карточками, орбита с карточками лицом к зрителю, вертикальное колесо или п… | [карточка](../components/react-bits/circular-carousel.md) |
| `react-bits/circular-text` | react-bits | Текст по кругу, медленно вращающийся, как бейдж-печать; опционально внутренняя окружность, иконка в центре, 3D-наклон, несколько повторов… | [карточка](../components/react-bits/circular-text.md) |
| `react-bits/drift-wall` | react-bits | Бесконечная стена плиток-изображений в перспективе: колонки плывут вверх и вниз навстречу друг другу с разной скоростью, края растворяютс… | [карточка](../components/react-bits/drift-wall.md) |
| `react-bits/gradient-text` | react-bits | Текст, залитый живым градиентом: скользящая линейная полоса, дрейфующие радиальные пятна (flow) или качающийся конический веер (conic); о… | [карточка](../components/react-bits/gradient-text.md) |
| `react-bits/infinite-spiral` | react-bits | Бесконечная 3D-спираль из карточек-изображений: карточки поднимаются по винтовой линии, центральные крупнее, к краям гаснут и размываются. | [карточка](../components/react-bits/infinite-spiral.md) |
| `react-bits/masonry` | react-bits | Masonry-галерея (Pinterest-сетка): плитки разной высоты по колонкам пружинисто влетают со stagger и проявляются из размытия; подписи, hov… | [карточка](../components/react-bits/masonry.md) |
| `recharts/radar-chart` | recharts | Лепестковая диаграмма: многоугольник значений по 4–10 осям-критериям поверх паутины PolarGrid, несколько полупрозрачных профилей для срав… | [карточка](../components/recharts/radar-chart.md) |

### Требует существенной переработки (`complex`) — 86

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/aperture-reveal` | animata | Крупный заголовок с окошком-капсулой; по мере прогресса слова расходятся, фото (или видео) раскрывается из окошка на весь экран, затем по… | [карточка](../components/animata/aperture-reveal.md) |
| `animata/boids-ecosystem` | animata | Стая из треугольников или точек на тёмном canvas: выравнивание, сцепление, расталкивание, шлейф; курсор распугивает, аттракторы притягивают. | [карточка](../components/animata/boids-ecosystem.md) |
| `animata/shooting-stars` | animata | Ночное небо: мерцающие точки и падающие звёзды — сужающиеся штрихи с ярким свечением на голове, летящие по диагонали; после пролёта звезд… | [карточка](../components/animata/shooting-stars.md) |
| `echarts/custom` | echarts | Произвольный ряд: функция renderItem рисует для каждой точки данных свою группу фигур (rect, path, text, image…) в координатах любой сист… | [карточка](../components/echarts/custom.md) |
| `echarts/graphic` | echarts | Слой произвольной графики поверх/под графиком: группы, прямоугольники, круги, кольца, сектора, пути, ломаные, текст, картинки с позициони… | [карточка](../components/echarts/graphic.md) |
| `echarts/pictorial-bar` | echarts | Пиктографические столбцы: столбец из повторяющихся иконок (человечки, бутылки) или одна фигура-маска, обрезанная по значению. | [карточка](../components/echarts/pictorial-bar.md) |
| `echarts/radar` | echarts | Лепестковая диаграмма: многоугольники значений по осям-индикаторам компонента radar, заливка areaStyle, несколько профилей. | [карточка](../components/echarts/radar.md) |
| `magicui/flickering-grid` | magicui | Поле мелких квадратиков, случайно вспыхивающих и гаснущих — мерцающая матрица, как светодиодное табло. | [карточка](../components/magicui/flickering-grid.md) |
| `magicui/floating-3d-particles` | magicui | Объёмное облако частиц, вращающееся вокруг вертикальной оси с перспективой; частицы медленно всплывают. | [карточка](../components/magicui/floating-3d-particles.md) |
| `magicui/glyph-matrix` | magicui | Сетка моноширинных символов разной прозрачности, где случайные ячейки тихо меняют символ; затухает книзу — спокойная «матрица». | [карточка](../components/magicui/glyph-matrix.md) |
| `magicui/particles` | magicui | Поле мелких светящихся пылинок, медленно дрейфующих и тянущихся к курсору; у краёв гаснут. | [карточка](../components/magicui/particles.md) |
| `magicui/retro-grid` | magicui | Синтвейв-пол: сетка уходит в перспективу к горизонту и бесконечно едет на зрителя, сверху растворяется в фон. | [карточка](../components/magicui/retro-grid.md) |
| `mermaid/cynefin` | mermaid | Фреймворк Кеневин: пять доменов (Clear, Complicated, Complex, Chaotic, Confusion) с волнистой границей и «обрывом», элементы-метки внутри… | [карточка](../components/mermaid/cynefin.md) |
| `mermaid/mindmap` | mermaid | Карта мыслей: центральная идея и расходящиеся ветви с узлами разных форм (круг, облако, взрыв, шестиугольник), цвет по ветке, опциональны… | [карточка](../components/mermaid/mindmap.md) |
| `mermaid/venn` | mermaid | Диаграмма Венна: перекрывающиеся круги-множества с подписями, подписанные пересечения (union) двух и трёх множеств. | [карточка](../components/mermaid/venn.md) |
| `motion-primitives-website/film-grain` | motion-primitives-website | Оверлей киноплёночного зерна: монохромный шум на canvas в половинном разрешении, обновляемый с заданной частотой, в режиме overlay. | [карточка](../components/motion-primitives-website/film-grain.md) |
| `motion-primitives-website/floating-shapes` | motion-primitives-website | 3D-фон: металлические фигуры (искажающаяся сфера, тор, каркасный икосаэдр) парят и вращаются в облаке частиц, освещённые HDR-окружением. | [карточка](../components/motion-primitives-website/floating-shapes.md) |
| `motion-primitives-website/glitch-background` | motion-primitives-website | Тёмный градиент со сканлайнами, шумом и редкими горизонтальными срывами строк с хроматической аберрацией — сломанный монитор. | [карточка](../components/motion-primitives-website/glitch-background.md) |
| `motion-primitives-website/liquid-metal-background` | motion-primitives-website | Тёмная жидкая ртуть: волнистая поверхность с бликами и френелевским свечением, медленно переливается. | [карточка](../components/motion-primitives-website/liquid-metal-background.md) |
| `motion-primitives-website/mesh-gradient` | motion-primitives-website | Stripe-градиент: плавно текущие пятна 3–5 цветов (FBM из simplex-шума + синусоидальное искажение) на canvas в 1/4 разрешения. | [карточка](../components/motion-primitives-website/mesh-gradient.md) |
| `motion-primitives-website/noise-gradient-background` | motion-primitives-website | Полноэкранный живой градиент из трёх цветов, перетекающих по трёхслойному simplex-шуму (GLSL-шейдер на плоскости). | [карточка](../components/motion-primitives-website/noise-gradient-background.md) |
| `motion-primitives-website/organic-blob-background` | motion-primitives-website | Пять мягких светящихся пятен, кружащих вокруг центра по меняющимся орбитам и сливающихся на тёмном фоне. | [карточка](../components/motion-primitives-website/organic-blob-background.md) |
| `motion-primitives-website/particle-morph` | motion-primitives-website | Облако из тысяч светящихся частиц, плавно перетекающее из одной 3D-формы в другую (сфера → куб → тор → спираль) с медленным вращением. | [карточка](../components/motion-primitives-website/particle-morph.md) |
| `motion-primitives-website/particles` | motion-primitives-website | Полноэкранный canvas с дрейфующими точками; с connected близкие точки соединяются тонкими линиями (сеть/созвездие). | [карточка](../components/motion-primitives-website/particles.md) |
| `motion-primitives-website/plasma-background` | motion-primitives-website | Демосценовая плазма: яркие перетекающие цветовые разводы из суммы четырёх синусов по кругу трёх цветов. | [карточка](../components/motion-primitives-website/plasma-background.md) |
| `motion-primitives-website/sparkles` | motion-primitives-website | Мерцающие искры: неподвижные точки разного размера, плавно загорающиеся и гаснущие, на canvas по размеру контейнера. | [карточка](../components/motion-primitives-website/sparkles.md) |
| `motion-primitives-website/svg-circuit-board` | motion-primitives-website | Сгенерированная печатная плата: узлы на сетке соединены ломаными дорожками; дорожки прорисовываются, узлы выпрыгивают и пульсируют, по до… | [карточка](../components/motion-primitives-website/svg-circuit-board.md) |
| `motion-primitives-website/wave-distortion-background` | motion-primitives-website | Вертикальный двухцветный градиент, граница которого колышется тремя синусоидальными волнами, с тонкими светлыми бликами. | [карточка](../components/motion-primitives-website/wave-distortion-background.md) |
| `react-bits/acid-squares` | react-bits | Повёрнутое поле скруглённых плиток, по которым бегут волны и пульсы кислотных цветов с раздельным освещением и зерном. | [карточка](../components/react-bits/acid-squares.md) |
| `react-bits/aero-shards` | react-bits | Рой парящих стеклянных или хромовых осколков с глубиной резкости, виньеткой и маркерами-плюсами. | [карточка](../components/react-bits/aero-shards.md) |
| `react-bits/antigravity` | react-bits | Поле частиц (капсулы, сферы, кубики, тетраэдры), стягивающихся в кольцо вокруг точки-магнита; капсулы вытягиваются в штрихи к центру; с a… | [карточка](../components/react-bits/antigravity.md) |
| `react-bits/ascii-text` | react-bits | Слово, отрисованное сеткой ASCII-символов на полноэкранном WebGL2-канвасе: плоскость волнуется и наклоняется, трёхцветный градиент с хром… | [карточка](../components/react-bits/ascii-text.md) |
| `react-bits/aurora` | react-bits | Полярное сияние: светящаяся занавесь из 1–3 слоёв с волнистым краем на simplex-шуме и градиентом из 2–5 цветов (OKLCH). | [карточка](../components/react-bits/aurora.md) |
| `react-bits/balatro` | react-bits | Психоделический пиксельный водоворот из трёх цветов в стиле фона игры Balatro. | [карточка](../components/react-bits/balatro.md) |
| `react-bits/ballpit` | react-bits | Бассейн из сотен 3D-шаров с PBR-материалом (satin, matte, gloss, frosted, metal): сталкиваются, падают или парят; курсор расталкивает и х… | [карточка](../components/react-bits/ballpit.md) |
| `react-bits/beams` | react-bits | Наклонные полосы-лучи света, медленно плывущие, с мягким свечением. | [карточка](../components/react-bits/beams.md) |
| `react-bits/color-bends` | react-bits | Изогнутые цветные полосы-ленты, текущие и искривляющиеся по полю искажения, с шумом и параллаксом; может быть прозрачным. | [карточка](../components/react-bits/color-bends.md) |
| `react-bits/crt-warp` | react-bits | Изогнутый экран ЭЛТ с маской люминофора (апертурная, теневая, щелевая), по которому бегут волны контента; послесвечение. | [карточка](../components/react-bits/crt-warp.md) |
| `react-bits/crystalized-ball` | react-bits | Хрустальный шар с плазмой внутри: потрескивающие разряды и свечение; реагирует на hover. | [карточка](../components/react-bits/crystalized-ball.md) |
| `react-bits/dark-veil` | react-bits | Тёмная дымчатая вуаль одного цвета, медленно меняющая форму, с мягким свечением, зерном и опциональными бликами. | [карточка](../components/react-bits/dark-veil.md) |
| `react-bits/decay-card` | react-bits | Карточка-изображение, края которой распадаются и плавятся турбулентным шумом (simplex-смещение, хроматическое расщепление, ч/б), затем со… | [карточка](../components/react-bits/decay-card.md) |
| `react-bits/dither` | react-bits | Волны шума в стиле ретро-дизеринга: Bayer, полутон, штриховка, линии или шум, ограниченная палитра, крупный пиксель. | [карточка](../components/react-bits/dither.md) |
| `react-bits/echo-text` | react-bits | Слово с шлейфом полупрозрачных копий: на входе копии с запаздыванием догоняют основное слово и сходятся в одно; затем шлейф тянется за ку… | [карточка](../components/react-bits/echo-text.md) |
| `react-bits/evil-eye` | react-bits | Огненный глаз: пылающая радужка с языками пламени и тёмным зрачком, следящим за курсором. | [карточка](../components/react-bits/evil-eye.md) |
| `react-bits/faulty-terminal` | react-bits | Экран неисправного ЭЛТ-терминала: поле пиксельных глифов (блоки, точки, символы 5×5), мерцание, послесвечение, кривизна, виньетка. | [карточка](../components/react-bits/faulty-terminal.md) |
| `react-bits/floating-lines` | react-bits | Три группы плавающих светящихся линий (верх, середина, низ), изогнутых волнами с градиентом; клик закручивает. | [карточка](../components/react-bits/floating-lines.md) |
| `react-bits/fluid-glass` | react-bits | Объёмный стеклянный объект (lens, blob, cube, pill, torus, prism, diamond), преломляющий и дисперсирующий заголовок, картинку или видео п… | [карточка](../components/react-bits/fluid-glass.md) |
| `react-bits/fuzzy-text` | react-bits | Крупное слово на канвасе, дрожащее как плохой ТВ-сигнал: строки пикселей случайно смещаются по горизонтали/вертикали, опционально с RGB-р… | [карточка](../components/react-bits/fuzzy-text.md) |
| `react-bits/galaxy` | react-bits | Многослойное звёздное поле с бликами-флерами и свечением, медленный полёт; курсор отталкивает звёзды, клик — варп. | [карточка](../components/react-bits/galaxy.md) |
| `react-bits/ghost-fibers` | react-bits | Закрученные ленты из светящихся волокон (точки, штрихи, линии) в 3D-перспективе с bloom и глубиной резкости. | [карточка](../components/react-bits/ghost-fibers.md) |
| `react-bits/gradient-ascii` | react-bits | Градиентная форма (например горизонт), нарисованная ASCII-символами по яркости, с переливом цветов; курсор оставляет след. | [карточка](../components/react-bits/gradient-ascii.md) |
| `react-bits/gradient-blinds` | react-bits | Градиент, разрезанный на наклонные жалюзи с рельефом, блеском и шумом; полосы покачиваются, у курсора прожектор и наклон. | [карточка](../components/react-bits/gradient-blinds.md) |
| `react-bits/gradient-waves` | react-bits | Океан градиентных волн с рельефом и светлыми гребнями до горизонта, освещённый под углом; клик поднимает волну. | [карточка](../components/react-bits/gradient-waves.md) |
| `react-bits/grainient` | react-bits | Плавно текущий многоцветный градиент (до 8 цветов) с плёночным зерном и шёлковыми переливами. | [карточка](../components/react-bits/grainient.md) |
| `react-bits/grid-distortion` | react-bits | Картинка на сетке grid×grid, которая деформируется и упруго возвращается; фоновое колыхание idle и интро. | [карточка](../components/react-bits/grid-distortion.md) |
| `react-bits/iridescence` | react-bits | Переливающаяся перламутровая плёнка: закрученные разводы цвета, как масло на воде, с бликом и зерном. | [карточка](../components/react-bits/iridescence.md) |
| `react-bits/letter-glitch` | react-bits | Стена моноширинных символов, которые глитчат: меняются и вспыхивают цветами палитры, по полю идёт шумовой поток яркости; клик рвёт сетку. | [карточка](../components/react-bits/letter-glitch.md) |
| `react-bits/light-rays` | react-bits | Объёмные лучи света из точки за краем кадра (углы или центры сторон) с дымкой и мерцанием. | [карточка](../components/react-bits/light-rays.md) |
| `react-bits/lightfall` | react-bits | Падающие световые штрихи (метеоры, световой дождь) со светящимися головами, мерцанием и bloom; удержание — варп. | [карточка](../components/react-bits/lightfall.md) |
| `react-bits/line-waves` | react-bits | Десятки тонких линий под углом, искривлённых волнами с подсветкой гребней (до трёх цветов). | [карточка](../components/react-bits/line-waves.md) |
| `react-bits/liquid-chrome` | react-bits | Жидкий хром: зеркальная металлическая поверхность с волнами и отражениями; курсор возмущает жидкость. | [карточка](../components/react-bits/liquid-chrome.md) |
| `react-bits/micro-slats` | react-bits | Поле мелких скруглённых ламелей (как жалюзи/LED-панель), по которому прокатывается волна с бликами. | [карточка](../components/react-bits/micro-slats.md) |
| `react-bits/molten-metal` | react-bits | Раскалённый расплав: светящиеся жилы металла с белым ядром, текущие в дымке; клик — вспышка. | [карточка](../components/react-bits/molten-metal.md) |
| `react-bits/noise` | react-bits | Оверлей киноплёнки: зерно (моно или цвет), пыль, царапины, строки развёртки, мерцание, с режимом смешивания поверх фото/видео. | [карточка](../components/react-bits/noise.md) |
| `react-bits/orb` | react-bits | Светящаяся сфера-кольцо из переливающегося трёхцветного градиента с мягким шлейфом; на hover искажается и вращается. | [карточка](../components/react-bits/orb.md) |
| `react-bits/particle-text` | react-bits | Надпись из тысяч частиц (точки, квадраты, штрихи), слетающихся на место: из облака, дождём, по спирали или за сканирующей линией; движущи… | [карточка](../components/react-bits/particle-text.md) |
| `react-bits/particles` | react-bits | 3D-облако частиц (круги, квадраты, кольца, искры), дрейфующих с мерцанием и свечением; опционально соединения линиями. | [карточка](../components/react-bits/particles.md) |
| `react-bits/pattern-waves` | react-bits | Движущаяся поверхность, напечатанная растром: точки, квадраты, плюсы, контурные линии или ASCII-символы следуют волне (silk/swell/ripple). | [карточка](../components/react-bits/pattern-waves.md) |
| `react-bits/pixel-blast` | react-bits | Поле пикселей, складывающихся в дрейфующий шумовой узор с мерцанием и свечением; клики пускают кольца, hover проявляет узор. | [карточка](../components/react-bits/pixel-blast.md) |
| `react-bits/pixel-card` | react-bits | Карточка, заполняющаяся мерцающими пикселями (квадраты, круги, ромбы): волна раскрытия от центра или курсора со вспышкой на фронте, затем… | [карточка](../components/react-bits/pixel-card.md) |
| `react-bits/pixel-snow` | react-bits | Пиксельный снегопад: снежинки-спрайты падают с ветром и свечением; курсор их расталкивает. | [карточка](../components/react-bits/pixel-snow.md) |
| `react-bits/plasma` | react-bits | Объёмная светящаяся плазма: закрученные клубы света, летящие на зрителя или от него, с бликами. | [карточка](../components/react-bits/plasma.md) |
| `react-bits/plasma-wave` | react-bits | Две изгибающиеся светящиеся плазменные волны-ленты с ярким ядром и свечением, переход между двумя цветами. | [карточка](../components/react-bits/plasma-wave.md) |
| `react-bits/prism` | react-bits | Светящаяся стеклянная призма-пирамида, преломляющая свет в радужные переливы и вращающаяся. | [карточка](../components/react-bits/prism.md) |
| `react-bits/scrambled-text` | react-bits | Моноширинный абзац, буквы которого при появлении расшифровываются из символов '.:' слева направо; дальше буквы у курсора перемешиваются,… | [карточка](../components/react-bits/scrambled-text.md) |
| `react-bits/shape-blur` | react-bits | Размытая светящаяся фигура, сквозь которую проходит линза резкости с хроматической аберрацией; при idle линза движется сама. | [карточка](../components/react-bits/shape-blur.md) |
| `react-bits/shape-waves` | react-bits | Сетка геометрических глифов (треугольники/круги/квадраты по полосам яркости) с морфящимися волнами; опционально вырезанный текст, вокруг… | [карточка](../components/react-bits/shape-waves.md) |
| `react-bits/side-rays` | react-bits | Пучок тёплых и холодных лучей света, бьющих из угла кадра, с мерцанием. | [карточка](../components/react-bits/side-rays.md) |
| `react-bits/silk` | react-bits | Струящаяся шёлковая ткань со складками, рельефом, бликом, мягким bloom и зерном, один базовый цвет. | [карточка](../components/react-bits/silk.md) |
| `react-bits/sliced-waves` | react-bits | Несколько волнистых лент-срезов (персик, розовый, синий) в перспективе, размытые и светящиеся, в нижней части кадра. | [карточка](../components/react-bits/sliced-waves.md) |
| `react-bits/soft-aurora` | react-bits | Мягкая светлая полоса сияния поперёк кадра, переходящая от белого к пурпурному, с медленным колыханием. | [карточка](../components/react-bits/soft-aurora.md) |
| `react-bits/strands` | react-bits | «Голос» ассистента: переплетённые светящиеся нити в стеклянной сфере или без неё, оживающие при listening и реагирующие на громкость level. | [карточка](../components/react-bits/strands.md) |
| `react-bits/threads` | react-bits | Пучок десятков тонких светящихся нитей, волнообразно колышущихся под углом, с расщеплением и бахромой. | [карточка](../components/react-bits/threads.md) |
| `react-bits/variable-proximity` | react-bits | Строка на вариативном шрифте (Roboto Flex), буквы которой меняют вес/оптический размер, цвет, масштаб и подъём рядом с курсором; опционал… | [карточка](../components/react-bits/variable-proximity.md) |
| `react-bits/warp-text` | react-bits | Заголовок в WebGL-текстуре, который плывёт: шумовое искажение, линза под курсором (bulge/pinch/swirl) с рябью, ударная волна по клику, хр… | [карточка](../components/react-bits/warp-text.md) |
| `react-bits/waves` | react-bits | Частокол тонких параллельных линий, изгибаемых полем Perlin-шума, как рельеф или звуковая волна; курсор раздвигает линии, клик пускает рябь. | [карточка](../components/react-bits/waves.md) |

### Не подходит (`unsuitable`) — 2

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/interactive-grid` | animata | Голубой фон с разреженной сеткой контурных квадратиков 24px; при наведении 5 раз подсвечиваются случайные линии клеток с волновой задержкой. | [карточка](../components/animata/interactive-grid.md) |
| `react-bits/text-cursor` | react-bits | След из текста или эмодзи за курсором: штампы-копии с отскоком и затуханием (stamp), цепочка копий (chain) или лента букв вдоль траектори… | [карточка](../components/react-bits/text-cursor.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`key-point-emphasis`, `transformation`, `spatial`
