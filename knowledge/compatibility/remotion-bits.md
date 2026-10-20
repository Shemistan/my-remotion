# remotion-bits — совместимость с Remotion

Репозиторий `templates/remotion-components/remotion-bits` (пакет
`remotion-bits` 0.2.1, «Remotion component bits with a shadcn-like
installer»). Лицензия — `"license": "MIT"` в `package.json`; файла
`LICENSE` в клоне нет. Ограничений нет, атрибуция по MIT. Peer-зависимости:
`react >=18`, `react-dom >=18`, `remotion >=4`.

## Что это и как устроено

- `src/components` — компоненты: `AnimatedText`, `AnimatedCounter`,
  `StaggeredMotion`, `TypeWriter`, `CodeBlock`, `MatrixRain`,
  `GradientTransition`, `ParticleSystem/` (`Particles`, `Spawner`,
  `Behavior`), `Scene3D/` (`Scene3D`, `Step`, `Element3D`, `StepResponsive`,
  хуки `useScene3D`/`useCamera`/`useActiveStep`), `ScrollingImages.tsx`
  (экспорт `ScrollingColumns`).
- `src/hooks/useViewportRect.ts`, `src/utils/*` — интерполяция, easing,
  motion-ядро, цвет/градиенты (culori, oklch), 3D-трансформы (three как
  математика), геометрия, seeded random, частицы.
- `docs/src/bits/examples/**` — готовые сцены («bits») с `metadata`
  (`registry.name`, размеры, длительность); устанавливаются CLI
  `remotion-bits` по `registry.json`.
- `docs/src/content/docs/reference/*.mdx`, `docs/src/content/docs/bits/*.mdx`
  — документация (Starlight).

## Общий стек анимации

Всё написано под Remotion: кадр из `useCurrentFrame()`, прогресс через
`useMotionTiming` → стили через `buildMotionStyles` (transform-строка,
opacity, `filter: blur`, цвет в oklch). Случайность — только `random(seed)`
из `remotion`. Нет CSS-анимаций, таймеров, rAF, Canvas/WebGL; 3D — CSS
`perspective` + `preserve-3d` + `matrix3d`, `three` используется только для
матриц/кватернионов. Частицы — детерминированный «реплей» симуляции на
каждом кадре. Поэтому почти все записи — `native`.

## Типовые адаптации для этой библиотеки

1. **CSS-переменные темы.** Примеры красятся через `--color-primary`,
   `--color-primary-hover`, `--color-background-dark`,
   `--color-surface-light/dark`, `--color-border-dark` из сайта
   документации — в проекте их нужно определить или заменить цветами.
2. **Картинки.** И `ScrollingColumns`, и примеры с фото используют обычный
   `<img>`; несколько примеров берут картинки с `picsum.photos` в рантайме.
   Заменить на `Img` из `remotion` + `staticFile()`, иначе кадры могут
   рендериться до загрузки.
3. **Данные зашиты в примеры.** Bits — сцены без props: тексты, массивы,
   размеры внутри `Component`. Для переиспользования вынести в props.
4. **Импорты.** Примеры импортируют из `remotion-bits` (пакет); при копии
   исходников переписать на локальные пути и взять зависимости registry
   (`motion`, `interpolate`, `transform3d`, `color`, `three`, `culori`,
   `prism-react-renderer`).
5. **Производительность.** Частицы (O(частицы × возраст) на кадр), MatrixRain
   (div на символ), промо с сотнями плиток и `backdrop-filter` рендерятся
   медленно — ограничивать `max`/`lifespan`/`density`, `--concurrency`.
6. **Эмодзи и шрифты** — системный шрифт headless Chrome; подгружать шрифты
   через `@remotion/google-fonts`, эмодзи заменить на SVG.

## Найденные проблемы в коде (по статическому чтению)

- `AnimatedText`: `useMotionTiming` вызывается в `map` по фрагментам —
  при `cycle` с разным числом фрагментов нарушается порядок хуков React.
- `bit-easings-visualizer`: `cycleOffset={0}` → прогресс всегда 0
  (подозрение, проверить рендером).
- `Element3D`: `scaleZ` объявлен в типах, но не читается; переход без
  `frames` отсчитывается от начала композиции.
- Parser градиентов упрощённый (углы `deg`/`to …`, стопы `%`/`px`).
- `Behavior.opacity` в объектной форме `{frames, values}` игнорируется.
- registry: часть `registryDependencies` у примеров неполна (промо не
  перечисляет animated-counter/type-writer/code-block; card-stack и
  cube-nav — без use-viewport-rect; terminal-3d — без type-writer,
  staggered-motion, use-viewport-rect).
- `bit-3d-step-timing-context`: в `AnimatedText` передаётся `<h1>`, а
  компонент делает `String(children)` — вероятно, «[object Object]».
- `bit-particles-grid`: прыжки по сетке почти не срабатывают (`p.seed`
  дробное); `bit-particles-fountain`: `burst` при `startFrame=100` не виден.
- `bit-terminal-3d`: TypeWriter во 2-м и 3-м окне начинает с кадра 0, а не
  от входа шага.
- `bit-transform3d-showcase`: `rotateZ(Math.PI/8)` трактуется как градусы.
- `bit-typing-code-block`: ~3 символа за кадр, курсор внутри кода
  подсвечивается prism.
- `bit-3d-elements`: `metadata.name` скопирован из 3DBasic.
- Внешние картинки `picsum.photos`: `bit-fracture-reassemble`,
  `bit-mosaic-reframe`, `bit-ken-burns` (флаг `external-service`);
  `bit-cursor-flyover` берёт `/gallery.png` из public сайта docs.

## Что пропущено и почему

- `step-context` (`src/utils/StepContext.ts`) — отдельной записи нет,
  описан внутри `motion` и `scene-3d` (служебный контекст без своего смысла).
- Хуки `useScene3D`, `useCamera`, `useActiveStep`, `useStepResponsive` —
  описаны в записи `scene-3d`.
- Чисто интерактивных контролов (кнопки, инпуты, меню) в репозитории нет.
- `skills/remotion-bits/` (SKILL.md для агентов) и `demo/src/showcases/`
  (указаны в repositories.json) — в этот проход не читались; кандидаты на
  записи `kind: doc` / `example` в следующем проходе.
- `scripts/` (CLI, MCP-сервер `remotion-bits-mcp.ts`, генерация registry),
  `demo/`, сайт документации (`docs/src/components`) — инфраструктура, не
  визуальные компоненты.

## Чего не удалось выяснить

- Рендер в Remotion не делался — все записи `static-review`.
- Bash за пределами worktree был запрещён, поэтому полный список файлов
  `src/` и `docs/src/bits/examples/` получен из `registry.json`, а не `find`;
  каждый путь подтверждён чтением файла. Файлы, которых нет в registry,
  могли остаться незамеченными.
- `python3 tools/kb.py check --repo remotion-bits` не запускался (Bash
  ограничен); поля JSON и пути сверены вручную.
