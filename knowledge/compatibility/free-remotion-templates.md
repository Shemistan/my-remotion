# free-remotion-templates — совместимость с Remotion

Репозиторий `templates/remotion-components/free-remotion-templates`
(RenderComp / Trimora Inc.), 50 шаблонов. `license: MIT` в `package.json`,
`LICENSE`; в каждом `.tsx` есть SPDX-заголовок `MIT`. При копировании этот
заголовок нужно оставить, так README выполняет условие MIT-уведомления. Remotion
лицензируется отдельно: крупным командам нужна company license. По
`ASSETS.md` в репозитории нет ни шрифтов, ни картинок, ни аудио, вся графика
нарисована в коде (inline SVG/CSS).

## Стек

Remotion 4.0.518, React 19, TypeScript. Зависимости только `remotion` и
`react`, zod не используется. Props описаны TS-типами, рядом лежит объект
`default*Props`. `src/Root.tsx` регистрирует 50 `Composition` в шести
`Folder`: Logo-and-Brand (8), Text-and-Titles (11), Transitions (8),
Data-and-Charts (6), Social-and-UI (9), Loops-and-Backgrounds (8).
`src/index.ts` содержит только `registerRoot`. Каждый шаблон — один файл
`src/components/<id>/<Name>.tsx`. Шесть pixel-шаблонов
(four-tone-mono-titler, pixel-typewriter-quote, pixel-mosaic-transition,
pourover-drip-fill-gauge, pixel-candlestick-ohlc, pixel-waterfall-cycle)
используют общий модуль `src/pixel-kit/` (`index.ts`, `render.tsx`, `fx.tsx`,
`palette.ts`, `particles.ts`, `font.ts`).

## Общий механизм анимации

Во всех шаблонах анимация построена на `useCurrentFrame` + `interpolate`/
`spring`/`Easing`, местами добавлен `Sequence` (flip-page, community-chat,
social-reel). CSS `@keyframes`, таймеров, rAF, Canvas, `fetch` и внешних
движков нет. Псевдослучайность детерминированная: `random()` из remotion
(glitch-text), свой LCG (shatter-reveal), sin-хэши (`seededRandom`,
`seed`/`seed2` в pixel-kit). `Math.random` не встречается. CRT-шум собран на
`feTurbulence` с `seed = frame % 64`. Единственная лишняя деталь —
`transition: opacity 0.02s` в neon-sign.

Итог: все 51 запись (50 template + 1 util) имеют класс `native`.

## Шрифты

Используются только системные стеки `-apple-system, "Segoe UI", Roboto,
sans-serif` и `"SF Mono", "Menlo", "Consolas", monospace`, загрузки шрифтов
нет. Поэтому вид текста зависит от машины рендера: на Linux/CI будет
Roboto или fallback. Эмодзи (community-chat, kpi-counter) тоже системные.
Pixel-шаблоны рисуют текст своим битмап-шрифтом 5×7 (`pixel-kit/font.ts`),
в нём только латиница, цифры и пунктуация, кириллицы нет.

## Типовые адаптации

- **Длительность.** Во многих шаблонах тайминги считаются от константы
  `DURATION_FRAMES` или от prop `duration` в секундах, а не от
  `useVideoConfig().durationInFrames`. Если менять длину композиции, это
  нужно поправить. Сами перетаймливаются только circle-wipe, whip-pan и
  parallax-pan.
- **Переходы.** Все восемь — самодостаточные демо: сцены A и B заданы цветом
  и подписью. Для монтажа сцены нужно вынести в `children` или переписать
  шаблон как `TransitionPresentation` для `TransitionSeries`. Готовый массив
  сцен в props принимает только whip-pan.
- **Фиксированные SVG id.** `lmw-wipe`, `lsd-shine-clip`, `eyeClip`,
  `snow-sky`, `ink-bleed`/`ink-core`, а в pixel-kit `bayer4`/`px-noise`.
  Если в одном кадре два экземпляра, id нужно сделать уникальными.
- **Сплошной фон.** Чтобы наложить шаблон на видео (lower third, титры),
  фон надо убрать.
- **Тяжёлые кадры.** В pixel-kit на кадр приходятся тысячи `<rect>`
  (pixel-mosaic при блоке 1 — около 130 тыс.). Тяжёлые и полноэкранные
  SVG-фильтры (ink-spread) и blur (whip-pan, bokeh) тоже замедляют рендер.
- **Данные.** pixel-candlestick генерирует ряд сам, через props его не
  передать. В drip-gauge нет целевого процента. В racing-chart ранг
  меняется скачком.

## Расхождения README и кода

- typewriter не печатает текст: слово появляется целиком.
- bounce-in-headline прыгает всей строкой, а не по словам.
- shatter-reveal собирает осколки, а не разбивает.
- text-mask-reveal открывает текст цветным блоком, а не маской снизу.
- eye-reveal не раскрывает вложенную сцену, такой сцены в коде нет.
- pourover-drip-fill-gauge не принимает target percentage, всегда наливает
  до 100 %.
- bokeh-circles в README назван «seamless loop», но бесшовность в коде не
  обеспечена.

## Что пропущено

Ничего из 50 композиций. Чисто интерактивных контролов в репозитории нет.
Превью-гифки `docs/thumbs/*.gif` и `docs/hero-50-templates.gif` в `docs`
записей не включены: без `ls` их существование не проверено.

## Чего не удалось выяснить

- Каталоги нельзя было пролистать `ls`/`find`, потому что Bash вне worktree
  запрещён режимом dontAsk. Файлы найдены по импортам `Root.tsx` и pixel-kit.
- Бесшовность петель (pixel-waterfall-cycle, loop-grid-wave) покадрово не
  проверялась.
- Рендер не выполнялся, у всех записей `verification: static-review`.
