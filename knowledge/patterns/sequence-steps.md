# Последовательность действий

«Шаг первый… шаг второй», «сначала… потом… наконец», инструкции, рецепты,
пайплайны, воронки. Важен порядок и темп: каждый шаг появляется, когда о
нём говорят.

## Визуальные приёмы

1. **Нумерованный список со stagger** — пункты появляются по одному.
2. **Горизонтальная цепочка карточек** — шаги слева направо с
   коннекторами.
3. **Чек-лист** — галочки ставятся по кадру.
4. **Воронка** — этапы сужаются; подходит для конверсий.
5. **Терминал/CLI** — команды печатаются по очереди (технические
   инструкции).
6. **Flowchart** — когда есть ветвления и условия.

## Как выбирать

- Линейно, 3–7 шагов → stagger-список или цепочка карточек
  (`lists-grids-stagger`).
- Технический процесс → typewriter/терминал/code block (`ui-mockups`).
- Ветвления → flowchart (`diagrams-flow`).
- Воронка продаж → funnel chart (`charts-data`).
- Синхронизируй появление с озвучкой: `Sequence` на каждый шаг.

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 47

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/chapter-title` | free-remotion-templates | Карточка раздела: метка «Chapter 1» влетает с крупного масштаба, прочерчивается золотая линия, снизу всплывают название главы и подзаголо… | [карточка](../components/free-remotion-templates/chapter-title.md) |
| `free-remotion-templates/community-chat` | free-remotion-templates | Окно командного мессенджера (рейл воркспейсов, каналы, лента, поле ввода); сообщения с аватаром и реакциями по очереди всплывают, окно на… | [карточка](../components/free-remotion-templates/community-chat.md) |
| `free-remotion-templates/flip-page-transition` | free-remotion-templates | Перелистывание книги: страница приподнимается у корешка, поворачивается на левом краю на 90° с затенением и открывает следующую, на котор… | [карточка](../components/free-remotion-templates/flip-page-transition.md) |
| `free-remotion-templates/four-tone-mono-titler` | free-remotion-templates | Пиксельная плашка нижней трети в стиле экрана ретро-консоли (4 зелёных тона): панель с дизерингом Байера открывается жёстким вайпом со «с… | [карточка](../components/free-remotion-templates/four-tone-mono-titler.md) |
| `free-remotion-templates/kinetic-word-stack` | free-remotion-templates | Слова по одному падают сверху и с ударом встают в вертикальный столбик; последнее выделено акцентом и свечением, через столбик прорисовыв… | [карточка](../components/free-remotion-templates/kinetic-word-stack.md) |
| `free-remotion-templates/pencil-draw` | free-remotion-templates | SVG-карандаш прорисовывает пятиконечную звезду, кончик следует за концом линии; затем снизу появляются слово и подпись. | [карточка](../components/free-remotion-templates/pencil-draw.md) |
| `free-remotion-templates/slide-wipe` | free-remotion-templates | Горизонтальный пуш: сцена до уезжает влево, сцена после въезжает справа, края страниц стыкуются. | [карточка](../components/free-remotion-templates/slide-wipe.md) |
| `free-remotion-templates/social-reel` | free-remotion-templates | Вертикальный плеер коротких видео (9:16) посреди горизонтальной сцены: аватар, хэндл, Follow, колонка лайк/коммент/шер, подпись, прогресс… | [карточка](../components/free-remotion-templates/social-reel.md) |
| `free-remotion-templates/text-mask-reveal` | free-remotion-templates | Столбик строк капсом: каждую строку по очереди перекрывает скользящий цветной блок и, уходя, открывает текст (block reveal); в конце проч… | [карточка](../components/free-remotion-templates/text-mask-reveal.md) |
| `free-remotion-templates/transition-circle-wipe` | free-remotion-templates | Ирисовый переход: из центра раскрывается круг с акцентной кромкой, сквозь него вторая сцена со своим радиальным фоном, подписью и дорисов… | [карточка](../components/free-remotion-templates/transition-circle-wipe.md) |
| `free-remotion-templates/whip-pan` | free-remotion-templates | Цепочка полноэкранных сцен (фон, заголовок, подзаголовок) с резкими хлёсткими панорамами вбок и сильным размытием движения между ними. | [карточка](../components/free-remotion-templates/whip-pan.md) |
| `remotion-bits/animated-text` | remotion-bits | Текст, появляющийся целиком, по словам, буквам, строкам или по разделителю: фрагменты сдвигаются, масштабируются, вращаются, проявляются… | [карточка](../components/remotion-bits/animated-text.md) |
| `remotion-bits/bit-3d-basic` | remotion-bits | Три слова, расставленные в глубину сцены; камера по очереди пролетает к каждому, слово проявляется на входе и гаснет на выходе. | [карточка](../components/remotion-bits/bit-3d-basic.md) |
| `remotion-bits/bit-3d-step-timing-context` | remotion-bits | Четыре слайда в глубину с подзаголовками и анимированным текстом; камера переходит между ними; анимации внутри Step стартуют от входа в ш… | [карточка](../components/remotion-bits/bit-3d-step-timing-context.md) |
| `remotion-bits/bit-basic-code-block` | remotion-bits | Четыре строки TypeScript (функция hello) с подсветкой синтаксиса и номерами строк, проявляющиеся сверху вниз со сдвигом на 10 px. | [карточка](../components/remotion-bits/bit-basic-code-block.md) |
| `remotion-bits/bit-card-stack` | remotion-bits | Восемь пронумерованных карточек влетают снизу по очереди и ложатся веером с поворотом, сдвигом по X и глубиной по Z. | [карточка](../components/remotion-bits/bit-card-stack.md) |
| `remotion-bits/bit-chat-conversation` | remotion-bits | Переписка в стиле мессенджера: шесть пузырей (свои справа, чужие слева, с аватарами-инициалами) появляются по одному. | [карточка](../components/remotion-bits/bit-chat-conversation.md) |
| `remotion-bits/bit-cursor-flyover` | remotion-bits | Скриншот приложения в 3D: камера показывает его целиком, затем приближается к четырём углам, SVG-курсор перелетает туда же и пульсирует,… | [карточка](../components/remotion-bits/bit-cursor-flyover.md) |
| `remotion-bits/bit-glitch-cycle` | remotion-bits | Моноширинная надпись сменяет фразы каждые 60 кадров (INITIALIZING → LOADING ASSETS → SYSTEM ONLINE → WELCOME USER), на стыках символы пре… | [карточка](../components/remotion-bits/bit-glitch-cycle.md) |
| `remotion-bits/bit-grid-stagger` | remotion-bits | Сетка 4×4 пронумерованных скруглённых квадратов, вырастающих (scale 0→1 и fade) волной от центра. | [карточка](../components/remotion-bits/bit-grid-stagger.md) |
| `remotion-bits/bit-list-reveal` | remotion-bits | Вертикальный список из шести пунктов меню (эмодзи, название, точка) всплывает построчно с fade и масштабом, весь список при этом медленно… | [карточка](../components/remotion-bits/bit-list-reveal.md) |
| `remotion-bits/bit-remotion-bits-promo` | remotion-bits | Промо-ролик библиотеки (1140 кадров): камера Scene3D пролетает intro → сетка карточек «Elements» (частицы, текст, счётчик, TypeWriter, Co… | [карточка](../components/remotion-bits/bit-remotion-bits-promo.md) |
| `remotion-bits/bit-scene-3d-cube-nav` | remotion-bits | Куб из шести подписанных граней: камера стартует с изометрии, облетает каждую грань фронтально и возвращается в изометрию. | [карточка](../components/remotion-bits/bit-scene-3d-cube-nav.md) |
| `remotion-bits/bit-slide-from-left` | remotion-bits | Строка текста целиком въезжает слева на 400px с одновременным проявлением. | [карточка](../components/remotion-bits/bit-slide-from-left.md) |
| `remotion-bits/bit-staggered-fade-in` | remotion-bits | Пять цветных квадратов в ряд по очереди поднимаются снизу и проявляются. | [карточка](../components/remotion-bits/bit-staggered-fade-in.md) |
| `remotion-bits/bit-terminal-3d` | remotion-bits | Три окна терминала в стиле macOS в 3D (git status, логи сервера, сборка): печатается вывод, окна покачиваются, камера перелетает между ними. | [карточка](../components/remotion-bits/bit-terminal-3d.md) |
| `remotion-bits/bit-typing-code-block` | remotion-bits | React-компонент с useState/useEffect набирается посимвольно в тёмном редакторе с подсветкой синтаксиса, номерами строк и мигающим курсором. | [карточка](../components/remotion-bits/bit-typing-code-block.md) |
| `remotion-bits/bit-word-by-word` | remotion-bits | Фраза появляется по словам: каждое слово поднимается на 20 px и проявляется, со сдвигом старта между фрагментами. | [карточка](../components/remotion-bits/bit-word-by-word.md) |
| `remotion-bits/cli-simulation` | remotion-bits | Терминал: после приглашения ➜ ~ печатается npm install remotion-bits, затем быстро выводятся строки ✔ Package found, ✔ Dependencies resol… | [карточка](../components/remotion-bits/cli-simulation.md) |
| `remotion-bits/code-block` | remotion-bits | Блок кода с подсветкой синтаксиса (prism), строки появляются по очереди; подсветка диапазонов строк фоном и приглушение строк вне фокуса. | [карточка](../components/remotion-bits/code-block.md) |
| `remotion-bits/multitext-typewriter` | remotion-bits | Три фразы печатаются по очереди: набор, пауза, посимвольное стирание, следующая фраза; затем цикл заново. | [карточка](../components/remotion-bits/multitext-typewriter.md) |
| `remotion-bits/scene-3d` | remotion-bits | CSS-3D мир в духе impress.js: шаги со своей позицией/поворотом/масштабом, камера перелетает между ними с easing; контент шагов входит и у… | [карточка](../components/remotion-bits/scene-3d.md) |
| `remotion-bits/staggered-motion` | remotion-bits | Группа дочерних элементов, входящих одной анимацией (сдвиг, масштаб, поворот, opacity, blur, цвет) с задержкой между соседями. | [карточка](../components/remotion-bits/staggered-motion.md) |
| `remotion-bits/type-writer` | remotion-bits | Посимвольная печать текста с мигающим курсором; стирание и печать следующей строки, опечатки с исправлением, переменная скорость. | [карточка](../components/remotion-bits/type-writer.md) |
| `remotion-boilerplate/features-scene` | remotion-boilerplate | Сцена возможностей: сверху ударная надпись по буквам (KineticBurst), ниже три строки фич появляются по очереди с шагом 15 кадров; всё под… | [карточка](../components/remotion-boilerplate/features-scene.md) |
| `remotion-boilerplate/main` | remotion-boilerplate | Двухсценный ролик 5 с: тёмная сцена-заголовок (герой-заголовок влетает с поворотом, подзаголовок по словам) → clockWipe → сцена фич (удар… | [карточка](../components/remotion-boilerplate/main.md) |
| `remotion-motion-graphics-skill/patterns` | remotion-motion-graphics-skill | Не рисует; документ с рабочими шаблонами Remotion-кода: скелет композиции (zod-схема, defaultProps, регистрация), enter/hold/exit, spring… | [карточка](../components/remotion-motion-graphics-skill/patterns.md) |
| `remotion-skills/maps-mapbox` | remotion-skills | Не рисует; документ о детерминированных 2D-анимациях карт Mapbox GL JS + Turf: маршрут по большой окружности с прорисовкой (lineSliceAlon… | [карточка](../components/remotion-skills/maps-mapbox.md) |
| `remotion-skills/multi-scene-video` | remotion-skills | Не рисует; документ о структуре ролика из нескольких сцен: компонент на сцену, Track с явными from/durationInFrames или TransitionSeries… | [карточка](../components/remotion-skills/multi-scene-video.md) |
| `remotion-skills/river-reveal` | remotion-skills | Карта-объяснялка: «электрическая» река прорисовывается с белой светящейся головой, по мере её прохода у каждой страны прорисовывается гра… | [карточка](../components/remotion-skills/river-reveal.md) |
| `remotion-skills/sequencing` | remotion-skills | Не рисует; документ о выборе границы тайминга: timing-props прямо на компоненте, общий Sequence для группы слоёв, Track для непересекающи… | [карточка](../components/remotion-skills/sequencing.md) |
| `remotion-skills/timing-props` | remotion-skills | Не рисует; документ о пропсах тайминга встроенных компонентов и порядке их применения (from → trimBefore → durationInFrames → playbackRat… | [карточка](../components/remotion-skills/timing-props.md) |
| `remotion-skills/transitions` | remotion-skills | Не рисует; документ о переходах между сценами: TransitionSeries с Transition (fade, slide, wipe, flip, clockWipe; linearTiming/springTimi… | [карточка](../components/remotion-skills/transitions.md) |
| `remotion-skills/video-editing` | remotion-skills | Не рисует; документ о монтаже клипов: Track для независимых клипов, TransitionSeries для смежных, общий тайминг-контейнер для видео и его… | [карточка](../components/remotion-skills/video-editing.md) |
| `remotion-video-templates/captioned-short` | remotion-video-templates | Вертикальный шорт 9:16 с караоке-субтитрами: крупные слова по центру, текущее подсвечено акцентом и подпрыгивает; сверху заголовок-чип, с… | [карточка](../components/remotion-video-templates/captioned-short.md) |
| `remotion-video-templates/kinetic-text` | remotion-video-templates | Строки сценария по очереди в центре экрана; слова строки выпрыгивают снизу со stagger, строки с emphasis крупнее и цветом акцента; строка… | [карточка](../components/remotion-video-templates/kinetic-text.md) |
| `remotion-video-templates/promo-template` | remotion-video-templates | Промо продукта: хук (Introducing, название, слоган), 1–3 сцены фич (номер, заголовок, описание + скриншот с Ken Burns), финальный CTA с к… | [карточка](../components/remotion-video-templates/promo-template.md) |

### Адаптируется без переписывания (`adaptable`) — 98

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/alarm-clock` | animata | Квадратный виджет Alarms в стиле iOS: до двух будильников (время крупно, расписание мелко) с тумблерами; выключенные бледнее. | [карточка](../components/animata/alarm-clock.md) |
| `animata/animated-timeline` | animata | Вертикальный таймлайн: точки на линии и заголовок, описание, дата; при активации пункта N точки 0…N заливаются и увеличиваются, линия нал… | [карточка](../components/animata/animated-timeline.md) |
| `animata/bento-gradient` | animata | Bento-сетка 3 колонки на тёмном фоне: четыре карточки с иконкой, заголовком, описанием и мягким градиентом (Gradient, Linear, Radial, Con… | [карточка](../components/animata/bento-gradient.md) |
| `animata/bento-seven` | animata | Каркас bento из 7 плашек на сетке 4×3 с широкими (2 и 3 колонки) и одиночными ячейками. | [карточка](../components/animata/bento-seven.md) |
| `animata/bento-six` | animata | Каркас bento из 6 плашек на сетке 4×3: верх — широкая + две одиночные, середина — полоса на всю ширину, низ — две половины. | [карточка](../components/animata/bento-six.md) |
| `animata/blur-out-up` | animata | Фраза появляется по словам: слово всплывает на 10px из лёгкого blur и уходит вверх в нарастающем размытии; фразы сменяются по кругу. | [карточка](../components/animata/blur-out-up.md) |
| `animata/calendar-event` | animata | Виджет календаря: день недели и число, до двух событий цветными плашками с точкой и строка «+N more» со временем следующего. | [карточка](../components/animata/calendar-event.md) |
| `animata/card-spread` | animata | Колода из четырёх карточек-виджетов (заметки, покупки, идеи ремонта, напоминания) лежит стопкой и по клику разлетается в ряд из 4 колонок… | [карточка](../components/animata/card-spread.md) |
| `animata/confirmation-message` | animata | Сцена успеха на зелёном градиенте: круглая галочка, из которой вырастает капсула «Process Successful», затем снизу въезжает карточка-сооб… | [карточка](../components/animata/confirmation-message.md) |
| `animata/cycle-text` | animata | Строка кода System.out.println(...), где слово в кавычках каждые 1.3 с меняется: старое уезжает вверх, новое въезжает снизу. | [карточка](../components/animata/cycle-text.md) |
| `animata/delivery-card` | animata | Тёмный виджет отслеживания заказа в виде багажной бирки: «Arrives today 09:26», статус Processing / In transit / Delivered, линия пути с… | [карточка](../components/animata/delivery-card.md) |
| `animata/email-feature-card` | animata | Мокап формы письма Send an Email: поля From / To / Subject / Body заполнены статичным текстом; по hover верхняя карточка слегка уменьшается. | [карточка](../components/animata/email-feature-card.md) |
| `animata/flipping-cards` | animata | Сетка из 3 колонок карточек 192×240, каждая при наведении переворачивается по оси Y и показывает обратную сторону. | [карточка](../components/animata/flipping-cards.md) |
| `animata/github-card-shiny` | animata | Карточка GitHub Actions: cmake.yml, on: push и шаги с зелёными галочками и временем (Install dependencies, Build, Test); за курсором плыв… | [карточка](../components/animata/github-card-shiny.md) |
| `animata/image-carousel` | animata | Рамка 600×500 с тремя карточками веером: центральная увеличена и резкая, боковые повёрнуты на ∓20° и размыты; стрелки листают. | [карточка](../components/animata/image-carousel.md) |
| `animata/images-reveal` | animata | Веер из 5 фото в белых рамках внахлёст под разными углами; при монтировании они по очереди выпрыгивают со scale 0.2; заголовок «Airbnb Im… | [карточка](../components/animata/images-reveal.md) |
| `animata/jumping-text-instagram` | animata | Слова или буквы запрыгивают на место снизу на 30px с поворотом −30° пружиной с перелётом, как текст в сторис. | [карточка](../components/animata/jumping-text-instagram.md) |
| `animata/line-by-line-slide` | animata | Многострочный текст: строки по очереди выезжают слева на −48px и проявляются, уходят вправо. | [карточка](../components/animata/line-by-line-slide.md) |
| `animata/mask-reveal-up` | animata | Заголовок в 1–2 строки поднимается снизу на 30px из размытия с коротким stagger между строками; clip-маски нет, эффект — opacity + blur +… | [карточка](../components/animata/mask-reveal-up.md) |
| `animata/menu-animation` | animata | Вертикальный список крупных моно-заголовков; у пункта под курсором выезжает синяя стрелка, текст сдвигается и синеет. | [карточка](../components/animata/menu-animation.md) |
| `animata/notes` | animata | Жёлтая заметка-стикер в стиле Apple Notes widget: заголовок «About John» и строки текста. | [карточка](../components/animata/notes.md) |
| `animata/per-word-crossfade` | animata | Слова проявляются одно за другим с коротким дрейфом 8px вверх; фразы спокойно сменяют друг друга. | [карточка](../components/animata/per-word-crossfade.md) |
| `animata/photo-booth` | animata | Светло-серая панель с сеткой квадратных фото 110×110 (2 или 4 колонки), при наведении фото увеличивается до 125%. | [карточка](../components/animata/photo-booth.md) |
| `animata/progress` | animata | Сегментированный прогресс-бар из палочек 2px через 2px высотой 12px: заполненные светлые, остальные тёмные; заполнение бежит слева направ… | [карточка](../components/animata/progress.md) |
| `animata/reminder-widget` | animata | Высокий виджет «Packing» в стиле iOS Reminders: колокольчик, счётчик оставшихся пунктов и список с круглыми чекбоксами; отмеченные синие,… | [карточка](../components/animata/reminder-widget.md) |
| `animata/reveal-image` | animata | Список услуг огромным текстом (Branding, Web design, Illustration); при наведении слово бледнеет и рядом выпрыгивают две маленькие фотогр… | [карточка](../components/animata/reveal-image.md) |
| `animata/scroll-reveal` | animata | Абзац, где слова по очереди загораются (opacity 0.5 → 1) по мере прокрутки — читаемый манифест. | [карточка](../components/animata/scroll-reveal.md) |
| `animata/shared-axis-y` | animata | Жёсткая смена слов по ступенькам: каждое слово появляется мгновенно (steps(1, jump-start)) с шагом 78 мс; сдвига по Y нет. | [карточка](../components/animata/shared-axis-y.md) |
| `animata/shopping-list` | animata | Виджет-список «Shopping list» с квадратными чекбоксами; отмеченные закрашены, текст зачёркнут. | [карточка](../components/animata/shopping-list.md) |
| `animata/short-slide-right` | animata | Вся фраза одним куском въезжает слева (−24px, лёгкий blur), а слова внутри проявляются по очереди только прозрачностью. | [карточка](../components/animata/short-slide-right.md) |
| `animata/spring-scale-in` | animata | Слова выпрыгивают с перелётом масштаба 0.7 → 1 (cubic-bezier(0.34,1.56,0.64,1)), stagger 95 мс. | [карточка](../components/animata/spring-scale-in.md) |
| `animata/staggered-letter` | animata | Буквы по одной падают сверху (−150px) или вылетают снизу на серую подложку того же слова и закрывают её. | [карточка](../components/animata/staggered-letter.md) |
| `animata/text-flip` | animata | Фраза «Coding is …», где последнее слово в окне перелистывается вверх по списку с лёгким перелётом. | [карточка](../components/animata/text-flip.md) |
| `animata/transaction-list` | animata | Белая карточка Transactions банковского приложения: строки с иконкой, названием, типом и суммой; по клику строка морфится в детальный вид… | [карточка](../components/animata/transaction-list.md) |
| `animata/typing-text` | animata | Печатная машинка: текст набирается по символу (или по словам в smooth), мигает курсор; при repeat стирается и набирается снова. | [карточка](../components/animata/typing-text.md) |
| `animata/wave-reveal` | animata | Текст проявляется волной по буквам или словам: каждый элемент выезжает сверху или снизу на 80% высоты из blur, задержка 50 мс на шаг. | [карточка](../components/animata/wave-reveal.md) |
| `animata/weekly-progress` | animata | Виджет прогресса чтения: автор и название книги, бейдж с иконкой книги «30%», семь маленьких колец по дням недели, которые заполняются ян… | [карточка](../components/animata/weekly-progress.md) |
| `magicui/animated-list` | magicui | Лента уведомлений: новые карточки по одной выпрыгивают сверху с пружинным увеличением, старые сдвигаются вниз. | [карточка](../components/magicui/animated-list.md) |
| `magicui/bento-grid` | magicui | Сетка «бенто» из карточек разного размера: фон-иллюстрация, иконка, заголовок, описание и CTA. | [карточка](../components/magicui/bento-grid.md) |
| `magicui/blur-fade` | magicui | Обёртка для любого содержимого: элемент проявляется из размытия с небольшим сдвигом; с разными delay — каскад. | [карточка](../components/magicui/blur-fade.md) |
| `magicui/interactive-grid-pattern` | magicui | Сетка квадратов-rect, клетка под курсором подсвечивается и плавно гаснет — шлейф подсветки. | [карточка](../components/magicui/interactive-grid-pattern.md) |
| `magicui/marquee` | magicui | Бесконечная бегущая лента из любых элементов (логотипы, отзывы, карточки, текст) по горизонтали или вертикали. | [карточка](../components/magicui/marquee.md) |
| `magicui/morphing-text` | magicui | Крупное слово «перетекает» в следующее: буквы размываются и слипаются, как капли, затем проявляется новое слово. | [карточка](../components/magicui/morphing-text.md) |
| `magicui/progressive-blur` | magicui | Полоса у края, где содержимое под ней размывается всё сильнее (8 ступеней backdrop-filter с масками) — мягкий край вместо обрезки. | [карточка](../components/magicui/progressive-blur.md) |
| `magicui/safari` | magicui | Окно браузера Safari: «светофоры», адресная строка с замком и URL, кнопки навигации; в окне — скриншот или видео сайта. | [карточка](../components/magicui/safari.md) |
| `magicui/scroll-based-velocity` | magicui | Бесконечная бегущая строка крупного текста, ускоряющаяся от скорости прокрутки; обычно две строки навстречу. | [карточка](../components/magicui/scroll-based-velocity.md) |
| `magicui/terminal` | magicui | Окно терминала: команда печатается посимвольно, затем строки вывода появляются одна за другой после предыдущей. | [карточка](../components/magicui/terminal.md) |
| `magicui/text-animate` | magicui | Текст появляется целиком, по словам, символам или строкам одним из 10 пресетов (fade, blur, slide ×4, scale up/down) со stagger. | [карточка](../components/magicui/text-animate.md) |
| `magicui/text-reveal` | magicui | Абзац крупного текста, слова которого по очереди загораются из полупрозрачного серого в полный цвет по прогрессу. | [карточка](../components/magicui/text-reveal.md) |
| `magicui/typing-animation` | magicui | Текст печатается по символу с мигающим курсором; для списка слов — печать, пауза, стирание, следующее слово. | [карточка](../components/magicui/typing-animation.md) |
| `magicui/word-rotate` | magicui | Слово в одной позиции по таймеру сменяется следующим: старое уезжает вниз и гаснет, новое въезжает сверху. | [карточка](../components/magicui/word-rotate.md) |
| `motion-primitives/animated-group` | motion-primitives | Дети контейнера появляются по очереди (stagger 0.1 с) одним из 10 пресетов: fade, slide, scale, blur, blur-slide, zoom, flip, bounce, rot… | [карточка](../components/motion-primitives/animated-group.md) |
| `motion-primitives/text-effect` | motion-primitives | Строка текста, проявляющаяся по словам, символам или строкам со stagger (fade, blur, fade-in-blur, scale, slide) с обратным exit. | [карточка](../components/motion-primitives/text-effect.md) |
| `motion-primitives/transition-panel` | motion-primitives | Панель, где содержимое сменяется по activeIndex: уходящий слайд проигрывает exit, новый — enter → center по заданным variants. | [карточка](../components/motion-primitives/transition-panel.md) |
| `motion-primitives-website/ai-response-card` | motion-primitives-website | Карточка ответа ИИ: иконка выпрыгивает, заголовок печатается, затем стримится текст; по рамке кружит фиолетовый conic-блик; в конце появл… | [карточка](../components/motion-primitives-website/ai-response-card.md) |
| `motion-primitives-website/blocks-preloader` | motion-primitives-website | Полноэкранная сетка блоков (4×6), которые по порядку загораются по мере роста прогресса. | [карточка](../components/motion-primitives-website/blocks-preloader.md) |
| `motion-primitives-website/character-reveal` | motion-primitives-website | Строка, буквы которой по очереди выпрыгивают снизу (y 50 → 0, opacity 0 → 1). | [карточка](../components/motion-primitives-website/character-reveal.md) |
| `motion-primitives-website/chat-bubble` | motion-primitives-website | Пузырь сообщения: пользователь — фиолетовый справа, ассистент — серый слева, системное — по центру курсивом; аватар и время; пружинное по… | [карточка](../components/motion-primitives-website/chat-bubble.md) |
| `motion-primitives-website/chat-container` | motion-primitives-website | Тёмное окно чата со скруглением и колонкой сообщений; при добавлении сообщений само прокручивается вниз. | [карточка](../components/motion-primitives-website/chat-container.md) |
| `motion-primitives-website/curtain-transition` | motion-primitives-website | Блок с однотонной шторкой, которая на mount въезжает поверх контента с выбранной стороны и закрывает его (на exit — уезжает дальше). | [карточка](../components/motion-primitives-website/curtain-transition.md) |
| `motion-primitives-website/flip-text` | motion-primitives-website | Фразы сменяются 3D-переворотом, как перекидное табло: новая откидывается сверху (rotateX 90 → 0), старая уходит (→ -90). | [карточка](../components/motion-primitives-website/flip-text.md) |
| `motion-primitives-website/line-reveal` | motion-primitives-website | Строки блока (дети с классом .line) по очереди поднимаются на 50 px и проявляются; в режиме scrub загораются от 0.2 до 1. | [карточка](../components/motion-primitives-website/line-reveal.md) |
| `motion-primitives-website/page-stagger` | motion-primitives-website | Контейнер, дочерние PageStaggerChild которого въезжают по очереди (сдвиг 40 px + проявление) на mount. | [карточка](../components/motion-primitives-website/page-stagger.md) |
| `motion-primitives-website/slide-reveal` | motion-primitives-website | Блок въезжает на 60 px с выбранной стороны и проявляется — универсальный вход элемента. | [карточка](../components/motion-primitives-website/slide-reveal.md) |
| `motion-primitives-website/step-indicator` | motion-primitives-website | Индикатор шагов: кружки (точки или номера с галочкой у пройденных), соединённые линиями, заполняющимися до текущего шага; вариант «таблет… | [карточка](../components/motion-primitives-website/step-indicator.md) |
| `motion-primitives-website/streaming-text` | motion-primitives-website | Текст стримится по словам или символам, как ответ LLM: новые токены появляются с fade, blur или сдвигом; мигает курсор до конца потока. | [карточка](../components/motion-primitives-website/streaming-text.md) |
| `motion-primitives-website/svg-line-orchestra` | motion-primitives-website | Все path внутри SVG прорисовываются строго по очереди с шагом 0.3 с — хореография линий. | [карточка](../components/motion-primitives-website/svg-line-orchestra.md) |
| `motion-primitives-website/svg-path-draw` | motion-primitives-website | SVG-обёртка, где все фигуры (path, line, polyline, polygon, circle, ellipse, rect) по очереди прорисовываются штрихом. | [карточка](../components/motion-primitives-website/svg-path-draw.md) |
| `motion-primitives-website/typewriter-effect` | motion-primitives-website | Печатная машинка: слово набирается по букве, держится 2 с, стирается и сменяется следующим; справа мигающий курсор. | [карточка](../components/motion-primitives-website/typewriter-effect.md) |
| `motion-primitives-website/typing-indicator` | motion-primitives-website | Пузырь с тремя подпрыгивающими точками «печатает…», опционально с подписью. | [карточка](../components/motion-primitives-website/typing-indicator.md) |
| `motion-primitives-website/typing-text` | motion-primitives-website | Печать фраз из массива по буквам, пауза, стирание и переход к следующей; мигающий курсор 3 px. | [карточка](../components/motion-primitives-website/typing-text.md) |
| `motion-primitives-website/word-preloader` | motion-primitives-website | Чёрный экран, в центре каждые 0.4 с сменяются крупные слова (снизу вверх), под ними точки-индикатор; на выходе экран уезжает вверх. | [карточка](../components/motion-primitives-website/word-preloader.md) |
| `motion-primitives-website/word-reveal` | motion-primitives-website | Фраза, слова которой по очереди откидываются из плоскости: rotateX −90° → 0, подъём на 30 px и проявление. | [карточка](../components/motion-primitives-website/word-reveal.md) |
| `nivo/funnel` | nivo | Воронка: этапы друг за другом, ширина части пропорциональна значению, сглаженные переходы между частями, разделители и подписи (experimen… | [карточка](../components/nivo/funnel.md) |
| `nivo/sankey` | nivo | Диаграмма Санкея (d3-sankey): узлы по слоям и изогнутые ленты потоков между ними, толщина — величина; градиенты лент, подписи внутри/снар… | [карточка](../components/nivo/sankey.md) |
| `nivo/tree` | nivo | Дерево/дендрограмма (d3-hierarchy): узлы-круги, связи кривыми bump/linear/step, четыре направления раскладки, подписи, подсветка предков… | [карточка](../components/nivo/tree.md) |
| `react-bits/accordion-gallery` | react-bits | Ряд или колонка узких панелей-фотографий; активная раскрывается на большую часть ширины, становится цветной и показывает подпись с акцент… | [карточка](../components/react-bits/accordion-gallery.md) |
| `react-bits/animated-content` | react-bits | Обёртка, в которой дети въезжают по одному со stagger: сдвиг, масштаб, поворот, наклон, размытие, прозрачность и маска-wipe. | [карточка](../components/react-bits/animated-content.md) |
| `react-bits/animated-list` | react-bits | Список строк (иконка или картинка, заголовок, описание, мета) в стеклянной рамке: строки по очереди выпрыгивают с пружиной, выделенную по… | [карточка](../components/react-bits/animated-list.md) |
| `react-bits/bounce-cards` | react-bits | Веер фото-карточек в белой рамке, которые по очереди выпрыгивают из нуля с упругим отскоком и раскладываются с наклонами; при наведении с… | [карточка](../components/react-bits/bounce-cards.md) |
| `react-bits/card-swap` | react-bits | Стопка карточек в перспективе, уходящая вглубь по диагонали со skew: по таймеру передняя улетает вниз и встаёт в конец колоды, остальные… | [карточка](../components/react-bits/card-swap.md) |
| `react-bits/carousel` | react-bits | Карусель карточек (текст с иконкой или фото) в стеклянной рамке с переходами tilt/slide/scale/fade/cube и индикатором — точки, полоски-та… | [карточка](../components/react-bits/carousel.md) |
| `react-bits/depth-carousel` | react-bits | Карусель карточек-изображений, уходящих в глубину по 3D-рельсу: активная спереди, следующие сдвинуты вбок, отодвинуты по Z, повёрнуты и з… | [карточка](../components/react-bits/depth-carousel.md) |
| `react-bits/fade-content` | react-bits | Обёртка, проявляющая детей (со stagger): простое появление, фокус из размытия, «проявка фото» или шумовые маски SVG (dissolve, mist, pixel). | [карточка](../components/react-bits/fade-content.md) |
| `react-bits/lattice-loader` | react-bits | Индикатор работы AI: сетка 3×3/4×4 клеток с бегущим узором, подпись «Thinking» и таймер; при done/error клетки складываются в галочку или… | [карточка](../components/react-bits/lattice-loader.md) |
| `react-bits/scroll-reveal` | react-bits | Абзац или цитата, слова (буквы, строки) которой по очереди проявляются из почти прозрачного размытого состояния в чёткий текст, опциональ… | [карточка](../components/react-bits/scroll-reveal.md) |
| `react-bits/split-text` | react-bits | Заголовок, разбитый на буквы/слова/строки, кусочки которого по очереди въезжают на место: подъём, fade, blur, 3D-переворот, pop, skew или… | [карточка](../components/react-bits/split-text.md) |
| `react-bits/stack` | react-bits | Стопка карточек (фото или контент) в раскладке веер, каскад, колода или россыпь; верхняя карточка улетает и подкладывается вниз, остальны… | [карточка](../components/react-bits/stack.md) |
| `react-bits/status-mark` | react-bits | Значок статуса задачи с подписью: пунктирное кольцо, вращающаяся дуга или кольцо прогресса, морф в галочку или крест, зачёркивание подписи. | [карточка](../components/react-bits/status-mark.md) |
| `react-bits/text-type` | react-bits | Пишущая машинка: строки печатаются по символу, курсор мигает и скользит, текст стирается backspace или выделением, затем печатается следу… | [карточка](../components/react-bits/text-type.md) |
| `react-bits/thought-line` | react-bits | Строка «Thinking…» как у AI-чатов: дышащая искра, переливающийся текст, лента шагов рассуждения, затем схлопывание в «Thought for 4.2s». | [карточка](../components/react-bits/thought-line.md) |
| `react-bits/true-focus` | react-bits | Фраза, в которой слова по очереди попадают в фокус: активное чёткое, остальные размыты; к активному переезжает рамка — уголки, прямоуголь… | [карточка](../components/react-bits/true-focus.md) |
| `recharts/funnel-chart` | recharts | Воронка: стопка трапеций сверху вниз, ширина пропорциональна значению этапа; последний этап — треугольник или прямоугольник. | [карточка](../components/recharts/funnel-chart.md) |
| `xyflow/default-nodes` | xyflow | Прямоугольные узлы-карточки с подписью и точками-ручками: default (вход сверху, выход снизу), input (только выход), output (только вход),… | [карточка](../components/xyflow/default-nodes.md) |
| `xyflow/edge-path-utils` | xyflow | Собственной картинки нет: чистые функции возвращают SVG-путь d между двумя точками и центр для подписи — рёбра React Flow в любом своём S… | [карточка](../components/xyflow/edge-path-utils.md) |
| `xyflow/example-layouting` | xyflow | Автораскладка графа библиотекой dagre по уровням сверху вниз (TB) или слева направо (LR) с переставленными ручками и стрелками на рёбрах. | [карточка](../components/xyflow/example-layouting.md) |
| `xyflow/example-overview` | xyflow | Схема на 7 узлов сверху вниз: input-узел, default-узлы (один с фоном #D6D5E6), два output; рёбра bezier с подписью, анимированное пунктир… | [карточка](../components/xyflow/example-overview.md) |
| `xyflow/react-flow` | xyflow | Холст схемы: HTML-узлы и SVG-рёбра между ручками (bezier, step, straight), подписи и стрелки на рёбрах, общий viewport с панорамой и зумо… | [карточка](../components/xyflow/react-flow.md) |

### Требует существенной переработки (`complex`) — 27

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/animated-dock` | animata | Док в стиле macOS: стеклянная полоса с круглыми иконками, которые увеличиваются рядом с курсором (40→80px), с подписью над наведённой; на… | [карточка](../components/animata/animated-dock.md) |
| `animata/bento-eight` | animata | Яркая bento-сетка 4×3 из 8 карточек EdTech-продукта: рейтинг 4.8★, «179k+ students» с аватарами, AI-чат с печатью ответа, отчёт-скелетон,… | [карточка](../components/animata/bento-eight.md) |
| `animata/card-stack` | animata | Стопка карточек (3 видимых слоя со смещением, масштабом 0.84/0.72 и поворотами ±1°): верхнюю выбрасывает со случайным сдвигом, следующая… | [карточка](../components/animata/card-stack.md) |
| `animata/direction-card` | animata | Чёрный виджет навигатора: дистанция до манёвра, большая стрелка поворота, улица; справа колонка предыдущий/текущий/следующий манёвр и зел… | [карточка](../components/animata/direction-card.md) |
| `animata/expandable` | animata | Горизонтальная гармошка из фото-полос: активная расширяется и становится резкой, остальные узкие и размытые; на активной волной проявляет… | [карточка](../components/animata/expandable.md) |
| `animata/kinetic-center-build` | animata | Фраза строится по слову: новое слово въезжает справа на 88px и расталкивает строку, пока фраза не встанет по центру; уход вверх с blur. | [карточка](../components/animata/kinetic-center-build.md) |
| `animata/short-slide-down` | animata | Вертикальная кинетика: каждое новое слово падает сверху на −28px и сталкивает стопку, пока три строки не встанут по центру. | [карточка](../components/animata/short-slide-down.md) |
| `animata/transition-list` | animata | Окно со списком строк-подписок (иконка-буква, название, категория, сумма): каждые 2.5 с верхняя строка схлопывается, остальные поднимаются. | [карточка](../components/animata/transition-list.md) |
| `echarts/custom` | echarts | Произвольный ряд: функция renderItem рисует для каждой точки данных свою группу фигур (rect, path, text, image…) в координатах любой сист… | [карточка](../components/echarts/custom.md) |
| `echarts/funnel` | echarts | Воронка из трапеций: ширина этапа пропорциональна значению, сортировка по убыванию, подписи снаружи с линиями или внутри. | [карточка](../components/echarts/funnel.md) |
| `mermaid/agentflow` | mermaid | Схема агентного workflow: контейнеры flow с агентами, внутри — задачи, инструменты, решения, входы разных форм; рёбра последовательности,… | [карточка](../components/mermaid/agentflow.md) |
| `mermaid/eventmodeling` | mermaid | Диаграмма Event Modeling: таймлайн тайм-фреймов по дорожкам (UI/процессоры, команды, read-модели, события), связи между ними выводятся ав… | [карточка](../components/mermaid/eventmodeling.md) |
| `mermaid/flowchart` | mermaid | Блок-схема: узлы разных форм (прямоугольник, ромб, круг, десятки форм через @{ shape }) соединены стрелками с подписями, подграфы-контейн… | [карточка](../components/mermaid/flowchart.md) |
| `mermaid/gantt` | mermaid | Диаграмма Ганта: горизонтальные полосы задач по шкале времени, секции, зависимости after, вехи (milestone), критические и выполненные зад… | [карточка](../components/mermaid/gantt.md) |
| `mermaid/kanban` | mermaid | Канбан-доска: колонки-стадии с заголовками и карточки задач в них, у карточек опциональные метаданные (assigned, ticket, priority). | [карточка](../components/mermaid/kanban.md) |
| `mermaid/railroad` | mermaid | Синтаксическая диаграмма грамматики: «рельсы» с терминалами в скруглённых рамках и нетерминалами в прямоугольниках, развилки альтернатив,… | [карточка](../components/mermaid/railroad.md) |
| `mermaid/sequence-diagram` | mermaid | Диаграмма последовательности: участники сверху, вертикальные линии жизни, горизонтальные стрелки сообщений с подписями сверху вниз по вре… | [карточка](../components/mermaid/sequence-diagram.md) |
| `mermaid/state-diagram` | mermaid | Диаграмма состояний: скруглённые состояния, стрелки переходов с событиями, начальная и конечная точки [*], вложенные (составные) состояни… | [карточка](../components/mermaid/state-diagram.md) |
| `mermaid/swimlanes` | mermaid | Кросс-функциональная блок-схема: горизонтальные или вертикальные дорожки (по subgraph) с шагами внутри и стрелками передачи работы между… | [карточка](../components/mermaid/swimlanes.md) |
| `mermaid/timeline` | mermaid | Хронология: горизонтальная (LR) или вертикальная (TD) ось с периодами, под каждым — одна или несколько карточек событий; секции окрашены… | [карточка](../components/mermaid/timeline.md) |
| `mermaid/user-journey` | mermaid | Карта пути пользователя: шаги-карточки по секциям слева направо, у каждого — оценка 1–5 со смайликом и участники. | [карточка](../components/mermaid/user-journey.md) |
| `mermaid/zenuml` | mermaid | Диаграмма последовательности в нотации ZenUML: участники, сообщения, вложенные вызовы и блоки, похожие на код. | [карточка](../components/mermaid/zenuml.md) |
| `react-bits/circular-gallery` | react-bits | Горизонтальная лента карточек-изображений, изогнутая дугой, с лёгкой волной поверхности, подписями, тенями и затуханием краёв; карточку м… | [карточка](../components/react-bits/circular-gallery.md) |
| `react-bits/flex-carousel` | react-bits | Бесконечная лента изображений, проходящая сквозь невидимую жидкую линзу у краёв: картинки изгибаются, скручиваются и дают дисперсию цвета… | [карточка](../components/react-bits/flex-carousel.md) |
| `react-bits/flux-lines` | react-bits | Светящиеся линии потока с ярким ободком, текущие в заданном направлении, как силовые линии; клик закручивает вихрь. | [карточка](../components/react-bits/flux-lines.md) |
| `react-bits/grid-scan` | react-bits | 3D-коридор из линий сетки, уходящий вглубь, по которому периодически проходит светящаяся полоса сканирования; клик — пинг. | [карточка](../components/react-bits/grid-scan.md) |
| `react-bits/scanner` | react-bits | Цветные полосы, по которым проходит луч сканирования со шлейфом, рябью и строчной развёрткой. | [карточка](../components/react-bits/scanner.md) |

### Не подходит (`unsuitable`) — 2

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/stacked-sections` | animata | Колода глав: секции при прокрутке прилипают сверху со смещением 48px, следующая наезжает поверх, накрытые уменьшаются. | [карточка](../components/animata/stacked-sections.md) |
| `react-bits/scroll-stack` | react-bits | Вертикальная лента карточек, которые при прокрутке прилипают к верху и складываются в стопку: нижние уменьшаются, затемняются, опциональн… | [карточка](../components/react-bits/scroll-stack.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`timeline`, `cause-effect`, `system-structure`
