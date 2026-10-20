# Magic UI — совместимость с Remotion

Репозиторий `templates/react-libriry/magicui` (монорепо pnpm/turbo,
сайт-документация `apps/www` на Next.js). Лицензия **MIT**
(`LICENSE.md`, «Copyright (c) Magic UI»; бейдж MIT в `README.md`).
Ограничений нет, при копировании кода сохранять уведомление MIT.

## Где что лежит

- Исходники компонентов: `apps/www/registry/magicui/<slug>.tsx`.
- Актуальный реестр: `apps/www/registry/registry-ui.ts` (78 элементов
  `registry:ui`); там же `cssVars`/`css` — **все `@keyframes`** компонентов
  (Tailwind v4, `animate-*` в теме). Ссылки на keyframes в карточках
  ведут на этот файл.
- Корневой `registry.json` (75 `registry:ui`, 133 `registry:example`)
  **устарел** относительно исходников: в нём есть `iphone-15-pro`,
  `arc-timeline`, `grid-beams`, `box-reveal`, `flip-text`,
  `script-copy-btn`, `scratch-to-reveal`, которых нет в
  `apps/www/registry/magicui/` (проверено чтением путей), и нет 11
  новых: `noise-texture`, `hexagon-pattern`, `glare-hover`,
  `dia-text-reveal`, `iphone`, `light-rays`, `dotted-map`, `backlight`,
  `kinetic-text`, `text-3d-flip`, `floating-3d-particles`. База
  построена по `registry-ui.ts` и реальным файлам.
- Примеры: `apps/www/registry/example/*.tsx` (`<slug>-demo.tsx` и
  варианты); доки: `apps/www/content/docs/components/<slug>.mdx`
  (у `client-tweet-card` своей страницы нет — описан в `tweet-card.mdx`).
- `skills/magic-ui/` — skill для агентов (`SKILL.md` + `references/`),
  записан как `magicui/magic-ui-skill` (`kind: doc`).

## Общий стек анимации

React 19 + Tailwind v4 + `motion` (`motion/react`), `cn` из
`@/lib/utils`, тема shadcn (CSS-переменные `--foreground`, `--border`,
`--background`…, `next-themes` в `magic-card`/`code-comparison`). Ни
один компонент не использует `remotion`. Механизмы:

| Механизм | Компоненты |
|---|---|
| CSS `@keyframes` из `registry-ui.ts` | aurora-text, animated-shiny-text, animated-gradient-text, line-shadow-text (на `::after`), meteors, ripple, orbiting-circles, marquee, shine-border, neon-gradient-card (на `::before/::after`), typing-animation (курсор), retro-grid (fallback) |
| `motion` — вход/variants/`repeat: Infinity` | text-animate, blur-fade, comic-text, spinning-text, word-rotate, sparkles-text, warp-background, light-rays, dot-pattern (glow), animated-grid-pattern, border-beam, animated-beam, animated-list, terminal |
| `motion` + `useInView`/`useScroll`/pointer | number-ticker, dia-text-reveal, text-reveal, scroll-based-velocity, magic-card, dock, text-3d-flip, highlighter |
| `setTimeout`/`setInterval` | word-rotate, typing-animation, sparkles-text, terminal, pixel-image, animated-list |
| rAF без canvas | morphing-text, hyper-text, scroll-based-velocity (`useAnimationFrame`) |
| Canvas 2D + rAF | particles, flickering-grid, glyph-matrix, floating-3d-particles, icon-cloud |
| WebGL | globe (`cobe`), retro-grid (свой шейдер) |
| Сторонний движок | confetti (`canvas-confetti`), highlighter (`rough-notation`), code-comparison (`shiki`, async), tweet-card (`react-tweet`, сеть), dotted-map (`svg-dotted-map` + SMIL) |
| Статичный SVG/CSS | grid/hexagon/striped/noise-pattern, progressive-blur, backlight, avatar-circles, bento-grid, android, iphone, safari, video-text |

## Как классифицировано

- **adaptable** — разметка/стили остаются, меняется только источник
  времени. Сюда же отнесены компоненты на таймерах/rAF, если состояние —
  **чистая функция прошедшего времени** (morphing-text, hyper-text,
  typing-animation, word-rotate): перевод на кадр — несколько строк.
- **complex** — накапливаемое случайное состояние в rAF (particles,
  flickering-grid, glyph-matrix, floating-3d-particles, icon-cloud),
  WebGL с собственным циклом (globe, retro-grid), сторонний движок
  со своим временем (confetti, highlighter).
- **unsuitable** — только `magic-ui-skill` (документ); интерактивные
  контролы не заводились записями (см. ниже).
- Статичные компоненты без анимации — `adaptable` с «адаптации не
  нужны» (`native` зарезервирован за кодом на `useCurrentFrame`).

## Типовые адаптации для этой библиотеки

1. **CSS keyframes** — на элемент `animationDelay: \`${delay -
   frame/fps}s\`` + `animationPlayState: 'paused'`; длительности берутся
   из `registry-ui.ts`. Если анимация висит на псевдоэлементе
   (`line-shadow-text`, `neon-gradient-card`, `glare-hover`), inline-стиль
   туда не достаёт — заменить псевдоэлемент реальным `div`/`span`.
   Учесть `alternate` (период ×2) и `motion-safe:` (`shine-border`).
2. **`motion`** — `motion.*` → обычный тег, значения из
   `interpolate`/`spring()` от `useCurrentFrame()`; `repeat: Infinity` →
   фаза `(t % duration)/duration`; `AnimatePresence`/`layout` убрать и
   считать позиции вручную; `useInView`/`whileInView`/`useScroll` —
   заменить прогрессом из кадра.
3. **`Math.random()`** (meteors, warp-background, light-rays,
   sparkles-text, dot-pattern, animated-grid-pattern, pixel-image,
   hyper-text) → `random(seed)` из `remotion`, причём **синхронно**, а не
   в `useEffect` (иначе первый кадр пуст, а при каждом рендере кадра —
   новые значения).
4. **Измерения DOM** (`getBoundingClientRect`, `ResizeObserver`,
   `window.innerWidth`, `offsetWidth`) — размеры из `useVideoConfig()`
   или явные числа; если без измерения никак (`animated-beam`,
   ширина текста) — один раз в `useLayoutEffect` под `delayRender`.
5. **Медиа** — `<img>`/`<video autoPlay>` → `<Img>`/`<OffthreadVideo>`
   со `staticFile`; внешние URL демо (`cdn.magicui.design`,
   `avatar.vercel.sh`) скачать в `public/`.
6. **Canvas** — рисовать в `useEffect([frame])`, состояние частиц
   выводить в замкнутой форме от кадра.
7. **Шрифты** — `comic-text` (Bangers), `kinetic-text` (variable font),
   маски `video-text` — загрузить заранее (`@remotion/google-fonts`).
8. **Tailwind v4** — компоненты используют синтаксис v4 (`bg-size-[…]`,
   `from-(--var)`, `mask-[…]`, container queries `cq*`); в Remotion-проекте
   нужен Tailwind v4 (`@remotion/tailwind-v4`) или ручной перевод
   классов в style. `offset-path: rect()` (`border-beam`) — проверить в
   версии Chrome рендера.

## Что пропущено и почему

Интерактивные контролы (смысл — во взаимодействии, самостоятельной
картинки в видео не дают), есть в `registry-ui.ts` и в исходниках:
`shimmer-button`, `shiny-button`, `rainbow-button`, `pulsating-button`,
`ripple-button`, `interactive-hover-button` — кнопки/CTA (эффект живёт
на кнопке); `cool-mode` — частицы по клику; `smooth-cursor`, `pointer` —
кастомные курсоры по движению мыши; `lens` — лупа под курсором;
`scroll-progress` — индикатор прокрутки страницы; `animated-theme-toggler`
— переключатель темы через View Transitions; `hero-video-dialog` —
превью видео с модальным плеером.

Есть только в корневом `registry.json`, исходников нет (записать
нельзя — путей не существует): `script-copy-btn`, `scratch-to-reveal`
(интерактивные), `box-reveal`, `flip-text`, `arc-timeline`, `grid-beams`,
`iphone-15-pro` (заменён `iphone`). `animated-subscribe-button.tsx` лежит
в исходниках, но не зарегистрирован в `registry-ui.ts`; это кнопка —
пропущена как контрол.

`file-tree` из списка контролов **включён**: статичное раскрытое
дерево — самостоятельная картинка «структура проекта».

Примеры (`registry:example`) отдельными записями не заводились, кроме
`marquee-3d` (визуально иная сцена — 3D-стена отзывов); остальные демо
указаны в `docs` карточек, где проверены.

## Чего не удалось выяснить

- Рендер в Remotion не делался (`verification: static-review`).
- Внутренняя анимация `rough-notation` и `canvas-confetti`, работа
  `cobe` в headless Chrome — исходников пакетов в репозитории нет
  (`node_modules` отсутствует), описано по коду обёрток.
- Поддержка WebGL (globe, retro-grid) и `offset-path: rect()`
  (border-beam) в конкретной сборке Chrome для рендера не проверялась.
- Полный список `apps/www/registry/example/` не просматривался (Bash
  вне worktree недоступен); в `docs` указаны только примеры, чьё
  существование подтверждено чтением файла.
- `python3 tools/kb.py check --repo magicui` в этой сессии не
  запускался (Bash ограничен); пути и поля сверены вручную.
