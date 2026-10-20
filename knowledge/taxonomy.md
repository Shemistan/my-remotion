# Таксономия базы визуальных возможностей

Единые словари для `capabilities.jsonl`, карточек в `components/` и
паттернов в `patterns/`. `tools/kb.py check` сверяет записи с этим файлом:
категории берутся из раздела «Категории компонентов» (слаг в обратных
кавычках в начале строки), остальные перечисления зашиты в скрипт.

## Категории компонентов

Категория отвечает на вопрос «что это за визуальный объект», а не «из какой
библиотеки». У записи ровно одна категория.

- `text-animation` — появление, исчезновение, печать, глитч, перебор текста.
- `numbers-counters` — счётчики, KPI, проценты, прогресс-кольца.
- `charts-data` — графики по данным: бары, линии, площади, пироги, радары,
  heatmap, treemap, sankey и т.п.
- `diagrams-flow` — схемы и графы: блок-схемы, узлы и связи, деревья,
  mind map, sequence/state diagrams, архитектурные схемы.
- `lists-grids-stagger` — списки, карточки, сетки, bento, появление группы
  элементов с задержкой.
- `transitions-scene` — переходы между сценами и слайдами, wipe, slide,
  cross-fade, морфинг.
- `backgrounds-gradients` — фоновые градиенты, сетки, шум, aurora, свет.
- `particles-effects` — частицы, конфетти, снег, искры, meteors, glow.
- `3d-camera` — 3D-сцены, камера, карусели, кубы, перспектива.
- `ui-mockups` — имитация интерфейсов: терминал, код, чат, окно браузера,
  рамка телефона, уведомления, курсор.
- `media` — изображения и видео: Ken Burns, маски, коллажи, сравнение
  до/после.
- `icons-shapes` — иконки, фигуры, стрелки, линии, рисование SVG-пути.
- `layout-templates` — готовые композиции целиком: интро, lower third,
  промо, титры, слайд с заголовком.
- `interactive-widgets` — компоненты, смысл которых в пользовательском
  взаимодействии (hover, drag, scroll); в видео пригодны только как
  статичная картинка или после переработки.
- `utilities` — хуки, интерполяция, easing, цвет, геометрия, тайминг.
- `knowledge-docs` — инструкции, skills, правила для агентов (не визуальные
  компоненты, но нужны при разработке).

## Виды записей (`kind`)

- `component` — переиспользуемый React-компонент с props.
- `example` — готовая демонстрационная сцена/композиция на базе компонентов.
- `template` — целый видеошаблон (композиция Remotion с Root/Composition).
- `chart-type` — тип графика в чартовой библиотеке (bar, line, pie…).
- `diagram-type` — тип диаграммы (flowchart, sequence, mindmap…).
- `hook`, `util` — вспомогательный код без собственной картинки.
- `doc` — инструкция/skill/правила.

## Совместимость с Remotion (`remotion_compat`)

- `native` — написано для Remotion: кадр берётся из `useCurrentFrame`,
  время детерминировано.
- `adaptable` — чистый React/SVG/CSS-рендер, анимацию можно заменить
  на покадровую интерполяцию без переписывания логики (обычно: заменить
  `motion`/CSS-transition на `interpolate(frame)`).
- `complex` — работает, но анимация завязана на таймеры, rAF, DOM-измерения,
  Canvas/WebGL или внешний движок; нужна существенная переработка либо
  `delayRender`/ручная синхронизация.
- `unsuitable` — нет смысла в видео (чисто интерактивные виджеты, зависят от
  курсора/скролла, сетевых данных в рантайме) или лицензия запрещает.
- `unknown` — данных недостаточно (нет исходников, не удалось прочитать).

## Флаги зависимостей (`compat_flags`)

Фиксируются независимо от итогового класса — это то, что придётся
нейтрализовать при адаптации.

- `css-animation` — `@keyframes`/`animation:` (Remotion не ждёт CSS-анимацию;
  кадр рендерится по времени, нужна подмена на interpolate или
  `animation-delay` с отрицательным значением, вычисленным из кадра).
- `css-transition` — `transition:` при смене состояния.
- `raf` — `requestAnimationFrame`.
- `timers` — `setTimeout`/`setInterval`.
- `dom` — измерения DOM (`getBoundingClientRect`, `ResizeObserver`,
  `IntersectionObserver`), `window`/`document` в рендере.
- `user-events` — hover, click, scroll, drag, pointer.
- `engine:gsap`, `engine:motion` (framer-motion / motion), `engine:anime`,
  `engine:three` (three.js / R3F), `engine:d3`, `engine:other` — внешний
  анимационный/графический движок.
- `canvas` — 2D Canvas.
- `webgl` — WebGL/shaders/OGL.
- `svg` — рендер в SVG (само по себе хорошо: детерминировано).
- `async-data` — fetch/асинхронная загрузка данных в компоненте.
- `external-service` — обращение к внешнему API/CDN в рантайме.

## Статус проверки (`verification`)

- `unverified` — только README/описание.
- `static-review` — исходники прочитаны, API и зависимости сверены с кодом.
- `rendered-ok` — реально отрендерено в Remotion (запись в
  `compatibility/results.jsonl` обязательна).
- `rendered-fail` — попытка рендера провалилась (запись с причиной).

## Визуальные паттерны (`patterns`)

Слаг = имя файла в `patterns/`. Один компонент может входить в несколько.

- `growth-decline` — рост и падение.
- `comparison` — сравнение.
- `cause-effect` — причина и следствие.
- `sequence-steps` — последовательность действий.
- `system-structure` — структура системы.
- `relationships` — взаимосвязи.
- `timeline` — таймлайн.
- `transformation` — трансформация.
- `quantities` — количественные показатели.
- `spatial` — пространственные отношения.
- `abstract-concepts` — абстрактные концепции.
- `key-point-emphasis` — выделение ключевой мысли.

## Категории репозиториев (`repositories.json`)

- `official-skills` — официальные инструкции Remotion для агентов.
- `infographics` — библиотеки графиков, диаграмм и инфографики.
- `react-animation` — библиотеки React-анимаций и UI-эффектов.
- `remotion-components` — Remotion-шаблоны, компоненты и video skills.
