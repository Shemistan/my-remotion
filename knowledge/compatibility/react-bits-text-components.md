# react-bits (срез Text Animations + Components) — совместимость с Remotion

Репозиторий `templates/react-libriry/react-bits` (React Bits, David Haz,
https://reactbits.dev). Срез: `src/content/TextAnimations/*` (33) и
`src/content/Components/*` (48). Записи — в
`components/react-bits/capabilities-text-components.jsonl` (66 шт.).
Animations/Backgrounds/Micro описаны в `compatibility/react-bits.md`.

## Лицензия

`LICENSE.md`: **MIT + Commons Clause License Condition v1.0**, © 2026 David Haz.
Использовать, менять и публиковать можно, в том числе коммерчески, но только
**в составе приложения, сайта или продукта**. Commons Clause запрещает
продавать, сублицензировать и распространять сами компоненты: по одному,
набором или портированными (например, как пакет Remotion-компонентов).
Видео, отрендеренное с компонентами, — это продукт, ограничения на него не
распространяются. Публиковать адаптированный исходник отдельной библиотекой
или шаблоном нельзя. Копирайт-уведомление сохранять в копиях кода.

## Устройство

- Каждый компонент лежит в 4 вариантах: `src/content/<Group>/<Name>/<Name>.jsx`
  (+ `.css`), `src/tailwind/…`, `src/ts-default/…/<Name>.tsx`,
  `src/ts-tailwind/…`. Демо — `src/demo/<Group>/<Name>Demo.jsx`, описания и
  docsUrl — `src/constants/Information.js`, список — `src/constants/Components.js`.
- Все компоненты недавно (2026-10) переписаны: много props, тёмная и светлая
  темы, `prefers-reduced-motion`, режимы `trigger` (load/view/hover/click/loop).

## Общий стек анимации

- В основном **свой цикл rAF** с самописными пружинами и сглаживанием.
  Результат пишется в `style` через ref. Внешние движки: `gsap` (SplitText,
  TextType, Shuffle, ScrambledText, ScrollReveal/Float, StrokeText, FoldText, TextLoop,
  MaskedHeading, DepthCarousel, AccordionGallery, MorphSlider), `motion`
  (BlurText, CountUp, RotatingText, CircularText, TrueFocus, ScrollVelocity,
  Stack), `matter-js` (FallingText), `ogl` (WarpText, FlexCarousel,
  MorphSlider), `three`/R3F (Lanyard, ModelViewer). Много сырого WebGL2 без
  библиотек (ASCIIText, DecayCard, FlyingPosters, CircularGallery, HoloCard,
  GlassIcons, FluidGlass, ReflectiveCard).
- Почти везде: `IntersectionObserver` (старт или пауза вне экрана),
  `ResizeObserver`, DOM-измерения, ожидание `document.fonts`.
- Сильная сторона: у многих компонентов картинка — **чистая функция
  времени или прогресса** (`gradient(pos)`, `render(t)`, `layout(pos)`,
  `pose()`, `slot()`, `paintPiece`). Поэтому большая часть записей — `adaptable`.

## Принцип классификации в срезе

- Цикл rAF или таймер только считает картинку от прошедшего времени →
  `adaptable`: время берётся из `frame/fps`, разметка и стили остаются
  (флаги `raf`/`timers` всё равно стоят).
- Состояние накапливается (физика, пружины от курсора, сглаживание следа),
  нужна императивная перестройка DOM или есть WebGL/canvas-цикл → `complex`.
- Смысл только в курсоре или скролле, авто-режима нет → `unsuitable`. Если
  есть режим autoplay, idle, intro или ambient, класс ставится по нему.

Итог: **adaptable 41, complex 23, unsuitable 2** (66).

## Типовые адаптации для React Bits

1. Отключить триггеры: `trigger='load'`/`mount`, убрать
   `IntersectionObserver`/`ScrollTrigger`, hover/drag/wheel-обработчики.
2. Перенести тело rAF-функции в рендер: `t = frame / fps`, стили считать
   инлайн, а не через `ref.style`.
3. Пружины на rAF заменить на `spring({frame, fps, config})`, stagger — на
   сдвиг `frame - i*staggerFrames`.
4. `Math.random` (стартовые фазы, глифы, порядок) → `random(seed)` из remotion.
5. Метрики (ширины глифов, `getTotalLength`, прямоугольники слов) снимать один
   раз после загрузки шрифта под `delayRender`. Шрифты Google
   (Roboto Flex, Figtree) — через `@remotion/google-fonts`.
6. Картинки по умолчанию с Unsplash/picsum → `Img` + `staticFile`; видео →
   `OffthreadVideo`.
7. WebGL: `uTime ← frame/fps`, `draw()` в `useEffect` на каждый кадр,
   текстуры под `delayRender`, рендер с `--gl=angle`; R3F → `@remotion/three`.
8. CSS `@keyframes` (SplitFlapText, MagicBento): `animationPlayState: 'paused'` +
   отрицательный `animationDelay` из кадра.

## Пропущено (интерактивные контролы, Components)

`Dock` (док с увеличением по hover и контекстным меню), `BubbleMenu`
(выпадающее меню), `CardNav`, `GooeyNav`, `PillNav`, `StaggeredMenu`
(навигация и меню), `LineSidebar` (боковая навигация с эффектом близости
курсора), `ElasticSlider` (слайдер-инпут), `CurvedInput` (поле ввода),
`OptionWheel` (пикер по скроллу или drag), `Folder` (папка, открываемая по
клику), `FlowingMenu` (меню с hover-маркизой), `InfiniteMenu` (сфера-меню,
вращаемая drag), `SpecularButton` (кнопка), `Stepper` (многошаговая форма с
кнопками Back/Next). Причина у всех одна: смысл компонента во взаимодействии,
в ролике получится только статичная картинка. Пропущено 15 из 48. Причины
взяты из описаний в `Information.js`, код просмотрен только у `Stepper`.

## Чего не удалось выяснить

- Автоматическая проверка `tools/kb.py check --repo react-bits` в этой сессии
  не запускалась, рендера не было. Все записи — `static-review`.
- Часть больших файлов прочитана частично: Lanyard, ModelViewer, FluidGlass,
  Masonry, MagicBento, ScrollStack, GlassSurface, DomeGallery, ReflectiveCard,
  FlyingPosters, FlexCarousel, MorphSlider. В карточках это помечено.
- Единицы `speed` в drift-режиме CircularCarousel, точные keyframes MagicBento,
  наличие `getUserMedia` в ReflectiveCard, полный список `order` в FallingText
  и `staggerFrom` в FoldText не сверены.
- В `Information.js` у MaskedHeading упомянута «drifting colour mesh», но в коде
  её нет: есть только `mediaType` image|video.
- Рецепт `timeline.progress()` для ScrollFloat и `mask-composite`/`plus-lighter`
  в BorderGlow нужно проверить рендером.
