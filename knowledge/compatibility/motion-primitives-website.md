# motion-primitives-website (itsjwill) — совместимость с Remotion

Репозиторий `templates/react-libriry/motion-primitives-website` — сайт-
витрина «155+ компонентов» (Next.js 16, React 19, Tailwind 3,
framer-motion 11, GSAP 3.12, three 0.164 + R3F 8 / drei 9, Spline, Lenis).
Не путать с `motion-primitives` (ibelick): общего кода нет, совпадает
только имя и домен в `package.json` (`homepage: motion-primitives.dev`).

## Лицензия

- `package.json`: `"license": "MIT"`, `author: itsjwill`; README —
  бейдж и раздел «MIT — use however you want».
- **Файла лицензии нет**: проверены `LICENSE`, `LICENSE.md`,
  `LICENSE.txt`, `LICENCE` в корне — не найдены (полный листинг каталога
  сделать не удалось, см. ниже). Формально MIT заявлен только
  метаданными; текста с копирайтом нет.
- Происхождение части дизайнов: README называет источники вдохновения
  Aceternity UI, Magic UI, 21st.dev, Hover.dev; в коде прямо помечены
  `Lamp` («Aceternity lamp effect»), `AnimatedBeam` («inspired by
  magicui»), `AuroraBackground`/`Spotlight` (повторяют Aceternity).
  Код написан заново, но при коммерческом использовании стоит учитывать
  риск заимствований (Aceternity UI Pro — не MIT).

## Общий стек анимации и типовые адаптации

- **framer-motion** (`initial/animate/whileInView/AnimatePresence`,
  `useSpring`): вход по кадру через `interpolate`/`spring()`; `whileInView`
  и `useInView` удалить.
- **Tailwind keyframes** из `tailwind.config.ts` (`aurora`, `meteor`,
  `shimmer`, `spotlight`, `gradient`, `marquee*`, `animate-pulse`) и
  `<style jsx>`-keyframes (`orbit`, `border-beam-travel`, `shimmer-spin`):
  считать фазу от кадра или отрицательный `animationDelay` + `paused`.
  `styled-jsx` есть только в Next.js.
- **GSAP + ScrollTrigger** (text-reveal, svg/animated-svg): почти везде
  это простые tween'ы — переписываются на `interpolate`; триггер скролла
  заменить кадром; `strokeDasharray` через `pathLength={1}` без
  `getTotalLength`.
- **rAF / таймеры / `Math.random`**: замкнутые формулы от `frame` и
  `random(seed)` из remotion; `lib/utils.random` = `Math.random`.
- **R3F/three** (shader-backgrounds, three/*): `ThreeCanvas` из
  `@remotion/three`, `uTime`/вращение = `frame/fps`; drei `Float`,
  `MeshDistortMaterial`, `OrbitControls autoRotate`, `Environment preset`
  (HDR с CDN) — заменить.
- **CSS-переменные темы** (`hsl(var(--primary))`, `bg-surface`,
  `border-border`, `text-foreground`, `useTheme().direction`) — в Remotion
  их нет: задавать цвета явно.

## Записи (91)

- adaptable — 74;
- complex — 17: svg-circuit-board, particles, sparkles, 6 шейдерных фонов
  (noise-gradient, liquid-metal, wave-distortion, plasma, organic-blob,
  glitch), mesh-gradient, film-grain, animated-beam, globe,
  floating-shapes, neural-network, particle-morph, noise-transition;
- native / unsuitable / unknown — 0 (интерактив не записывался, см.
  ниже).

Покрытые файлы: `text/*` (4 файла), `chat/animated-chat.tsx`,
`svg/animated-svg.tsx`, `backgrounds/*` из `index.ts` (8 файлов),
`interactive/{morphing-text, number-ticker, animated-counter, orbit,
border-beam, lamp, marquee, progress, animated-beam, confetti,
wavy-background}.tsx`, `three/{globe, floating-shapes, neural-network,
particle-morph}.tsx`, `transitions/{preloader, noise-transition,
page-transition}.tsx`.

## Что пропущено как интерактив (код прочитан)

- `SpringText` (`text/premium-text.tsx`) — смысл в отталкивании букв от
  курсора (`mousemove` на window).
- `ChatInput`, `MessageReaction` (`chat/animated-chat.tsx`) — textarea и
  кнопки-реакции (hover/tap/click); в кадре можно нарисовать статично.
- `ConfettiButton` (`interactive/confetti.tsx`) — взрыв по клику; для
  видео есть `celebration-confetti`.
- `BeamCircle` (`interactive/animated-beam.tsx`) — статичный кружок-узел,
  упомянут в карточке `animated-beam`.
- `DotPattern` из `interactive/wavy-background.tsx` — статичный
  SVG-паттерн, дублирует `dot-pattern` из `premium-backgrounds`.
- `TransitionProvider`, `TransitionLink`, `usePageTransition`
  (`transitions/page-transition.tsx`) — завязаны на `next/navigation`
  (`usePathname`, `useRouter`); их 6 вариантов оверлея (fade, slide,
  curtain, reveal-circle, morph, blocks) — готовый рецепт переходов для
  `@remotion/transitions`.
- `PreloaderProvider`, `usePreloader`, `Skeleton`, `SkeletonText`,
  `SkeletonCard` (`transitions/preloader.tsx`) — провайдер с симуляцией
  загрузки и скелетоны; `ImageLoad` из того же файла не прочитан.

## Что не разобрано в этом проходе (код не читался)

Объём витрины (~200 экспортов) не позволил прочитать всё за один проход.
Класс не присваивался, записи не создавались:

- `effects/*`: `magnetic-button.tsx` (17 кнопок), `custom-cursor.tsx`
  (9 курсоров), `animated-input.tsx`, `theme-toggle.tsx` — по названиям
  интерактив (кнопки/курсоры/инпуты), вероятно пропуск; **но**
  `media-reveal.tsx` (`KenBurnsImage`, `ImageReveal`, `VideoReveal`,
  `ImageComparison`, `MediaGallery`, `ParallaxImage`, `DistortionImage`,
  `ScrollVideo`) и `premium-effects.tsx` (`LiquidGlass`, `SpotlightCard`,
  `AnimatedBeam`, `CursorReveal`, `ProgressiveBlur`) — видео-полезные,
  первыми в очередь на следующий проход. Файлы `audio-reactive`,
  `fluid-cursor`, `magnetic-gallery`, `reveal-on-hover`,
  `text-distortion` упомянуты в `component-registry.ts`, существование
  не проверено.
- `cards/*` (`tilt-card`, `glow-card` с `BorderBeam`/`BeamCard`/
  `EvervaultCard`, `bento-grid` с 9 экспортами, `hover-card`) и
  `stack-cards`, `feature-showcase`, `living-system` (`LivingSystem`,
  `NeuralWeb`, `SynapseCard`) из реестра — bento/stats/living-system
  полезны для видео.
- `layout/*` (`hero-sections` ×5, `sections` ×8, `premium-layouts`:
  `MasonryGrid`, `Timeline`, `HorizontalTimeline`, `SplitLayout` и др.) —
  прочитано только начало `premium-layouts.tsx`; `Timeline` важен для
  паттерна `timeline`.
- `scroll/*` (`infinite-scroll` ×4, `parallax-scroll` ×5,
  `scroll-animations` ×8, `gsap-scroll` ×11, `scroll-orchestrator` ×7) —
  в основном scroll-driven (вероятно unsuitable/адаптация «прогресс
  скролла → кадр»); `InfiniteScroll`/`LogoScroll`, `CounterAnimation`,
  `TextRevealScrub`, `ClipPathReveal` стоит разобрать.
- `interactive/`: `dock`, `magnetic`, `ripple`, `animated-tabs`,
  `spotlight-card` (×3), `liquid-glass` (×3), `scroll-reveal` (×3),
  `modal`, `toast`, `drawer`, `accordion`, `tooltip`, `skeleton`,
  `command-palette`, `switch`, `swipe-cards`, `sortable-list` — по
  `index.ts` и реестру это интерактивные контролы (пропуск по
  протоколу), `scroll-reveal` и `liquid-glass` — кандидаты на
  адаптацию.
- `three/scroll-progress-3d.tsx`, `backgrounds/gradient-mesh.tsx`,
  `backgrounds/infinite-grid.tsx` — есть в реестре, но не в `index.ts`;
  существование не проверено.
- `buttons/premium-buttons.tsx` (10 кнопок: shader, ink, cloth, portal,
  swarm…), `navigation/*`, `core/*` (direction picker, smooth scroll),
  `ui/splite` (`SplineScene` — грузит сцену с `prod.spline.design`,
  external-service), `templates/*`, `seo/*`, `hooks/*` — интерактив,
  инфраструктура или сетевые зависимости.
- Демо-страницы `src/app/**` не читались — поле `docs` у большинства
  записей пустое или ссылается на `src/lib/component-registry.ts`
  (там есть записи не для всех компонентов, и props в реестре местами
  расходятся с кодом).

## Чего не удалось выяснить

- Рендер в Remotion не делался (`verification: static-review`).
- В сессии Bash `ls`/`find` по `templates/` был отклонён (режим
  dontAsk), Glob недоступен — файлы находились через `index.ts`,
  `component-registry.ts` и README; каждый путь в записях подтверждён
  успешным чтением файла, но полный состав каталогов и наличие файла
  лицензии под другими именами не проверены.
- `bg-gradient-conic` (используется в `Lamp`) и `perspective-1000`
  (`FlipText`) не найдены в `tailwind.config.ts` — вероятно, классы не
  генерируются; подтвердить можно только рендером.
- Работа `useTheme` (`@/lib/theme`) вне провайдера сайта для
  `particle-morph` не проверялась.
