# Animata — совместимость с Remotion

Репозиторий `templates/react-libriry/animata` (сайт animata.design на
Next.js 16, commit `e7478b8`). Лицензия **MIT** (`LICENSE.md`,
«Copyright (c) Animata»); при копировании кода сохранять уведомление MIT.
Сам код ограничений не несёт, но **медиа в дефолтах — нет**: фото с
Unsplash по URL, аватар персонажа с `ign.com` (`widget/profile`), логотип
Air Canada с `seeklogo.com` (`widget/flight-widget`), файлы
`public/jumping-man.png` и `public/widget/music.jpg` без указанной
лицензии. В ролик — только свои ассеты через `staticFile`.

## Где что лежит

- Компоненты: `animata/<group>/<name>.tsx`, рядом `<name>.stories.tsx`
  (Storybook 10 — по сути пример использования) и иногда `<name>.css` с
  локальными `@keyframes`.
- Документация: `content/docs/<group>/<name>.mdx` (velite); индекс группы
  `content/docs/<group>/index.mdx`. Опубликованность — флаг в frontmatter
  (`lib/published-docs.ts`): у части компонентов (например, 4 виджета ниже)
  mdx есть, но в каталоге сайта они скрыты.
- Демо-сцены целиком: `app/demo/library/<group>/<item>.tsx` (hero,
  footer, browse, scroll) — полноэкранные композиции из нескольких
  компонентов; отдельными записями не заводились.
- Docs группы `feature-cards` частично ссылаются на исходники в
  `animata/card/` (score-card, subscribe-card, survey-card, swap-card,
  tilted-card, reminder-scheduler, notify-user-info) — это срез card.
- База разбита на срезы: `capabilities-visual-rest.jsonl` (background,
  bento-grid, container, image, list, widget, feature-cards, carousel,
  scroll, section, icon, overlay) и часть другого исследователя (text,
  graphs, progress, hero, card).

## Общий стек анимации

React 19 + **Tailwind v4.3** (`@tailwindcss/postcss`) + `tw-animate-css`
(`animate-in/out`, `slide-out-to-*`, `zoom-in`, `repeat-infinite`,
`direction-*`) + `motion` (`motion/react`) + `lucide-react`; `cn` из
`@/lib/utils` (clsx + tailwind-merge). Цвета — тема shadcn через
CSS-переменные (`--background`, `--foreground`, `--muted`, `--border`,
`--card`, `--accent`…) из `styles/globals.css`. Ни один компонент не
использует `remotion`.

**Где объявлены Tailwind keyframes.** Глобально — в
`styles/globals.css` внутри `@theme`: токены `--animate-*`
(`pop-blob`, `bg-position`, `marquee-horizontal/vertical`, `fadeIn`,
`blink-red`, `sparkle`, `meteor`, `led`, `float`, `rotate-full`, `fill`,
`flip-words`, `accordion-*`, `cg-*`, `section-reveal`) и сами
`@keyframes` (плюс `orbit-move`, `counter-rotate`, `orbit-indexes`,
`glitch`, `twinkle`, `reveal-up/down`, `shape-shift`, `swing`,
`content-blur` в `@layer utilities`/`@theme`). Там же easing-токены
(`--ease-slow`, `--ease-glide`, `--ease-overshoot`, `--ease-apple`…),
`--transition-duration-mid: 3s`, `--transition-duration-long: 10s`,
утилиты `bg-striped`, `bg-custom-gradient`, тени `shadow-glow`/`glow2`.
Локально — в `<name>.css` рядом с компонентом (`background/animated-beam.css`
`meteor`, `background/shooting-stars.css`, `container/marquee.css`,
`container/animated-border-trail.css` с `@property`, `scroll/*.css`,
`feature-cards/content-scan.css`, `text/*.css`). `animate-ping`,
`animate-pulse` — встроенные Tailwind.

| Механизм | Компоненты среза visual-rest |
|---|---|
| Статичная разметка (CSS-фон/сетка) | diagonal-lines, dot, grid, zigzag, fibonacci-lines, bento-four…eleven, calendar-event, notes, reminder, weather-card, storage-status, storage-widget |
| Глобальные/локальные CSS keyframes | animated-beam, blurry-blob, moving-gradient, marquee, announcement-ribbon, animated-border-trail, orbiting-items, security-alert, study-timer, icon-ripple, music-widget, disclose-image, image-carousel |
| `motion` только на входе | confirmation-message, images-reveal |
| `motion` + интеракция/layout | animated-dock, transaction-list, transition-list, fund-widget, pricing, aperture-reveal (`useScroll`) |
| hover/click + CSS transition | tilted-cover, photo-booth, avatar-list, flipping-cards, menu-animation, reveal-image, alarm-clock, vpn-widget, water-tracker, reminder-widget, shopping-list, mobile-detail, profile, expense-tracker |
| Таймер-хак 250 мс + transition (`graphs/donut-chart`, `bar-chart`, `progress`) | battery-level, calorie-counter, score-board, sleep-tracker, cycling, bento-eight |
| `setInterval`/`setTimeout` как состояние | orbiting-items-3-d, transition-list, direction-card, expandable, content-scan, live-score, clock-with-photo, flight-widget |
| rAF + Canvas / DOM-измерения | boids-ecosystem (canvas), shooting-stars, stacked-sections, content-scan |
| SVG SMIL `<animate>` | weekly-progress |

## Как классифицировано

- **adaptable** — разметка и стили остаются, меняется только источник
  времени/состояния. Сюда же статичные компоненты («адаптации не нужны»;
  `native` зарезервирован за кодом на `useCurrentFrame`) и виджеты, где
  таймер обновляет лишь **данные** (часы, дата) или делает одноразовый
  «старт» CSS-перехода по монтированию.
- **complex** — таймеры/rAF являются самой анимацией (orbiting-items-3-d,
  transition-list, direction-card, expandable), накопительная случайная
  симуляция (boids-ecosystem, shooting-stars), DOM-измерения в цикле
  (content-scan), композиция из нескольких таймерных детей (bento-eight),
  мышь как вход анимации (animated-dock), скролл-прогресс (aperture-reveal —
  но сводится к одному прогрессу и переводится легко).
- **unsuitable** — interactive-grid (подсветка только от hover),
  stacked-sections (sticky + scroll).
- Виджеты (`category: ui-mockups`) ценны как mockup-и интерфейсов: почти
  все дают картинку без интеракции.

## Типовые адаптации для этой библиотеки

1. **Tailwind v4 в проекте Remotion** (`@remotion/tailwind-v4`) и копия
   нужных токенов/keyframes из `styles/globals.css` (`@theme`) и CSS-
   переменных темы (`:root`/`.dark`). Без них `bg-background`,
   `text-muted-foreground`, `animate-*`, `ease-slow`, `duration-mid`
   не работают. Брейкпоинты `sm:/md:` в кадре 1920×1080 активны.
2. **CSS keyframes** — `animationDelay: -(frame/fps)s` +
   `animationPlayState: 'paused'` либо замена на inline transform из
   `interpolate`; учесть `alternate` (период ×2).
3. **`motion`** — `motion.*` → обычный тег, значения из
   `interpolate`/`spring()`; `layoutId`/`AnimatePresence` воспроизвести
   вручную (две фазы + cross-fade) — в Remotion не сработают.
4. **Хак `setTimeout(250)` + `transition`** в `graphs/donut-chart`,
   `bar-chart`, `progress` — в копии компонента сразу использовать
   значение, а прогресс (0→1) подавать из кадра.
5. **Hover-состояния** (`group-hover/*`) → проп «активен/прогресс» из
   кадра, inline-стили вместо классов-переходов.
6. **Недетерминизм**: `new Date()` (calendar-event, expense-tracker,
   flight-widget, clock-with-photo), `Math.random` (live-score,
   interactive-grid, shooting-stars, boids) → props или `random(seed)`.
7. **Медиа**: `<img>` → `<Img>`/`staticFile`; `absoluteUrl("/…")` и
   внешние URL скачать и заменить своими; `next/link` → `span`/`div`.
8. **Шрифты**: сайт использует свои (`--font-display`, Paper Mono);
   задать шрифт сцены явно.

## Слаги

`slug` = имя файла. Для `bento-grid/*` добавлен префикс `bento-`
(`bento-four`, `bento-gradient`…), т.к. имена `four`/`gradient`
неинформативны и конфликтовали бы по смыслу с `moving-gradient`.

## Что пропущено и почему

Группы интерактивных/служебных контролов (не описывались по одному):

- `button` (ai-button, algolia-blue-button, algolia-white-button,
  animated-follow-button, arrow-button, duolingo, external-link-button,
  get-started-button, ripple-button, shining-button, slide-arrow-button,
  status-button, swipe-button, toggle-switch, work-button) — кнопки и
  тумблеры, эффект живёт в hover/click.
- `fabs` (flower-menu, speed-dial) — плавающие кнопки-меню, раскрытие
  по клику.
- `accordion` (faq) — раскрывающийся FAQ, смысл в клике.
- `tabs` (fluid-tabs, gooey-tabs, shift-tabs, shared.ts) — переключатели
  вкладок.
- `skeleton` (category-glyphs, category-skeleton, code, cookie-banner,
  list, receipt, report, wide-card) — плейсхолдеры загрузки; `report` и
  `wide-card` использованы внутри `bento-eight`. Как самостоятельная
  картинка не рассматривались (исходники не читались).
- `preloader` (split-reveal с подкаталогом, vertical-tiles) — оверлеи
  загрузки страницы, завязаны на загрузку изображений/скролл-блокировку.
  `vertical-tiles` по описанию — шторка из тайлов, потенциальный переход;
  исходник не читался, точечно не включён.

Отдельные компоненты групп среза:

- `container/cursor-tracker` — элемент следует за курсором.
- `container/nav-tabs` — табы по клику (motion layoutId).
- `container/sibling-focus-nav` — затемнение соседних ссылок при
  hover/focus, чистый CSS.
- `image/trailing-image` — шлейф картинок за курсором.
- `image/skew-image`, `image/zoom-image`, `image/image-box-shadow` —
  hover-эффект одной картинки (clip-path/scale/shadow), статика — просто
  фото.
- `icon/hover-interaction` — иконка появляется над словом по hover.
- `overlay/modal` — модальное окно по клику.
- `widget/calendar-widget`, `widget/music-stack-interaction`,
  `widget/team-clock`, `widget/video-chat` — сняты с публикации в
  каталоге (changelog 2026-06, «oversized widgets»), интерактивные
  (выбор даты со скроллом, переключение grid/3D-карусели, часовой
  пояс по hover, управление звонком; video-chat импортирует
  `@/public/*.jpg` как `next/image` StaticImageData). Mdx есть.

## Чего не удалось выяснить

- Рендер в Remotion не делался (`verification: static-review`).
- Bash вне worktree недоступен: инвентаризация сделана по списку
  отслеживаемых файлов в `.git/index` (прочитан как файл, git не
  запускался) и чтением каждого исходника; существование всех `.mdx`,
  `.css` и демо проверено чтением, `.stories.tsx` — выборочно (6 шт.) и по
  индексу. Бинарные `public/*.png|jpg` — только по индексу.
- Внутренние анимации зависимостей из чужого среза (`text/wave-reveal`,
  `text/swap-text`, `text/counter`, `text/ticker`, `text/typing-text`)
  описаны поверхностно — подробности в карточках среза text.
- Лицензии `public/jumping-man.png`, `public/widget/music.jpg`,
  изображений Unsplash/ign.com — не указаны в репозитории.
- `python3 tools/kb.py check --repo animata` не запускался (Bash
  ограничен); пути и поля JSON сверены вручную.
