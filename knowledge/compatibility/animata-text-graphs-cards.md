# Animata (срез text / graphs / progress / hero / card): совместимость с Remotion

Репозиторий `templates/react-libriry/animata` (Next.js 16 + Storybook 10,
`package.json` `"private": true`, версия 4.0.0). Лицензия MIT: `LICENSE.md`
(«Copyright (c) Animata»), в README то же. Ограничений нет, при копировании
кода сохранять текст MIT. Общая сводка по остальным группам лежит в
`compatibility/animata.md` (её ведёт другой агент). Этот файл описывает
только срез `text-graphs-cards`, записи в
`components/animata/capabilities-text-graphs-cards.jsonl`.

## Стек анимации в срезе

- **Tailwind v4 + `tw-animate-css`.** Конфига `tailwind.config.*` нет: тема,
  токены и keyframes лежат в `styles/globals.css` (`@theme { --animate-*;
  @keyframes … }`). Срез использует `animate-bg-position` (`bg-position 3s
  infinite alternate`), `animate-flip-words` (`flip-words 8s infinite`),
  `animate-led`, `animate-fadeIn`, произвольные `animate-[reveal-up]`,
  `animate-[reveal-down]`, `animate-[content-blur]`, `animate-[shape-shift]`,
  плюс утилиты `tw-animate-css` (`animate-in`/`animate-out`, `slide-in-from-*`,
  `fill-mode-forwards`, `direction-alternate`, `repeat-infinite`). Токены easing
  (`ease-slow` = `cubic-bezier(0.405,0,0.025,1)` и др.) тоже там.
- **CSS рядом с компонентом:** `text/glitch-text.css`, `text/roll-text.css`,
  `text/text-animator.css`, `card/collab-card.css`, `card/card-spread.css`.
- **WAAPI-runtime `text/text-animator.tsx`.** На нём 19 текстовых пресетов
  (blur-out-up … top-down-letters). Пресет описан данными (`BASE_SPEC`:
  `target`, enter/exit `{durationMs, staggerMs, easing, from, to}`, `swap`,
  `build`). Runtime сам создаёт DOM, анимирует через `element.animate`,
  ведёт цикл на `setTimeout`, а старт откладывает на `Math.random()*400` мс.
- **`motion` (`motion/react`)** в counter, ticker, circular-text, jitter-text,
  jumping-text-instagram, cycle-text, staggered-letter, scroll-reveal,
  text-explode-imessage, product-features, card-stack, notification-card.
- **Hover и обычный React-state** с Tailwind-`transition`: большинство карточек
  и часть текстов (split-text, swap-text, mirror-text, roll-text и др.).
- **Графики** (`graphs/`): чистый SVG (donut, gauge, ring) или div-бары. Первую
  анимацию запускает хак `setTimeout(250)`. У donut и gauge стоит только
  `duration-500`, `transition-property` не задан, поэтому дуга, скорее всего,
  меняется скачком. Рендером это не проверялось.

## Классы в срезе (69 записей)

| Класс | Кол-во | Записи |
|---|---|---|
| adaptable | 64 | все, кроме перечисленных ниже |
| complex | 5 | `kinetic-center-build`, `short-slide-down` (измеряют ширину и высоту слов в живом DOM), `text-explode-imessage` (цепочка `controls.start` + `Math.random` + rAF), `hero-section` (6 внутренних модулей + hover-стопка), `card-stack` (автоплей, клики, `AnimatePresence`, случайный импульс) |
| native / unsuitable / unknown | 0 | — |

Hover-only карточки и тексты, у которых статичная композиция пригодна для
видео, записаны как `adaptable` с пометкой «hover-анимацию воспроизвести по
кадру».

## Типовые адаптации

### Рецепт «TextAnimator → кадр» (19 пресетов)

1. Не использовать `TextAnimator`. Текст делить в React по `spec.target`:
   `whole` (одна часть), `per-word` (по `/(\S+|\s+)/`, пробелы не
   анимируются), `per-line` (по `\n`, `display:block`), `per-character`.
2. Рантайм-константы по умолчанию: `speed 0.72`, `yTravel 0.58`, `hold 550`,
   `gap 320` мс. Длительность `D = max(140, round(durationMs·speed))`, шаг
   `S = round(staggerMs·speed)`.
3. Для юнита i: `ms = frame/fps·1000 − start`,
   `t = clamp((ms − rank_i·S)/D, 0, 1)`, `e = Easing.bezier(...)(t)` (кривая
   из спеки; `steps(1, jump-start)` означает `t > 0 ? 1 : 0`).
4. Стиль: `opacity = lerp(from.opacity, to.opacity, e)`,
   `transform = translate3d(x px, y·yTravel px, 0) scale(s)`,
   `filter = blur(b px)`.
5. Выход (exit) — та же формула со своей фазой. Смену фраз собирать через
   `<Sequence>` (`enter + hold + exit + gap`).
6. `kinetic-center-build` и `short-slide-down` дополнительно требуют ширины
   или высоты слов: измерить один раз (`useLayoutEffect` + `delayRender`
   или `measureText` из `@remotion/layout-utils`).

### CSS keyframes

Оставить класс и задать элементу `animationDelay: -(frame/fps − startSec)+'s'`
и `animationPlayState: 'paused'`. Исходный `animation-delay` элемента
прибавлять к смещению. Это подходит для glitch-text, animated-gradient-text,
text-flip, wave-reveal, collab-card, shape-shifter и led-board. Второй способ:
считать значения по таблице keyframes через `interpolate`.

### motion

Mount-анимации заменить на `spring({frame: frame − delay, fps, config})` из
`remotion` (пружины заданы в коде: counter `damping 60, stiffness 80`; ticker
`stiffness 150 − 2i, damping 15`; jumping-text `damping 10, mass 2`).
`useInView`, `whileInView`, `whileHover` и `AnimatePresence` убрать. Бесконечные
циклы (circular-text, jitter-text) сделать функцией от `frame/fps`.

### Hover и state

Вместо `group-hover:`/`isHovered` ввести прогресс `p = interpolate(frame, …)`
и вычислять `transform`/`opacity`/цвет inline. Конечная поза hover берётся из
классов компонента: числа там прописаны явно.

### Графики

`setTimeout(250)` убрать. Значения умножать на прогресс кадра
(`strokeDashoffset = C·(1 − progress/100·p)`), для нескольких серий добавить
stagger. В `bar-chart` высоту передавать явно (без ResizeObserver),
в `progress` задавать ширину. В `commit-graph` обязательно заменить
`Math.random` на данные или `random(seed)`.

### Внешние ресурсы

`shape-shifter` (Unsplash), `product-features` (`assets.lummi.ai`),
`case-study-card`/`notification-card`/`collab-card` (URL из props): картинки
класть локально, грузить через `staticFile` и `<Img>`. `bold-copy` берёт
шрифт через `next/font/google` (Tourney), в Remotion нужен
`@remotion/google-fonts`.

## Что пропущено и почему

- `progress/spinner`: прелоадер (`animate-spin`), пропущен по протоколу.
- `card/staggered-card`: выпадающее меню по клику (`published: false`).
- `card/comment-reply-card`: форма с `input` и добавлением комментария,
  интерактивный виджет.
- `text/text-animator.tsx`, `text-animator.css`, `text-animator-demo.*`:
  runtime и демо-обёртка без своей картинки. Описаны в рецепте выше, отдельной
  записи нет.
- Hover-тексты и карточки **не** пропускались. Все записаны как `adaptable`
  с пометкой про hover.

## Чего не удалось выяснить

- **Полная инвентаризация каталогов невозможна.** Bash-команды чтения
  (`ls`, `find`, `grep`) вне worktree отклонил permission-режим (don't ask), а
  субагента для листинга не дал лимит параллельных агентов. Список файлов
  собран косвенно: `content/docs/text/index.mdx`, changelog (`content/docs/
  changelog/*.mdx`), `lib/og-manifest.json` (опубликованные доки) и точечная
  проверка `Read` каждого пути. Все пути в `source_files`/`docs` проверены
  `Read`.
- Вероятно, найдены не все компоненты. В `progress/` обнаружены только 2
  из ~4 (`animatedtimeline`, `spinner`), в `hero/` 5 из ~10, в `card/`
  17 из ~27 (15 записано, `staggered-card` и `comment-reply-card` пропущены).
  `card/notice-card` упомянут в changelog, но не проверялся. Остальные
  неопубликованные файлы найти без листинга не удалось.
- Анимирует ли donut/gauge переход дуги (нет `transition-property`), можно
  выяснить только рендером.
- `card-stack`: props отдельных частей (`Viewport`, `List`, `Card`, `Trigger`)
  полностью не выписаны. В `email-feature-card` разобраны только первые 40
  строк.
- Автоматическая проверка `python3 tools/kb.py check --repo animata` не
  запускалась: Bash-команду отклонил permission-режим. Поля JSON сверены
  вручную по схеме `knowledge/README.md`, существование карточек проверено
  через `ls`.
