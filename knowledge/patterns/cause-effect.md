# Причина и следствие

«Из-за этого…», «что привело к…», «поэтому», «в результате». Нужна
направленность: от причины к следствию, с явной связью (стрелка, линия,
переход).

## Визуальные приёмы

1. **Два блока со стрелкой** — причина слева, следствие справа; стрелка
   рисуется по кадру.
2. **Цепочка** — несколько звеньев, появляющихся по очереди (A → B → C).
3. **Ветвление** — одна причина, несколько следствий (дерево/веер).
4. **Диаграмма Исикавы** («рыбья кость») — много причин одного следствия.
5. **Переход сцены** — причина «превращается» в следствие (morph, wipe).

## Как выбирать

- Простая пара → два блока + стрелка (`icons-shapes` для стрелки,
  `lists-grids-stagger` для блоков).
- Цепочка 3–6 шагов → `sequence-steps`-компоненты с направленными
  коннекторами.
- Много причин → mermaid ishikawa/flowchart (статичный SVG, появление по
  узлам).
- Граф связей → `diagrams-flow` (React Flow, mermaid flowchart).

## Кандидаты из каталога

<!-- kb:begin candidates -->
### Готово для Remotion (`native`) — 4

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `free-remotion-templates/camera-shake` | free-remotion-templates | Заголовок в акцентной рамке; в момент удара весь кадр трясётся с затуханием, белая вспышка, 12 SVG-лучей от центра, заголовок подпрыгивае… | [карточка](../components/free-remotion-templates/camera-shake.md) |
| `free-remotion-templates/split-screen` | free-remotion-templates | Кадр делится на две контрастные панели: каждая раскрывается clip-path-вайпом, по центру выстреливает разделитель, затем поднимаются загол… | [карточка](../components/free-remotion-templates/split-screen.md) |
| `remotion-bits/cli-simulation` | remotion-bits | Терминал: после приглашения ➜ ~ печатается npm install remotion-bits, затем быстро выводятся строки ✔ Package found, ✔ Dependencies resol… | [карточка](../components/remotion-bits/cli-simulation.md) |
| `remotion-skills/river-reveal` | remotion-skills | Карта-объяснялка: «электрическая» река прорисовывается с белой светящейся головой, по мере её прохода у каждой страны прорисовывается гра… | [карточка](../components/remotion-skills/river-reveal.md) |

### Адаптируется без переписывания (`adaptable`) — 29

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/card-comment` | animata | Абстрактная карточка-комментарий «{commenter} commented» с пульсирующими полосками-заглушками; по hover блок уезжает вверх и появляется з… | [карточка](../components/animata/card-comment.md) |
| `animata/confirmation-message` | animata | Сцена успеха на зелёном градиенте: круглая галочка, из которой вырастает капсула «Process Successful», затем снизу въезжает карточка-сооб… | [карточка](../components/animata/confirmation-message.md) |
| `animata/email-feature-card` | animata | Мокап формы письма Send an Email: поля From / To / Subject / Body заполнены статичным текстом; по hover верхняя карточка слегка уменьшается. | [карточка](../components/animata/email-feature-card.md) |
| `animata/icon-ripple` | animata | Иконка (по умолчанию микрофон) с бесконечно расходящимся круговым пингом. | [карточка](../components/animata/icon-ripple.md) |
| `animata/notification-card` | animata | Белое уведомление (логотип, заголовок, жирный текст) съезжает сверху, затем из-под него выдвигается зелёная таблетка отправителя с аватар… | [карточка](../components/animata/notification-card.md) |
| `animata/security-alert` | animata | Чёрный виджет тревоги: полоса-штриховка, «Security at risk», число 139,532, «30m ago», кнопка Quick scan и пульсирующая красным плашка «2… | [карточка](../components/animata/security-alert.md) |
| `animata/vpn-widget` | animata | Виджет VPN: сервер «Tokyo» с флажком, пинг «53 ms» с пульсирующей точкой, скорость «57.4 Mbps» и сдвижной переключатель Disconnected/Not… | [карточка](../components/animata/vpn-widget.md) |
| `animata/webhooks-card` | animata | Два блока-узла с подписями, соединённые пунктиром; по hover линия становится сплошной лаймовой, рамки загораются, шарик перекатывается от… | [карточка](../components/animata/webhooks-card.md) |
| `magicui/animated-beam` | magicui | Линия-связь (прямая или дуга) между двумя элементами схемы, по которой бежит светящийся градиентный импульс — данные текут от A к B. | [карточка](../components/magicui/animated-beam.md) |
| `magicui/comic-text` | magicui | Надпись в стиле комикса: жёлтые буквы в красный горошек, толстая чёрная обводка, наклон, двойная тень; влетает пружиной. | [карточка](../components/magicui/comic-text.md) |
| `magicui/ripple` | magicui | Концентрические круги от центра, мягко дышащие волной — круги на воде или сигнал радара за центральным элементом. | [карточка](../components/magicui/ripple.md) |
| `magicui/terminal` | magicui | Окно терминала: команда печатается посимвольно, затем строки вывода появляются одна за другой после предыдущей. | [карточка](../components/magicui/terminal.md) |
| `motion-primitives-website/ai-response-card` | motion-primitives-website | Карточка ответа ИИ: иконка выпрыгивает, заголовок печатается, затем стримится текст; по рамке кружит фиолетовый conic-блик; в конце появл… | [карточка](../components/motion-primitives-website/ai-response-card.md) |
| `motion-primitives-website/celebration-confetti` | motion-primitives-website | Полноэкранный дождь конфетти: 80 цветных квадратиков и кружков падают сверху вниз с вращением и боковым дрейфом, исчезая. | [карточка](../components/motion-primitives-website/celebration-confetti.md) |
| `motion-primitives-website/chat-notification` | motion-primitives-website | Цветной баннер-уведомление (info/success/error/warning) с иконкой и текстом; выезжает сверху, внизу тает полоска автозакрытия. | [карточка](../components/motion-primitives-website/chat-notification.md) |
| `motion-primitives-website/svg-glitch-filter` | motion-primitives-website | Обёртка с глитчем на любом содержимом: шумовое смещение (feTurbulence + feDisplacementMap) с резкими всплесками и RGB-раздвоением. | [карточка](../components/motion-primitives-website/svg-glitch-filter.md) |
| `motion-primitives-website/svg-particle-explosion` | motion-primitives-website | Элементы SVG-иллюстрации разлетаются с поворотом и уменьшением, затем упруго собираются обратно (inView — стартуют разбросанными и собира… | [карточка](../components/motion-primitives-website/svg-particle-explosion.md) |
| `nivo/sankey` | nivo | Диаграмма Санкея (d3-sankey): узлы по слоям и изогнутые ленты потоков между ними, толщина — величина; градиенты лент, подписи внутри/снар… | [карточка](../components/nivo/sankey.md) |
| `react-bits/glitch-text` | react-bits | Крупный заголовок с цифровым глитчем: копии текста, обрезанные полосами, сдвигаются с красной/циановой тенью; режимы slices, rgb (цветово… | [карточка](../components/react-bits/glitch-text.md) |
| `recharts/composed-chart` | recharts | Комбинированный декартов график: столбцы, линии, области и точки в одной системе координат, при необходимости на двух осях Y. | [карточка](../components/recharts/composed-chart.md) |
| `recharts/sankey` | recharts | Диаграмма потоков: узлы-прямоугольники по колонкам глубины и ленты-связи (кубические кривые), толщина ленты пропорциональна величине потока. | [карточка](../components/recharts/sankey.md) |
| `xyflow/edge-label-renderer` | xyflow | HTML-подписи на рёбрах: портал в слой поверх SVG-рёбер в координатах холста — плашки, бейджи, цифры, иконки посреди связи. | [карточка](../components/xyflow/edge-label-renderer.md) |
| `xyflow/edge-path-utils` | xyflow | Собственной картинки нет: чистые функции возвращают SVG-путь d между двумя точками и центр для подписи — рёбра React Flow в любом своём S… | [карточка](../components/xyflow/edge-path-utils.md) |
| `xyflow/edge-types` | xyflow | SVG-связи между узлами: плавная кривая, упрощённая кривая, прямая, ортогональная ломаная и ломаная со скруглёнными углами; стрелки на кон… | [карточка](../components/xyflow/edge-types.md) |
| `xyflow/example-custom-node` | xyflow | Тёмный холст #1A192B: input-узел слева, в центре свой узел с одним входом и двумя выходами a/b, справа два output-узла; три белых анимиро… | [карточка](../components/xyflow/example-custom-node.md) |
| `xyflow/example-edges` | xyflow | Граф на 17 узлов, где каждое ребро — приём оформления: подписи всех типов, ребро «только подпись», анимированное красное, подпись на жёлт… | [карточка](../components/xyflow/example-edges.md) |
| `xyflow/example-floating-edges` | xyflow | Радиальная схема: узел Target в центре и 8 узлов Source по кругу радиусом 250px; плавающие bezier-рёбра выходят из точки пересечения лини… | [карточка](../components/xyflow/example-floating-edges.md) |
| `xyflow/example-overview` | xyflow | Схема на 7 узлов сверху вниз: input-узел, default-узлы (один с фоном #D6D5E6), два output; рёбра bezier с подписью, анимированное пунктир… | [карточка](../components/xyflow/example-overview.md) |
| `xyflow/react-flow` | xyflow | Холст схемы: HTML-узлы и SVG-рёбра между ручками (bezier, step, straight), подписи и стрелки на рёбрах, общий viewport с панорамой и зумо… | [карточка](../components/xyflow/react-flow.md) |

### Требует существенной переработки (`complex`) — 22

| id | Репозиторий | Что визуализирует | Карточка |
|---|---|---|---|
| `animata/content-scan` | animata | Карточка «Free AI Content Detector»: по тексту проходит сканирующая фиолетовая полоса, заданные фразы подсвечиваются жёлтым при пересечен… | [карточка](../components/animata/content-scan.md) |
| `animata/text-explode-imessage` | animata | iMessage-взрыв: строка сжимается, дрожит, буквы разлетаются по дуге со случайными поворотами и гаснут, затем текст возвращается. | [карточка](../components/animata/text-explode-imessage.md) |
| `echarts/sankey` | echarts | Диаграмма потоков: узлы-столбики по уровням и ленты, толщина ленты — величина потока; горизонтально или вертикально. | [карточка](../components/echarts/sankey.md) |
| `magicui/confetti` | magicui | Взрыв разноцветного конфетти на canvas: кусочки вылетают веером, кувыркаются и падают; есть ConfettiButton. | [карточка](../components/magicui/confetti.md) |
| `mermaid/flowchart` | mermaid | Блок-схема: узлы разных форм (прямоугольник, ромб, круг, десятки форм через @{ shape }) соединены стрелками с подписями, подграфы-контейн… | [карточка](../components/mermaid/flowchart.md) |
| `mermaid/ishikawa` | mermaid | Диаграмма Исикавы («рыбий скелет»): проблема в голове, хребет, наклонные кости категорий причин и вложенные подпричины. | [карточка](../components/mermaid/ishikawa.md) |
| `mermaid/sankey` | mermaid | Диаграмма Санкея: прямоугольники-узлы по слоям и полупрозрачные ленты потоков, толщина ленты пропорциональна значению; подписи и значения… | [карточка](../components/mermaid/sankey.md) |
| `motion-primitives-website/animated-beam` | motion-primitives-website | Светящаяся линия-связь между двумя элементами (квадратичная кривая): по бледному пути бегут штрихи градиента от A к B; BeamCircle — узел-… | [карточка](../components/motion-primitives-website/animated-beam.md) |
| `motion-primitives-website/glitch-background` | motion-primitives-website | Тёмный градиент со сканлайнами, шумом и редкими горизонтальными срывами строк с хроматической аберрацией — сломанный монитор. | [карточка](../components/motion-primitives-website/glitch-background.md) |
| `motion-primitives-website/neural-network` | motion-primitives-website | 3D-нейросеть: ~96 светящихся нейронов в 7 слоях-кольцах с изогнутыми синапсами; нейроны вспыхивают, импульсы бегут по связям и зажигают с… | [карточка](../components/motion-primitives-website/neural-network.md) |
| `motion-primitives-website/noise-transition` | motion-primitives-website | Переход-растворение: экран засыпается чёрными пикселями шума до полного покрытия, затем шум рассеивается поверх цветного фона (в коде — б… | [карточка](../components/motion-primitives-website/noise-transition.md) |
| `react-bits/cubes` | react-bits | Сетка 3D-кубиков, поворачивающихся волной вокруг кисти; при autoAnimate кисть движется сама, клик пускает рябь. | [карточка](../components/react-bits/cubes.md) |
| `react-bits/falling-text` | react-bits | Абзац, рассыпающийся на слова или буквы, которые с физикой падают в кучу на дно контейнера, сталкиваются и отскакивают; выделенные слова… | [карточка](../components/react-bits/falling-text.md) |
| `react-bits/ferrofluid` | react-bits | Поверхность магнитной жидкости в наклонной перспективе: шипы растут над движущимися невидимыми магнитами; курсор — дополнительный магнит. | [карточка](../components/react-bits/ferrofluid.md) |
| `react-bits/flux-lines` | react-bits | Светящиеся линии потока с ярким ободком, текущие в заданном направлении, как силовые линии; клик закручивает вихрь. | [карточка](../components/react-bits/flux-lines.md) |
| `react-bits/fuzzy-text` | react-bits | Крупное слово на канвасе, дрожащее как плохой ТВ-сигнал: строки пикселей случайно смещаются по горизонтали/вертикали, опционально с RGB-р… | [карточка](../components/react-bits/fuzzy-text.md) |
| `react-bits/laser-flow` | react-bits | Вертикальный лазерный луч, падающий на поверхность (элемент по surfaceRef): вспышка в точке удара, разлив света, туман и пыль; опциональн… | [карточка](../components/react-bits/laser-flow.md) |
| `react-bits/lightning` | react-bits | Мерцающая молния (1–4 разряда) с ветвлением и свечением; клик вызывает отдельный удар. | [карточка](../components/react-bits/lightning.md) |
| `react-bits/magic-rings` | react-bits | Концентрические светящиеся кольца-портал: пульсируют по очереди, расходятся от центра или дышат; цвет от внутреннего к внешнему. | [карточка](../components/react-bits/magic-rings.md) |
| `react-bits/magnet-lines` | react-bits | Сетка коротких штрихов (линии, стрелки, стрелки компаса), поворачивающихся к точке-магниту, как опилки в магнитном поле; режимы orbit/att… | [карточка](../components/react-bits/magnet-lines.md) |
| `react-bits/ripple-grid` | react-bits | Сетка (линии, точки или кресты), по которой расходятся кольцевые волны — автоматически из центра или от кликов. | [карточка](../components/react-bits/ripple-grid.md) |
| `react-bits/shredder` | react-bits | Список карточек, которые затягиваются в шредер и выходят закручивающимися полосками, падающими вниз; стопка сдвигается; есть автопроигрыв… | [карточка](../components/react-bits/shredder.md) |
<!-- kb:end candidates -->

## Связанные паттерны

`sequence-steps`, `relationships`, `transformation`
