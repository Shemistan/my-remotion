# Трансформация

«Превратилось в», «было — стало», «эволюция», «рефакторинг», «новая
версия». Один объект меняет форму/состояние; зритель должен узнать объект
до и после.

## Визуальные приёмы

1. **Морфинг текста/фигуры** — плавный переход между двумя состояниями.
2. **Wipe / cross-fade между двумя кадрами** — старое уходит, новое
   приходит.
3. **Раскладка → новая раскладка** — элементы переезжают на новые места
   (mosaic reframe, grid → list).
4. **Разрушение и сборка** — fracture/reassemble, пиксельный переход.
5. **Diff кода** — code comparison, подсветка изменённых строк.
6. **Градиентный переход фона** — смена настроения.

## Как выбирать

- Два скриншота/картинки → переход (`transitions-scene`) или
  image-comparison.
- Текст/заголовок → text-morph, glitch, scramble (`text-animation`).
- Код → code-comparison / code block с highlight.
- Эффектный переход между сценами → pixel-transition, fracture,
  gradient-transition.

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 30

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `claude-code-plugin/remotion-interactivity` | claude-code-plugin | Не рисует; документ о разметке, редактируемой в Studio: InteractivitySchema, Interactive.*, inline-стили и interpolate, Interactive.Path… | [карточка](../components/claude-code-plugin/remotion-interactivity.md) |
| `free-remotion-templates/card-flip-transition` | free-remotion-templates | Весь кадр как карточка переворачивается на 180° по оси Y: спереди сцена до, на обороте сцена после; под карточкой подсвеченная сцена и ко… | [карточка](../components/free-remotion-templates/card-flip-transition.md) |
| `free-remotion-templates/flip-page-transition` | free-remotion-templates | Перелистывание книги: страница приподнимается у корешка, поворачивается на левом краю на 90° с затенением и открывает следующую, на котор… | [карточка](../components/free-remotion-templates/flip-page-transition.md) |
| `free-remotion-templates/ink-spread-transition` | free-remotion-templates | Чернильный переход: 7 капель и 10 брызг цвета второй сцены растекаются и сливаются в пятно с рваным краем (SVG gooey-фильтры), затем проя… | [карточка](../components/free-remotion-templates/ink-spread-transition.md) |
| `free-remotion-templates/logo-blur-reveal` | free-remotion-templates | Текстовый логотип проявляется из сильного размытия в резкий с лёгким «наведением фокуса» по масштабу и затуханием в конце. | [карточка](../components/free-remotion-templates/logo-blur-reveal.md) |
| `free-remotion-templates/logo-stroke-draw` | free-remotion-templates | Кольцо бейджа прорисовывается пером со светящимся кончиком, заливается, проявляется монограмма, проходит блик, снизу появляется название… | [карточка](../components/free-remotion-templates/logo-stroke-draw.md) |
| `free-remotion-templates/parallax-pan` | free-remotion-templates | Векторный пейзаж из слоёв (небо, солнце, горы, холмы, земля, ёлки), едущих влево с разной скоростью; поверх неподвижный заголовок и подза… | [карточка](../components/free-remotion-templates/parallax-pan.md) |
| `free-remotion-templates/pencil-draw` | free-remotion-templates | SVG-карандаш прорисовывает пятиконечную звезду, кончик следует за концом линии; затем снизу появляются слово и подпись. | [карточка](../components/free-remotion-templates/pencil-draw.md) |
| `free-remotion-templates/pixel-mosaic-transition` | free-remotion-templates | 8-битный стингер: процедурная пиксельная сцена день укрупняется в мозаику, на пике со вспышкой меняется на ночь (луна, звёзды) и снова ст… | [карточка](../components/free-remotion-templates/pixel-mosaic-transition.md) |
| `free-remotion-templates/scramble-text` | free-remotion-templates | «Расшифровка»: метка [ DECRYPTING ], символы строки перебирают случайные знаки и фиксируются слева направо, бежит скан-линия, после расши… | [карточка](../components/free-remotion-templates/scramble-text.md) |
| `free-remotion-templates/shatter-reveal` | free-remotion-templates | Разлетевшиеся повёрнутые осколки собираются в цельную градиентную плитку с крупным заголовком; снизу вытягивается полоса и проявляется по… | [карточка](../components/free-remotion-templates/shatter-reveal.md) |
| `free-remotion-templates/split-screen` | free-remotion-templates | Кадр делится на две контрастные панели: каждая раскрывается clip-path-вайпом, по центру выстреливает разделитель, затем поднимаются загол… | [карточка](../components/free-remotion-templates/split-screen.md) |
| `free-remotion-templates/starfield` | free-remotion-templates | Варп-полёт: звёзды разлетаются радиально от центра, к краям растут, ярчеют и вытягиваются в светящиеся шлейфы; по центру надпись. | [карточка](../components/free-remotion-templates/starfield.md) |
| `free-remotion-templates/transition-circle-wipe` | free-remotion-templates | Ирисовый переход: из центра раскрывается круг с акцентной кромкой, сквозь него вторая сцена со своим радиальным фоном, подписью и дорисов… | [карточка](../components/free-remotion-templates/transition-circle-wipe.md) |
| `remotion-bits/bit-fracture-reassemble` | remotion-bits | Сетка 5×5 фото-плиток собирается из осколков, разбросанных в 3D, держится ~60 кадров и снова разлетается; в центральном ряду поверх фото… | [карточка](../components/remotion-bits/bit-fracture-reassemble.md) |
| `remotion-bits/bit-glitch-cycle` | remotion-bits | Моноширинная надпись сменяет фразы каждые 60 кадров (INITIALIZING → LOADING ASSETS → SYSTEM ONLINE → WELCOME USER), на стыках символы пре… | [карточка](../components/remotion-bits/bit-glitch-cycle.md) |
| `remotion-bits/bit-glitch-in` | remotion-bits | Надпись «SYSTEM ONLINE» проявляется из случайных символов: шум уходит за 45 кадров с коротким сбоем в конце, одновременно растёт opacity. | [карточка](../components/remotion-bits/bit-glitch-in.md) |
| `remotion-bits/bit-ken-burns` | remotion-bits | Слайд-шоу из трёх фото на весь кадр: медленный наезд/отъезд со смещением, смена слайдов через cross-fade. | [карточка](../components/remotion-bits/bit-ken-burns.md) |
| `remotion-bits/bit-linear-gradient` | remotion-bits | Полноэкранный линейный градиент, перетекающий из тёмно-сине-фиолетового (0°) в светло-голубой (180°): ночь сменяется днём. | [карточка](../components/remotion-bits/bit-linear-gradient.md) |
| `remotion-bits/bit-mosaic-reframe` | remotion-bits | Двенадцать фото-плиток: сетка 4×3 → мозаика с крупным главным кадром → диагональный каскад повёрнутых квадратов с глубиной; плитки меняют… | [карточка](../components/remotion-bits/bit-mosaic-reframe.md) |
| `remotion-bits/bit-radial-gradient` | remotion-bits | Круглое световое пятно перемещается из левого верхнего угла в правый нижний и меняет цвет с солнечно-жёлтого на голубом на закатно-розовы… | [карточка](../components/remotion-bits/bit-radial-gradient.md) |
| `remotion-bits/bit-typing-code-block` | remotion-bits | React-компонент с useState/useEffect набирается посимвольно в тёмном редакторе с подсветкой синтаксиса, номерами строк и мигающим курсором. | [карточка](../components/remotion-bits/bit-typing-code-block.md) |
| `remotion-bits/gradient-transition` | remotion-bits | Полноэкранный CSS-градиент (linear/radial/conic), плавно перетекающий через цепочку градиентов: цвета в oklch, угол по кратчайшему пути,… | [карточка](../components/remotion-bits/gradient-transition.md) |
| `remotion-bits/variable-speed-typewriter` | remotion-bits | Фраза печатается по-человечески: быстро, медленнее в середине, снова быстро; около 10% символов — опечатки, которые через паузу стираются… | [карточка](../components/remotion-bits/variable-speed-typewriter.md) |
| `remotion-boilerplate/motion-blur` | remotion-boilerplate | Обёртки над @remotion/motion-blur: плёночное размытие движения содержимого (CameraBlur) и шлейф полупрозрачных копий (TrailBlur). | [карточка](../components/remotion-boilerplate/motion-blur.md) |
| `remotion-skills/color-correction` | remotion-skills | Не рисует; документ о цветокоррекции футажа: colorCorrection() (exposure, temperature, tint, shadows/highlights, blacks/whites, contrast,… | [карточка](../components/remotion-skills/color-correction.md) |
| `remotion-skills/cropping` | remotion-skills | Не рисует; документ об обрезке видимой области пропсами cropLeft/cropRight/cropTop/cropBottom (доли 0..1) с ключами по кадру. | [карточка](../components/remotion-skills/cropping.md) |
| `remotion-skills/remotion-interactivity` | remotion-skills | Не рисует; документ о разметке, редактируемой в Studio: схемы полей InteractivitySchema, Interactive.Div/Interactive.create, inline-текст… | [карточка](../components/remotion-skills/remotion-interactivity.md) |
| `remotion-skills/timing` | remotion-skills | Не рисует; документ о тайминге анимаций: interpolate по диапазону кадров, clamp, Easing.spring/Easing.bezier, perceptual-scale, несколько… | [карточка](../components/remotion-skills/timing.md) |
| `remotion-skills/transitions` | remotion-skills | Не рисует; документ о переходах между сценами: TransitionSeries с Transition (fade, slide, wipe, flip, clockWipe; linearTiming/springTimi… | [карточка](../components/remotion-skills/transitions.md) |

### Адаптируется без переписывания (`adaptable`) — 61

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/blur-out-up` | animata | Фраза появляется по словам: слово всплывает на 10px из лёгкого blur и уходит вверх в нарастающем размытии; фразы сменяются по кругу. | [карточка](../components/animata/blur-out-up.md) |
| `animata/card-spread` | animata | Колода из четырёх карточек-виджетов (заметки, покупки, идеи ремонта, напоминания) лежит стопкой и по клику разлетается в ряд из 4 колонок… | [карточка](../components/animata/card-spread.md) |
| `animata/cycle-text` | animata | Строка кода System.out.println(...), где слово в кавычках каждые 1.3 с меняется: старое уезжает вверх, новое въезжает снизу. | [карточка](../components/animata/cycle-text.md) |
| `animata/disclose-image` | animata | Изображение под двумя цветными створками, которые разъезжаются влево/вправо (или вверх/вниз) после загрузки — эффект открывающихся дверей. | [карточка](../components/animata/disclose-image.md) |
| `animata/fade-through` | animata | Material fade through: строка целиком гаснет, следующая проявляется с 6px снизу, лёгким blur и масштабом 0.99. | [карточка](../components/animata/fade-through.md) |
| `animata/flip-card` | animata | Карточка 224×288 с двумя гранями: по hover переворачивается на 180° по Y (или X) и показывает обратную сторону; содержимое граней — любые… | [карточка](../components/animata/flip-card.md) |
| `animata/flipping-cards` | animata | Сетка из 3 колонок карточек 192×240, каждая при наведении переворачивается по оси Y и показывает обратную сторону. | [карточка](../components/animata/flipping-cards.md) |
| `animata/focus-blur-resolve` | animata | Строка наводится на резкость: из blur 14px и сдвига 14px снизу проявляется в чёткий текст, затем мягко расфокусируется вверх. | [карточка](../components/animata/focus-blur-resolve.md) |
| `animata/gibberish-text` | animata | Расшифровка: каждая буква перебирает случайные заглавные A–Z и через 5–14 шагов встаёт на место. | [карточка](../components/animata/gibberish-text.md) |
| `animata/roll-text` | animata | Надпись прокручивается как барабан: единица (целиком, слово или буква) уезжает вверх, снизу приходит её копия; со stagger по буквам — волна. | [карточка](../components/animata/roll-text.md) |
| `animata/scale-down-fade` | animata | Строка оседает на место (scale 1.04 → 1, 8px снизу) и уходит с уменьшением до 0.94. | [карточка](../components/animata/scale-down-fade.md) |
| `animata/shape-shifter` | animata | Строка «Shape [окно] Shifter»: окно между словами бесконечно меняет форму (40×20 → 240×128 → 80×80 → 128×240), внутри бежит лента фотогра… | [карточка](../components/animata/shape-shifter.md) |
| `animata/shared-axis-z` | animata | Переход по оси глубины: новая строка выходит из глубины (scale 0.9 → 1, blur 2 → 0), старая уходит на зрителя (scale 1.06). | [карточка](../components/animata/shared-axis-z.md) |
| `animata/shimmer-sweep` | animata | Строка проплывает слева к центру (−22px) из blur 8px и уходит вправо в blur; бликового градиента в коде нет. | [карточка](../components/animata/shimmer-sweep.md) |
| `animata/slack-intro` | animata | Интро в стиле Slack: на фиолетовом фоне пять строк из цветных таблеток и кругов поочерёдно въезжают слева и справа, в белых капсулах волн… | [карточка](../components/animata/slack-intro.md) |
| `animata/swap-text` | animata | Две надписи в окне: начальная уезжает вверх, снизу поднимается финальная (1000 мс, ease-slow). | [карточка](../components/animata/swap-text.md) |
| `animata/swap-text-card` | animata | Светло-серая карточка с надзаголовком ANIMATA и крупной фразой; по hover фраза уезжает вверх и гаснет, на её место поднимается поясняющий… | [карточка](../components/animata/swap-text-card.md) |
| `animata/text-flip` | animata | Фраза «Coding is …», где последнее слово в окне перелистывается вверх по списку с лёгким перелётом. | [карточка](../components/animata/text-flip.md) |
| `animata/tilted-cover` | animata | Две карточки 160×208 в 3D-перспективе: задний контент повёрнут на 20° и уменьшен, передняя обложка в белой рамке; по наведению обложка ул… | [карточка](../components/animata/tilted-cover.md) |
| `animata/vpn-widget` | animata | Виджет VPN: сервер «Tokyo» с флажком, пинг «53 ms» с пульсирующей точкой, скорость «57.4 Mbps» и сдвижной переключатель Disconnected/Not… | [карточка](../components/animata/vpn-widget.md) |
| `magicui/code-comparison` | magicui | Две панели кода before/after с подсветкой Shiki, бейджем VS, подсветкой строк, diff (+/−) и фокусом (остальные строки размыты). | [карточка](../components/magicui/code-comparison.md) |
| `magicui/dia-text-reveal` | magicui | Текст проявляется слева направо цветной градиентной полосой; за полосой остаётся текст основного цвета. Для массива слов — смена с повтор… | [карточка](../components/magicui/dia-text-reveal.md) |
| `magicui/hyper-text` | magicui | Моноширинный заголовок капсом: буквы мелькают случайными символами и слева направо встают на правильные — дешифровка. | [карточка](../components/magicui/hyper-text.md) |
| `magicui/morphing-text` | magicui | Крупное слово «перетекает» в следующее: буквы размываются и слипаются, как капли, затем проявляется новое слово. | [карточка](../components/magicui/morphing-text.md) |
| `magicui/pixel-image` | magicui | Картинка собирается из прямоугольных плиток, проявляющихся в случайном порядке; затем ч/б наливается цветом. | [карточка](../components/magicui/pixel-image.md) |
| `magicui/text-3d-flip` | magicui | Каждая буква — грань 3D-кубика; волной кубики поворачиваются на 90°, показывая вторую грань, как табло-перевёртыш. | [карточка](../components/magicui/text-3d-flip.md) |
| `magicui/warp-background` | magicui | Блок с контентом внутри 3D-туннеля: четыре стены из клеточной сетки уходят в перспективу, по ним летят цветные лучи-кометы. | [карточка](../components/magicui/warp-background.md) |
| `motion-primitives/image-comparison` | motion-primitives | Два изображения друг над другом и вертикальный разделитель: слева одно, справа другое — «до / после». | [карточка](../components/motion-primitives/image-comparison.md) |
| `motion-primitives/text-roll` | motion-primitives | Слово перекатывается по буквам, как табло: каждая буква поворачивается по rotateX на 90° и сменяется копией снизу, волной слева направо. | [карточка](../components/motion-primitives/text-roll.md) |
| `motion-primitives/text-scramble` | motion-primitives | «Расшифровка»: строка из случайных символов, которые слева направо фиксируются в правильные буквы. | [карточка](../components/motion-primitives/text-scramble.md) |
| `motion-primitives/transition-panel` | motion-primitives | Панель, где содержимое сменяется по activeIndex: уходящий слайд проигрывает exit, новый — enter → center по заданным variants. | [карточка](../components/motion-primitives/transition-panel.md) |
| `motion-primitives-website/curtain-transition` | motion-primitives-website | Блок с однотонной шторкой, которая на mount въезжает поверх контента с выбранной стороны и закрывает его (на exit — уезжает дальше). | [карточка](../components/motion-primitives-website/curtain-transition.md) |
| `motion-primitives-website/flip-text` | motion-primitives-website | Фразы сменяются 3D-переворотом, как перекидное табло: новая откидывается сверху (rotateX 90 → 0), старая уходит (→ -90). | [карточка](../components/motion-primitives-website/flip-text.md) |
| `motion-primitives-website/gradient-reveal` | motion-primitives-website | Текст заливается слева направо: градиент, обрезанный по буквам, растёт по background-size от 0 до 100 %. | [карточка](../components/motion-primitives-website/gradient-reveal.md) |
| `motion-primitives-website/logo-preloader` | motion-primitives-website | Логотип или слово проявляется слева направо за вертикальной сканирующей линией (маска clip-path), затем экран увеличивается и гаснет. | [карточка](../components/motion-primitives-website/logo-preloader.md) |
| `motion-primitives-website/mask-reveal` | motion-primitives-website | Изображение или блок раскрывается маской clip-path: шторкой слева направо, снизу вверх, по диагонали или расширяющимся кругом. | [карточка](../components/motion-primitives-website/mask-reveal.md) |
| `motion-primitives-website/morphing-text` | motion-primitives-website | Фразы по кругу сменяются через размытие: старая уходит вверх с blur 8px, новая выплывает снизу и фокусируется (только CSS blur, без SVG-ф… | [карточка](../components/motion-primitives-website/morphing-text.md) |
| `motion-primitives-website/split-color-text` | motion-primitives-website | Текст, разрезанный по вертикали на два цвета; граница — splitPosition %. | [карточка](../components/motion-primitives-website/split-color-text.md) |
| `motion-primitives-website/split-preloader` | motion-primitives-website | Экран из двух половин-шторок с процентом загрузки; по окончании половины разъезжаются в стороны или вверх/вниз, открывая сцену. | [карточка](../components/motion-primitives-website/split-preloader.md) |
| `motion-primitives-website/svg-glitch-filter` | motion-primitives-website | Обёртка с глитчем на любом содержимом: шумовое смещение (feTurbulence + feDisplacementMap) с резкими всплесками и RGB-раздвоением. | [карточка](../components/motion-primitives-website/svg-glitch-filter.md) |
| `motion-primitives-website/svg-liquid-morph` | motion-primitives-website | Органическая амёба: замкнутая кривая, непрерывно меняющая форму (синусоидальный шум по 8 точкам), опционально вторая капля. | [карточка](../components/motion-primitives-website/svg-liquid-morph.md) |
| `motion-primitives-website/svg-morph` | motion-primitives-website | Одна SVG-фигура, плавно перетекающая в следующую из списка по таймеру, hover, клику или скроллу. | [карточка](../components/motion-primitives-website/svg-morph.md) |
| `motion-primitives-website/svg-particle-explosion` | motion-primitives-website | Элементы SVG-иллюстрации разлетаются с поворотом и уменьшением, затем упруго собираются обратно (inView — стартуют разбросанными и собира… | [карточка](../components/motion-primitives-website/svg-particle-explosion.md) |
| `motion-primitives-website/svg-stroke-reveal` | motion-primitives-website | Двухэтапное появление иллюстрации или логотипа: контур прорисовывается штрихом, затем фигура заливается цветом. | [карточка](../components/motion-primitives-website/svg-stroke-reveal.md) |
| `motion-primitives-website/svg-wave-distortion` | motion-primitives-website | Обёртка, через которую содержимое колышется, как сквозь воду или горячий воздух (feTurbulence turbulence + смещение). | [карточка](../components/motion-primitives-website/svg-wave-distortion.md) |
| `motion-primitives-website/text-scramble` | motion-primitives-website | Расшифровка в моноширинном шрифте: случайные символы (латиница, цифры, !@#$%&*) слева направо превращаются в целевой текст. | [карточка](../components/motion-primitives-website/text-scramble.md) |
| `motion-primitives-website/wavy-background` | motion-primitives-website | Несколько размытых полупрозрачных цветных волн (SVG-пути), плавно меняющих форму туда-обратно за контентом. | [карточка](../components/motion-primitives-website/wavy-background.md) |
| `nivo/sankey` | nivo | Диаграмма Санкея (d3-sankey): узлы по слоям и изогнутые ленты потоков между ними, толщина — величина; градиенты лент, подписи внутри/снар… | [карточка](../components/nivo/sankey.md) |
| `nivo/stream` | nivo | Streamgraph: сглаженные слои-потоки стопкой во времени со смещённой базовой линией (offsetType), точки и срезы. | [карточка](../components/nivo/stream.md) |
| `react-bits/counter` | react-bits | Число-одометр: каждый разряд — лента цифр 0–9, докручивающаяся до нового значения с пружиной, motion-blur и затуханием по краям; новые ра… | [карточка](../components/react-bits/counter.md) |
| `react-bits/curved-loop` | react-bits | Бегущая строка, текст которой течёт вдоль кривой (дуга, волна, прямая, кольцо); опционально контурные буквы, акцентный разделитель и зату… | [карточка](../components/react-bits/curved-loop.md) |
| `react-bits/decrypted-text` | react-bits | Хакерская расшифровка: буквы мелькают случайными символами и по очереди или разом встают в настоящий текст; варианты scramble, fade, flip… | [карточка](../components/react-bits/decrypted-text.md) |
| `react-bits/fold-text` | react-bits | Буквы, слова или строки разворачиваются, как сложенная бумага, вокруг петли с тенью сгиба; варианты blinds и flip; в цикле складываются о… | [карточка](../components/react-bits/fold-text.md) |
| `react-bits/rotating-text` | react-bits | Слово или фраза, по таймеру сменяющаяся следующей из списка: буквы уезжают и въезжают (slide), переворачиваются (flip), проявляются из bl… | [карточка](../components/react-bits/rotating-text.md) |
| `react-bits/scroll-float` | react-bits | Огромный жирный заголовок, буквы или слова которого по очереди всплывают снизу вытянутыми и пружинисто встают на место; варианты flip (3D… | [карточка](../components/react-bits/scroll-float.md) |
| `react-bits/split-flap-text` | react-bits | Механическое табло вылетов: плитки щёлкают случайными символами и останавливаются на нужных, фразы сменяются по кругу; каскад слева/справ… | [карточка](../components/react-bits/split-flap-text.md) |
| `react-bits/stroke-text` | react-bits | Контуры букв прорисовываются пером с задержкой между буквами, затем заливаются цветом шторкой или проявлением; контур может быть пунктиро… | [карточка](../components/react-bits/stroke-text.md) |
| `react-bits/text-loop` | react-bits | Цветная лента с бегущим текстом вдоль SVG-кривой (волна, арка, круг, бесконечность, прямая или свой path); опционально вторая лента крест… | [карточка](../components/react-bits/text-loop.md) |
| `recharts/funnel-chart` | recharts | Воронка: стопка трапеций сверху вниз, ширина пропорциональна значению этапа; последний этап — треугольник или прямоугольник. | [карточка](../components/recharts/funnel-chart.md) |
| `recharts/sankey` | recharts | Диаграмма потоков: узлы-прямоугольники по колонкам глубины и ленты-связи (кубические кривые), толщина ленты пропорциональна величине потока. | [карточка](../components/recharts/sankey.md) |
| `xyflow/example-layouting` | xyflow | Автораскладка графа библиотекой dagre по уровням сверху вниз (TB) или слева направо (LR) с переставленными ручками и стрелками на рёбрах. | [карточка](../components/xyflow/example-layouting.md) |

### Требует существенной переработки (`complex`) — 51

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/aperture-reveal` | animata | Крупный заголовок с окошком-капсулой; по мере прогресса слова расходятся, фото (или видео) раскрывается из окошка на весь экран, затем по… | [карточка](../components/animata/aperture-reveal.md) |
| `animata/content-scan` | animata | Карточка «Free AI Content Detector»: по тексту проходит сканирующая фиолетовая полоса, заданные фразы подсвечиваются жёлтым при пересечен… | [карточка](../components/animata/content-scan.md) |
| `animata/expandable` | animata | Горизонтальная гармошка из фото-полос: активная расширяется и становится резкой, остальные узкие и размытые; на активной волной проявляет… | [карточка](../components/animata/expandable.md) |
| `echarts/funnel` | echarts | Воронка из трапеций: ширина этапа пропорциональна значению, сортировка по убыванию, подписи снаружи с линиями или внутри. | [карточка](../components/echarts/funnel.md) |
| `echarts/sankey` | echarts | Диаграмма потоков: узлы-столбики по уровням и ленты, толщина ленты — величина потока; горизонтально или вертикально. | [карточка](../components/echarts/sankey.md) |
| `mermaid/gitgraph` | mermaid | Граф git-истории: коммиты-кружки на цветных линиях веток, ответвления, слияния, cherry-pick, теги. | [карточка](../components/mermaid/gitgraph.md) |
| `mermaid/sankey` | mermaid | Диаграмма Санкея: прямоугольники-узлы по слоям и полупрозрачные ленты потоков, толщина ленты пропорциональна значению; подписи и значения… | [карточка](../components/mermaid/sankey.md) |
| `mermaid/state-diagram` | mermaid | Диаграмма состояний: скруглённые состояния, стрелки переходов с событиями, начальная и конечная точки [*], вложенные (составные) состояни… | [карточка](../components/mermaid/state-diagram.md) |
| `mermaid/wardley` | mermaid | Карта Уордли: компоненты цепочки ценности на осях «видимость» и «эволюция» (genesis → commodity), связи зависимостей, стрелки эволюции, з… | [карточка](../components/mermaid/wardley.md) |
| `motion-primitives/text-morph` | motion-primitives | Переход одной строки в другую: совпадающие буквы переезжают на новые позиции, лишние гаснут, новые проявляются (spring). | [карточка](../components/motion-primitives/text-morph.md) |
| `motion-primitives-website/noise-gradient-background` | motion-primitives-website | Полноэкранный живой градиент из трёх цветов, перетекающих по трёхслойному simplex-шуму (GLSL-шейдер на плоскости). | [карточка](../components/motion-primitives-website/noise-gradient-background.md) |
| `motion-primitives-website/noise-transition` | motion-primitives-website | Переход-растворение: экран засыпается чёрными пикселями шума до полного покрытия, затем шум рассеивается поверх цветного фона (в коде — б… | [карточка](../components/motion-primitives-website/noise-transition.md) |
| `motion-primitives-website/particle-morph` | motion-primitives-website | Облако из тысяч светящихся частиц, плавно перетекающее из одной 3D-формы в другую (сфера → куб → тор → спираль) с медленным вращением. | [карточка](../components/motion-primitives-website/particle-morph.md) |
| `react-bits/aero-shards` | react-bits | Рой парящих стеклянных или хромовых осколков с глубиной резкости, виньеткой и маркерами-плюсами. | [карточка](../components/react-bits/aero-shards.md) |
| `react-bits/aurora` | react-bits | Полярное сияние: светящаяся занавесь из 1–3 слоёв с волнистым краем на simplex-шуме и градиентом из 2–5 цветов (OKLCH). | [карточка](../components/react-bits/aurora.md) |
| `react-bits/balatro` | react-bits | Психоделический пиксельный водоворот из трёх цветов в стиле фона игры Balatro. | [карточка](../components/react-bits/balatro.md) |
| `react-bits/color-bends` | react-bits | Изогнутые цветные полосы-ленты, текущие и искривляющиеся по полю искажения, с шумом и параллаксом; может быть прозрачным. | [карточка](../components/react-bits/color-bends.md) |
| `react-bits/crt-warp` | react-bits | Изогнутый экран ЭЛТ с маской люминофора (апертурная, теневая, щелевая), по которому бегут волны контента; послесвечение. | [карточка](../components/react-bits/crt-warp.md) |
| `react-bits/decay-card` | react-bits | Карточка-изображение, края которой распадаются и плавятся турбулентным шумом (simplex-смещение, хроматическое расщепление, ч/б), затем со… | [карточка](../components/react-bits/decay-card.md) |
| `react-bits/dither` | react-bits | Волны шума в стиле ретро-дизеринга: Bayer, полутон, штриховка, линии или шум, ограниченная палитра, крупный пиксель. | [карточка](../components/react-bits/dither.md) |
| `react-bits/dither-veil` | react-bits | Фото в дизеринге (Bayer, blue noise, Atkinson, Floyd–Steinberg, линии; дуотон или RGB), под которым в круге проявляется оригинал. | [карточка](../components/react-bits/dither-veil.md) |
| `react-bits/elastic-mesh` | react-bits | Надутое слово или логотип (balloon, chrome, jelly, clay) — упругая сетка, которую можно тянуть и сминать; надувается при появлении. | [карточка](../components/react-bits/elastic-mesh.md) |
| `react-bits/falling-text` | react-bits | Абзац, рассыпающийся на слова или буквы, которые с физикой падают в кучу на дно контейнера, сталкиваются и отскакивают; выделенные слова… | [карточка](../components/react-bits/falling-text.md) |
| `react-bits/faulty-terminal` | react-bits | Экран неисправного ЭЛТ-терминала: поле пиксельных глифов (блоки, точки, символы 5×5), мерцание, послесвечение, кривизна, виньетка. | [карточка](../components/react-bits/faulty-terminal.md) |
| `react-bits/flex-carousel` | react-bits | Бесконечная лента изображений, проходящая сквозь невидимую жидкую линзу у краёв: картинки изгибаются, скручиваются и дают дисперсию цвета… | [карточка](../components/react-bits/flex-carousel.md) |
| `react-bits/gradient-ascii` | react-bits | Градиентная форма (например горизонт), нарисованная ASCII-символами по яркости, с переливом цветов; курсор оставляет след. | [карточка](../components/react-bits/gradient-ascii.md) |
| `react-bits/gradient-blinds` | react-bits | Градиент, разрезанный на наклонные жалюзи с рельефом, блеском и шумом; полосы покачиваются, у курсора прожектор и наклон. | [карточка](../components/react-bits/gradient-blinds.md) |
| `react-bits/grainient` | react-bits | Плавно текущий многоцветный градиент (до 8 цветов) с плёночным зерном и шёлковыми переливами. | [карточка](../components/react-bits/grainient.md) |
| `react-bits/grid-distortion` | react-bits | Картинка на сетке grid×grid, которая деформируется и упруго возвращается; фоновое колыхание idle и интро. | [карточка](../components/react-bits/grid-distortion.md) |
| `react-bits/halftone-reveal` | react-bits | Фото в газетном полутоне (точки, линии, эллипсы; моно, дуотон, цвет), под которым в круге проявляется оригинал; wander водит круг сам. | [карточка](../components/react-bits/halftone-reveal.md) |
| `react-bits/hyperspeed` | react-bits | Полёт по ночной трассе: световые следы фар и стоп-сигналов, столбы, пыль, отражения; трасса петляет; удержание — ускорение с ростом FOV. | [карточка](../components/react-bits/hyperspeed.md) |
| `react-bits/iridescence` | react-bits | Переливающаяся перламутровая плёнка: закрученные разводы цвета, как масло на воде, с бликом и зерном. | [карточка](../components/react-bits/iridescence.md) |
| `react-bits/letter-glitch` | react-bits | Стена моноширинных символов, которые глитчат: меняются и вспыхивают цветами палитры, по полю идёт шумовой поток яркости; клик рвёт сетку. | [карточка](../components/react-bits/letter-glitch.md) |
| `react-bits/liquid-chrome` | react-bits | Жидкий хром: зеркальная металлическая поверхность с волнами и отражениями; курсор возмущает жидкость. | [карточка](../components/react-bits/liquid-chrome.md) |
| `react-bits/liquid-ether` | react-bits | Симуляция жидкости/дыма: цветные струи, закручивающиеся в вихри за курсором; при autoDemo виртуальный курсор водит сам. | [карточка](../components/react-bits/liquid-ether.md) |
| `react-bits/meta-balls` | react-bits | Лава-лампа: шарики, сливающиеся в липкие капли (сплошные, контуром, изолиниями), орбитально движутся сами; дополнительный шар следует за… | [карточка](../components/react-bits/meta-balls.md) |
| `react-bits/metallic-paint` | react-bits | Логотип (imageSrc, например SVG) или слово (text), залитые жидким металлом: переливающиеся блики текут по форме. | [карточка](../components/react-bits/metallic-paint.md) |
| `react-bits/micro-slats` | react-bits | Поле мелких скруглённых ламелей (как жалюзи/LED-панель), по которому прокатывается волна с бликами. | [карточка](../components/react-bits/micro-slats.md) |
| `react-bits/molten-metal` | react-bits | Раскалённый расплав: светящиеся жилы металла с белым ядром, текущие в дымке; клик — вспышка. | [карточка](../components/react-bits/molten-metal.md) |
| `react-bits/morph-slider` | react-bits | Полноэкранный слайдер изображений, где смена кадра — шейдерный переход: картинка плавится (melt), идёт рябью (ripple), сдвигается срезами… | [карточка](../components/react-bits/morph-slider.md) |
| `react-bits/particle-text` | react-bits | Надпись из тысяч частиц (точки, квадраты, штрихи), слетающихся на место: из облака, дождём, по спирали или за сканирующей линией; движущи… | [карточка](../components/react-bits/particle-text.md) |
| `react-bits/pixel-blast` | react-bits | Поле пикселей, складывающихся в дрейфующий шумовой узор с мерцанием и свечением; клики пускают кольца, hover проявляет узор. | [карточка](../components/react-bits/pixel-blast.md) |
| `react-bits/pixel-card` | react-bits | Карточка, заполняющаяся мерцающими пикселями (квадраты, круги, ромбы): волна раскрытия от центра или курсора со вспышкой на фронте, затем… | [карточка](../components/react-bits/pixel-card.md) |
| `react-bits/pixel-swap` | react-bits | Смена одного содержимого другим волной пикселей: блоки вырастают с отскоком, поворотом и скруглением в заданном порядке (random, center,… | [карточка](../components/react-bits/pixel-swap.md) |
| `react-bits/pixel-transition` | react-bits | Карточка, где первое содержимое закрывается пикселями и открывается второе: случайно, по Bayer-дизеру, рябью или wipe; формы square/round… | [карточка](../components/react-bits/pixel-transition.md) |
| `react-bits/plasma` | react-bits | Объёмная светящаяся плазма: закрученные клубы света, летящие на зрителя или от него, с бликами. | [карточка](../components/react-bits/plasma.md) |
| `react-bits/scrambled-text` | react-bits | Моноширинный абзац, буквы которого при появлении расшифровываются из символов '.:' слева направо; дальше буквы у курсора перемешиваются,… | [карточка](../components/react-bits/scrambled-text.md) |
| `react-bits/shredder` | react-bits | Список карточек, которые затягиваются в шредер и выходят закручивающимися полосками, падающими вниз; стопка сдвигается; есть автопроигрыв… | [карточка](../components/react-bits/shredder.md) |
| `react-bits/shuffle` | react-bits | Буквы прокручиваются, как барабаны слот-машины: ячейка пролистывает ленту случайных символов и останавливается на нужной букве; варианты… | [карточка](../components/react-bits/shuffle.md) |
| `react-bits/text-pressure` | react-bits | Крупное слово капсом во всю ширину на Roboto Flex: буквы раздуваются по ширине, весу и наклону рядом с курсором, по клику — кольцевая вол… | [карточка](../components/react-bits/text-pressure.md) |
| `react-bits/warp-text` | react-bits | Заголовок в WebGL-текстуре, который плывёт: шумовое искажение, линза под курсором (bulge/pinch/swirl) с рябью, ударная волна по клику, хр… | [карточка](../components/react-bits/warp-text.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`comparison`, `timeline`, `abstract-concepts`
