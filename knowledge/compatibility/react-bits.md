# React Bits — совместимость с Remotion

Репозиторий `templates/react-libriry/react-bits` (reactbits.dev,
`package.json`: `name: react-bits`, `private: true`, поля `license` нет).
Записи разбиты на срезы:

- `components/react-bits/capabilities-animations-backgrounds-micro.jsonl` —
  `src/content/Animations`, `Backgrounds`, `Micro` (этот файл описывает их);
- срез TextAnimations + Components — см. `compatibility/react-bits-text-components.md`.

## Лицензия и условия (`LICENSE.md`)

«MIT + Commons Clause License Condition v1.0», © 2026 David Haz.

- Разрешено использовать, копировать, изменять, публиковать и
  распространять **в составе приложения, сайта или продукта**, в том числе
  коммерчески; копирайт и текст лицензии сохранять.
- **Запрещено** продавать, сублицензировать или распространять **сами
  компоненты** — по одному, набором или в портированном виде. То же — для
  инструментов React Bits (Background Studio, Texture Lab, Shape Magic,
  Center Stage, Sound Lab) и звуков библиотеки; нельзя предлагать
  инструменты или их аналог как хостинг-сервис.
- Экспорт из инструментов (код, картинки, видео, звук) можно использовать в
  своих продуктах, но нельзя продавать/распространять экспорт сам по себе
  (паки фонов, текстур, шаблонов).

Для нас: отрендеренный ролик — продукт, это разрешено. Нельзя выкладывать
Remotion-порты компонентов отдельной библиотекой/набором шаблонов или
продавать их. Во всех записях поле `license` это отражает.

## Стек срезa

Компоненты переписаны «новым поколением» (2026): у большинства одна схема —
`settingsRef` с props, один `useEffect` со своим циклом
`requestAnimationFrame`, `ResizeObserver` + `IntersectionObserver`,
слушатели `pointermove/pointerdown` на `window`, учёт
`prefers-reduced-motion`, props `intro`, `paused`, `dpr`, `lightMode`,
`mouseInteraction`/`interactive`, дефолты которых сверяет
`scripts/checkPropDocs.js` с PropTable в демо.

| Механизм | Где |
|---|---|
| Сырой WebGL2 (`getContext('webgl2')`, свои шейдеры, без библиотек) | почти все Backgrounds; Animations: ElectricBorder, ShapeBlur, MetallicPaint, Cubes, ElasticMesh, HalftoneReveal, LaserFlow, Strands, MetaBalls |
| `ogl` | Backgrounds: PatternWaves, MicroSlats, EvilEye; Animations: DitherVeil, ElectricLogo, CrystalizedBall |
| `three` (императивно, `import * as THREE`, не R3F) | Backgrounds: Hyperspeed, ColorBends |
| `vgpu` (свой цикл `frame`, по именам API — WebGPU) | Backgrounds: ShapeWaves, AeroShards |
| Canvas 2D + rAF | ShapeGrid, StarBorder, PixelTransition, Noise, Shredder |
| DOM/SVG + rAF | GridMotion, LogoLoop, OrbitImages, PulseHeart |
| GSAP (+ScrollTrigger) | FadeContent, AnimatedContent |
| `motion/react` | StatusMark, ThoughtLine |
| CSS keyframes | LatticeLoader (клетки), shimmer в ThoughtLine |

Только **Aurora** принимает внешнее время (`time`); у остальных время живёт
внутри замыкания эффекта.

## Типовые адаптации (на них ссылаются карточки)

**R1 — сырой WebGL2 / OGL + rAF.**
1. Убрать rAF-цикл: время шейдера считать как
   `uTime = frame / fps * speed * k` (`k` — множитель из кода компонента,
   например `0.1` у Silk/Aurora) из `useCurrentFrame`/`useVideoConfig`.
2. Инициализацию контекста/программ/текстур — в `useEffect` с
   `delayRender()` → `continueRender()`; отрисовку `render()` вызывать в
   эффекте, зависящем от `frame` (у компонентов уже есть «эффект без
   зависимостей», который будит `render()` после каждого рендера — его и
   использовать).
3. `intro={false}` (или прогресс интро считать из кадра),
   `mouseInteraction/interactive={false}`, клики-эффекты выключить.
4. `ResizeObserver`/`clientWidth` заменить размерами из `useVideoConfig`;
   `dpr` задать явно (1–2), `IntersectionObserver` и `document.hidden`
   убрать (в headless вкладка может считаться скрытой).
5. Любой `Math.random` → `random(seed)` из `remotion`.
6. Рендер с `--gl=angle` (WebGL в headless Chrome). Для OGL то же самое:
   `program.uniforms.uTime.value = …; renderer.render({ scene })`.
7. Накопление между кадрами (`persistence`, послесвечение, след курсора,
   симуляции) — либо выключить, либо см. R3.

**R2 — three.js.** Либо перенести сцену в `ThreeCanvas` из
`@remotion/three` и крутить её от кадра, либо оставить императивный
`WebGLRenderer` и вызывать `renderer.render(scene, camera)` из эффекта с
`clock = frame / fps` (без `THREE.Clock`); `delayRender` на загрузку.

**R3 — Canvas 2D / накопительное состояние.** Рисовать кадр как функцию от
`frame`. Если состояние накапливается (пружины, физика, жидкость, затухание
следа) — фиксированный шаг и прогон симуляции от 0 до текущего кадра
(дорого, но детерминированно) или упрощение до формулы от времени.
`concurrency=1` порядок кадров не гарантирует детерминизм — не опираться.

**R4 — CSS `@keyframes`.** `animationDelay: -(frame / fps) + 's'` +
`animationPlayState: 'paused'` (с учётом собственных задержек элементов)
или замена на `interpolate`.

**R5 — GSAP / motion.** GSAP: таймлайн создать `paused: true` и
`tl.progress(frame / total)` в эффекте; надёжнее — переписать на
`interpolate`/`spring`. `motion`: значения `useMotionValue` считать из кадра,
`animate()` не вызывать.

**R6 — vgpu.** Свой цикл `frame` и WebGPU-бэкенд (по именам API, документации
в репозитории нет). Работоспособность в headless-рендере Remotion не
проверена; до проверки считать рискованным и предпочитать WebGL-аналоги.

Общее: картинки из демо/usage часто внешние (unsplash, picsum, wixmp) —
заменить на `staticFile` и ждать загрузки; шрифты для текстовых масок
(ShapeWaves, LetterGlitch, MetallicPaint, ElasticMesh, GradientASCII) —
`delayRender` до `document.fonts.ready`.

## Что вошло (88 записей)

- Backgrounds: 62 из 64 (61 `complex`, 1 `adaptable` — GridMotion).
- Animations: 21 из 38 (5 `adaptable`: FadeContent, AnimatedContent,
  GradualBlur, LogoLoop, OrbitImages; 16 `complex`).
- Micro: 5 из 35 (4 `adaptable`: PulseHeart, LatticeLoader, StatusMark,
  ThoughtLine; 1 `complex`: Shredder).

## Что пропущено и почему

**Backgrounds (2):** DotGrid, DotField — точки реагируют только на близость
курсора и клик (`proximity`, `shock*`, `cursorRadius`, `bulgeStrength`); без
указателя после интро — статичная сетка точек.

**Animations (17), смысл — в курсоре/hover/scroll/drag:** BlobCursor,
Magnet, Crosshair, SplashCursor, ClickSpark (искры по клику), ImageTrail,
PixelTrail, GlareHover (блик по hover; есть prop `mode`, другие режимы не
проверялись), TargetCursor, StickerPeel (отклеивание по hover/drag),
ScrollExpand (раскрытие по прокрутке; в принципе прогресс скролла можно
подменить кадром, но это переписывание), SwarmCursor, GhostCursor,
CursorGrid, GlowCursor, Ribbons (ленты тянутся за курсором), RippleDistortion
(кисть-рябь под курсором, `trigger = 'hover'`).

**Micro (30), UI-контролы без самостоятельной картинки:** SquishSwitch,
HoldButton, PeekRating, SpringCheck, RubberSegment, SlideCommit, WarmTooltip,
FuseButton, ScrubField, DodgeField, CodeSlots, WakeSlider, CometDial,
JellyRadio, SwipeRow, GlideSelect, CallChip, BellToggle, SlingButton,
FlyingButton, SwipeToast, PromptBar, SloshGauge, VoicePill, RefineFrame,
FolderFloat, BranchedMenu, FlipCard — переключатели, кнопки, поля, меню,
тосты: эффект возникает только от действия пользователя. Отдельно проверены
по коду: PaperCrumple (three.js, сминание по удержанию/перетаскиванию, авто-
режима нет) и TearTicket (`motion`, отрыв перетаскиванием, `onTear`) —
пропущены по той же причине. Остальные из этого списка оценены по названию
и usage-примеру, исходники построчно не читались.

## Чего не удалось выяснить

- Автоматическая проверка `python3 tools/kb.py check --repo react-bits` не
  запускалась: Bash в этой сессии запрещён для путей вне worktree и для
  запуска python. Пути сверены вручную (каждый файл открыт `Read`), поля —
  по схеме `knowledge/README.md`.
- Для большинства фонов props взяты из usage-примеров
  `src/constants/code/<Group>/*Code.js` и PropTable демо; полный JSX
  прочитан у Aurora, Silk, ShapeGrid, GridMotion, FadeContent и частично у
  остальных (импорты, шейдеры, сигнатуры). Наличие отдельных флагов
  (`user-events` у Beams/WebThreads/CRTWarp, `Math.random` в Particles и
  искрах StarBorder, механизм смены кадров у Noise, отрисовка PixelSwap)
  построчно не сверено — помечено в карточках.
- Поведение `vgpu` в headless Chrome и необходимость
  `preserveDrawingBuffer` для снимка WebGL-канваса — не проверялись
  (рендера не было, `verification = static-review`).
- Список папок `src/content/<Group>` получен из `src/constants/Components.js`
  (каталоги не листинговались, поэтому лишние папки без записи в карте
  могли остаться незамеченными); у `masked-heading` из карты animations
  демо лежит в `src/demo/TextAnimations` — отнесён к текстовому срезу и
  здесь не описан; `LogoLoop` лежит в `src/content/Animations`, хотя в карте
  указан среди textAnimations, — описан здесь.
