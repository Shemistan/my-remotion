# Motion-Primitives (ibelick) — совместимость с Remotion

Репозиторий `templates/react-libriry/motion-primitives` (Next.js-сайт с
документацией, `package.json` `private: true`, без поля `license`).
Лицензия — **MIT**, файл `LICENCE.md` (именно с «C»), © 2024 ibelick;
README ссылается на `/LICENSE.md`, такого файла нет. Ограничений нет,
атрибуция по MIT. В конце `LICENCE.md` случайная строка `app/page.tsx` —
на текст лицензии не влияет.

## Стек

React 18, Next 15, Tailwind 4, `motion` 11 (`motion/react`). Компоненты —
`components/core/*.tsx` (33 шт., список в `scripts/registry-components.ts`),
демо — `app/docs/<name>/*.tsx` (список в `scripts/registry-examples.ts`),
доки — `app/docs/<name>/page.mdx` с таблицами props. Хуки
`hooks/useClickOutside.tsx`, `hooks/usePreventScroll.tsx` — только для
интерактивных компонентов. `useCurrentFrame` нигде нет: `native`-записей нет.

## Как анимирует и типовые адаптации

- **Варианты motion на входе** (`initial/animate/exit`, `staggerChildren`):
  text-effect, text-roll, animated-group, transition-panel → считать
  прогресс сегмента `i` через `interpolate`/`spring` от
  `frame - start - i*stagger*fps`; `AnimatePresence` заменить ручным
  рендером уходящего элемента.
- **Бесконечные циклы motion** (`repeat: Infinity`): text-shimmer,
  text-shimmer-wave, spinning-text, border-trail, glow-effect → фаза
  `t = (frame % (T*fps)) / (T*fps)`; `mirror` → `0.5 - 0.5*cos(2πt)`.
- **Таймеры**: text-loop (`setInterval` → индекс `floor(frame/period)`),
  text-scramble (`setInterval` + `Math.random` → шаг от кадра +
  `random(seed)`).
- **Spring на смене значения** (`useSpring`): animated-number,
  sliding-number → `spring({frame, fps, config})` из remotion.
- **Layout-анимации / DOM-измерения**: text-morph (`layoutId`, FLIP) и
  infinite-slider (`useMeasure` + императивный `animate`) — `complex`.
- Tailwind 4 arbitrary properties (`[--bg:…]`, `bg-clip-text`) — при
  переносе в Remotion без Tailwind 4 переписать в inline-style.

## Записи (17)

adaptable — 15: text-effect, text-loop, text-roll, text-scramble,
text-shimmer, text-shimmer-wave, spinning-text, animated-number,
sliding-number, animated-group, border-trail, glow-effect,
progressive-blur, image-comparison, transition-panel.
complex — 2: text-morph, infinite-slider.

## Что пропущено и почему (16 из 33)

Чисто интерактивные — нет смысла в видео без переработки в другой
компонент:

- `accordion`, `disclosure` — раскрытие по клику.
- `dialog`, `morphing-dialog`, `morphing-popover` — модалки/поповеры по
  клику, `useClickOutside`, `usePreventScroll`.
- `toolbar-dynamic`, `toolbar-expandable` — тулбары по клику,
  `useClickOutside`, `react-use-measure`.
- `animated-background` — подсветка активного таба по click/hover
  (`onMouseEnter`/`onClick`, `layoutId`).
- `carousel` — drag (`drag='x'`), кнопки навигации, `IntersectionObserver`;
  смену слайдов по кадру лучше делать через `transition-panel`.
- `cursor` — кастомный курсор, следует за мышью (`window`, mousemove).
- `dock` — macOS-dock, магнификация от `mouseX`.
- `magnetic` — притяжение к курсору (`getBoundingClientRect`, mousemove).
- `spotlight` — пятно света за курсором (mousemove на родителе).
- `tilt` — 3D-наклон по положению мыши.
- `in-view` — обёртка-триггер `useInView` (скролл); в видео появление
  задаётся кадром, сама обёртка не нужна.
- `scroll-progress` — полоса прогресса по `useScroll`; для видео —
  простая полоса `scaleX = frame/durationInFrames`.

## Чего не удалось выяснить

- Рендер в Remotion не делался (`verification: static-review`).
- Листинг каталогов в сессии был запрещён (Bash `ls/find` по `templates/`
  отклонён), поэтому состав компонентов и демо взят из
  `scripts/registry-components.ts` и `scripts/registry-examples.ts`; все
  пути в записях подтверждены чтением файлов. Файлы, не упомянутые в
  реестрах (если есть), не проверены.
- Демо-файлы прочитаны выборочно (первые строки), подробности примеров в
  карточках не описаны.
